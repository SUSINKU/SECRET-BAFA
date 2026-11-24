"""Gabarit de tete procedural (Python pur, sans bpy, donc testable hors Blender).

Principe : cube subdivise (n x n par face) -> boucles concentriques inserees sur la
face avant (yeux, bouche) et les faces laterales (oreilles) -> projection sur une
sphere -> ouverture a la base pour le cou. Tout est en quads, symetrique en X.

Convention Blender : le visage regarde vers -Y. Rayon de la sphere = 1.
"""
import math


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cube_grid(n):
    vid, verts, faces = {}, [], []

    def vert(i, j, k):
        key = (i, j, k)
        if key not in vid:
            vid[key] = len(verts)
            verts.append([-1 + 2 * i / n, -1 + 2 * j / n, -1 + 2 * k / n])
        return vid[key]

    for axis in range(3):
        for side in (0, n):
            for a in range(n):
                for b in range(n):
                    quad = []
                    for da, db in ((0, 0), (1, 0), (1, 1), (0, 1)):
                        idx = [0, 0, 0]
                        idx[axis] = side
                        idx[(axis + 1) % 3] = a + da
                        idx[(axis + 2) % 3] = b + db
                        quad.append(vert(*idx))
                    faces.append(quad)
    # normales vers l'exterieur
    for f in faces:
        p = [verts[v] for v in f]
        nrm = _cross(_sub(p[1], p[0]), _sub(p[3], p[0]))
        ctr = [sum(q[i] for q in p) / 4 for i in range(3)]
        if _dot(nrm, ctr) < 0:
            f.reverse()
    return verts, faces


def _centre(verts, f):
    return [sum(verts[v][i] for v in f) / len(f) for i in range(3)]


def _select(verts, faces, axis, value, rect, axes):
    """Faces dans le plan axis=value dont le centre est dans rect=(amin, amax, bmin, bmax)."""
    a, b = axes
    amin, amax, bmin, bmax = rect
    out = []
    for fi, f in enumerate(faces):
        if all(abs(verts[v][axis] - value) < 1e-9 for v in f):
            c = _centre(verts, f)
            if amin < c[a] < amax and bmin < c[b] < bmax:
                out.append(fi)
    return out


def _inset(verts, faces, region, t, axes):
    """Insere un anneau de quads autour d'une region rectangulaire de faces."""
    a, b = axes
    count = {}
    for fi in region:
        f = faces[fi]
        for k in range(4):
            key = frozenset((f[k], f[(k + 1) % 4]))
            count[key] = count.get(key, 0) + 1
    boundary = []
    for fi in region:
        f = faces[fi]
        for k in range(4):
            u, v = f[k], f[(k + 1) % 4]
            if count[frozenset((u, v))] == 1:
                boundary.append((u, v))
    bverts = {u for u, _ in boundary} | {v for _, v in boundary}
    pts = [verts[v] for fi in region for v in faces[fi]]
    amin, amax = min(p[a] for p in pts), max(p[a] for p in pts)
    bmin, bmax = min(p[b] for p in pts), max(p[b] for p in pts)
    copy = {}
    for v in bverts:
        p = verts[v][:]
        p[a] = min(max(p[a], amin + t), amax - t)
        p[b] = min(max(p[b], bmin + t), bmax - t)
        copy[v] = len(verts)
        verts.append(p)
    for fi in region:
        faces[fi] = [copy.get(v, v) for v in faces[fi]]
    for u, v in boundary:
        faces.append([u, v, copy[v], copy[u]])


def _spherify(p):
    x, y, z = p
    x2, y2, z2 = x * x, y * y, z * z
    return [
        x * math.sqrt(max(0.0, 1 - y2 / 2 - z2 / 2 + y2 * z2 / 3)),
        y * math.sqrt(max(0.0, 1 - z2 / 2 - x2 / 2 + z2 * x2 / 3)),
        z * math.sqrt(max(0.0, 1 - x2 / 2 - y2 / 2 + x2 * y2 / 3)),
    ]


def build(res=12, ears=True, neck=True):
    """Retourne (verts, faces) : sphere unite, visage vers -Y, quads uniquement."""
    n = res
    cell = 2.0 / n
    verts, faces = _cube_grid(n)
    front = dict(axis=1, value=-1.0, axes=(0, 2))

    # yeux : region 2x2 cellules (a n=12) de chaque cote, 2 boucles
    for sx in (1, -1):
        lo, hi = sorted((sx * 1 / 6 + sx * 0.001, sx * 0.5 - sx * 0.001))
        region = _select(verts, faces, rect=(lo, hi, 0.001, 1 / 3 - 0.001), **front)
        _inset(verts, faces, region, 0.40 * cell, front["axes"])
        _inset(verts, faces, region, 0.30 * cell, front["axes"])
    # bouche : region 4x1 cellules, 2 boucles
    region = _select(verts, faces, rect=(-1 / 3 + 0.001, 1 / 3 - 0.001, -0.5 + 0.001, -1 / 3 - 0.001), **front)
    _inset(verts, faces, region, 0.25 * cell, front["axes"])
    _inset(verts, faces, region, 0.15 * cell, front["axes"])
    # oreilles : region 2x2 sur les cotes, 1 boucle
    if ears:
        for sx in (1, -1):
            region = _select(
                verts, faces, axis=0, value=float(sx),
                rect=(0.001, 1 / 3 - 0.001, -1 / 6 + 0.001, 1 / 6 - 0.001), axes=(1, 2),
            )
            _inset(verts, faces, region, 0.3 * cell, (1, 2))

    # ouverture du cou (face du bas, centre)
    if neck:
        faces = [
            f for f in faces
            if not (
                all(abs(verts[v][2] + 1.0) < 1e-9 for v in f)
                and abs(_centre(verts, f)[0]) < 0.34
                and abs(_centre(verts, f)[1]) < 0.34
            )
        ]

    verts = [_spherify(p) for p in verts]

    # compacter les sommets inutilises
    used = sorted({v for f in faces for v in f})
    remap = {old: new for new, old in enumerate(used)}
    verts = [verts[v] for v in used]
    faces = [[remap[v] for v in f] for f in faces]
    return verts, faces
