"""Atlas de façades : 32 « travées » de 3 m x 3 m composées à partir de photos de matériaux libres (Poly Haven, CC0).

Familles : crépi (maisons et immeubles), galets du Rhône et vieil enduit (bourg ancien), pierre (église, remparts),
bardage métallique (zones d'activité). Produit couleur, normales et ORM (4096 x 2048).
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import cc0

T = 512                      # pixels par travée
PX = T / 3.0                 # pixels par mètre
COLS, LIGS = 8, 4
CELLULES = [
    'nu', 'volets_bleus', 'volets_verts', 'volets_gris', 'volets_fermes_bleus', 'volets_fermes_bois', 'roulant_mi', 'roulant_ferme',
    'porte_fenetre', 'porte_bois', 'porte_moderne', 'garage_bois', 'garage_metal', 'petite', 'nu_gouttiere', 'genoise',
    'galets_nu', 'galets_volets', 'galets_volets_fermes', 'galets_porte', 'galets_petite', 'galets_gouttiere', 'pierre_nu', 'pierre_arche',
    'bardage', 'bardage_porte', 'bardage_fenetres', 'bardage_entree', 'ancien_nu', 'ancien_volets', 'ancien_volets_fermes', 'ancien_porte',
]


def _tuile(img, taille, px_par_tuile):
    t = img.resize((px_par_tuile, px_par_tuile), Image.LANCZOS)
    res = Image.new(img.mode, (taille, taille))
    for x in range(0, taille, px_par_tuile):
        for y in range(0, taille, px_par_tuile):
            res.paste(t, (x, y))
    return res


def _teinte(img, coul, force=1.0):
    """Recolore une texture (bois…) en gardant son relief : luminance x couleur."""
    g = np.asarray(img.convert('L'), np.float32) / 255.0
    g = g / max(g.mean(), 1e-3)
    c = np.array(coul, np.float32)[None, None, :]
    return Image.fromarray(np.clip(c * (1 - force + force * g[..., None]), 0, 255).astype(np.uint8), 'RGB')


def _base(ident, px_tuile, moyenne=None, contraste=1.0):
    """Mur de base (couleur + normales), éventuellement ramené à une couleur moyenne."""
    c = np.asarray(_tuile(Image.open(cc0.texture(ident, 'Diffuse', '1k')).convert('RGB'), T, px_tuile), np.float32)
    m = c.reshape(-1, 3).mean(0)
    if moyenne is not None:
        c = (c - m) * contraste + m
        c = c / m * np.array(moyenne, np.float32)
    n = _tuile(Image.open(cc0.texture(ident, 'nor_gl', '1k')).convert('RGB'), T, px_tuile)
    return Image.fromarray(np.clip(c, 0, 255).astype(np.uint8), 'RGB'), n


class Cellule:
    def __init__(self, base, rug=0.92):
        self.c = base[0].copy()
        self.n0 = base[1]
        self.h = Image.new('L', (T, T), 128)        # relief
        self.r = Image.new('L', (T, T), int(rug * 255))
        self.dc, self.dh, self.dr = ImageDraw.Draw(self.c), ImageDraw.Draw(self.h), ImageDraw.Draw(self.r)

    def bx(self, x0, y0, x1, y1):
        return [int(round(min(x0, x1) * PX)), int(round(T - max(y0, y1) * PX)), int(round(max(x0, x1) * PX)) - 1, int(round(T - min(y0, y1) * PX)) - 1]

    def rect(self, x0, y0, x1, y1, coul=None, haut=None, rug=None):
        b = self.bx(x0, y0, x1, y1)
        if coul is not None: self.dc.rectangle(b, fill=coul)
        if haut is not None: self.dh.rectangle(b, fill=haut)
        if rug is not None: self.dr.rectangle(b, fill=int(rug * 255))

    def image(self, img, x0, y0, x1, y1, haut=None, rug=None):
        b = self.bx(x0, y0, x1, y1)
        self.c.paste(img.resize((max(1, b[2] - b[0] + 1), max(1, b[3] - b[1] + 1)), Image.LANCZOS), (b[0], b[1]))
        if haut is not None: self.dh.rectangle(b, fill=haut)
        if rug is not None: self.dr.rectangle(b, fill=int(rug * 255))

    def ombre(self, x0, y0, x1, y1, force=0.35):
        b = self.bx(x0, y0, x1, y1)
        if b[2] < b[0] or b[3] < b[1]: return
        zone = self.c.crop((b[0], b[1], b[2] + 1, b[3] + 1))
        self.c.paste(Image.eval(zone, lambda v: int(v * (1 - force))), (b[0], b[1]))

    def degrade(self, x0, y0, x1, y1, haut_c, bas_c):
        b = self.bx(x0, y0, x1, y1)
        h = b[3] - b[1] + 1
        for k in range(h):
            f = k / max(h - 1, 1)
            self.dc.line([(b[0], b[1] + k), (b[2], b[1] + k)], fill=tuple(int(haut_c[i] + (bas_c[i] - haut_c[i]) * f) for i in range(3)))

    def arc(self, cx, cy, r, coul=None, haut=None, rug=None, demi=True):
        """Demi-disque (haut d'une baie en plein cintre)."""
        b = [int((cx - r) * PX), int(T - (cy + r) * PX), int((cx + r) * PX), int(T - (cy - r) * PX)]
        for d, v in ((self.dc, coul), (self.dh, haut), (self.dr, None if rug is None else int(rug * 255))):
            if v is not None: d.pieslice(b, 180, 360, fill=v) if demi else d.ellipse(b, fill=v)


def composer(dossier, rng=None):
    """Peint l'atlas et renvoie les chemins (couleur, normales, orm)."""
    rng = rng or np.random.default_rng(3)
    os.makedirs(dossier, exist_ok=True)
    crepi = _base('plastered_wall_02', 256, (232, 227, 217))
    galets = _base('plaster_stone_wall_02', 300, (196, 180, 156), 1.1)
    ancien = _base('plaster_stone_wall_01', 300, (214, 198, 170))
    pierre = _base('stone_wall', 320, (198, 186, 160), 1.05)
    tole = _base('corrugated_iron', 256, (205, 208, 208), 0.8)
    bois = Image.open(cc0.texture('wood_shutter', 'Diffuse', '1k')).convert('RGB')
    porte_bois = Image.open(cc0.texture('rough_pine_door', 'Diffuse', '1k')).convert('RGB')
    garage_bois = Image.open(cc0.texture('wooden_garage_door', 'Diffuse', '1k')).convert('RGB')
    lames = Image.open(cc0.texture('painted_metal_shutter', 'Diffuse', '1k')).convert('RGB')
    BLEU, VERT, GRIS, BRUN = (128, 152, 172), (106, 132, 108), (150, 152, 150), (120, 78, 48)
    DELAVE, VIEUX_BOIS = (138, 150, 150), (104, 78, 56)
    PIERRE, CADRE, VITRE_H, VITRE_B = (205, 198, 184), (240, 240, 236), (62, 76, 92), (22, 27, 33)
    TAILLE = (214, 204, 182)                                    # pierre de taille des encadrements

    def encadrement(c, x0, y0, x1, y1, retrait=0.06):
        c.rect(x0, y0, x1, y1, coul=(52, 50, 47), haut=40, rug=0.9)
        c.rect(x0 + retrait, y0, x1, y1 - retrait, coul=(96, 92, 86), haut=44)
        c.rect(x1 - 0.025, y0, x1, y1 - retrait, coul=(178, 172, 162), haut=60)

    def pierre_taille(c, x0, y0, x1, y1, e=0.13):
        """Encadrement en pierre de taille autour d'une baie (bourg ancien)."""
        for a, b_, cc, d in ((x0 - e, y0, x0, y1 + e), (x1, y0, x1 + e, y1 + e), (x0 - e, y1, x1 + e, y1 + e)):
            c.rect(a, b_, cc, d, coul=TAILLE, haut=150, rug=0.85)
        for k in range(int((y1 - y0) / 0.32)):                   # joints des pierres
            y = y0 + (k + 0.5) * 0.32
            c.rect(x0 - e, y, x0, y + 0.012, coul=(150, 142, 126), haut=118)
            c.rect(x1, y + 0.1, x1 + e, y + 0.112, coul=(150, 142, 126), haut=118)
        c.ombre(x0 - e, y0 - 0.03, x1 + e, y0, 0.2)

    def vitrage(c, x0, y0, x1, y1, croisillons=True, cadre=CADRE, rideau=True):
        c.rect(x0, y0, x1, y1, coul=cadre, haut=92, rug=0.45)
        e, m = 0.055, (x0 + x1) / 2
        for a0, a1 in ((x0 + e, m - e / 2), (m + e / 2, x1 - e)):
            c.degrade(a0, y0 + e, a1, y1 - e, VITRE_H, VITRE_B)
            c.rect(a0, y0 + e, a1, y1 - e, haut=70, rug=0.05)
            if rideau:
                b = c.bx(a0, y0 + e, a1, y1 - e)
                voile = Image.new('RGB', (max(1, b[2] - b[0] + 1), max(1, b[3] - b[1] + 1)), (215, 212, 204))
                masque = Image.new('L', voile.size, 0)
                ImageDraw.Draw(masque).rectangle([0, 0, voile.size[0], int(voile.size[1] * rng.uniform(0.25, 0.8))], fill=int(rng.uniform(40, 95)))
                c.c.paste(voile, (b[0], b[1]), masque)
            if croisillons:
                yc = y0 + (y1 - y0) * 0.5
                c.rect(a0, yc - 0.012, a1, yc + 0.012, coul=cadre, haut=88, rug=0.45)
        c.rect(m - 0.012, y0 + e, m + 0.012, y1 - e, coul=tuple(int(v * 0.8) for v in cadre), haut=96)

    def appui(c, x0, x1, y):
        c.rect(x0 - 0.06, y - 0.06, x1 + 0.06, y, coul=PIERRE, haut=175, rug=0.85)
        c.rect(x0 - 0.06, y - 0.012, x1 + 0.06, y, coul=(228, 222, 210), haut=185)
        c.ombre(x0 - 0.06, y - 0.16, x1 + 0.06, y - 0.06, 0.22)
        for k in range(5):
            x = rng.uniform(x0, x1)
            c.ombre(x, y - rng.uniform(0.3, 0.75), x + 0.02, y - 0.16, 0.08)

    def volet(c, x0, y0, x1, y1, coul, ferme=False):
        img = _teinte(bois.crop((0, 0, 512, 1024)), coul, 0.55)
        c.ombre(x0 + 0.03, y0 - 0.04, x1 + 0.05, y1 - 0.03, 0.30)
        c.image(img, x0, y0, x1, y1, haut=168 if not ferme else 120, rug=0.62)
        n = max(3, int((x1 - x0) / 0.11))
        for k in range(1, n):
            x = x0 + (x1 - x0) * k / n
            c.rect(x - 0.004, y0, x + 0.004, y1, coul=tuple(int(v * 0.55) for v in coul), haut=140 if not ferme else 96)
        for y in (y0 + (y1 - y0) * 0.18, y0 + (y1 - y0) * 0.80):
            c.rect(x0, y - 0.045, x1, y + 0.045, coul=tuple(int(v * 0.9) for v in coul), haut=190 if not ferme else 140)
            c.ombre(x0, y - 0.065, x1, y - 0.045, 0.3)
        for y in (y0 + 0.12, y1 - 0.12):
            c.rect(x0, y - 0.012, x0 + (x1 - x0) * 0.8, y + 0.012, coul=(28, 28, 30), haut=200, rug=0.5)

    def fenetre(c, coul_volet=None, etat='ouvert', x0=1.0, x1=2.0, y0=0.95, y1=2.30, cadre=CADRE, taille=False):
        if taille: pierre_taille(c, x0, y0, x1, y1)
        encadrement(c, x0, y0, x1, y1)
        if etat == 'ferme':
            volet(c, x0 + 0.02, y0 + 0.01, (x0 + x1) / 2 - 0.004, y1 - 0.07, coul_volet, True)
            volet(c, (x0 + x1) / 2 + 0.004, y0 + 0.01, x1 - 0.02, y1 - 0.07, coul_volet, True)
        else:
            vitrage(c, x0 + 0.07, y0 + 0.02, x1 - 0.03, y1 - 0.08, cadre=cadre)
            if coul_volet is not None:
                w = (x1 - x0) / 2
                d = 0.16 if taille else 0.03
                volet(c, x0 - w - d, y0, x0 - d, y1, coul_volet)
                volet(c, x1 + d, y0, x1 + w + d, y1, coul_volet)
        appui(c, x0, x1, y0)

    def roulant(c, ouverture, x0=0.95, x1=2.05, y0=0.95, y1=2.30):
        encadrement(c, x0, y0, x1, y1)
        vitrage(c, x0 + 0.07, y0 + 0.02, x1 - 0.03, y1 - 0.20, croisillons=False)
        c.rect(x0 + 0.06, y1 - 0.22, x1 - 0.025, y1 - 0.06, coul=(226, 226, 222), haut=110, rug=0.5)
        bas = y1 - 0.22 - (y1 - 0.22 - y0) * (1 - ouverture)
        if ouverture < 1:
            c.image(_teinte(lames.crop((0, 0, 512, 512)), (224, 224, 220), 0.5), x0 + 0.075, bas, x1 - 0.035, y1 - 0.22, haut=100, rug=0.5)
            for k in range(int((y1 - 0.22 - bas) / 0.045)):
                y = bas + k * 0.045
                c.rect(x0 + 0.075, y, x1 - 0.035, y + 0.006, coul=(176, 176, 172), haut=84)
        appui(c, x0, x1, y0)

    def seuil(c, x0, x1):
        c.rect(x0 - 0.1, 0.0, x1 + 0.1, 0.07, coul=PIERRE, haut=185, rug=0.85)
        c.ombre(x0 - 0.1, 0.07, x1 + 0.1, 0.09, 0.3)

    def gouttiere(c):
        c.ombre(1.50, 0.0, 1.62, 3.0, 0.12)
        c.rect(1.44, 0.0, 1.52, 3.0, coul=(150, 146, 138), haut=215, rug=0.45)
        c.rect(1.455, 0.0, 1.475, 3.0, coul=(196, 192, 184), haut=225)
        for y in (0.6, 1.9):
            c.rect(1.42, y, 1.54, y + 0.04, coul=(90, 88, 84), haut=225)

    def porte(c, img, taille=False, x0=1.02, x1=1.98, y1=2.22):
        if taille: pierre_taille(c, x0, 0.0, x1, y1, 0.15)
        encadrement(c, x0, 0.0, x1, y1)
        c.image(img, x0 + 0.07, 0.07, x1 - 0.025, y1 - 0.08, haut=96, rug=0.55)
        c.rect(x1 - 0.2, 1.02, x1 - 0.13, 1.06, coul=(190, 170, 110), haut=150, rug=0.3)
        seuil(c, x0, x1)

    cells = []
    for nom in CELLULES:
        fam = 'galets' if nom.startswith('galets') else 'pierre' if nom.startswith('pierre') else 'bardage' if nom.startswith('bardage') else 'ancien' if nom.startswith('ancien') else 'crepi'
        c = Cellule({'crepi': crepi, 'galets': galets, 'pierre': pierre, 'bardage': tole, 'ancien': ancien}[fam], 0.55 if fam == 'bardage' else 0.92)
        if nom == 'volets_bleus': fenetre(c, BLEU)
        elif nom == 'volets_verts': fenetre(c, VERT)
        elif nom == 'volets_gris': fenetre(c, GRIS)
        elif nom == 'volets_fermes_bleus': fenetre(c, BLEU, 'ferme')
        elif nom == 'volets_fermes_bois': fenetre(c, BRUN, 'ferme')
        elif nom == 'roulant_mi': roulant(c, 0.45)
        elif nom == 'roulant_ferme': roulant(c, 0.0)
        elif nom in ('petite', 'galets_petite'): fenetre(c, None, x0=1.2, x1=1.8, y0=1.45, y1=2.15, taille=fam != 'crepi', cadre=CADRE if fam == 'crepi' else (120, 96, 70))
        elif nom == 'galets_volets': fenetre(c, VIEUX_BOIS, x0=1.05, x1=1.95, taille=True, cadre=(120, 96, 70))
        elif nom == 'galets_volets_fermes': fenetre(c, VIEUX_BOIS, 'ferme', x0=1.05, x1=1.95, taille=True)
        elif nom == 'ancien_volets': fenetre(c, DELAVE, x0=1.05, x1=1.95, taille=True, cadre=(226, 222, 210))
        elif nom == 'ancien_volets_fermes': fenetre(c, DELAVE, 'ferme', x0=1.05, x1=1.95, taille=True)
        elif nom in ('galets_porte', 'ancien_porte'): porte(c, _teinte(porte_bois, (104, 74, 50) if nom.startswith('galets') else (92, 110, 104), 0.7), True)
        elif nom == 'porte_bois':
            porte(c, porte_bois)
            c.rect(1.30, 1.45, 1.74, 1.52, coul=(40, 34, 28), haut=80)
            c.rect(2.15, 1.50, 2.33, 1.62, coul=(30, 60, 140), haut=150, rug=0.4)
        elif nom == 'porte_moderne':
            encadrement(c, 1.02, 0.0, 1.98, 2.20)
            c.rect(1.09, 0.07, 1.955, 2.12, coul=(70, 74, 80), haut=96, rug=0.4)
            c.degrade(1.25, 1.15, 1.50, 1.95, VITRE_H, VITRE_B)
            c.rect(1.25, 1.15, 1.50, 1.95, haut=80, rug=0.06)
            c.rect(1.82, 0.85, 1.86, 1.35, coul=(205, 205, 208), haut=160, rug=0.25)
            seuil(c, 1.02, 1.98)
        elif nom == 'porte_fenetre':
            encadrement(c, 0.95, 0.08, 2.05, 2.32)
            vitrage(c, 1.02, 0.10, 2.02, 2.24, croisillons=False)
            c.rect(0.86, 0.02, 2.14, 0.08, coul=PIERRE, haut=190, rug=0.85)
            c.ombre(0.86, -0.02, 2.14, 0.02, 0.35)
            for k in range(13):
                x = 0.90 + k * 0.10
                c.rect(x - 0.008, 0.08, x + 0.008, 1.05, coul=(24, 24, 26), haut=215, rug=0.5)
            c.rect(0.88, 1.03, 2.12, 1.07, coul=(24, 24, 26), haut=220, rug=0.5)
            c.rect(0.88, 0.16, 2.12, 0.19, coul=(24, 24, 26), haut=220, rug=0.5)
        elif nom in ('garage_bois', 'garage_metal'):
            encadrement(c, 0.30, 0.0, 2.70, 2.20, 0.08)
            if nom == 'garage_bois':
                c.image(garage_bois, 0.39, 0.02, 2.67, 2.11, haut=90, rug=0.6)
            else:
                c.image(_teinte(lames, (214, 216, 214), 0.6), 0.39, 0.02, 2.67, 2.11, haut=90, rug=0.45)
                for k in range(1, 4):
                    c.rect(0.39, 2.11 * k / 4, 2.67, 2.11 * k / 4 + 0.012, coul=(150, 152, 150), haut=70)
            c.ombre(0.39, 1.95, 2.67, 2.11, 0.25)
        elif nom in ('nu_gouttiere', 'galets_gouttiere'): gouttiere(c)
        elif nom == 'genoise':
            # génoise provençale : trois rangs de tuiles canal scellées sous le toit (bande du bas de la travée, 0 à 0,36 m)
            for rang in range(3):
                y = 0.02 + rang * 0.115
                dec = 0.1 * (rang % 2)
                c.rect(0, y + 0.085, 3.0, y + 0.115, coul=(214, 196, 170), haut=120 + rang * 30, rug=0.9)
                for k in range(-1, 16):
                    x = k * 0.2 + dec
                    c.arc(x + 0.1, y, 0.095, coul=(168 + int(rng.integers(-14, 14)), 96 + int(rng.integers(-10, 10)), 62), haut=150 + rang * 30, rug=0.8)
                    c.arc(x + 0.1, y, 0.062, coul=(46, 30, 24), haut=60)
                c.ombre(0, y - 0.03, 3.0, y, 0.25)
            c.ombre(0, 0.36, 3.0, 0.42, 0.12)
        elif nom == 'pierre_arche':
            # baie en plein cintre (église)
            for e, coul, h in ((0.16, TAILLE, 150), (0.0, (26, 30, 38), 50)):
                c.rect(1.2 - e, 0.7, 1.8 + e, 2.0, coul=coul, haut=h, rug=0.85 if e else 0.1)
                c.arc(1.5, 2.0, 0.3 + e, coul=coul, haut=h, rug=0.85 if e else 0.1)
            for x in (1.4, 1.6):
                c.rect(x - 0.012, 0.7, x + 0.012, 2.25, coul=(20, 20, 22), haut=90)
            for y in (1.1, 1.5, 1.9):
                c.rect(1.2, y - 0.01, 1.8, y + 0.01, coul=(20, 20, 22), haut=90)
            c.rect(1.0, 0.62, 2.0, 0.7, coul=TAILLE, haut=175, rug=0.85)
        elif nom == 'bardage':
            c.rect(0, 0, 3.0, 0.32, coul=(120, 120, 116), haut=150, rug=0.9)            # soubassement béton
        elif nom == 'bardage_porte':
            c.rect(0, 0, 3.0, 0.32, coul=(120, 120, 116), haut=150, rug=0.9)
            c.rect(0.12, 0.0, 2.88, 2.82, coul=(40, 42, 46), haut=60, rug=0.7)
            c.image(_teinte(lames, (176, 180, 184), 0.6), 0.2, 0.0, 2.8, 2.74, haut=95, rug=0.42)
            for k in range(1, 5):
                c.rect(0.2, 2.74 * k / 5, 2.8, 2.74 * k / 5 + 0.014, coul=(110, 114, 118), haut=70)
            for x in (0.9, 1.9):
                c.degrade(x, 1.72, x + 0.3, 1.9, VITRE_H, VITRE_B); c.rect(x, 1.72, x + 0.3, 1.9, rug=0.06)
        elif nom == 'bardage_fenetres':
            c.rect(0, 0, 3.0, 0.32, coul=(120, 120, 116), haut=150, rug=0.9)
            c.rect(0.0, 1.18, 3.0, 2.12, coul=(54, 58, 64), haut=80, rug=0.5)
            for k in range(3):
                c.degrade(0.06 + k, 1.24, 0.94 + k, 2.06, VITRE_H, VITRE_B); c.rect(0.06 + k, 1.24, 0.94 + k, 2.06, haut=70, rug=0.05)
        elif nom == 'bardage_entree':
            c.rect(0, 0, 3.0, 0.32, coul=(120, 120, 116), haut=150, rug=0.9)
            c.rect(0.3, 0.0, 2.7, 2.5, coul=(48, 52, 58), haut=70, rug=0.45)
            for x0, x1 in ((0.38, 1.46), (1.54, 2.62)):
                c.degrade(x0, 0.08, x1, 2.42, VITRE_H, VITRE_B); c.rect(x0, 0.08, x1, 2.42, haut=62, rug=0.05)
                c.rect(x1 - 0.14 if x0 < 1 else x0 + 0.08, 0.9, x1 - 0.08 if x0 < 1 else x0 + 0.14, 1.5, coul=(200, 202, 206), haut=150, rug=0.25)
            c.rect(0.1, 2.5, 2.9, 2.62, coul=(70, 74, 80), haut=210, rug=0.4)             # auvent
            c.ombre(0.3, 2.3, 2.7, 2.5, 0.3)
        cells.append(c)

    W, H = COLS * T, LIGS * T
    atlas_c, atlas_h, atlas_r, atlas_n0 = Image.new('RGB', (W, H)), Image.new('L', (W, H), 128), Image.new('L', (W, H), 235), Image.new('RGB', (W, H))
    atlas_m = Image.new('L', (W, H), 0)
    for k, c in enumerate(cells):
        p = ((k % COLS) * T, (k // COLS) * T)
        atlas_c.paste(c.c, p); atlas_h.paste(c.h, p); atlas_r.paste(c.r, p); atlas_n0.paste(c.n0, p)
        if CELLULES[k].startswith('bardage'):                     # tôle : légèrement métallique
            atlas_m.paste(150, (p[0], p[1], p[0] + T, p[1] + T))
    h = np.asarray(atlas_h.filter(ImageFilter.GaussianBlur(1.0)), np.float32) / 255.0
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 7.0
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 7.0
    n0 = np.asarray(atlas_n0, np.float32) / 127.5 - 1.0
    mur = np.abs(np.asarray(atlas_h, np.float32) - 128) < 2
    nx = -dx + np.where(mur, n0[..., 0] * 0.9, 0)
    ny = dy + np.where(mur, n0[..., 1] * 0.9, 0)
    l = np.sqrt(nx * nx + ny * ny + 1.0)
    f_c, f_n, f_o = [os.path.join(dossier, 'facades_' + s) for s in ('couleur.jpg', 'normale.jpg', 'orm.jpg')]
    atlas_c.save(f_c, quality=90)
    Image.fromarray(((np.stack([nx / l, ny / l, 1.0 / l], -1) * 0.5 + 0.5) * 255).astype(np.uint8), 'RGB').save(f_n, quality=92)
    Image.merge('RGB', (Image.new('L', (W, H), 255), atlas_r, atlas_m)).save(f_o, quality=90)
    return f_c, f_n, f_o


def uv_cellule(nom, s0, s1, t0, t1):
    """Coins UV (Blender, v vers le haut) de la portion [s0,s1] x [t0,t1] (0..1) d'une travée."""
    k = CELLULES.index(nom)
    col, lig = k % COLS, k // COLS
    m = 1.5 / T
    u = lambda s: (col + m + s * (1 - 2 * m)) / COLS
    v = lambda t: (LIGS - 1 - lig + m + t * (1 - 2 * m)) / LIGS
    return u(s0), u(s1), v(t0), v(t1)
