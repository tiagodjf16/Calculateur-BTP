"""Construit dans Blender les bâtiments réels de Donzère à partir des emprises IGN (BD TOPO) :
murs découpés en travées (fenêtres à volets, portes, garages), toits à deux pans en tuiles, toits plats.

Usage : python outils/monde.py      -> modeles/batiments_brut.glb (à alléger ensuite avec optimiser.mjs)
Repère du jeu : x vers l'est, y vers le haut, z vers le sud ; Blender : X = x, Y = -z (nord), Z = y.
"""
import sys, os, json, math, base64
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)
import numpy as np
import bpy
from shapely.geometry import Polygon, MultiPolygon, Point
from shapely.geometry.polygon import orient
from shapely import STRtree
import mapbox_earcut as earcut
from PIL import Image
import atelier as A
import facades, cc0

RACINE = os.path.join(ICI, '..')
D = json.load(open(os.path.join(RACINE, 'data', 'donzere.json')))
LARG, HAUT = D['taille']
N = D['relief']['n']
REL = np.frombuffer(base64.b64decode(D['relief']['data']), '<u2').reshape(N, N).astype(np.float64) / 100.0


def sol(x, y):
    """Altitude du terrain (m au-dessus du point bas de la carte) en X (est), Y (nord)."""
    fx = min(max((x + LARG / 2) / LARG * (N - 1), 0), N - 1.001)
    fz = min(max((-y + HAUT / 2) / HAUT * (N - 1), 0), N - 1.001)
    i, j = int(fx), int(fz)
    a, b = fx - i, fz - j
    return (REL[j, i] * (1 - a) * (1 - b) + REL[j, i + 1] * a * (1 - b) + REL[j + 1, i] * (1 - a) * b + REL[j + 1, i + 1] * a * b)


# teintes de crépi provençales (multipliées par le crépi clair de l'atlas)
TEINTES = [(0.86, 0.80, 0.68), (0.84, 0.74, 0.58), (0.80, 0.66, 0.48), (0.88, 0.78, 0.68), (0.80, 0.78, 0.72), (0.90, 0.88, 0.82),
           (0.78, 0.68, 0.54), (0.86, 0.72, 0.62), (0.84, 0.80, 0.66), (0.74, 0.70, 0.62), (0.82, 0.62, 0.50), (0.90, 0.84, 0.72)]
MAILLE = 4                                   # découpage de la carte en 4 x 4 dalles (pour n'afficher que ce qui est visible)


class Lot:
    def __init__(self):
        self.p, self.uv, self.c = [], [], []

    def tri(self, p0, p1, p2, uv0, uv1, uv2, coul):
        self.p += [p0, p1, p2]; self.uv += [uv0, uv1, uv2]; self.c += [coul, coul, coul]

    def quad(self, p0, p1, p2, p3, u0, u1, v0, v1, coul):
        self.tri(p0, p1, p2, (u0, v0), (u1, v0), (u1, v1), coul)
        self.tri(p0, p2, p3, (u0, v0), (u1, v1), (u0, v1), coul)


lots = {}


def lot(dalle, mat):
    return lots.setdefault((dalle, mat), Lot())


# ---------------------------------------------------------------- emprises propres
polys, infos = [], []
for b in D['batiments']:
    pts = list(zip(b['p'][0::2], [-v for v in b['p'][1::2]]))
    trous = [list(zip(t[0::2], [-v for v in t[1::2]])) for t in b.get('t', [])]
    if len(pts) < 3:
        continue
    try:
        p = Polygon(pts, trous)
        if not p.is_valid:
            p = p.buffer(0)
        if isinstance(p, MultiPolygon):
            p = max(p.geoms, key=lambda g: g.area)
        if p.is_empty or p.area < 6:
            continue
        polys.append(orient(p.simplify(0.05), 1.0))
        infos.append(b)
    except Exception:
        pass
