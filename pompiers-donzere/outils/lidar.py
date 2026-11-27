"""Télécharge les relevés laser de l'IGN (LiDAR HD, Licence Ouverte) sur la zone du jeu, à 50 cm de résolution :
- MNH : hauteur au-dessus du sol (toits, arbres)          -> .cache/lidar/mnh.npy
- MNT : altitude du sol nu                                -> .cache/lidar/mnt.npy
- classes : sol, végétation, bâtiment, eau… (image)       -> .cache/lidar/classes.png
Les images sont alignées sur les coordonnées du jeu : colonne 0 = bord ouest, ligne 0 = bord nord, 2 pixels par mètre.
Usage : python3 outils/lidar.py
"""
import io, math, os, sys, time, urllib.request, urllib.parse
import numpy as np
from PIL import Image

LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = 44.4265, 44.4465, 4.7000, 4.7280            # mêmes bornes que outils/bake.py
LAT0, LON0 = (LAT_MIN + LAT_MAX) / 2, (LON_MIN + LON_MAX) / 2
MX, MZ = math.cos(math.radians(LAT0)) * 111320.0, 110574.0
PAS = 0.5
L, H = (LON_MAX - LON_MIN) * MX, (LAT_MAX - LAT_MIN) * MZ
W, HT = int(round(L / PAS)), int(round(H / PAS))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.cache', 'lidar')
os.makedirs(OUT, exist_ok=True)
BLOC = 2000


def carte(couche, fmt, i0, j0, w, h):
    lon0, lon1 = LON_MIN + (LON_MAX - LON_MIN) * i0 / W, LON_MIN + (LON_MAX - LON_MIN) * (i0 + w) / W
    lat1, lat0 = LAT_MAX - (LAT_MAX - LAT_MIN) * j0 / HT, LAT_MAX - (LAT_MAX - LAT_MIN) * (j0 + h) / HT
    u = 'https://data.geopf.fr/wms-r/wms?' + urllib.parse.urlencode(dict(SERVICE='WMS', VERSION='1.3.0', REQUEST='GetMap', LAYERS=couche, STYLES='', CRS='EPSG:4326',
        BBOX=f'{lat0:.8f},{lon0:.8f},{lat1:.8f},{lon1:.8f}', WIDTH=w, HEIGHT=h, FORMAT=fmt))
    for essai in range(5):
        try:
            d = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'curl/8.5'}), timeout=180).read()
            if fmt.startswith('image/x-bil') and len(d) != w * h * 4:
                raise IOError('taille inattendue : ' + d[:120].decode('utf-8', 'replace'))
            return d
        except Exception as e:
            print('   nouvel essai', essai + 1, str(e)[:100]); time.sleep(4 + essai * 6)
    raise SystemExit('échec ' + couche)


def assembler(couche, fmt, nom):
    f = os.path.join(OUT, nom)
    if os.path.exists(f):
        print(nom, 'déjà présent'); return
    brut = fmt.startswith('image/x-bil')
    a = np.zeros((HT, W), np.float32) if brut else np.zeros((HT, W, 3), np.uint8)
    for j0 in range(0, HT, BLOC):
        for i0 in range(0, W, BLOC):
            w, h = min(BLOC, W - i0), min(BLOC, HT - j0)
            d = carte(couche, fmt, i0, j0, w, h)
            a[j0:j0 + h, i0:i0 + w] = np.frombuffer(d, '<f4').reshape(h, w) if brut else np.asarray(Image.open(io.BytesIO(d)).convert('RGB'))
            print('  ', nom, i0, j0, w, h, flush=True)
    if brut:
        np.save(f, a); print(nom, 'min %.2f max %.2f | sans donnée : %.2f %%' % (a[a > -1000].min(), a.max(), (a <= -1000).mean() * 100))
    else:
        Image.fromarray(a).save(f)


print('zone', round(L, 1), 'x', round(H, 1), 'm ->', W, 'x', HT, 'pixels')
assembler('IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS84G', 'image/x-bil;bits=32', 'mnh.npy')
assembler('IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS84G', 'image/x-bil;bits=32', 'mnt.npy')
assembler('IGNF_LIDAR-HD_CLASS', 'image/png', 'classes.png')
