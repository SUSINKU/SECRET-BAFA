"""Auto Retopo Character

Pipeline en un clic pour un personnage anime :
  1. nettoyage du maillage haute resolution (copie de travail)
  2. retopologie quad via QuadriFlow (integre a Blender)
  3. reprojection sur l'original (Shrinkwrap)
  4. depliage UV
  5. bake de la normal map (haute -> basse), sauvegardee sur disque

La haute resolution n'est jamais modifiee.
"""

bl_info = {
    "name": "Auto Retopo Character",
    "author": "SUSINKU",
    "version": (0, 1, 0),
    "blender": (4, 2, 0),
    "location": "View3D > Sidebar > Retopo",
    "description": "Retopologie QuadriFlow + UV + bake de normales pour personnages",
    "category": "Mesh",
}

import os

import bmesh
import bpy
from bpy.props import (
    BoolProperty,
    EnumProperty,
    FloatProperty,
    IntProperty,
    PointerProperty,
    StringProperty,
)
from bpy.types import Operator, Panel, PropertyGroup


# --------------------------------------------------------------------------
# Reglages
# --------------------------------------------------------------------------

PRESETS = {
    # nom: (faces cibles, preserve sharp, preserve boundary)
    "HERO": (12000, False, True),
    "GAME": (5000, False, True),
    "MOBILE": (1500, False, True),
}


def _apply_preset(self, context):
    if self.preset == "CUSTOM":
        return
    faces, sharp, boundary = PRESETS[self.preset]
    self.target_faces = faces
    self.preserve_sharp = sharp
    self.preserve_boundary = boundary


class RetopoSettings(PropertyGroup):
    preset: EnumProperty(
        name="Preset",
        items=[
            ("HERO", "Personnage hero", "~12 000 faces"),
            ("GAME", "Jeu", "~5 000 faces"),
            ("MOBILE", "Mobile", "~1 500 faces"),
            ("CUSTOM", "Personnalise", ""),
        ],
        default="GAME",
        update=_apply_preset,
    )
    target_faces: IntProperty(name="Faces cibles", default=5000, min=100, max=500000)
    use_symmetry: BoolProperty(
        name="Symetrie X",
        description="Force un maillage symetrique (le personnage doit etre centre sur l'axe X)",
        default=True,
    )
    preserve_sharp: BoolProperty(name="Garder les aretes vives", default=False)
    preserve_boundary: BoolProperty(name="Garder les bords", default=True)
    smooth_normals: BoolProperty(name="Normales lissees", default=True)
    seed: IntProperty(name="Seed", default=0, min=0)

    pre_voxel_size: FloatProperty(
        name="Voxel pre-remesh",
        description="0 = desactive. Utile pour les maillages tres sales ou avec parties detachees",
        default=0.0,
        min=0.0,
        unit="LENGTH",
    )
    merge_distance: FloatProperty(
        name="Distance de fusion", default=0.0001, min=0.0, unit="LENGTH"
    )

    use_shrinkwrap: BoolProperty(
        name="Reprojeter sur l'original",
        description="Colle la basse resolution sur la haute apres QuadriFlow",
        default=True,
    )
    shrinkwrap_iterations: IntProperty(name="Lissage apres projection", default=2, min=0, max=20)

    do_uv: BoolProperty(name="Deplier les UV", default=True)
    uv_angle: FloatProperty(
        name="Angle UV", default=66.0, min=1.0, max=89.0
    )
    uv_margin: FloatProperty(name="Marge ilots", default=0.003, min=0.0, max=0.1)

    do_bake: BoolProperty(name="Baker la normal map", default=True)
    bake_size: EnumProperty(
        name="Resolution",
        items=[("1024", "1024", ""), ("2048", "2048", ""), ("4096", "4096", "")],
        default="2048",
    )
    cage_extrusion: FloatProperty(
        name="Extrusion cage", default=0.02, min=0.0, unit="LENGTH",
        description="Distance de lancer des rayons depuis la basse resolution",
    )
    max_ray_distance: FloatProperty(name="Distance max rayon", default=0.0, min=0.0, unit="LENGTH")
    bake_samples: IntProperty(name="Samples", default=16, min=1, max=512)
    output_dir: StringProperty(name="Dossier de sortie", subtype="DIR_PATH", default="//retopo_output/")


# --------------------------------------------------------------------------
# Utilitaires
# --------------------------------------------------------------------------