arbre = STRtree(polys)
print(len(polys), 'bâtiments')
moy_tuile = np.asarray(Image.open(cc0.texture('clay_roof_tiles_02', 'Diffuse', '1k')).convert('RGB'), np.float32).reshape(-1, 3).mean(0)
stats = dict(pans=0, plats=0, quads=0)


def decouper(poly, c, n, signe):
    """Partie du polygone du côté `signe` de la droite passant par c, de normale n."""
    G = 5000.0
    d = np.array([-n[1], n[0]])
    a, b_ = c - d * G, c + d * G
    demi = Polygon([a, b_, b_ + n * G * signe, a + n * G * signe])
    r = poly.intersection(demi)
    if r.is_empty:
        return []
    geoms = r.geoms if hasattr(r, 'geoms') else [r]
    return [g for g in geoms if isinstance(g, Polygon) and g.area > 0.05]


def trianguler(poly):
    anneaux = [list(poly.exterior.coords)[:-1]] + [list(i.coords)[:-1] for i in poly.interiors]
    v = np.array([q for a in anneaux for q in a], np.float64)
    fins = np.cumsum([len(a) for a in anneaux]).astype(np.uint32)
    t = earcut.triangulate_float64(v, fins).reshape(-1, 3)
    return v, t


for ib, (poly, b) in enumerate(zip(polys, infos)):
    rng = np.random.default_rng(1000 + ib)
    cx, cy = poly.centroid.x, poly.centroid.y
    dalle = (min(MAILLE - 1, max(0, int((cx + LARG / 2) / LARG * MAILLE))), min(MAILLE - 1, max(0, int((-cy + HAUT / 2) / HAUT * MAILLE))))
    ext = list(poly.exterior.coords)[:-1]
    g = [sol(x, y) for x, y in ext]
    g_min, g_max = min(g), max(g)
    aire, h = poly.area, float(b['h'])
    usage = b['u']
    if usage in ('Industriel', 'Agricole', 'Commercial et services', 'Sportif') and aire > 180:
        style = 'industriel'
    elif usage == 'Annexe' or h < 3.2 or aire < 28 or b['l']:
        style = 'annexe'
    elif aire > 420 and h > 8:
        style = 'collectif'
    else:
        style = 'maison'
    z0 = min(g_max, g_min + 1.2)                       # niveau du rez-de-chaussée
    base = g_min - 0.8
    h_eff = max(2.5, h - (z0 - g_min))
    egout = z0 + h_eff
    etages = max(1, int(round(h_eff / 2.85)))
    he = h_eff / etages
    teinte = TEINTES[int(rng.integers(len(TEINTES)))] if style != 'industriel' else (0.74, 0.75, 0.74)
    teinte = tuple(t * float(rng.uniform(0.9, 1.04)) for t in teinte)
    if style == 'annexe':
        teinte = tuple(t * 0.95 for t in teinte)
    volets = ['volets_bleus', 'volets_verts', 'volets_gris', 'roulant'][int(rng.choice(4, p=[0.34, 0.2, 0.2, 0.26]))]
    if style == 'collectif':
        volets = 'roulant'

    # ---- toit : deux pans au-dessus du rectangle englobant, ou plat
    rect = list(poly.minimum_rotated_rectangle.exterior.coords)[:4]
    e0, e1 = np.subtract(rect[1], rect[0]), np.subtract(rect[2], rect[1])
    l0, l1 = np.hypot(*e0), np.hypot(*e1)
    dfait = (e0 / l0) if l0 >= l1 else (e1 / l1)        # direction du faîtage (grand côté)
    nrm = np.array([-dfait[1], dfait[0]])
    centre = np.mean(rect, axis=0)
    w = min(l0, l1) / 2
    r = float(b.get('r', 0))
    pans = style in ('maison', 'collectif', 'annexe') and r >= 0.5 and w > 1.2
    rise = min(max(r, 0.24 * w), 0.40 * w) if pans else 0.0

    def z_toit(x, y):
        return egout + rise * (1 - min(1.0, abs(float(np.dot((x - centre[0], y - centre[1]), nrm))) / w)) if pans else egout

    # ---- murs
    voisins = [polys[k] for k in arbre.query(poly.buffer(0.6)) if k != ib]
    anneaux = [ext] + [list(i.coords)[:-1] for i in poly.interiors]
    aretes = []
    for an in anneaux:
        for k in range(len(an)):
            a, c = np.array(an[k]), np.array(an[(k + 1) % len(an)])
            L = float(np.hypot(*(c - a)))
            if L < 0.08:
                continue
            # coupe au faîtage pour former le pignon
            da, dc = float(np.dot(a - centre, nrm)), float(np.dot(c - centre, nrm))
            morceaux = [(a, a + (c - a) * (da / (da - dc))), (a + (c - a) * (da / (da - dc)), c)] if (pans and da * dc < -1e-6) else [(a, c)]
            for p_, q_ in morceaux:
                if np.hypot(*(q_ - p_)) > 0.08:
                    aretes.append((p_, q_))
    longueurs = [float(np.hypot(*(q - p))) for p, q in aretes]
    mitoyen = []
    for (p_, q_), L in zip(aretes, longueurs):
        dx, dy = (q_ - p_) / L
        m = (p_ + q_) / 2 + np.array([dy, -dx]) * 0.5
        mitoyen.append(any(v.contains(Point(m)) for v in voisins))
    libres = [k for k in range(len(aretes)) if not mitoyen[k] and longueurs[k] >= 2.4]
    porte = max(libres, key=lambda k: longueurs[k]) if libres and style in ('maison', 'collectif') else -1
    garage = -1
    if style == 'maison' and len(libres) > 1 and rng.random() < 0.45:
        autres = [k for k in libres if k != porte and longueurs[k] >= 3.0]
        if autres:
            garage = autres[int(rng.integers(len(autres)))]
    murs = lot(dalle, 'facades')
    for k, ((p_, q_), L) in enumerate(zip(aretes, longueurs)):
        d = (q_ - p_) / L
        pt = lambda s, z: (float(p_[0] + d[0] * s), float(p_[1] + d[1] * s), float(z))
        nb = max(1, int(round(L / 3.0)))
        bw = L / nb
        simple = mitoyen[k] or L < 2.2 or style in ('annexe', 'industriel')
        # soubassement
        for i in range(nb):
            u0, u1, v0, v1 = facades.uv_cellule('nu', 0, min(1, bw / 3), 0, min(1.0, (z0 - base) / 3))
            murs.quad(pt(i * bw, base), pt((i + 1) * bw, base), pt((i + 1) * bw, z0), pt(i * bw, z0), u0, u1, v0, v1, tuple(t * 0.86 for t in teinte))
            stats['quads'] += 1
        for f in range(etages):
            za, zb = z0 + f * he, z0 + (f + 1) * he
            for i in range(nb):
                cel = 'nu'
                if not simple:
                    t = rng.random()
                    if f == 0 and k == porte and i == nb // 2:
                        cel = 'porte_bois' if volets != 'roulant' else 'porte_moderne'
                    elif f == 0 and k == garage and i == 0 and bw >= 2.6:
                        cel = 'garage_bois' if rng.random() < 0.4 else 'garage_metal'
                    elif t < 0.14:
                        cel = ['nu', 'nu_tache', 'nu_gouttiere'][int(rng.integers(3))]
                    elif volets == 'roulant':
                        cel = 'porte_fenetre' if (style == 'collectif' and f > 0 and t < 0.5) else ('roulant_mi' if t < 0.7 else 'roulant_ferme')
                    elif t < 0.30:
                        cel = 'volets_fermes_bleus' if volets != 'volets_verts' else 'volets_fermes_bois'
                    elif t < 0.36 and f > 0:
                        cel = 'petite'
                    else:
                        cel = volets
                elif style == 'annexe' and f == 0 and k == (libres[0] if libres else -1) and i == 0 and bw >= 2.5:
                    cel = 'garage_metal' if rng.random() < 0.5 else 'porte_bois'
                elif rng.random() < 0.12:
                    cel = 'nu_tache'
                plein = cel.startswith('nu')
                u0, u1, v0, v1 = facades.uv_cellule(cel, 0, min(1, bw / 3) if plein else 1, 0, min(1, he / 3) if plein else 1)
                murs.quad(pt(i * bw, za), pt((i + 1) * bw, za), pt((i + 1) * bw, zb), pt(i * bw, zb), u0, u1, v0, v1, teinte)
                stats['quads'] += 1
        # pignon : du niveau de l'égout jusqu'à la pente du toit
        if pans:
            for i in range(nb):
                s0, s1 = i * bw, (i + 1) * bw
                h0, h1 = z_toit(*pt(s0, 0)[:2]), z_toit(*pt(s1, 0)[:2])
                if max(h0, h1) - egout > 0.03:
                    u0, u1, v0, v1 = facades.uv_cellule('nu', 0, min(1, bw / 3), 0, 1)
                    vv = lambda z: v0 + (v1 - v0) * min(1.0, (z - egout) / 3.0)
                    A0, B0, B1, A1 = pt(s0, egout), pt(s1, egout), pt(s1, h1), pt(s0, h0)
                    murs.tri(A0, B0, B1, (u0, v0), (u1, v0), (u1, vv(h1)), teinte)
                    murs.tri(A0, B1, A1, (u0, v0), (u1, vv(h1)), (u0, vv(h0)), teinte)

    # ---- couverture
    if pans:
        stats['pans'] += 1
        debord = 0.0 if any(mitoyen) else 0.32
        emprise = poly.buffer(debord, join_style=2) if debord else poly
        cr, cg, cb = b.get('c', [150, 110, 90])
        tt = tuple(float(np.clip(0.45 + 0.55 * v / m, 0.6, 1.3)) for v, m in zip((cr, cg, cb), moy_tuile))
        toit = lot(dalle, 'tuiles')
        k_pente = math.sqrt(1 + (rise / w) ** 2)
        for signe in (1, -1):
            for morceau in decouper(emprise, centre, nrm, signe):
                v2, tr = trianguler(morceau)
                for t3 in tr:
                    P, UV = [], []
                    for q in v2[t3]:
                        dn = abs(float(np.dot(q - centre, nrm)))
                        P.append((float(q[0]), float(q[1]), float(egout + rise * (1 - dn / w))))
                        UV.append((signe * float(np.dot(q - centre, dfait)) / 2.2, (w - dn) * k_pente / 2.2))
                    nz = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0])
                    o = (0, 1, 2) if nz > 0 else (0, 2, 1)
                    toit.tri(P[o[0]], P[o[1]], P[o[2]], UV[o[0]], UV[o[1]], UV[o[2]], tt)
    else:
        stats['plats'] += 1
        toit = lot(dalle, 'toit_plat')
        v2, tr = trianguler(poly)
        for t3 in tr:
            P = [(float(q[0]), float(q[1]), float(egout)) for q in v2[t3]]
            UV = [((q[0] + LARG / 2) / LARG, (q[1] + HAUT / 2) / HAUT) for q in v2[t3]]
            nz = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0])
            o = (0, 1, 2) if nz > 0 else (0, 2, 1)
            toit.tri(P[o[0]], P[o[1]], P[o[2]], UV[o[0]], UV[o[1]], UV[o[2]], (1.0, 1.0, 1.0))
        if style != 'annexe':                           # acrotère : petit relevé en bord de toit plat
            for k in range(len(ext)):
                a, c = ext[k], ext[(k + 1) % len(ext)]
                u0, u1, v0, v1 = facades.uv_cellule('nu', 0, 0.3, 0, 0.1)
                lot(dalle, 'facades').quad((a[0], a[1], egout), (c[0], c[1], egout), (c[0], c[1], egout + 0.35), (a[0], a[1], egout + 0.35), u0, u1, v0, v1, tuple(t * 0.92 for t in teinte))
