"""Arbres réels d'après le relevé laser de l'IGN (LiDAR HD) : un arbre par sommet de houppier, avec sa hauteur et son envergure.

Sortie : data/arbres.json  { zone: [x0, z0, x1, z1], arbres: [[x, z, rayon, hauteur], …] }  (mètres, repère du jeu)
Usage : python3 outils/lidar.py   puis   python3 outils/arbres_lidar.py [controle.png x0 x1 z0 z1]
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
Image.MAX_IMAGE_PIXELS = None

R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
D = json.load(open(os.path.join(R, 'data', 'donzere.json')))
L, H = D['taille']
mnh = np.load(os.path.join(R, '.cache', 'lidar', 'mnh.npy'))
HT, W = mnh.shape
PXM = W / L
# on écarte les bâtiments (emprises élargies de 1 m) et les lignes électriques (objets fins : disparaissent à l'ouverture)
masque = Image.new('L', (W, HT), 0)
dm = ImageDraw.Draw(masque)
for b in D['batiments']:
    p = b['p']
    if len(p) >= 6:
        dm.polygon([((p[i] + L / 2) * PXM, (p[i + 1] + H / 2) * PXM) for i in range(0, len(p), 2)], fill=255)
bati = np.asarray(masque.filter(ImageFilter.MaxFilter(5)), bool)
h = np.where(bati, 0.0, np.clip(mnh, 0, 40)).astype(np.float32)
f_cl = os.path.join(R, '.cache', 'lidar', 'classes.png')
if os.path.exists(f_cl):                                   # seuls les points classés « végétation » par l'IGN (vert) sont des arbres
    c = np.asarray(Image.open(f_cl).convert('RGB'))
    h = np.where((c[..., 0] == 70) & (c[..., 1] == 150) & (c[..., 2] == 60), h, 0.0).astype(np.float32)
    del c
img = Image.fromarray(h, 'F')
ouvert = np.asarray(img.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5)), np.float32)       # retire câbles, poteaux, bords de murs


def flou(a, sigma):
    """Flou gaussien séparable (somme de décalages) pour un tableau de réels."""
    n = int(sigma * 3)
    k = np.exp(-np.arange(-n, n + 1) ** 2 / (2 * sigma ** 2))
    k /= k.sum()
    for axe in (0, 1):
        p = np.pad(a, [(n, n) if ax == axe else (0, 0) for ax in (0, 1)], mode='edge')
        a = sum(k[d] * (p[d:d + a.shape[0], :] if axe == 0 else p[:, d:d + a.shape[1]]) for d in range(2 * n + 1))
    return a.astype(np.float32)


lisse = flou(np.minimum(h, ouvert + 1.5), 1.6)
# sommets : maximum local sur une fenêtre d'autant plus large que l'arbre est haut
arbres = []
for rayon_px, hmin, hmax in ((4, 2.5, 6.0), (6, 6.0, 12.0), (9, 12.0, 60.0)):
    k = 2 * rayon_px + 1
    mx = np.asarray(Image.fromarray(lisse, 'F').filter(ImageFilter.MaxFilter(k)), np.float32)
    js, is_ = np.nonzero((lisse >= mx - 1e-4) & (lisse >= hmin) & (lisse < hmax))
    for j, i in zip(js, is_):
        arbres.append((float(lisse[j, i]), int(i), int(j)))
arbres.sort(reverse=True)
# écart minimal entre deux arbres : proportionnel à leur hauteur ; envergure : étendue du houppier autour du sommet
grille, gardes = {}, []
for ht, i, j in arbres:
    x, z = (i + 0.5) / PXM - L / 2, (j + 0.5) / PXM - H / 2
    ecart = float(np.clip(ht * 0.42, 2.2, 6.5))
    cx, cz = int(x // 7), int(z // 7)
    if any(math.hypot(x - a[0], z - a[1]) < (ecart + a[4]) / 2 for dx in (-1, 0, 1) for dz in (-1, 0, 1) for a in grille.get((cx + dx, cz + dz), [])):
        continue
    r_px = int(min(16, max(4, ht * 0.9)))
    f = lisse[max(0, j - r_px):j + r_px + 1, max(0, i - r_px):i + r_px + 1]
    aire = float((f > ht * 0.55).sum()) / PXM ** 2
    ray = float(np.clip(math.sqrt(aire / math.pi), 1.2, min(7.0, ecart * 1.25)))
    if abs(x) > L / 2 - 6 or abs(z) > H / 2 - 6:
        continue
    a = (round(x, 1), round(z, 1), round(ray, 1), round(ht, 1), ecart)
    grille.setdefault((cx, cz), []).append(a)
    gardes.append(a[:4])
json.dump(dict(zone=[-L / 2, -H / 2, L / 2, H / 2], source='IGN LiDAR HD (MNH)', arbres=gardes), open(os.path.join(R, 'data', 'arbres.json'), 'w'), separators=(',', ':'))
hs = np.array([a[3] for a in gardes])
print(len(gardes), 'arbres | hauteur médiane %.1f m | plus de 12 m : %d | moins de 5 m : %d' % (np.median(hs), (hs > 12).sum(), (hs < 5).sum()), '|', os.path.getsize(os.path.join(R, 'data', 'arbres.json')) // 1024, 'Ko')
if len(sys.argv) > 5:
    x0, x1, z0, z1 = [float(t) for t in sys.argv[2:6]]
    e = 8
    px = 8192 / L
    im = Image.new('RGB', (int((x1 - x0) * px), int((z1 - z0) * px)))
    for i in range(2):
        for j in range(2):
            im.paste(Image.open(os.path.join(R, 'data', f'ortho_{i}_{j}.jpg')), (int(round(i * 4096 - (x0 + L / 2) * px)), int(round(j * 4096 - (z0 + H / 2) * px))))
    im = im.resize((int((x1 - x0) * e), int((z1 - z0) * e)), Image.LANCZOS)
    g = ImageDraw.Draw(im, 'RGBA')
    for x, z, ray, ht in gardes:
        if x0 < x < x1 and z0 < z < z1:
            X, Z = (x - x0) * e, (z - z0) * e
            g.ellipse([X - ray * e, Z - ray * e, X + ray * e, Z + ray * e], outline=(255, 255, 0, 220))
            g.text((X + 3, Z - 6), f'{ht:.0f}', fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
            g.ellipse([X - 3, Z - 3, X + 3, Z + 3], fill=(255, 40, 40, 255))
    im.save(sys.argv[1])
