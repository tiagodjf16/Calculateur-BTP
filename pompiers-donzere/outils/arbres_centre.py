"""Repère les arbres du centre-ville sur la photo aérienne (un point par houppier) pour les planter en 3D au bon endroit.

Principe : masque du feuillage (vert et sombre), puis sommets locaux de la luminosité lissée — le dessus d'un houppier
est plus clair que les creux entre deux arbres. Les points tombant dans un bâtiment sont écartés ; ceux qui tombent sur
une chaussée sont repoussés sur son bord (le houppier d'un platane d'alignement déborde sur la rue).

Sortie : data/arbres_centre.json  { zone: [x0, z0, x1, z1], arbres: [[x, z, rayon du houppier], …] }
Usage : python outils/arbres_centre.py [controle.png x0 x1 z0 z1]
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
Image.MAX_IMAGE_PIXELS = None

R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
d = json.load(open(os.path.join(R, 'data', 'donzere.json')))
L, H = d['taille']
ZONE = (-700.0, -980.0, -90.0, -660.0)                    # x0, z0, x1, z1 : le centre et le parc
PX = 8192 / L                                            # pixels par mètre de la photo aérienne


def photo(x0, z0, x1, z1):
    im = Image.new('RGB', (int((x1 - x0) * PX), int((z1 - z0) * PX)))
    for i in range(2):
        for j in range(2):
            t = Image.open(os.path.join(R, 'data', f'ortho_{i}_{j}.jpg'))
            im.paste(t, (int(round(i * 4096 - (x0 + L / 2) * PX)), int(round(j * 4096 - (z0 + H / 2) * PX))))
    return im


def flou(a, sigma):
    n = int(sigma * 3)
    k = np.exp(-np.arange(-n, n + 1) ** 2 / (2 * sigma ** 2))
    k /= k.sum()
    a = np.apply_along_axis(lambda v: np.convolve(v, k, 'same'), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(v, k, 'same'), 1, a)


def maxi(a, n):
    """Maximum glissant sur une fenêtre carrée de côté 2n+1."""
    r = a.copy()
    for s in range(1, n + 1):
        r[s:] = np.maximum(r[s:], a[:-s]); r[:-s] = np.maximum(r[:-s], a[s:])
    a2 = r.copy()
    for s in range(1, n + 1):
        r[:, s:] = np.maximum(r[:, s:], a2[:, :-s]); r[:, :-s] = np.maximum(r[:, :-s], a2[:, s:])
    return r


def dans(x, z, p):
    c = False
    for i in range(0, len(p), 2):
        xi, zi, xj, zj = p[i], p[i + 1], p[i - 2], p[i - 1]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            c = not c
    return c


x0, z0, x1, z1 = ZONE
img = np.asarray(photo(*ZONE), np.float32)
r, v, b = img[..., 0], img[..., 1], img[..., 2]
feuillage = ((v - (r + b) / 2 > 7) & (r + v + b < 350)).astype(np.float32)
dense = flou(feuillage, 1.2 * PX)                                    # part de feuillage dans un voisinage de ~1,2 m
lum = flou(r + v + b, 1.25 * PX) * (dense > 0.55)
sommets = (lum > 0) & (lum >= maxi(lum, int(3.1 * PX)) - 1e-3)       # un sommet par fenêtre de ~6 m
large = flou(feuillage, 3.5 * PX)
bats = [bt['p'] for bt in d['batiments'] if any(x0 - 5 < bt['p'][i] < x1 + 5 and z0 - 5 < bt['p'][i + 1] < z1 + 5 for i in range(0, len(bt['p']), 2))]
routes = [rt for rt in d['routes'] if rt.get('w', 0) >= 3 and any(x0 < rt['p'][i] < x1 and z0 < rt['p'][i + 1] < z1 for i in range(0, len(rt['p']), 2))]
arbres = []
for j, i in zip(*np.nonzero(sommets)):
    x, z = x0 + (i + 0.5) / PX, z0 + (j + 0.5) / PX
    if any(dans(x, z, p) for p in bats):
        continue
    for rt in routes:                                                # hors chaussée : on repousse sur le bord
        p, demi = rt['p'], rt['w'] / 2 + 0.9
        for k in range(0, len(p) - 2, 2):
            ax, az, bx, bz = p[k], p[k + 1], p[k + 2], p[k + 3]
            l2 = (bx - ax) ** 2 + (bz - az) ** 2 or 1e-9
            t = min(1, max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2))
            qx, qz = ax + (bx - ax) * t, az + (bz - az) * t
            dist = math.hypot(x - qx, z - qz)
            if dist < demi:
                if dist < 0.05:
                    nx, nz = -(bz - az) / math.sqrt(l2), (bx - ax) / math.sqrt(l2)
                else:
                    nx, nz = (x - qx) / dist, (z - qz) / dist
                x, z = qx + nx * demi, qz + nz * demi
    if any(dans(x, z, p) for p in bats):
        continue
    arbres.append([round(x, 1), round(z, 1), round(float(np.clip(2.2 + 4.6 * large[j, i], 2.4, 6.4)), 1)])
# deux sommets trop proches après déplacement : on garde le plus gros
arbres.sort(key=lambda a: -a[2])
gardes = []
for a in arbres:
    if all(math.hypot(a[0] - g[0], a[1] - g[1]) > 4.2 for g in gardes):
        gardes.append(a)
json.dump(dict(zone=list(ZONE), arbres=gardes), open(os.path.join(R, 'data', 'arbres_centre.json'), 'w'), separators=(',', ':'))
print(len(gardes), 'arbres repérés dans la zone', ZONE)
if len(sys.argv) > 5:
    cx0, cx1, cz0, cz1 = [float(t) for t in sys.argv[2:6]]
    e = 8
    im = photo(cx0, cz0, cx1, cz1).resize((int((cx1 - cx0) * e), int((cz1 - cz0) * e)), Image.LANCZOS)
    g = ImageDraw.Draw(im, 'RGBA')
    for x, z, ray in gardes:
        if cx0 < x < cx1 and cz0 < z < cz1:
            X, Z = (x - cx0) * e, (z - cz0) * e
            g.ellipse([X - ray * e, Z - ray * e, X + ray * e, Z + ray * e], outline=(255, 255, 0, 200))
            g.ellipse([X - 4, Z - 4, X + 4, Z + 4], fill=(255, 40, 40, 255))
    im.save(sys.argv[1])