print(stats)

# ---------------------------------------------------------------- matériaux et maillages Blender
A.nouvelle_scene()
TEX = os.path.join(RACINE, '.cache', 'tex')
f_c, f_n, f_o = facades.composer(TEX)


def reduire(src, nom, taille=1024, q=88):
    f = os.path.join(TEX, nom)
    Image.open(src).convert('RGB').resize((taille, taille), Image.LANCZOS).save(f, quality=q)
    return f


def mat_tex(nom, coul, normale=None, orm=None, double=False):
    m = A.materiau_texture(nom, coul, orm, normale, double=double)
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    lien = bsdf.inputs['Base Color'].links[0]
    src = lien.from_socket
    nt.links.remove(lien)
    ca = nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'Col'
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type, mix.blend_type = 'RGBA', 'MULTIPLY'
    mix.inputs[0].default_value = 1.0
    nt.links.new(src, mix.inputs[6])
    nt.links.new(ca.outputs['Color'], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    return m


arm = Image.open(cc0.texture('clay_roof_tiles_02', 'arm', '1k')).convert('RGB').resize((1024, 1024))
f_arm = os.path.join(TEX, 'tuiles_orm.jpg')
arm.save(f_arm, quality=88)
MATS = {
    'facades': mat_tex('facades', f_c, f_n, f_o),
    'tuiles': mat_tex('tuiles', reduire(cc0.texture('clay_roof_tiles_02', 'Diffuse', '1k'), 'tuiles_couleur.jpg'),
                      reduire(cc0.texture('clay_roof_tiles_02', 'nor_gl', '1k'), 'tuiles_normale.jpg', q=92), f_arm, double=True),
    'toit_plat': A.materiau('toit_plat', (0.5, 0.5, 0.5), rug=0.9),
}
tot = 0
for ((i, j), nom_mat), L in sorted(lots.items()):
    n = len(L.p)
    if not n:
        continue
    me = bpy.data.meshes.new(f'{nom_mat}_{i}_{j}')
    me.vertices.add(n)
    me.vertices.foreach_set('co', np.array(L.p, np.float32).ravel())
    me.loops.add(n)
    me.loops.foreach_set('vertex_index', np.arange(n, dtype=np.int32))
    me.polygons.add(n // 3)
    me.polygons.foreach_set('loop_start', np.arange(0, n, 3, dtype=np.int32))
    try:
        me.polygons.foreach_set('loop_total', np.full(n // 3, 3, dtype=np.int32))
    except Exception:
        pass
    me.polygons.foreach_set('use_smooth', np.zeros(n // 3, dtype=bool))
    me.uv_layers.new(name='UVMap').data.foreach_set('uv', np.array(L.uv, np.float32).ravel())
    col = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    col.data.foreach_set('color_srgb', np.concatenate([np.clip(np.array(L.c, np.float32), 0, 1), np.ones((n, 1), np.float32)], 1).ravel())
    me.update(calc_edges=True)
    me.materials.append(MATS[nom_mat])
    A.lier(bpy.data.objects.new(me.name, me))
    tot += n // 3
print('triangles :', tot)
sortie = os.path.join(RACINE, 'modeles', 'batiments_brut.glb')
os.makedirs(os.path.dirname(sortie), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=sortie, export_format='GLB', export_apply=False, export_yup=True, export_image_format='AUTO',
                          export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True)
print('exporté', sortie, os.path.getsize(sortie) // 1024, 'Ko')
if len(sys.argv) > 1:                                   # aperçu : vue du centre ancien
    A.decor_apercu(elevation=34.0, azimut=205.0)
    bpy.data.objects.remove(bpy.data.objects['sol_apercu'])
    A.rendu(os.path.join(sys.argv[1], 'donzere_blender.png'), (-120, 520, 130), (60, 660, 70), focale=35)
