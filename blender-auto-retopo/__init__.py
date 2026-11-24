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
    "version": (0, 3, 0),
    "blender": (4, 2, 0),
    "location": "View3D > Sidebar > Retopo",
    "description": "Retopologie QuadriFlow + UV + bake de normales pour personnages",
    "category": "Mesh",
}

import math
import os
import subprocess

import bmesh
import bpy
from bpy.props import (
    CollectionProperty,
    BoolProperty,
    EnumProperty,
    FloatProperty,
    IntProperty,
    PointerProperty,
    StringProperty,
)
from bpy.types import AddonPreferences, Operator, Panel, PropertyGroup
from mathutils import Vector

from . import face_template


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


class RetopoPrefs(AddonPreferences):
    bl_idname = __package__ or __name__

    instant_meshes_path: StringProperty(
        name="Instant Meshes (executable)",
        description="Chemin vers 'Instant Meshes.exe' (telechargeable gratuitement). Laisse vide pour seulement exporter",
        subtype="FILE_PATH",
    )

    def draw(self, context):
        self.layout.prop(self, "instant_meshes_path")


class PartItem(PropertyGroup):
    group: StringProperty(name="Groupe de sommets")
    density: FloatProperty(
        name="Densite",
        description="Multiplicateur de densite de faces (2 = deux fois plus de faces par m2)",
        default=1.0, min=0.1, max=20.0,
    )


class RetopoSettings(PropertyGroup):
    im_faces: IntProperty(name="Faces cibles (Instant Meshes)", default=6000, min=100, max=500000)
    im_crease: FloatProperty(name="Angle d'arete vive", default=0.0, min=0.0, max=180.0,
                             description="0 = desactive")
    template_res: EnumProperty(
        name="Resolution du gabarit",
        items=[("12", "Legere (~900 faces)", ""), ("24", "Dense (~3500 faces)", "")],
        default="12",
    )
    template_head_ratio: FloatProperty(
        name="Hauteur de tete / hauteur totale", default=0.4, min=0.1, max=0.8,
        description="Sert a placer et dimensionner le gabarit automatiquement (chibi ~0.4, realiste ~0.13)",
    )
    template_rot_z: FloatProperty(name="Rotation Z (deg)", default=0.0, min=-180.0, max=180.0,
                                  description="Le visage du gabarit regarde vers -Y")
    split_mode: EnumProperty(
        name="Decoupage",
        items=[
            ("NONE", "Aucun", "Un seul bloc, densite uniforme"),
            ("LOOSE", "Pieces separees", "Chaque ilot de geometrie deconnecte devient une piece"),
            ("GROUPS", "Groupes de sommets", "Une piece par groupe de sommets, avec sa propre densite"),
        ],
        default="NONE",
    )
    parts: CollectionProperty(type=PartItem)
    min_part_faces: IntProperty(name="Faces min par piece", default=150, min=20, max=100000)
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


def _clean_mesh(obj, merge_dist, fill_holes=True):
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
    if boundary and fill_holes:
        bmesh.ops.holes_fill(bm, edges=boundary, sides=8)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def _decimate(context, obj, target_faces):
    """Dernier recours : simplification en triangles vers ~target_faces quads."""
    _select_only(context, obj)
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    m = obj.modifiers.new("Decimate", "DECIMATE")
    m.ratio = min(1.0, (target_faces * 2) / max(tris, 1))
    bpy.ops.object.modifier_apply(modifier=m.name)


