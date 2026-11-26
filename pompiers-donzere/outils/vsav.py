"""VSAV (véhicule de secours et d'assistance aux victimes) — fourgon type utilitaire L2H2.

Usage : python outils/vsav.py [dossier_des_rendus]
Le véhicule regarde vers -Y dans Blender, donc vers +Z dans le jeu (glTF). Unités : mètres.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atelier import *

scene = nouvelle_scene()
MODELES = os.path.join(ICI, '..', 'modeles')
TEX = os.path.join(ICI, '..', '.cache', 'tex')
os.makedirs(TEX, exist_ok=True)

# ---------------------------------------------------------------- dimensions
HW = 1.035                       # demi-largeur
Y_AV, Y_AR = -1.95, 1.73         # essieux
R_ROUE, X_ROUE = 0.35, 0.875
SEUIL, R_ARCHE = 0.30, 0.43

ROUGE, ROUGE_F = (198, 26, 32), (172, 20, 30)
JAUNE, BANDE = (229, 226, 62), (244, 184, 36)
NOIR, GRIS, BLANC = (18, 18, 20), (44, 45, 47), (243, 243, 239)


def bas(y):
    z = SEUIL
    for yw in (Y_AV, Y_AR):
        d = abs(y - yw)
        if d < R_ARCHE:
            z = max(z, R_ROUE + math.sqrt(R_ARCHE ** 2 - d * d))
    return z


# ---------------------------------------------------------------- atlas de textures
atlas = Atlas(4096, fond=ROUGE)
E = 560
r_g = atlas.region('gauche', 'cote', 0, 0, 3136, 1344, (0, 1, 0), (0, 0, 1), -2.85, 0.20, E)
r_d = atlas.region('droite', 'cote', 0, 1344, 3136, 1344, (0, -1, 0), (0, 0, 1), -2.75, 0.20, E)
r_ar = atlas.region('arriere', 'bout', 0, 2688, 1176, 1344, (-1, 0, 0), (0, 0, 1), -1.05, 0.20, E)
r_av = atlas.region('avant', 'bout', 1176, 2688, 1176, 1344, (1, 0, 0), (0, 0, 1), -1.05, 0.20, E)
r_h = atlas.region('dessus', 'dessus', 3150, 0, 924, 2464, (-1, 0, 0), (0, -1, 0), -1.05, -2.75, 440)
r_pl = atlas.region('plaque', 'bout', 2400, 2720, 624, 132, (1, 0, 0), (0, 0, 1), 0, 0, 1200)


def arc_porte():
    """Bord avant-bas de la porte de cabine, qui contourne le passage de roue."""
    return [(Y_AV + 0.50 * math.cos(math.radians(a)), R_ROUE + 0.50 * math.sin(math.radians(a))) for a in range(95, -1, -5)]


def peindre_cote(t, droite):
    # lignes de style embouties
    t.ligne([(-2.0, 1.365), (2.62, 1.365)], 0.014, haut=96)
    t.ligne([(-1.4, 0.625), (2.62, 0.625)], 0.010, haut=100)
    # bas de caisse en plastique noir
    t.rect(-1.50, 0.20, 2.70, 0.605, coul=GRIS, rug=0.62, vernis=0.0, haut=150)
    # bandes jaunes rétro-réfléchissantes (cadre)
    t.rect(-1.47, 0.640, 2.585, 0.735, coul=BANDE, rug=0.42)
    t.rect(-0.86, 2.270, 2.585, 2.335, coul=BANDE, rug=0.42)
    t.rect(2.505, 0.640, 2.585, 2.335, coul=BANDE, rug=0.42)
    for z in (0.652, 0.723, 2.279, 2.326):
        t.ligne([(-0.86 if z > 2 else -1.47, z), (2.585, z)], 0.006, coul=(250, 222, 120))
    # baguette de protection noire à mi-hauteur
    t.rect(-1.93, 1.000, 2.585, 1.085, rayon=0.02, coul=NOIR, rug=0.6, vernis=0.0, haut=178)
    # vitre de porte de cabine (suit le montant de pare-brise)
    v = [(-1.87, 1.44), (-1.01, 1.44), (-1.01, 2.10), (-1.29, 2.10)]
    t.poly([(-1.925, 1.415), (-0.985, 1.415), (-0.985, 2.125), (-1.30, 2.125)], coul=(14, 14, 15), rug=0.55, vernis=0.0, haut=112)
    t.poly(v, coul=(9, 12, 15), rug=0.03, haut=120)
    t.ligne([(-1.62, 1.44), (-1.62, 1.71)], 0.02, coul=(14, 14, 15), rug=0.55)      # déflecteur
    # vitres de la cellule
    if droite:
        t.vitre(-0.72, 1.44, 0.26, 2.04)
        t.vitre(0.62, 1.44, 1.58, 2.04)
        t.rect(0.62, 1.44, 1.58, 1.76, rayon=0.05, coul=(196, 200, 204), rug=0.55)   # vitrage dépoli
        t.rect(0.62, 1.70, 1.58, 1.76, coul=(196, 200, 204), rug=0.55)
    else:
        t.vitre(0.62, 1.44, 1.58, 2.04)
    # joints de portes
    t.joint([(-0.94, 0.34), (-0.94, 2.30), (-1.26, 2.24), (-1.99, 1.44), (-1.99, 0.86)] + arc_porte() + [(-1.45, 0.34), (-0.94, 0.34)])
    if droite:
        t.joint([(-0.88, 0.34), (-0.88, 2.30), (0.42, 2.30), (0.42, 0.34), (-0.88, 0.34)])
        t.rect(0.42, 1.300, 1.80, 1.335, rayon=0.012, coul=(8, 8, 9), rug=0.7, vernis=0.0, haut=30)   # rail de porte coulissante
    else:
        t.cercle(-0.55, 0.88, 0.092, coul=(10, 10, 11), haut=20)                    # trappe à carburant
        t.cercle(-0.55, 0.88, 0.085, coul=ROUGE, haut=128)
        t.joint([(-0.20, 0.64), (-0.20, 2.26), (0.42, 2.26), (0.42, 0.64), (-0.20, 0.64)], 0.004)   # coffre latéral
    t.joint([(2.44, 0.62), (2.44, 2.38)], 0.004)
    # lettrage
    t.texte(0.82, 2.165, 'SAPEURS-POMPIERS DE LA DRÔME', 0.088, BLANC, espace=3)
    t.texte(0.80, 0.868, "VÉHICULE DE SECOURS ET D'ASSISTANCE AUX VICTIMES", 0.060, BLANC, espace=2)
    t.texte(-1.46, 1.235, 'SDIS 26', 0.105, BLANC, espace=3)
    t.texte(-1.46, 0.87, 'URGENCES  18 · 112', 0.052, BLANC, espace=2)
    # feux de gabarit orange
    t.rect(1.05, 0.50, 1.15, 0.535, rayon=0.01, coul=(235, 130, 20), rug=0.2)


def peindre_arriere(t):
    t.chevrons(-0.90, 0.74, 0.90, 2.36, JAUNE, ROUGE_F, periode=0.28)
    t.joint([(-0.90, 0.74), (-0.90, 2.36), (0.90, 2.36), (0.90, 0.74), (-0.90, 0.74)], 0.006)
    t.joint([(0, 0.74), (0, 2.36)], 0.006)
    t.vitre(0.10, 1.40, 0.80, 2.06, rayon=0.07, bord=0.03)
    t.vitre(-0.80, 1.40, -0.10, 2.06, rayon=0.07, bord=0.03)
    t.rect(0.20, 0.755, 0.80, 0.935, rayon=0.02, coul=NOIR, rug=0.6, vernis=0.0, haut=150)    # support de plaque
    t.rect(-1.05, 0.20, 1.05, 0.74, coul=GRIS, rug=0.62, vernis=0.0)


def peindre_avant(t):
    # pare-brise avec sa sérigraphie noire
    t.poly([(-0.90, 1.385), (0.90, 1.385), (0.83, 2.175), (-0.83, 2.175)], coul=(12, 12, 13), rug=0.5, vernis=0.0, haut=112)
    t.poly([(-0.865, 1.42), (0.865, 1.42), (0.795, 2.14), (-0.795, 2.14)], coul=(9, 12, 15), rug=0.03, haut=120)
    # calandre
    t.rect(-0.50, 0.70, 0.50, 0.935, rayon=0.04, coul=(12, 12, 13), rug=0.6, vernis=0.0, haut=90)
    for i in range(6):
        z = 0.725 + i * 0.036
        t.ligne([(-0.47, z), (0.47, z)], 0.012, coul=(30, 31, 33), haut=150)
    # optiques
    for s in (-1, 1):
        t.rect(s * 0.53, 0.715, s * 1.05, 0.955, rayon=0.05, coul=(16, 16, 17), rug=0.5, vernis=0.0, haut=110)
        t.rect(s * 0.555, 0.735, s * 1.05, 0.935, rayon=0.04, coul=(206, 211, 218), rug=0.10, metal=0.85, haut=118)
        t.cercle(s * 0.66, 0.835, 0.062, coul=(238, 240, 244), rug=0.05, metal=0.9)
        t.cercle(s * 0.82, 0.835, 0.062, coul=(238, 240, 244), rug=0.05, metal=0.9)
    t.joint([(-0.95, 0.975), (0.95, 0.975)], 0.006)
    t.rect(-1.05, 0.20, 1.05, 0.69, coul=GRIS, rug=0.62, vernis=0.0)


def peindre_dessus(t):
    t.joint([(-0.93, -2.74), (0.93, -2.74), (0.93, -2.09), (-0.93, -2.09), (-0.93, -2.74)], 0.006)
    t.texte(0, -2.42, 'SAPEURS-POMPIERS', 0.10, BLANC, rot=180, espace=4)
    for x in (-0.75, -0.45, -0.15, 0.15, 0.45, 0.75):      # nervures de toit
        t.ligne([(x, -0.20), (x, 2.50)], 0.07, haut=178)
    # côtés (vus de dessus) : haut des flancs, même peinture
    t.rect(-1.05, -2.85, -0.99, 2.75, coul=ROUGE)
    t.rect(0.99, -2.85, 1.05, 2.75, coul=ROUGE)


for reg, peintre in ((r_g, lambda t: peindre_cote(t, False)), (r_d, lambda t: peindre_cote(t, True)),
                     (r_ar, peindre_arriere), (r_av, peindre_avant), (r_h, peindre_dessus)):
    toile = Toile(reg, ROUGE, rug=0.27)
    peintre(toile)
    atlas.coller(toile)
peindre_plaque(atlas, r_pl, 'GD-426-SP', '26')
f_c, f_o, f_n = atlas.sauver(os.path.join(TEX, 'vsav'))

# ---------------------------------------------------------------- matériaux
M_CAR = materiau_texture('carrosserie', f_c, f_o, f_n, vernis=1.0)
M_NOIR = materiau('plastique_noir', lin(*NOIR), rug=0.6)
M_GRIS = materiau('plastique_gris', lin(*GRIS), rug=0.66)
M_BLANC = materiau('peinture_blanche', lin(238, 238, 234), rug=0.35)
M_PNEU = materiau('pneu', lin(15, 15, 15), rug=0.9)
M_JANTE = materiau('jante', lin(168, 170, 173), rug=0.42, metal=0.9)
M_ALU = materiau('aluminium', lin(176, 178, 181), rug=0.45, metal=1.0)
M_MIROIR = materiau('miroir', (0.85, 0.85, 0.85), rug=0.03, metal=1.0)
M_DESSOUS = materiau('dessous', lin(9, 9, 9), rug=0.92)
M_STOP = materiau('feu_stop', lin(150, 8, 10), rug=0.22, emission=(1.0, 0.03, 0.02), force=1.0)
M_CLIGNO = materiau('clignotant', lin(235, 120, 12), rug=0.22, emission=(1.0, 0.4, 0.02), force=0.3)
M_RECUL = materiau('feu_blanc', lin(232, 232, 232), rug=0.2)
M_PHARE = materiau('phare', lin(246, 246, 238), rug=0.15, emission=(1.0, 0.96, 0.86), force=3.0)
M_LENT = materiau('lentille_bleue', lin(18, 60, 200), rug=0.10, alpha=0.5)
M_LED_G = materiau('led_bleu_G', lin(130, 175, 255), rug=0.3, emission=(0.08, 0.28, 1.0), force=5.0)
M_LED_D = materiau('led_bleu_D', lin(130, 175, 255), rug=0.3, emission=(0.08, 0.28, 1.0), force=5.0)

# ---------------------------------------------------------------- carrosserie
cles = [
    dict(y=-2.80, hw=0.84, zt=0.96, rh=0.10, rv=0.10, k=0.0, bombe=0.02),
    dict(y=-2.77, hw=0.90, zt=1.02, rh=0.10, rv=0.10, k=0.0, bombe=0.02),
    dict(y=-2.68, hw=0.985, zt=1.09, rh=0.12, rv=0.10, k=0.0, bombe=0.025),
    dict(y=-2.50, hw=1.025, zt=1.17, rh=0.12, rv=0.10, k=0.0, bombe=0.03),
    dict(y=-2.25, hw=HW, zt=1.27, rh=0.12, rv=0.10, k=0.0, bombe=0.03),
    dict(y=-2.06, hw=HW, zt=1.36, rh=0.13, rv=0.10, k=0.02, bombe=0.03),
    dict(y=-1.98, hw=HW, zt=1.43, rh=0.14, rv=0.12, k=0.03, bombe=0.03),
    dict(y=-1.32, hw=HW, zt=2.16, rh=0.15, rv=0.14, k=0.06, bombe=0.03),
    dict(y=-1.20, hw=HW, zt=2.27, rh=0.18, rv=0.16, k=0.06, bombe=0.02),
    dict(y=-0.85, hw=HW, zt=2.43, rh=0.20, rv=0.16, k=0.06, bombe=0.015),
    dict(y=-0.45, hw=HW, zt=2.49, rh=0.20, rv=0.16, k=0.06, bombe=0.015),
    dict(y=0.00, hw=HW, zt=2.50, rh=0.20, rv=0.16, k=0.06, bombe=0.015),
    dict(y=2.45, hw=HW, zt=2.49, rh=0.20, rv=0.16, k=0.06, bombe=0.015),
    dict(y=2.62, hw=1.025, zt=2.48, rh=0.20, rv=0.16, k=0.06, bombe=0.015),
    dict(y=2.68, hw=1.00, zt=2.46, rh=0.18, rv=0.14, k=0.055, bombe=0.012),
    dict(y=2.70, hw=0.97, zt=2.43, rh=0.16, rv=0.12, k=0.05, bombe=0.01),
]
y_arches = [yw + R_ARCHE * f for yw in (Y_AV, Y_AR) for f in (-1.09, -1.0, -0.93, -0.78, -0.55, -0.28, 0, 0.28, 0.55, 0.78, 0.93, 1.0, 1.09)]
caisse = coque('carrosserie', stations(cles, bas, y_arches, pas=0.32), M_CAR, niveaux=2)
projeter_uv(caisse, atlas)

# ---------------------------------------------------------------- dessous et passages de roue
boite('dessous', -0.93, 0.93, -2.62, 2.58, 0.25, 0.46, M_DESSOUS)
for nom, y in (('AV', Y_AV), ('AR', Y_AR)):
    for s, c in ((1, 'G'), (-1, 'D')):
        passage_de_roue(f'passage_{nom}_{c}', s * 0.985, y, R_ROUE, R_ARCHE + 0.02, 0.52, M_DESSOUS, cote=s)

# ---------------------------------------------------------------- pare-chocs
nez = [(1.03, -2.36), (1.035, -2.50), (1.012, -2.66), (0.955, -2.755), (0.85, -2.815), (0.5, -2.845), (0.0, -2.852)]
chemin_av = nez + [(-x, y) for x, y in reversed(nez[:-1])]
balayage('pare_chocs_av', chemin_av, [(-0.04, 0.26), (0.035, 0.26), (0.055, 0.33), (0.055, 0.60), (0.03, 0.675), (-0.04, 0.69)], M_GRIS, niveaux=2)
boite('prise_air', -0.56, 0.56, -2.915, -2.86, 0.33, 0.50, M_NOIR, rayon=0.02)
for s in (-1, 1):
    boite(f'antibrouillard_{s}', s * 0.66, s * 0.84, -2.885, -2.84, 0.36, 0.47, M_PHARE, rayon=0.02, rot=(0, 0, s * -0.22))

cul = [(1.03, 2.28), (1.036, 2.50), (1.022, 2.64), (0.975, 2.715), (0.86, 2.745), (0.0, 2.75)]
chemin_ar = cul + [(-x, y) for x, y in reversed(cul[:-1])]
balayage('pare_chocs_ar', chemin_ar, [(-0.04, 0.36), (0.04, 0.36), (0.058, 0.42), (0.058, 0.66), (0.035, 0.725), (-0.04, 0.735)], M_BLANC, niveaux=2)
boite('pare_chocs_ar_noir', -0.66, 0.66, 2.70, 2.815, 0.60, 0.745, M_NOIR, rayon=0.02)
boite('marchepied_ar', -0.62, 0.62, 2.80, 3.04, 0.375, 0.405, M_ALU, rayon=0.006)
boite('marchepied_ar_bord', -0.63, 0.63, 3.03, 3.05, 0.365, 0.415, M_ALU, rayon=0.006)
for s in (-1, 1):
    boite(f'marchepied_bras_{s}', s * 0.45, s * 0.50, 2.60, 2.85, 0.33, 0.375, M_NOIR, rayon=0.005)
    boite(f'catadioptre_{s}', s * 0.72, s * 0.92, 2.795, 2.806, 0.48, 0.53, M_STOP, rayon=0.004)

# ---------------------------------------------------------------- feux
for s, c in ((1, 'G'), (-1, 'D')):
    boite(f'feu_ar_{c}', s * 0.915, s * 1.035, 2.60, 2.718, 1.02, 1.36, M_STOP, rayon=0.03)
    boite(f'cligno_ar_{c}', s * 0.915, s * 1.035, 2.60, 2.718, 1.375, 1.52, M_CLIGNO, rayon=0.03)
    boite(f'recul_{c}', s * 0.915, s * 1.035, 2.60, 2.718, 0.93, 1.005, M_RECUL, rayon=0.025)
    boite(f'feu_av_{c}', s * 0.60, s * 0.88, -2.812, -2.79, 0.775, 0.895, M_PHARE, rayon=0.01)
    boite(f'cligno_av_{c}', s * 0.93, s * 1.0, -2.79, -2.70, 0.78, 0.90, M_CLIGNO, rayon=0.02, rot=(0, 0, s * -0.9))
    boite(f'repetiteur_{c}', s * 1.03, s * 1.045, -2.30, -2.22, 1.10, 1.13, M_CLIGNO, rayon=0.006)
boite('troisieme_stop', -0.20, 0.20, 2.688, 2.712, 2.385, 2.415, M_STOP, rayon=0.008)

# ---------------------------------------------------------------- feux bleus
boite('rampe_socle', -0.63, 0.63, -1.13, -0.81, 2.455, 2.495, M_NOIR, rayon=0.012)
boite('rampe_lentille', -0.65, 0.65, -1.15, -0.79, 2.49, 2.585, M_LENT, rayon=0.035)
for s in (-1, 1):
    boite(f'rampe_pied_{s}', s * 0.46, s * 0.54, -1.03, -0.91, 2.38, 2.46, M_NOIR, rayon=0.01)
for i in range(8):
    x = -0.56 + i * 0.16
    m = M_LED_G if x > 0 else M_LED_D
    boite(f'led_av_{i}', x - 0.062, x + 0.062, -1.128, -1.108, 2.512, 2.566, m, rayon=0.006)
    boite(f'led_arr_{i}', x - 0.062, x + 0.062, -0.832, -0.812, 2.512, 2.566, m, rayon=0.006)
    vide(f'halo_bleu_{"G" if x > 0 else "D"}_{i}', (x, -1.16, 2.54))
for s, m, c in ((1, M_LED_G, 'G'), (-1, M_LED_D, 'D')):
    boite(f'led_cote_{c}', s * 0.615, s * 0.635, -1.07, -0.87, 2.512, 2.566, m, rayon=0.006)
    boite(f'led_calandre_{c}', s * 0.22, s * 0.36, -2.826, -2.80, 0.80, 0.85, m, rayon=0.008)
    boite(f'led_ar_haut_{c}', s * 0.52, s * 0.80, 2.69, 2.714, 2.385, 2.42, m, rayon=0.008)
    vide(f'halo_bleu_{c}_calandre', (s * 0.29, -2.85, 0.825))
    vide(f'halo_bleu_{c}_arriere', (s * 0.66, 2.74, 2.40))
# gyrophare arrière
cylindre('gyro_socle', (-0.74, 2.22, 2.495), 0.075, 0.03, M_NOIR, 'Z', 24)
cylindre('gyro_lentille', (-0.74, 2.22, 2.57), 0.062, 0.12, M_LENT, 'Z', 24, rayon2=0.055)
cylindre('gyro_coeur', (-0.74, 2.22, 2.565), 0.03, 0.09, M_LED_D, 'Z', 16)
vide('halo_bleu_D_gyro', (-0.74, 2.22, 2.58))

# ---------------------------------------------------------------- accessoires
boite('clim_toit', -0.46, 0.46, -0.42, 0.42, 2.48, 2.60, M_BLANC, rayon=0.045)
boite('clim_grille', -0.36, 0.36, -0.30, 0.30, 2.595, 2.608, M_GRIS, rayon=0.004)
cylindre('antenne_pied', (0.62, 0.9, 2.52), 0.022, 0.05, M_NOIR, 'Z', 12)
cylindre('antenne', (0.62, 0.9, 2.76), 0.004, 0.45, M_NOIR, 'Z', 6)
for s, c in ((1, 'G'), (-1, 'D')):
    boite(f'retro_bras_{c}', s * 1.02, s * 1.20, -2.01, -1.95, 1.50, 1.545, M_NOIR, rayon=0.012)
    boite(f'retro_coque_{c}', s * 1.15, s * 1.345, -2.075, -1.935, 1.37, 1.73, M_NOIR, rayon=0.04)
    boite(f'retro_glace_{c}', s * 1.17, s * 1.325, -1.94, -1.928, 1.395, 1.705, M_MIROIR, rayon=0.004)
    boite(f'poignee_cab_{c}', s * 1.02, s * 1.058, -1.10, -0.965, 1.275, 1.315, M_NOIR, rayon=0.012)
    boite(f'bavette_{c}', s * 0.72, s * 1.0, 2.185, 2.20, 0.12, 0.42, M_NOIR)
    for k, z in enumerate((0.95, 1.50, 2.15)):
        boite(f'charniere_{c}_{k}', s * 0.862, s * 0.905, 2.692, 2.722, z, z + 0.075, M_NOIR, rayon=0.008)
boite('poignee_coulissante', -1.058, -1.02, -0.86, -0.73, 1.19, 1.23, M_NOIR, rayon=0.012)
boite('poignee_ar', -0.17, -0.03, 2.695, 2.728, 1.15, 1.19, M_NOIR, rayon=0.012)
boite('marche_laterale', -1.03, -0.80, -0.82, 0.38, 0.265, 0.305, M_NOIR, rayon=0.01)
for s in (-1, 1):
    boite(f'essuie_glace_{s}', s * 0.42 - 0.31, s * 0.42 + 0.31, -1.945, -1.930, 1.475, 1.50, M_NOIR, rayon=0.004, rot=(0.83, 0, s * 0.04))
cylindre('echappement', (0.55, 2.52, 0.27), 0.03, 0.30, M_ALU, 'Y', 12)

# plaques d'immatriculation
p = boite('plaque_ar', 0.24, 0.76, 2.722, 2.730, 0.79, 0.90, M_CAR)
plaque_uv(p, atlas, r_pl, (0, 1, 0), (-1, 0, 0), (0, 0, 1))
p = boite('plaque_av', -0.26, 0.26, -2.925, -2.915, 0.545, 0.655, M_CAR)
plaque_uv(p, atlas, r_pl, (0, -1, 0), (1, 0, 0), (0, 0, 1))

# ---------------------------------------------------------------- roues
mats_roue = (M_PNEU, M_JANTE, M_DESSOUS)
roue('roue_AV_G', (X_ROUE, Y_AV, R_ROUE), R_ROUE, 0.225, 0.205, mats_roue, cote=1)
roue('roue_AV_D', (-X_ROUE, Y_AV, R_ROUE), R_ROUE, 0.225, 0.205, mats_roue, cote=-1)
roue('roue_AR_G', (X_ROUE, Y_AR, R_ROUE), R_ROUE, 0.225, 0.205, mats_roue, cote=1)
roue('roue_AR_D', (-X_ROUE, Y_AR, R_ROUE), R_ROUE, 0.225, 0.205, mats_roue, cote=-1)

exporter(os.path.join(MODELES, 'vsav.glb'))

# ---------------------------------------------------------------- rendus de contrôle
if len(sys.argv) > 1:
    d = sys.argv[1]
    decor_apercu()
    rendu(os.path.join(d, 'vsav_arriere.png'), (-4.4, 6.6, 1.75), (0, 0.3, 1.2))
    rendu(os.path.join(d, 'vsav_avant.png'), (4.6, -6.6, 1.7), (0, -0.2, 1.15))
