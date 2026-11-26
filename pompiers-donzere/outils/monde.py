"""Construit dans Blender les bâtiments réels de Donzère à partir des emprises IGN (BD TOPO) :
murs découpés en travées (fenêtres à volets, portes, garages), bourg ancien en galets, église en pierre, zones d'activité en bardage,
toits à deux pans en tuiles avec génoises et cheminées, toits plats, devantures des commerces réels (annuaire Sirene) et enseignes publiques.

Usage : python outils/monde.py [dossier_apercu]   -> modeles/batiments_brut.glb (à alléger ensuite avec optimiser.mjs)
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
import facades, devantures, cc0

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
TOLES = [(0.86, 0.87, 0.86), (0.76, 0.78, 0.77), (0.90, 0.87, 0.78), (0.68, 0.74, 0.78), (0.62, 0.69, 0.63), (0.82, 0.80, 0.74)]
FAMILLES = {
    'crepi': dict(nu=['nu', 'nu', 'nu', 'nu_gouttiere'], porte='porte_bois', petite='petite'),
    'galets': dict(nu=['galets_nu', 'galets_nu', 'galets_gouttiere'], fen='galets_volets', ferme='galets_volets_fermes', porte='galets_porte', petite='galets_petite'),
    'ancien': dict(nu=['ancien_nu'], fen='ancien_volets', ferme='ancien_volets_fermes', porte='ancien_porte', petite='ancien_volets'),
    'pierre': dict(nu=['pierre_nu'], fen='pierre_arche', ferme='pierre_nu', porte='galets_porte', petite='pierre_arche'),
    'bardage': dict(nu=['bardage'], fen='bardage_fenetres', ferme='bardage', porte='bardage_entree', petite='bardage_fenetres'),
}
PUBLICS = {'Mairie': ('public', 'Mairie'), 'Poste': ('poste', 'La Poste'), 'Gendarmerie': ('gendarmerie', 'Gendarmerie nationale'),
           'Caserne de pompiers': ('pompiers', 'Centre de secours'), 'Enseignement primaire': ('public', None), 'Maison de retraite': ('public', None),
           'Salle de spectacle ou conférence': ('public', None), 'Ecomusée': ('public', None), 'Divers public ou administratif': ('public', None),
           "Autre établissement d'enseignement": ('public', None)}
MAILLE = 4                                   # découpage de la carte en 4 x 4 dalles (pour n'afficher que ce qui est visible)


class Lot:
    def __init__(self):
        self.p, self.uv, self.c = [], [], []

    def tri(self, p0, p1, p2, uv0, uv1, uv2, coul):
        self.p += [p0, p1, p2]; self.uv += [uv0, uv1, uv2]; self.c += [coul, coul, coul]

    def quad(self, p0, p1, p2, p3, u0, u1, v0, v1, coul):
        self.tri(p0, p1, p2, (u0, v0), (u1, v0), (u1, v1), coul)
        self.tri(p0, p2, p3, (u0, v0), (u1, v1), (u0, v1), coul)

    def boite(self, x0, y0, z0, x1, y1, z1, coul):
        """Pavé droit (couleur unie) aligné sur les axes."""
        P = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        for a, b, c, d in ((0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7), (3, 2, 1, 0)):
            self.quad(P[a], P[b], P[c], P[d], 0, 0, 0, 0, coul)


lots = {}


def lot(dalle, mat):
    return lots.setdefault((dalle, mat), Lot())


# ---------------------------------------------------------------- emprises propres
polys, infos, brut_vers_poly = [], [], {}
for ib_brut, b in enumerate(D['batiments']):
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
        brut_vers_poly[ib_brut] = len(polys)
        polys.append(orient(p.simplify(0.05), 1.0))
        infos.append(b)
    except Exception:
        pass
arbre = STRtree(polys)
print(len(polys), 'bâtiments')
moy_tuile = np.asarray(Image.open(cc0.texture('clay_roof_tiles_02', 'Diffuse', '1k')).convert('RGB'), np.float32).reshape(-1, 3).mean(0)
stats = dict(pans=0, plats=0, quads=0, bourg=0, enseignes=0)

# ---------------------------------------------------------------- enseignes : commerces réels et bâtiments publics
enseignes_par_bat = {}
f_com = os.path.join(RACINE, 'data', 'commerces.json')
if os.path.exists(f_com):
    for c in json.load(open(f_com)):
        if c['bat'] in brut_vers_poly:
            enseignes_par_bat.setdefault(brut_vers_poly[c['bat']], []).append(dict(nom=c['nom'], type=c['type'], x=c['x'], y=-c['z']))
caserne = -1
for l in D['lieux']:
    if l['n'] not in PUBLICS:
        continue
    typ, nom = PUBLICS[l['n']]
    pt = Point(l['x'], -l['z'])
    proches = [k for k in arbre.query(pt.buffer(90)) if polys[k].area > 60]
    if not proches:
        continue
    k = min(proches, key=lambda k: polys[k].distance(pt) - min(polys[k].area, 600) * 0.02)
    enseignes_par_bat.setdefault(int(k), []).insert(0, dict(nom=nom or l['nom'] or l['n'], type=typ, x=l['x'], y=-l['z']))
    if typ == 'pompiers':
        caserne = int(k)


def decouper(poly, c, n, signe):
    """Partie du polygone du côté `signe` de la droite passant par c, de normale n."""
    G = 5000.0
    d = np.array([-n[1], n[0]])
    a, b_ = c - d * G, c + d * G
    r = poly.intersection(Polygon([a, b_, b_ + n * G * signe, a + n * G * signe]))
    if r.is_empty:
        return []
    return [g for g in (r.geoms if hasattr(r, 'geoms') else [r]) if isinstance(g, Polygon) and g.area > 0.05]


def trianguler(poly):
    anneaux = [list(poly.exterior.coords)[:-1]] + [list(i.coords)[:-1] for i in poly.interiors]
    v = np.array([q for a in anneaux for q in a], np.float64)
    fins = np.cumsum([len(a) for a in anneaux]).astype(np.uint32)
    return v, earcut.triangulate_float64(v, fins).reshape(-1, 3)


# ---------------------------------------------------------------- 1re passe : style de chaque bâtiment, arêtes, emplacement des enseignes
preps, toutes_enseignes = [], []
for ib, (poly, b) in enumerate(zip(polys, infos)):
    rng = np.random.default_rng(1000 + ib)
    ext = list(poly.exterior.coords)[:-1]
    g = [sol(x, y) for x, y in ext]
    g_min, g_max = min(g), max(g)
    aire, h, usage, nature = poly.area, float(b['h']), b['u'], b['n']
    if nature in ('Eglise', 'Chapelle'):
        style = 'eglise'
    elif ib == caserne or nature in ('Serre', 'Silo', 'Tribune') or ((nature.startswith('Industriel') or usage in ('Industriel', 'Agricole', 'Commercial et services', 'Sportif')) and aire > 180):
        style = 'industriel'
    elif usage == 'Annexe' or h < 3.2 or aire < 28 or b['l']:
        style = 'annexe'
    elif aire > 420 and h > 8:
        style = 'collectif'
    else:
        style = 'maison'
    # toit : deux pans au-dessus du rectangle englobant, ou plat
    rect = list(poly.minimum_rotated_rectangle.exterior.coords)[:4]
    e0, e1 = np.subtract(rect[1], rect[0]), np.subtract(rect[2], rect[1])
    l0, l1 = np.hypot(*e0), np.hypot(*e1)
    dfait = (e0 / l0) if l0 >= l1 else (e1 / l1)
    nrm = np.array([-dfait[1], dfait[0]])
    centre = np.mean(rect, axis=0)
    w = min(l0, l1) / 2
    r = float(b.get('r', 0))
    pans = style in ('maison', 'collectif', 'annexe', 'eglise') and r >= 0.5 and w > 1.2
    rise = min(max(r, 0.24 * w), 0.40 * w) if pans else 0.0
    # arêtes des murs (coupées au faîtage pour former les pignons)
    voisins = [polys[k] for k in arbre.query(poly.buffer(0.6)) if k != ib]
    aretes = []
    for an in [ext] + [list(i.coords)[:-1] for i in poly.interiors]:
        for k in range(len(an)):
            a, c = np.array(an[k]), np.array(an[(k + 1) % len(an)])
            if np.hypot(*(c - a)) < 0.08:
                continue
            da, dc = float(np.dot(a - centre, nrm)), float(np.dot(c - centre, nrm))
            morceaux = [(a, a + (c - a) * (da / (da - dc))), (a + (c - a) * (da / (da - dc)), c)] if (pans and da * dc < -1e-6) else [(a, c)]
            aretes += [(p_, q_) for p_, q_ in morceaux if np.hypot(*(q_ - p_)) > 0.08]
    longueurs = [float(np.hypot(*(q - p))) for p, q in aretes]
    mitoyen = []
    for (p_, q_), L in zip(aretes, longueurs):
        dx, dy = (q_ - p_) / L
        m = (p_ + q_) / 2 + np.array([dy, -dx]) * 0.5
        mitoyen.append(any(v.contains(Point(m)) for v in voisins))
    famille = {'eglise': 'pierre', 'industriel': 'bardage'}.get(style, 'crepi')
    if style == 'maison' and sum(mitoyen) >= 2 and aire < 320:               # maisons accolées du bourg ancien
        style = 'bourg'
        famille = ['galets', 'ancien', 'crepi'][int(rng.choice(3, p=[0.38, 0.34, 0.28]))]
        stats['bourg'] += 1
    if famille == 'crepi':
        teinte = TEINTES[int(rng.integers(len(TEINTES)))]
    elif famille == 'bardage':
        teinte = TOLES[int(rng.integers(len(TOLES)))]
    else:
        teinte = (0.95, 0.94, 0.92)
    teinte = tuple(t * float(rng.uniform(0.9, 1.04)) for t in teinte)
    z0 = min(g_max, g_min + 1.2)
    h_eff = max(2.5, h - (z0 - g_min))
    etages = max(1, int(round(h_eff / 2.85)))
    # enseignes : chaque commerce va sur la façade libre la plus proche de son adresse
    places = {}
    libres = [k for k in range(len(aretes)) if not mitoyen[k] and longueurs[k] >= 3.0]
    for e in enseignes_par_bat.get(ib, []):
        if not libres or h_eff / etages < 2.3:
            break
        pt = np.array([e['x'], e['y']])

        def ecart(k):
            p_, q_ = aretes[k]
            t = np.clip(np.dot(pt - p_, q_ - p_) / longueurs[k] ** 2, 0, 1)
            return float(np.hypot(*(p_ + (q_ - p_) * t - pt))) - min(longueurs[k], 12) * 0.5 + len(places.get(k, [])) * 4
        k = min(libres, key=ecart)
        if (len(places.get(k, [])) + 1) * 2.9 + 0.4 <= longueurs[k]:
            places.setdefault(k, []).append(e)
    for k, liste in places.items():
        larg = min(6.0, (longueurs[k] - 0.4) / len(liste) - 0.25)
        total = len(liste) * larg + (len(liste) - 1) * 0.25
        for i, e in enumerate(liste):
            e.update(s0=(longueurs[k] - total) / 2 + i * (larg + 0.25), largeur=larg, teinte=teinte, famille=famille if famille != 'pierre' else 'galets', index=len(toutes_enseignes))
            toutes_enseignes.append(e)
    preps.append(dict(style=style, famille=famille, teinte=teinte, pans=pans, rise=rise, dfait=dfait, nrm=nrm, centre=centre, w=w, long=max(l0, l1),
                      aretes=aretes, longueurs=longueurs, mitoyen=mitoyen, z0=z0, base=g_min - 0.8, h_eff=h_eff, etages=etages, places=places, ext=ext, aire=aire))

TEX = os.path.join(RACINE, '.cache', 'tex')
f_dev, emplacements = devantures.composer(TEX, toutes_enseignes) if toutes_enseignes else ([], [])
stats['enseignes'] = len(toutes_enseignes)

# ---------------------------------------------------------------- 2e passe : géométrie
for ib, (poly, b, P) in enumerate(zip(polys, infos, preps)):
    rng = np.random.default_rng(5000 + ib)
    cx, cy = poly.centroid.x, poly.centroid.y
    dalle = (min(MAILLE - 1, max(0, int((cx + LARG / 2) / LARG * MAILLE))), min(MAILLE - 1, max(0, int((-cy + HAUT / 2) / HAUT * MAILLE))))
    style, famille, teinte, pans, rise, dfait, nrm, centre, w = (P[k] for k in ('style', 'famille', 'teinte', 'pans', 'rise', 'dfait', 'nrm', 'centre', 'w'))
    aretes, longueurs, mitoyen, z0, base, h_eff, etages = (P[k] for k in ('aretes', 'longueurs', 'mitoyen', 'z0', 'base', 'h_eff', 'etages'))
    F = FAMILLES[famille]
    egout = z0 + h_eff
    he = h_eff / etages
    volets = ['volets_bleus', 'volets_verts', 'volets_gris', 'roulant'][int(rng.choice(4, p=[0.34, 0.2, 0.2, 0.26]))]
    if style == 'collectif':
        volets = 'roulant'
    if style == 'bourg' and volets == 'roulant':
        volets = 'volets_gris'
    nu = lambda: F['nu'][int(rng.integers(len(F['nu'])))]

    def z_toit(x, y):
        return egout + rise * (1 - min(1.0, abs(float(np.dot((x - centre[0], y - centre[1]), nrm))) / w)) if pans else egout

    libres = [k for k in range(len(aretes)) if not mitoyen[k] and longueurs[k] >= 2.4]
    porte = max(libres, key=lambda k: longueurs[k]) if libres and style in ('maison', 'collectif', 'bourg', 'eglise', 'industriel') else -1
    garage = -1
    if style == 'maison' and len(libres) > 1 and rng.random() < 0.45:
        autres = [k for k in libres if k != porte and longueurs[k] >= 3.0]
        if autres:
            garage = autres[int(rng.integers(len(autres)))]
    murs = lot(dalle, 'facades')
    for k, ((p_, q_), L) in enumerate(zip(aretes, longueurs)):
        d = (q_ - p_) / L
        ext_n = np.array([d[1], -d[0]])                                        # normale vers l'extérieur
        pt = lambda s, z, dec=0.0: (float(p_[0] + d[0] * s + ext_n[0] * dec), float(p_[1] + d[1] * s + ext_n[1] * dec), float(z))
        nb = max(1, int(round(L / 3.0)))
        bw = L / nb
        simple = mitoyen[k] or L < 2.2 or style == 'annexe'
        occupes = [(e['s0'], e['s0'] + e['largeur'], e) for e in P['places'].get(k, [])]

        def travee(s0, s1, za, zb, cel, coul=teinte):
            plein = cel in ('nu', 'galets_nu', 'ancien_nu', 'pierre_nu', 'bardage', 'nu_gouttiere', 'galets_gouttiere')
            larg_c = min(1, (s1 - s0) / 3) if plein and 'gouttiere' not in cel else 1
            haut_c = min(1, (zb - za) / 3) if plein else 1
            u0, u1, v0, v1 = facades.uv_cellule(cel, 0, larg_c, 0, haut_c)
            murs.quad(pt(s0, za), pt(s1, za), pt(s1, zb), pt(s0, zb), u0, u1, v0, v1, coul)
            stats['quads'] += 1

        for i in range(nb):                                                    # soubassement
            travee(i * bw, (i + 1) * bw, base, z0, F['nu'][0], tuple(t * 0.86 for t in teinte))
        for f in range(etages):
            za, zb = z0 + f * he, z0 + (f + 1) * he
            if f == 0 and occupes:
                # rez-de-chaussée commerçant : devantures aux emplacements réservés, mur plein entre elles
                s = 0.0
                for a, b_, e in sorted(occupes, key=lambda o: o[0]) + [(L, L, None)]:
                    while a - s > 0.05:
                        fin = min(a, s + 3.0)
                        travee(s, fin, za, zb, F['nu'][0])
                        s = fin
                    if e is None:
                        break
                    ka, u0, u1, v0, v1 = emplacements[e['index']]
                    hd = min(3.0, he)
                    lot(dalle, f'devantures_{ka}').quad(pt(a, za, 0.02), pt(b_, za, 0.02), pt(b_, za + hd, 0.02), pt(a, za + hd, 0.02), u0, u1, v0, v1, (1, 1, 1))
                    travee(a, b_, za, za + hd, F['nu'][0])
                    if he > hd + 0.05:
                        travee(a, b_, za + hd, zb, F['nu'][0])
                    # volumes : store des cafés et boulangeries, croix de pharmacie, carotte de tabac
                    dec = lot(dalle, 'couleur')
                    mx = (a + b_) / 2
                    if e['type'] in ('bar', 'restaurant', 'boulangerie', 'fleuriste', 'boucherie'):
                        coul = {'bar': (0.10, 0.22, 0.17), 'restaurant': (0.30, 0.09, 0.10), 'boulangerie': (0.55, 0.30, 0.14), 'fleuriste': (0.20, 0.42, 0.25), 'boucherie': (0.52, 0.07, 0.09)}[e['type']]
                        A0, B0 = pt(a + 0.15, za + hd * 0.80, 0.03), pt(b_ - 0.15, za + hd * 0.80, 0.03)
                        A1, B1 = pt(a + 0.15, za + hd * 0.68, 1.15), pt(b_ - 0.15, za + hd * 0.68, 1.15)
                        dec.quad(A1, B1, B0, A0, 0, 0, 0, 0, coul)
                        dec.quad(A0, B0, B1, A1, 0, 0, 0, 0, tuple(c * 0.7 for c in coul))
                        A2, B2 = (A1[0], A1[1], A1[2] - 0.16), (B1[0], B1[1], B1[2] - 0.16)
                        dec.quad(A2, B2, B1, A1, 0, 0, 0, 0, tuple(c * 0.9 for c in coul))
                    if e['type'] in ('pharmacie', 'tabac'):
                        coul = (0.05, 0.62, 0.30) if e['type'] == 'pharmacie' else (0.72, 0.06, 0.07)
                        c0 = np.array(pt(a + 0.2, za + hd * 0.94, 0.55))
                        for dx_, dz_ in (((0.30, 0.09), (0.09, 0.30)) if e['type'] == 'pharmacie' else ((0.24, 0.24),)):
                            for cote in (1, -1):
                                o = d * 0.04 * cote
                                Pq = [(c0[0] + ext_n[0] * sx * dx_ + o[0], c0[1] + ext_n[1] * sx * dx_ + o[1], c0[2] + sz * dz_) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
                                if e['type'] == 'tabac':
                                    Pq = [(c0[0] + ext_n[0] * sx * 0.3 + o[0], c0[1] + ext_n[1] * sx * 0.3 + o[1], c0[2] + sz * 0.36) for sx, sz in ((-1, 0), (0, -1), (1, 0), (0, 1))]
                                dec.quad(*(Pq if cote == 1 else Pq[::-1]), 0, 0, 0, 0, coul)
                    s = b_
                continue
            for i in range(nb):
                cel = F['nu'][0]
                t = rng.random()
                if style == 'industriel':
                    if not simple and f == 0 and k == porte and i == nb // 2 and not occupes:
                        cel = 'bardage_entree'
                    elif not simple and f == 0 and bw >= 2.7 and ((ib == caserne and k == porte) or t < 0.16):
                        travee(i * bw, (i + 1) * bw, za, zb, 'bardage_porte', (0.80, 0.10, 0.09) if ib == caserne else teinte)
                        continue
                    elif not simple and t > 0.86 and f == 0:
                        cel = 'bardage_fenetres'
                elif not simple:
                    if f == 0 and k == porte and i == nb // 2:
                        cel = F['porte'] if famille != 'crepi' else ('porte_bois' if volets != 'roulant' else 'porte_moderne')
                    elif famille == 'pierre':
                        cel = 'pierre_arche' if (f > 0 or etages == 1) and i % 2 == 0 else 'pierre_nu'
                    elif f == 0 and k == garage and i == 0 and bw >= 2.6:
                        cel = 'garage_bois' if rng.random() < 0.4 else 'garage_metal'
                    elif t < 0.14:
                        cel = nu()
                    elif famille != 'crepi':
                        cel = F['ferme'] if t < 0.32 else (F['petite'] if t < 0.4 and f > 0 else F['fen'])
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
                travee(i * bw, (i + 1) * bw, za, zb, cel)
        # pignon : du niveau de l'égout jusqu'à la pente du toit
        if pans:
            for i in range(nb):
                s0, s1 = i * bw, (i + 1) * bw
                h0, h1 = z_toit(*pt(s0, 0)[:2]), z_toit(*pt(s1, 0)[:2])
                if max(h0, h1) - egout > 0.03:
                    u0, u1, v0, v1 = facades.uv_cellule(F['nu'][0], 0, min(1, bw / 3), 0, 1)
                    vv = lambda z: v0 + (v1 - v0) * min(1.0, (z - egout) / 3.0)
                    A0, B0, B1, A1 = pt(s0, egout), pt(s1, egout), pt(s1, h1), pt(s0, h0)
                    murs.tri(A0, B0, B1, (u0, v0), (u1, v0), (u1, vv(h1)), teinte)
                    murs.tri(A0, B1, A1, (u0, v0), (u1, vv(h1)), (u0, vv(h0)), teinte)
            # génoise sous l'égout (murs gouttereaux) : bandeau de tuiles incliné vers l'extérieur
            mil = pt(L / 2, 0)
            if not mitoyen[k] and style in ('maison', 'bourg', 'annexe') and abs(float(np.dot(d, dfait))) > 0.75 and z_toit(mil[0], mil[1]) - egout < 0.3:
                for i in range(nb):
                    u0, u1, v0, v1 = facades.uv_cellule('genoise', 0, min(1, bw / 3), 0.0, 0.118)
                    murs.quad(pt(i * bw, egout - 0.30, 0.01), pt((i + 1) * bw, egout - 0.30, 0.01), pt((i + 1) * bw, egout + 0.03, 0.2), pt(i * bw, egout + 0.03, 0.2), u0, u1, v0, v1, (1, 1, 1))

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
                    Pt, UV = [], []
                    for q in v2[t3]:
                        dn = abs(float(np.dot(q - centre, nrm)))
                        Pt.append((float(q[0]), float(q[1]), float(egout + rise * (1 - dn / w))))
                        UV.append((signe * float(np.dot(q - centre, dfait)) / 2.2, (w - dn) * k_pente / 2.2))
                    nz = (Pt[1][0] - Pt[0][0]) * (Pt[2][1] - Pt[0][1]) - (Pt[1][1] - Pt[0][1]) * (Pt[2][0] - Pt[0][0])
                    o = (0, 1, 2) if nz > 0 else (0, 2, 1)
                    toit.tri(Pt[o[0]], Pt[o[1]], Pt[o[2]], UV[o[0]], UV[o[1]], UV[o[2]], tt)
        # cheminée
        if style in ('maison', 'bourg') and rng.random() < 0.62:
            c2 = centre + dfait * float(rng.uniform(-0.3, 0.3)) * P['long'] + nrm * float(rng.uniform(0.15, 0.55)) * w * (1 if rng.random() < 0.5 else -1)
            if poly.contains(Point(c2)):
                zb, zh = z_toit(c2[0], c2[1]) - 0.35, z_toit(c2[0], c2[1]) + float(rng.uniform(0.7, 1.1))
                u0, u1, v0, v1 = facades.uv_cellule('nu', 0, 0.17, 0, 0.35)
                coins = [c2 + dfait * sx * 0.27 + nrm * sy * 0.22 for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
                for i in range(4):
                    a, c_ = coins[i], coins[(i + 1) % 4]
                    murs.quad((a[0], a[1], zb), (c_[0], c_[1], zb), (c_[0], c_[1], zh), (a[0], a[1], zh), u0, u1, v0, v1, tuple(t * 0.95 for t in teinte))
                cap = [c2 + dfait * sx * 0.33 + nrm * sy * 0.28 for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
                dec = lot(dalle, 'couleur')
                dec.quad(*[(q[0], q[1], zh + 0.06) for q in cap], 0, 0, 0, 0, (0.50, 0.24, 0.15))
                for i in range(4):
                    a, c_ = cap[i], cap[(i + 1) % 4]
                    dec.quad((a[0], a[1], zh), (c_[0], c_[1], zh), (c_[0], c_[1], zh + 0.06), (a[0], a[1], zh + 0.06), 0, 0, 0, 0, (0.42, 0.20, 0.13))
    else:
        stats['plats'] += 1
        toit = lot(dalle, 'toit_plat')
        v2, tr = trianguler(poly)
        for t3 in tr:
            Pt = [(float(q[0]), float(q[1]), float(egout)) for q in v2[t3]]
            UV = [((q[0] + LARG / 2) / LARG, (q[1] + HAUT / 2) / HAUT) for q in v2[t3]]
            nz = (Pt[1][0] - Pt[0][0]) * (Pt[2][1] - Pt[0][1]) - (Pt[1][1] - Pt[0][1]) * (Pt[2][0] - Pt[0][0])
            o = (0, 1, 2) if nz > 0 else (0, 2, 1)
            toit.tri(Pt[o[0]], Pt[o[1]], Pt[o[2]], UV[o[0]], UV[o[1]], UV[o[2]], (1.0, 1.0, 1.0))
        if style != 'annexe':                           # acrotère : petit relevé en bord de toit plat
            ext = P['ext']
            for k in range(len(ext)):
                a, c = ext[k], ext[(k + 1) % len(ext)]
                u0, u1, v0, v1 = facades.uv_cellule(F['nu'][0], 0, 0.3, 0.3, 0.4)
                murs.quad((a[0], a[1], egout), (c[0], c[1], egout), (c[0], c[1], egout + 0.35), (a[0], a[1], egout + 0.35), u0, u1, v0, v1, tuple(t * 0.92 for t in teinte))
print(stats)

# ---------------------------------------------------------------- matériaux et maillages Blender
A.nouvelle_scene()
f_c, f_n, f_o = facades.composer(TEX)


def reduire(src, nom, taille=1024, q=88):
    f = os.path.join(TEX, nom)
    Image.open(src).convert('RGB').resize((taille, taille), Image.LANCZOS).save(f, quality=q)
    return f


def avec_teinte(m):
    """Multiplie la couleur du matériau par la couleur des sommets (teinte propre à chaque bâtiment)."""
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    ca = nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'Col'
    liens = bsdf.inputs['Base Color'].links
    if liens:
        src = liens[0].from_socket
        nt.links.remove(liens[0])
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type, mix.blend_type = 'RGBA', 'MULTIPLY'
        mix.inputs[0].default_value = 1.0
        nt.links.new(src, mix.inputs[6])
        nt.links.new(ca.outputs['Color'], mix.inputs[7])
        nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    else:
        nt.links.new(ca.outputs['Color'], bsdf.inputs['Base Color'])
    return m


Image.open(cc0.texture('clay_roof_tiles_02', 'arm', '1k')).convert('RGB').resize((1024, 1024)).save(os.path.join(TEX, 'tuiles_orm.jpg'), quality=88)
MATS = {
    'facades': avec_teinte(A.materiau_texture('facades', f_c, f_o, f_n)),
    'tuiles': avec_teinte(A.materiau_texture('tuiles', reduire(cc0.texture('clay_roof_tiles_02', 'Diffuse', '1k'), 'tuiles_couleur.jpg'), os.path.join(TEX, 'tuiles_orm.jpg'),
                                             reduire(cc0.texture('clay_roof_tiles_02', 'nor_gl', '1k'), 'tuiles_normale.jpg', q=92), double=True)),
    'toit_plat': A.materiau('toit_plat', (0.5, 0.5, 0.5), rug=0.9),
    'couleur': avec_teinte(A.materiau('couleur', (1, 1, 1), rug=0.7, double=True)),
}
for k, (fc, fo) in enumerate(f_dev):
    MATS[f'devantures_{k}'] = A.materiau_texture(f'devantures_{k}', fc, fo)
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
# emplacement des enseignes pour le jeu (adresses des interventions, GPS)
json.dump([dict(nom=devantures.nom_propre(e['nom']), type=e['type'], x=round(float(e['x']), 1), z=round(-float(e['y']), 1)) for e in toutes_enseignes],
          open(os.path.join(RACINE, 'data', 'enseignes.json'), 'w'), ensure_ascii=False)
