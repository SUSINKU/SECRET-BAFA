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
    """Insere un anneau de quads autour d'une region rectangulaire de faces.

    Retourne un dict : 'ring' (sommets internes crees), 'interior' (sommets internes
    non crees), et le rectangle interieur (centre + demi-tailles) pour l'arrondi."""
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
    allv = {v for fi in region for v in faces[fi]}
    pts = [verts[v] for v in allv]
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
    return {
        "ring": list(copy.values()),
        "interior": list(allv - bverts),
        "axes": axes,
        "center": ((amin + amax) / 2, (bmin + bmax) / 2),
        "half": ((amax - amin) / 2 - t, (bmax - bmin) / 2 - t),
    }


def _round_ring(verts, info, r):
    """Arrondit un anneau rectangulaire en ellipse (carre -> disque), melange r in [0, 1]."""
    a, b = info["axes"]
    ca, cb = info["center"]
    ha, hb = info["half"]
    if ha < 1e-9 or hb < 1e-9:
        return
    for v in info["ring"]:
        u = (verts[v][a] - ca) / ha
        w = (verts[v][b] - cb) / hb
        u2 = u * math.sqrt(max(0.0, 1 - w * w / 2))
        w2 = w * math.sqrt(max(0.0, 1 - u * u / 2))
        verts[v][a] = ca + ha * (u + (u2 - u) * r)
        verts[v][b] = cb + hb * (w + (w2 - w) * r)


def _spherify(p):
    x, y, z = p
    x2, y2, z2 = x * x, y * y, z * z
    return [
        x * math.sqrt(max(0.0, 1 - y2 / 2 - z2 / 2 + y2 * z2 / 3)),
        y * math.sqrt(max(0.0, 1 - z2 / 2 - x2 / 2 + z2 * x2 / 3)),
        z * math.sqrt(max(0.0, 1 - x2 / 2 - y2 / 2 + x2 * y2 / 3)),
    ]


# Disposition sur la face avant (coordonnees du cube, x vers la droite, z vers le haut)
EYE_X = (1 / 6, 1 / 2)      # oeil cote +X ; l'autre est symetrique
EYE_Z = (0.0, 1 / 3)
NOSE_X = (-1 / 6, 1 / 6)
NOSE_Z = (-1 / 3, 0.0)
MOUTH_X = (-1 / 3, 1 / 3)
MOUTH_Z = (-2 / 3, -1 / 2)


def build(res=12, ears=True, neck=True, nose=0.10, socket=0.03):
    """Retourne (verts, faces) : sphere unite, visage vers -Y, quads uniquement."""
    n = res
    cell = 2.0 / n
    verts, faces = _cube_grid(n)
    front = dict(axis=1, value=-1.0, axes=(0, 2))
    eps = 0.001
    eye_inner, eye_rings = [], []
    nose_verts = []

    def region_of(xr, zr):
        return _select(verts, faces, rect=(xr[0] + eps, xr[1] - eps, zr[0] + eps, zr[1] - eps), **front)

    # yeux : 2 boucles, arrondies progressivement
    for sx in (1, -1):
        xr = tuple(sorted((sx * EYE_X[0], sx * EYE_X[1])))
        region = region_of(xr, EYE_Z)
        r1 = _inset(verts, faces, region, 0.22 * cell, front["axes"])
        r2 = _inset(verts, faces, region, 0.22 * cell, front["axes"])
        eye_rings.append((r1, r2))
        eye_inner += r2["ring"] + r2["interior"]
    # nez : 1 boucle ronde
    region = region_of(NOSE_X, NOSE_Z)
    rn = _inset(verts, faces, region, 0.30 * cell, front["axes"])
    nose_verts = rn["ring"] + rn["interior"]
    # bouche : 2 boucles en lentille
    region = region_of(MOUTH_X, MOUTH_Z)
    m1 = _inset(verts, faces, region, 0.18 * cell, front["axes"])
    m2 = _inset(verts, faces, region, 0.12 * cell, front["axes"])
    # oreilles : 1 boucle
    ear_rings = []
    if ears:
        for sx in (1, -1):
            region = _select(
                verts, faces, axis=0, value=float(sx),
                rect=(0.001, 1 / 3 - 0.001, -1 / 6 + 0.001, 1 / 6 - 0.001), axes=(1, 2),
            )
            ear_rings.append(_inset(verts, faces, region, 0.3 * cell, (1, 2)))

    # arrondi (apres tous les insets, pour ne pas fausser les rectangles)
    for r1, r2 in eye_rings:
        _round_ring(verts, r1, 0.5)
        _round_ring(verts, r2, 1.0)
    _round_ring(verts, rn, 1.0)
    _round_ring(verts, m1, 0.6)
    _round_ring(verts, m2, 1.0)
    for e in ear_rings:
        _round_ring(verts, e, 1.0)

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
    # relief : nez en saillie, orbites legerement creusees
    for v in set(nose_verts):
        verts[v] = [c * (1 + nose) for c in verts[v]]
    for v in set(eye_inner):
        verts[v] = [c * (1 - socket) for c in verts[v]]

    # compacter les sommets inutilises
    used = sorted({v for f in faces for v in f})
    remap = {old: new for new, old in enumerate(used)}
    verts = [verts[v] for v in used]
    faces = [[remap[v] for v in f] for f in faces]
    return verts, faces


def landmarks():
    """Positions (sphere unite, avant mise a l'echelle) de l'oeil cote +X et du centre de la bouche."""
    ex = (EYE_X[0] + EYE_X[1]) / 2
    ez = (EYE_Z[0] + EYE_Z[1]) / 2
    mz = (MOUTH_Z[0] + MOUTH_Z[1]) / 2
    return {
        "eye": _spherify([ex, -1.0, ez]),
        "mouth": _spherify([0.0, -1.0, mz]),
    }


def _smooth(a, b, x):
    """0 si x<=a, 1 si x>=b, transition douce entre les deux (a < b ou a > b)."""
    if a == b:
        return 1.0 if x >= b else 0.0
    s = min(1.0, max(0.0, (x - a) / (b - a)))
    return s * s * (3 - 2 * s)


def fit_weights(verts, hairline=0.45, softness=0.2):
    """Poids de projection par sommet pour une tete sans cheveux.

    1 = colle a la surface (visage sous la racine des cheveux), 0 = reste lisse (crane,
    arriere et cotes de la tete). `verts` sont les coordonnees de la sphere unite
    (visage vers -Y), `hairline` la hauteur Z de la racine des cheveux."""
    out = []
    for x, y, z in verts:
        below_hair = _smooth(hairline + softness, hairline, z)
        facing_front = _smooth(0.0, -0.3, y)
        out.append(below_hair * facing_front)
    return out