def _split_parts(context, low, s):
    """Decoupe `low` en pieces. Retourne [(objet, densite)]."""
    parts = []
    _select_only(context, low)
    if s.split_mode == "LOOSE":
        before = set(context.view_layer.objects)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.separate(type="LOOSE")
        bpy.ops.object.mode_set(mode="OBJECT")
        parts = [(low, 1.0)] + [(o, 1.0) for o in context.view_layer.objects if o not in before]
        return parts

    for item in s.parts:
        vg = low.vertex_groups.get(item.group)
        if vg is None:
            continue
        _select_only(context, low)
        low.vertex_groups.active_index = vg.index
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_mode(type="VERT")
        bpy.ops.mesh.select_all(action="DESELECT")
        bpy.ops.object.vertex_group_select()
        has = any(v.select for v in bmesh.from_edit_mesh(low.data).verts)
        before = set(context.view_layer.objects)
        if has:
            bpy.ops.mesh.separate(type="SELECTED")
        bpy.ops.object.mode_set(mode="OBJECT")
        if has:
            for o in context.view_layer.objects:
                if o not in before:
                    o.name = f"{low.name}_{item.group}"
                    parts.append((o, item.density))
    if len(low.data.polygons) > 0:
        parts.append((low, 1.0))
    else:
        bpy.data.objects.remove(low, do_unlink=True)
    return parts


