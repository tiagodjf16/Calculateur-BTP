"""Prépare le ciel du jeu à partir d'un HDRI libre (Poly Haven, CC0) :
- ciel/env.hdr      : éclairage et reflets (soleil écrêté, car le jeu ajoute sa propre lumière solaire pour les ombres)
- ciel/dome.jpg     : image du ciel affichée (moitié haute du panorama), + dome_leger.jpg pour les téléphones
- data/ciel.json    : direction du soleil dans l'image, couleurs d'horizon (brume) et de soleil
Usage : python outils/ciel.py [identifiant_hdri]
"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import bpy
from PIL import Image
import cc0

ident = sys.argv[1] if len(sys.argv) > 1 else 'kloofendal_48d_partly_cloudy_puresky'
RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
os.makedirs(os.path.join(RACINE, 'ciel'), exist_ok=True)
img = bpy.data.images.load(cc0.hdri(ident, '1k', 'hdr'))
W, H = img.size
px = np.array(img.pixels[:], np.float32).reshape(H, W, 4)[::-1, :, :3]      # ligne 0 = zénith
lum = px @ np.array([0.2126, 0.7152, 0.0722], np.float32)
# soleil : barycentre des pixels les plus lumineux
seuil = np.percentile(lum, 99.97)
ys, xs = np.nonzero(lum >= seuil)
poids = lum[ys, xs]
# moyenne circulaire en azimut
ang = (xs + 0.5) / W * 2 * math.pi
az = math.atan2(float((np.sin(ang) * poids).sum()), float((np.cos(ang) * poids).sum())) % (2 * math.pi)
el = (0.5 - (float((ys * poids).sum() / poids.sum()) + 0.5) / H) * math.pi
u_soleil = az / (2 * math.pi)
coul_soleil = (px[ys, xs] * poids[:, None]).sum(0) / poids.sum()
coul_soleil = (coul_soleil / coul_soleil.max()).tolist()
print('soleil : u =', round(u_soleil, 4), 'élévation', round(math.degrees(el), 1), '° ; luminance max', float(lum.max()))
# éclairage d'ambiance : on écrête le disque solaire ; l'énergie retirée devient la lumière directionnelle du jeu
ecrete = np.minimum(px, 12.0)
elev = (0.5 - (np.arange(H) + 0.5) / H) * math.pi
d_omega = (2 * math.pi / W) * (math.pi / H) * np.cos(elev)[:, None, None]
eclairement = ((px - ecrete) * d_omega).sum((0, 1))
print('éclairement solaire retiré (RVB) :', eclairement.round(2))
sortie = bpy.data.images.new('env', W, H, alpha=False, float_buffer=True)
sortie.pixels = np.concatenate([ecrete[::-1], np.ones((H, W, 1), np.float32)], -1).ravel()
sortie.filepath_raw = os.path.join(RACINE, 'ciel', 'env.hdr')
sortie.file_format = 'HDR'
sortie.save()
# image du ciel (panorama déjà « développé »), de -9° sous l'horizon jusqu'au zénith
Image.MAX_IMAGE_PIXELS = None
pano = Image.open(cc0.hdri_jpg(ident)).convert('RGB')
PW, PH = pano.size
BAS = 9.0
haut = pano.crop((0, 0, PW, int(PH * (0.5 + BAS / 180))))
haut.resize((8192, 2048), Image.LANCZOS).save(os.path.join(RACINE, 'ciel', 'dome.jpg'), quality=88, optimize=True, progressive=True)
haut.resize((4096, 1024), Image.LANCZOS).save(os.path.join(RACINE, 'ciel', 'dome_leger.jpg'), quality=86, optimize=True, progressive=True)
bande = np.asarray(pano.crop((0, int(PH * 0.47), PW, int(PH * 0.495))).resize((64, 4)), np.float32).reshape(-1, 3).mean(0)
zenith = np.asarray(pano.crop((0, int(PH * 0.05), PW, int(PH * 0.15))).resize((64, 4)), np.float32).reshape(-1, 3).mean(0)
json.dump({'source': f'Poly Haven — {ident} (CC0)', 'u_soleil': u_soleil, 'elevation': el, 'sous_horizon_deg': BAS,
           'couleur_soleil': coul_soleil, 'eclairement_soleil': [float(v) for v in eclairement], 'horizon': [round(float(v)) for v in bande], 'zenith': [round(float(v)) for v in zenith]},
          open(os.path.join(RACINE, 'data', 'ciel.json'), 'w'), indent=1)
print('ciel prêt', {f: os.path.getsize(os.path.join(RACINE, 'ciel', f)) // 1024 for f in os.listdir(os.path.join(RACINE, 'ciel'))}, 'Ko')