def _select_only(context, obj):
    for o in context.view_layer.objects:
        o.select_set(False)
    obj.select_set(True)
    context.view_layer.objects.active = obj


def _clean_mesh(obj, merge_dist):
    """Fusionne les doublons, supprime la geometrie libre, recalcule les normales, comble les trous."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    if merge_dist > 0:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge_dist)
    # geometrie libre
    loose_edges = [e for e in bm.edges if not e.link_faces]
    bmesh.ops.delete(bm, geom=loose_edges, context="EDGES")
    loose_verts = [v for v in bm.verts if not v.link_edges]
    bmesh.ops.delete(bm, geom=loose_verts, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    boundary = [e for e in bm.edges if e.is_boundary]
    if boundary:
        bmesh.ops.holes_fill(bm, edges=boundary, sides=8)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def _voxel_remesh(obj, size):
    obj.data.remesh_voxel_size = size
    obj.data.remesh_voxel_adaptivity = 0.0
    bpy.ops.object.voxel_remesh()


def _make_bake_material(obj, image):
    mat = bpy.data.materials.new(name=f"{obj.name}_bake")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.name = "BAKE_TARGET"
    nodes.active = tex
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat


def _normal_preview_material(obj, image):
    """Remplace le materiau temporaire par un materiau qui utilise la normal map bakee."""
    mat = obj.data.materials[0]
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    tex = nodes["BAKE_TARGET"]
    image.colorspace_settings.name = "Non-Color"
    nmap = nodes.new("ShaderNodeNormalMap")
    bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    links.new(tex.outputs["Color"], nmap.inputs["Color"])
    if bsdf:
        links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])


# --------------------------------------------------------------------------
# Operateur principal
# --------------------------------------------------------------------------

class RETOPO_OT_run(Operator):
    bl_idname = "retopo.run"
    bl_label = "Lancer la retopologie"
    bl_description = "Cree une basse resolution quad a partir de l'objet actif et bake la normal map"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context):
        o = context.active_object
        return o is not None and o.type == "MESH" and context.mode == "OBJECT"

    def execute(self, context):
        s = context.scene.retopo_settings
        high = context.active_object
        if len(high.data.polygons) == 0:
            self.report({"ERROR"}, "Le maillage n'a aucune face.")
            return {"CANCELLED"}

        # Dossier de sortie
        out_dir = bpy.path.abspath(s.output_dir)
        if s.do_bake:
            if not bpy.data.is_saved and s.output_dir.startswith("//"):
                self.report({"ERROR"}, "Sauvegarde le .blend ou choisis un chemin absolu pour le dossier de sortie.")
                return {"CANCELLED"}
            os.makedirs(out_dir, exist_ok=True)

        # 1. copie de travail
        low = high.copy()
        low.data = high.data.copy()
        low.name = f"{high.name}_low"
        low.data.name = f"{high.name}_low"
        low.modifiers.clear()
        for c in high.users_collection:
            c.objects.link(low)
        _select_only(context, low)

        # Appliquer l'echelle pour que les distances/QuadriFlow soient coherentes
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

        # 2. nettoyage
        _clean_mesh(low, s.merge_distance)
        if s.pre_voxel_size > 0:
            _voxel_remesh(low, s.pre_voxel_size)

        # 3. QuadriFlow
        try:
            res = bpy.ops.object.quadriflow_remesh(
                use_mesh_symmetry=s.use_symmetry,
                use_preserve_sharp=s.preserve_sharp,
                use_preserve_boundary=s.preserve_boundary,
                preserve_attributes=False,
                smooth_normals=s.smooth_normals,
                mode="FACES",
                target_faces=s.target_faces,
                seed=s.seed,
            )
        except RuntimeError as e:
            self.report({"ERROR"}, f"QuadriFlow a echoue : {e}")
            bpy.data.objects.remove(low)
            _select_only(context, high)
            return {"CANCELLED"}
        if "FINISHED" not in res:
            self.report({"ERROR"}, "QuadriFlow n'a pas abouti (maillage non manifold ? essaie le voxel pre-remesh).")
            bpy.data.objects.remove(low)
            _select_only(context, high)
            return {"CANCELLED"}

        # 4. reprojection
        if s.use_shrinkwrap:
            sw = low.modifiers.new("Shrinkwrap", "SHRINKWRAP")
            sw.target = high
            sw.wrap_method = "NEAREST_SURFACEPOINT"
            bpy.ops.object.modifier_apply(modifier=sw.name)
            if s.shrinkwrap_iterations:
                sm = low.modifiers.new("Smooth", "SMOOTH")
                sm.iterations = s.shrinkwrap_iterations
                sm.factor = 0.5
                bpy.ops.object.modifier_apply(modifier=sm.name)
                sw = low.modifiers.new("Shrinkwrap", "SHRINKWRAP")
                sw.target = high
                sw.wrap_method = "NEAREST_SURFACEPOINT"
                bpy.ops.object.modifier_apply(modifier=sw.name)

        # 5. UV
        if s.do_uv or s.do_bake:
            import math
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(
                angle_limit=math.radians(s.uv_angle), island_margin=s.uv_margin
            )
            bpy.ops.object.mode_set(mode="OBJECT")

        # 6. bake
        if s.do_bake:
            err = self._bake(context, high, low, s, out_dir)
            if err:
                self.report({"WARNING"}, err)

        _select_only(context, low)
        self.report({"INFO"}, f"Retopo terminee : {len(low.data.polygons)} faces ({low.name}).")
        return {"FINISHED"}

    def _bake(self, context, high, low, s, out_dir):
        scene = context.scene
        prev_engine = scene.render.engine
        size = int(s.bake_size)
        name = f"{high.name}_normal"
        image = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
        image.colorspace_settings.name = "Non-Color"
        _make_bake_material(low, image)
        try:
            scene.render.engine = "CYCLES"
            scene.cycles.samples = s.bake_samples
            for o in context.view_layer.objects:
                o.select_set(False)
            high.select_set(True)
            low.select_set(True)
            context.view_layer.objects.active = low
            bpy.ops.object.bake(
                type="NORMAL",
                normal_space="TANGENT",
                use_selected_to_active=True,
                cage_extrusion=s.cage_extrusion,
                max_ray_distance=s.max_ray_distance,
                margin=16,
                margin_type="EXTEND",
                use_clear=True,
            )
        except RuntimeError as e:
            return f"Bake echoue : {e}"
        finally:
            scene.render.engine = prev_engine

        path = os.path.join(out_dir, f"{name}.png")
        image.filepath_raw = path
        image.file_format = "PNG"
        image.save()
        _normal_preview_material(low, image)
        return None


# --------------------------------------------------------------------------
# UI
# --------------------------------------------------------------------------

class RETOPO_PT_panel(Panel):
    bl_label = "Auto Retopo"
    bl_idname = "RETOPO_PT_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Retopo"

    def draw(self, context):
        s = context.scene.retopo_settings
        col = self.layout.column()
        col.prop(s, "preset")
        col.prop(s, "target_faces")
        col.prop(s, "use_symmetry")
        col.prop(s, "preserve_sharp")
        col.prop(s, "preserve_boundary")
        col.prop(s, "smooth_normals")
        col.prop(s, "seed")

        box = self.layout.box()
        box.label(text="Nettoyage")
        box.prop(s, "merge_distance")
        box.prop(s, "pre_voxel_size")

        box = self.layout.box()
        box.label(text="Projection")
        box.prop(s, "use_shrinkwrap")
        if s.use_shrinkwrap:
            box.prop(s, "shrinkwrap_iterations")

        box = self.layout.box()
        box.label(text="UV")
        box.prop(s, "do_uv")
        if s.do_uv:
            box.prop(s, "uv_angle")
            box.prop(s, "uv_margin")

        box = self.layout.box()
        box.prop(s, "do_bake")
        if s.do_bake:
            box.prop(s, "bake_size")
            box.prop(s, "cage_extrusion")
            box.prop(s, "max_ray_distance")
            box.prop(s, "bake_samples")
            box.prop(s, "output_dir")

        self.layout.operator("retopo.run", icon="MOD_REMESH")


classes = (RetopoSettings, RETOPO_OT_run, RETOPO_PT_panel)


def register():
    for c in classes:
        bpy.utils.register_class(c)
    bpy.types.Scene.retopo_settings = PointerProperty(type=RetopoSettings)


def unregister():
    del bpy.types.Scene.retopo_settings
    for c in reversed(classes):
        bpy.utils.unregister_class(c)


if __name__ == "__main__":
    register()