def _mesh_stats(obj):
    """(aretes non manifold, nombre d'ilots) pour le diagnostic."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    non_manifold = sum(1 for e in bm.edges if len(e.link_faces) != 2)
    seen, islands = set(), 0
    for v in bm.verts:
        if v.index in seen:
            continue
        islands += 1
        stack = [v]
        seen.add(v.index)
        while stack:
            cur = stack.pop()
            for e in cur.link_edges:
                o = e.other_vert(cur)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
    bm.free()
    return non_manifold, islands


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

        # 2-3. nettoyage + retopo (en un bloc, ou piece par piece)
        if s.split_mode == "NONE":
            _clean_mesh(low, s.merge_distance)
            if s.pre_voxel_size > 0:
                _voxel_remesh(low, s.pre_voxel_size)
            ok, err = self._remesh_one(context, low, s, s.target_faces)
            if not ok:
                nm, isl = _mesh_stats(low)
                self.report(
                    {"ERROR"},
                    f"QuadriFlow a echoue : {err} | faces : {len(low.data.polygons)}, cible : {s.target_faces}, "
                    f"aretes non manifold : {nm}, ilots : {isl}",
                )
                _select_only(context, high)
                bpy.data.objects.remove(low, do_unlink=True)
                return {"CANCELLED"}
        else:
            low = self._remesh_parts(context, high, low, s)
            if low is None:
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

    def _remesh_one(self, context, obj, s, target):
        """QuadriFlow sur un objet, avec voxels progressifs puis options relachees."""
        _select_only(context, obj)
        ok, err = self._quadriflow(s, target)
        if not ok and (s.pre_voxel_size == 0 or s.split_mode != "NONE"):
            longest = max(obj.dimensions)
            for div in (250.0, 150.0, 100.0, 60.0):
                _voxel_remesh(obj, longest / div)
                ok, err = self._quadriflow(s, target)
                if ok:
                    break
        if not ok:
            ok, err = self._quadriflow(s, target, relaxed=True)
        return ok, err

    def _remesh_parts(self, context, high, low, s):
        parts = _split_parts(context, low, s)
        parts = [(o, d) for o, d in parts if len(o.data.polygons) > 0]
        if not parts:
            self.report({"ERROR"}, "Aucune piece trouvee : cree des groupes de sommets (Ctrl+G en Edit Mode) et ajoute-les a la liste.")
            return None
        for o, _ in parts:
            _clean_mesh(o, s.merge_distance, fill_holes=False)
        weights = [sum(p.area for p in o.data.polygons) * d for o, d in parts]
        total = sum(weights) or 1.0
        for (o, _), w in zip(parts, weights):
            target = max(s.min_part_faces, int(s.target_faces * w / total))
            ok, err = self._remesh_one(context, o, s, target)
            if not ok:
                _decimate(context, o, target)
                self.report({"WARNING"}, f"Piece '{o.name}' : QuadriFlow a echoue ({err}), simplification en triangles a la place.")
        for ob in context.view_layer.objects:
            ob.select_set(False)
        for o, _ in parts:
            o.select_set(True)
        context.view_layer.objects.active = parts[0][0]
        if len(parts) > 1:
            bpy.ops.object.join()
        merged = context.view_layer.objects.active
        merged.name = f"{high.name}_low"
        merged.data.name = merged.name
        self.report({"INFO"}, f"{len(parts)} pieces retopologisees. Les jonctions entre pieces ne sont pas soudees : a raccorder a la main.")
        return merged

    def _quadriflow(self, s, target, relaxed=False):
        """Retourne (ok, message_erreur)."""
        try:
            res = bpy.ops.object.quadriflow_remesh(
                use_mesh_symmetry=False if relaxed else s.use_symmetry,
                use_preserve_sharp=False if relaxed else s.preserve_sharp,
                use_preserve_boundary=False if relaxed else s.preserve_boundary,
                preserve_attributes=False,
                smooth_normals=s.smooth_normals,
                mode="FACES",
                target_faces=target,
                seed=s.seed,
            )
        except Exception as e:  # RuntimeError (erreur rapportee) ou TypeError (API)
            return False, str(e).strip()
        if "FINISHED" in res:
            return True, ""
        return False, "operateur annule sans message"

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


def _resolve_out_dir(op, s):
    if not bpy.data.is_saved and s.output_dir.startswith("//"):
        op.report({"ERROR"}, "Sauvegarde le .blend ou choisis un chemin absolu pour le dossier de sortie.")
        return None
    d = bpy.path.abspath(s.output_dir)
    os.makedirs(d, exist_ok=True)
    return d


def _mesh_poll(cls, context):
    o = context.active_object
    return o is not None and o.type == "MESH" and context.mode == "OBJECT"


class RETOPO_OT_instant_meshes(Operator):
    bl_idname = "retopo.instant_meshes"
    bl_label = "Exporter / lancer Instant Meshes"
    bl_description = "Exporte l'objet en OBJ. Si l'executable est configure, lance Instant Meshes et importe le resultat"
    bl_options = {"REGISTER", "UNDO"}
    poll = classmethod(_mesh_poll)

    def execute(self, context):
        s = context.scene.retopo_settings
        obj = context.active_object
        out_dir = _resolve_out_dir(self, s)
        if out_dir is None:
            return {"CANCELLED"}
        in_path = os.path.join(out_dir, f"{obj.name}_input.obj")
        out_path = os.path.join(out_dir, f"{obj.name}_instant.obj")
        _select_only(context, obj)
        try:
            bpy.ops.wm.obj_export(
                filepath=in_path, export_selected_objects=True, apply_modifiers=True,
                export_uv=False, export_normals=False, export_materials=False,
            )
        except Exception as e:
            self.report({"ERROR"}, f"Export OBJ impossible : {e}")
            return {"CANCELLED"}

        prefs = context.preferences.addons[__package__].preferences
        exe = bpy.path.abspath(prefs.instant_meshes_path) if prefs.instant_meshes_path else ""
        if not exe or not os.path.isfile(exe):
            self.report(
                {"INFO"},
                f"Exporte : {in_path}. Ouvre-le dans Instant Meshes (trace les guides avec l'outil Orientation), "
                f"exporte le resultat, puis importe-le dans Blender. (Ou renseigne l'executable dans les preferences de l'add-on.)",
            )
            return {"FINISHED"}

        cmd = [exe, in_path, "-o", out_path, "-f", str(s.im_faces), "-d", "-S", "2"]
        if s.im_crease > 0:
            cmd += ["-c", str(s.im_crease)]
        try:
            subprocess.run(cmd, check=True, timeout=900, capture_output=True)
        except (subprocess.SubprocessError, OSError) as e:
            self.report({"ERROR"}, f"Instant Meshes a echoue : {e}")
            return {"CANCELLED"}
        if not os.path.isfile(out_path):
            self.report({"ERROR"}, "Instant Meshes n'a produit aucun fichier.")
            return {"CANCELLED"}
        before = set(bpy.data.objects)
        bpy.ops.wm.obj_import(filepath=out_path)
        new = [o for o in bpy.data.objects if o not in before]
        if new:
            new[0].name = f"{obj.name}_instant"
            _select_only(context, new[0])
        self.report({"INFO"}, f"Instant Meshes termine : {out_path}")
        return {"FINISHED"}


class RETOPO_OT_quad_remesher(Operator):
    bl_idname = "retopo.quad_remesher"
    bl_label = "Lancer Quad Remesher"
    bl_description = "Appelle l'add-on Quad Remesher (payant, a installer separement) avec les faces cibles"
    bl_options = {"REGISTER", "UNDO"}
    poll = classmethod(_mesh_poll)

    def execute(self, context):
        s = context.scene.retopo_settings
        try:
            if not bpy.ops.qremesher.remesh.poll():
                raise RuntimeError
        except Exception:
            self.report({"ERROR"}, "Quad Remesher n'est pas installe/active. Installe-le, puis relance (ou utilise son panneau).")
            return {"CANCELLED"}
        qs = getattr(context.scene, "qremesher", None)
        if qs is not None:
            try:
                qs.target_count = s.target_faces
            except Exception:
                pass
        try:
            bpy.ops.qremesher.remesh()
        except Exception as e:
            self.report({"ERROR"}, f"Quad Remesher : {e}. Lance-le depuis son propre panneau.")
            return {"CANCELLED"}
        self.report({"INFO"}, "Quad Remesher lance. Pour les guides, utilise les outils de son panneau.")
        return {"FINISHED"}


class RETOPO_OT_manual_setup(Operator):
    bl_idname = "retopo.manual_setup"
    bl_label = "Preparer la retopo manuelle"
    bl_description = (
        "Cree un objet de retopo colle sur le modele : symetrie X, Shrinkwrap, accrochage a la surface, outil Poly Build"
    )
    bl_options = {"REGISTER", "UNDO"}
    poll = classmethod(_mesh_poll)

    def execute(self, context):
        high = context.active_object
        c = context.scene.cursor.location
        size = max(high.dimensions) * 0.015
        verts = [(c.x - size, c.y, c.z - size), (c.x + size, c.y, c.z - size),
                 (c.x + size, c.y, c.z + size), (c.x - size, c.y, c.z + size)]
        mesh = bpy.data.meshes.new(f"{high.name}_retopo")
        mesh.from_pydata(verts, [], [(0, 1, 2, 3)])
        mesh.update()
        obj = bpy.data.objects.new(f"{high.name}_retopo", mesh)
        context.collection.objects.link(obj)

        mir = obj.modifiers.new("Mirror", "MIRROR")
        mir.use_axis[0] = True
        mir.use_clip = True
        mir.show_on_cage = True
        mir.show_in_editmode = True
        sw = obj.modifiers.new("Shrinkwrap", "SHRINKWRAP")
        sw.target = high
        sw.wrap_method = "NEAREST_SURFACEPOINT"
        sw.offset = max(high.dimensions) * 0.001
        sw.show_on_cage = True
        sw.show_in_editmode = True
        obj.show_in_front = True
        obj.show_wire = True

        ts = context.scene.tool_settings
        ts.use_snap = True
        for attr in ("snap_elements", "snap_elements_individual"):
            try:
                setattr(ts, attr, {"FACE_PROJECT"})
                break
            except Exception:
                continue

        _select_only(context, obj)
        bpy.ops.object.mode_set(mode="EDIT")
        try:
            bpy.ops.wm.tool_set_by_id(name="builtin.poly_build")
        except Exception:
            pass
        self.report({"INFO"}, "Pret : Ctrl+clic pour poser des sommets avec Poly Build ; place d'abord le curseur 3D sur le modele (Shift+clic droit).")
        return {"FINISHED"}


class RETOPO_OT_face_template(Operator):
    bl_idname = "retopo.face_template"
    bl_label = "Ajouter le gabarit de visage"
    bl_description = (
        "Cree une tete tout en quads avec boucles autour des yeux, de la bouche et des oreilles, "
        "placee sur le haut de l'objet actif, avec un Shrinkwrap pour l'ajuster"
    )
    bl_options = {"REGISTER", "UNDO"}
    poll = classmethod(_mesh_poll)

    def execute(self, context):
        s = context.scene.retopo_settings
        target = context.active_object
        verts, faces = face_template.build(int(s.template_res))
        mesh = bpy.data.meshes.new("FaceTemplate")
        mesh.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
        mesh.update()
        mesh.use_mirror_x = True
        for p in mesh.polygons:
            p.use_smooth = True

        corners = [target.matrix_world @ Vector(c) for c in target.bound_box]
        xs, ys, zs = [c.x for c in corners], [c.y for c in corners], [c.z for c in corners]
        height = max(zs) - min(zs)
        r = s.template_head_ratio * height / 2
        obj = bpy.data.objects.new(f"{target.name}_facetemplate", mesh)
        obj.location = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, max(zs) - r)
        obj.scale = (r, r, r)
        obj.rotation_euler.z = math.radians(s.template_rot_z)
        context.collection.objects.link(obj)

        sw = obj.modifiers.new("Fit", "SHRINKWRAP")
        sw.target = target
        sw.wrap_method = "NEAREST_SURFACEPOINT"
        _select_only(context, obj)
        self.report(
            {"INFO"},
            "Gabarit cree. Deplace (G) / redimensionne (S) l'objet pour qu'il recouvre la tete, "
            "puis clique 'Appliquer l'ajustement'. Affine ensuite yeux et bouche en Edit Mode (edition proportionnelle, O).",
        )
        return {"FINISHED"}


class RETOPO_OT_template_apply(Operator):
    bl_idname = "retopo.template_apply"
    bl_label = "Appliquer l'ajustement"
    bl_description = "Applique le Shrinkwrap 'Fit' du gabarit actif"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context):
        o = context.active_object
        return o is not None and o.type == "MESH" and "Fit" in o.modifiers and context.mode == "OBJECT"

    def execute(self, context):
        bpy.ops.object.modifier_apply(modifier="Fit")
        return {"FINISHED"}


class RETOPO_OT_part_add(Operator):
    bl_idname = "retopo.part_add"
    bl_label = "Ajouter une piece"

    def execute(self, context):
        context.scene.retopo_settings.parts.add()
        return {"FINISHED"}


class RETOPO_OT_part_remove(Operator):
    bl_idname = "retopo.part_remove"
    bl_label = "Retirer la piece"
    index: IntProperty()

    def execute(self, context):
        context.scene.retopo_settings.parts.remove(self.index)
        return {"FINISHED"}


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
        box.label(text="Pieces et densite")
        box.prop(s, "split_mode")
        if s.split_mode != "NONE":
            box.prop(s, "min_part_faces")
        if s.split_mode == "GROUPS":
            obj = context.active_object
            for i, item in enumerate(s.parts):
                row = box.row(align=True)
                row.prop_search(item, "group", obj, "vertex_groups", text="")
                row.prop(item, "density", text="x")
                op = row.operator("retopo.part_remove", text="", icon="X")
                op.index = i
            box.operator("retopo.part_add", icon="ADD")
            box.label(text="Le voxel pre-remesh est ignore (il efface les groupes).", icon="INFO")

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

        box = self.layout.box()
        box.label(text="Outils avec guides (meilleure topologie)")
        box.prop(s, "im_faces")
        box.prop(s, "im_crease")
        box.operator("retopo.instant_meshes", icon="EXPORT")
        box.operator("retopo.quad_remesher", icon="MOD_REMESH")

        box = self.layout.box()
        box.label(text="Gabarit de visage")
        box.prop(s, "template_res")
        box.prop(s, "template_head_ratio")
        box.prop(s, "template_rot_z")
        box.operator("retopo.face_template", icon="MESH_MONKEY")
        box.operator("retopo.template_apply", icon="CHECKMARK")

        box = self.layout.box()
        box.label(text="Retopo manuelle")
        box.operator("retopo.manual_setup", icon="SNAP_FACE")


classes = (RetopoPrefs, RETOPO_OT_instant_meshes, RETOPO_OT_quad_remesher, RETOPO_OT_manual_setup, RETOPO_OT_face_template, RETOPO_OT_template_apply, PartItem, RetopoSettings, RETOPO_OT_part_add, RETOPO_OT_part_remove, RETOPO_OT_run, RETOPO_PT_panel)


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
