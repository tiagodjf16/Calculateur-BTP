"""Prépare le sol vu de près : au lieu d'afficher la photo aérienne (voitures et ombres « écrasées » par terre),
le jeu affiche de vraies matières (herbe, bitume, terre) choisies et teintées d'après la photo.

- textures/sol_flou.jpg    : couleur du sol sans les détails (bâtiments retirés, voitures et ombres gommées)
- textures/sol_classes.png : nature du sol (rouge = herbe, vert = bitume/béton, bleu = terre nue)
- textures/sol_herbe.jpg, sol_bitume.jpg, sol_terre.jpg : matières de détail (Poly Haven, CC0), ramenées à une moyenne neutre
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import cc0

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(RACINE, 'textures')
D = json.load(open(os.path.join(RACINE, 'data', 'donzere.json')))
L, H = D['taille']
T = 2048
ortho = Image.open(os.path.join(RACINE, 'data', 'ortho.jpg')).convert('RGB').resize((T, T), Image.LANCZOS)
a = np.asarray(ortho, np.float32) / 255.0
# masque des bâtiments (un peu élargi) : on les « efface » en prolongeant la couleur du sol voisin
masque = Image.new('L', (T, T), 0)
dm = ImageDraw.Draw(masque)
for b in D['batiments']:
    pts = [((b['p'][i] + L / 2) / L * T, (b['p'][i + 1] + H / 2) / H * T) for i in range(0, len(b['p']), 2)]
    if len(pts) >= 3:
        dm.polygon(pts, fill=255)
masque = masque.filter(ImageFilter.MaxFilter(7))
m = np.asarray(masque, np.float32)[..., None] / 255.0
flou = lambda img, r: np.asarray(Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), np.float32) / 255.0
poids = flou(np.repeat(1 - m, 3, 2), 9)
comble = flou(a * (1 - m), 9) / np.maximum(poids, 1e-3)
sol = a * (1 - m) + comble * m
# centre-ville : les houppiers des arbres (plantés en 3D dans le jeu) cachent le sol sur la photo ; on les efface en
# prolongeant de proche en proche la couleur du sol dégagé qui les entoure (chaussée de la place, pelouse du parc…)
f_centre = os.path.join(RACINE, 'data', 'arbres_centre.json')
if os.path.exists(f_centre):
    x0, z0, x1, z1 = json.load(open(f_centre))['zone']
    i0, i1, j0, j1 = [int(round(v)) for v in ((x0 + L / 2) / L * T, (x1 + L / 2) / L * T, (z0 + H / 2) / H * T, (z1 + H / 2) / H * T)]
    zone = sol[j0:j1, i0:i1].copy()
    r_, v_, b_ = zone[..., 0], zone[..., 1], zone[..., 2]
    feuilles = ((v_ - (r_ + b_) / 2 > 5 / 255) & (r_ + v_ + b_ < 380 / 255)).astype(np.float32)
    feuilles = np.asarray(Image.fromarray((feuilles * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)), np.float32)[..., None] / 255.0
    connu = 1 - feuilles
    for _ in range(80):
        if connu.min() > 0.5:
            break
        p_ = flou(np.repeat(connu, 3, 2), 4)
        c_ = flou(zone * connu, 4) / np.maximum(p_, 1e-3)
        gagne = (connu < 0.5) & (p_[..., :1] > 0.08)
        zone = np.where(gagne, c_, zone)
        connu = np.where(gagne, 1.0, connu)
    sol[j0:j1, i0:i1] = zone
    print('centre : %.0f %% de la zone était sous les arbres' % (feuilles.mean() * 100))
# voitures et petits objets : filtre médian ; ombres : on remonte les zones sombres
img = Image.fromarray((np.clip(sol, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(11)).filter(ImageFilter.GaussianBlur(3))
s = np.asarray(img, np.float32) / 255.0
lum = s @ np.array([0.3, 0.59, 0.11], np.float32)
s *= np.clip(0.30 / np.maximum(lum, 0.03), 1.0, 2.4)[..., None]
Image.fromarray((np.clip(s, 0, 1) * 255).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, 'sol_flou.jpg'), quality=90)
# nature du sol d'après la couleur
r, g, b = s[..., 0], s[..., 1], s[..., 2]
herbe = np.clip((g - 0.5 * (r + b)) * 14 + 0.15, 0, 1)
sat = (s.max(-1) - s.min(-1)) / np.maximum(s.max(-1), 1e-3)
bitume = np.clip(1.25 - sat * 6.5, 0, 1) * (1 - herbe)
terre = np.clip(1 - herbe - bitume, 0, 1)
cl = np.stack([herbe, bitume, terre], -1)
cl = np.asarray(Image.fromarray((cl * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2)), np.uint8)
Image.fromarray(cl, 'RGB').resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, 'sol_classes.png'))
print('herbe %.0f %%, bitume %.0f %%, terre %.0f %%' % tuple(cl.reshape(-1, 3).mean(0) / 2.55))
# matières de détail : moyenne neutre (0,5) pour être multipliées par la couleur du lieu
for nom, ident in (('sol_herbe', 'leafy_grass'), ('sol_bitume', 'asphalt_02'), ('sol_terre', 'gravel_floor_02')):
    t = np.asarray(Image.open(cc0.texture(ident, 'Diffuse', '1k')).convert('RGB').resize((512, 512), Image.LANCZOS), np.float32)
    t = t / t.reshape(-1, 3).mean(0) * 127.5
    if nom == 'sol_bitume':
        t = 127.5 + (t - 127.5) * 0.6                    # enrobé : grain conservé, fissures atténuées
    Image.fromarray(np.clip(t, 0, 255).astype(np.uint8), 'RGB').save(os.path.join(OUT, nom + '.jpg'), quality=88)
print({f: os.path.getsize(os.path.join(OUT, f)) // 1024 for f in sorted(os.listdir(OUT))})
