"""Atlas de façades provençales : 16 « travées » de 3 m x 3 m (fenêtres à volets, portes, garages…),
composées à partir de photos de matériaux libres (Poly Haven, CC0). Produit couleur, normales et ORM.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import cc0

T = 512                      # pixels par travée
PX = T / 3.0                 # pixels par mètre
CELLULES = ['nu', 'volets_bleus', 'volets_verts', 'volets_fermes_bleus', 'volets_fermes_bois', 'roulant_mi', 'roulant_ferme',
            'porte_fenetre', 'porte_bois', 'porte_moderne', 'garage_bois', 'garage_metal', 'petite', 'volets_gris', 'nu_gouttiere', 'nu_tache']


def _tuile(img, taille, px_par_tuile):
    """Répète une texture carrée pour couvrir `taille` pixels à l'échelle voulue."""
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
    a = np.clip(c * (1 - force + force * g[..., None]), 0, 255).astype(np.uint8)
    return Image.fromarray(a, 'RGB')


class Cellule:
    def __init__(self, crepi, crepi_n):
        self.c = crepi.copy()
        self.h = Image.new('L', (T, T), 128)        # relief
        self.r = Image.new('L', (T, T), 235)        # rugosité
        self.n0 = crepi_n
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
        self.c.paste(img.resize((b[2] - b[0] + 1, b[3] - b[1] + 1), Image.LANCZOS), (b[0], b[1]))
        if haut is not None: self.dh.rectangle(b, fill=haut)
        if rug is not None: self.dr.rectangle(b, fill=int(rug * 255))

    def ombre(self, x0, y0, x1, y1, force=0.35):
        b = self.bx(x0, y0, x1, y1)
        zone = self.c.crop((b[0], b[1], b[2] + 1, b[3] + 1))
        self.c.paste(Image.eval(zone, lambda v: int(v * (1 - force))), (b[0], b[1]))

    def degrade(self, x0, y0, x1, y1, haut_c, bas_c):
        b = self.bx(x0, y0, x1, y1)
        h = b[3] - b[1] + 1
        for k in range(h):
            f = k / max(h - 1, 1)
            self.dc.line([(b[0], b[1] + k), (b[2], b[1] + k)], fill=tuple(int(haut_c[i] + (bas_c[i] - haut_c[i]) * f) for i in range(3)))


def composer(dossier, rng=None):
    """Peint l'atlas 4 x 4 et renvoie les chemins (couleur, normales, orm) + la couleur moyenne du crépi."""
    rng = rng or np.random.default_rng(3)
    os.makedirs(dossier, exist_ok=True)
    crepi_src = Image.open(cc0.texture('plastered_wall_02', 'Diffuse', '1k')).convert('RGB')
    crepi_nor = Image.open(cc0.texture('plastered_wall_02', 'nor_gl', '1k')).convert('RGB')
    # crépi clair et neutre : la teinte de chaque maison est donnée ensuite par les couleurs de sommets
    a = np.asarray(_tuile(crepi_src, T, 256), np.float32)
    a = a / a.reshape(-1, 3).mean(0) * np.array([232, 227, 217], np.float32)
    crepi = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGB')
    crepi_n = _tuile(crepi_nor, T, 256)
    bois = Image.open(cc0.texture('wood_shutter', 'Diffuse', '1k')).convert('RGB')
    porte_bois = Image.open(cc0.texture('rough_pine_door', 'Diffuse', '1k')).convert('RGB')
    garage_bois = Image.open(cc0.texture('wooden_garage_door', 'Diffuse', '1k')).convert('RGB')
    lames = Image.open(cc0.texture('painted_metal_shutter', 'Diffuse', '1k')).convert('RGB')
    BLEU, VERT, GRIS, BRUN, BLANC = (128, 152, 172), (106, 132, 108), (150, 152, 150), (120, 78, 48), (236, 236, 232)
    PIERRE, CADRE, VITRE_H, VITRE_B = (205, 198, 184), (240, 240, 236), (62, 76, 92), (22, 27, 33)

    def encadrement(c, x0, y0, x1, y1, retrait=0.06):
        """Tableau de la baie : ombre en haut et à gauche (soleil), arête claire à droite."""
        c.rect(x0, y0, x1, y1, coul=(52, 50, 47), haut=40, rug=0.9)
        c.rect(x0 + retrait, y0, x1, y1 - retrait, coul=(96, 92, 86), haut=44)
        c.rect(x1 - 0.025, y0, x1, y1 - retrait, coul=(178, 172, 162), haut=60)

    def vitrage(c, x0, y0, x1, y1, croisillons=True, cadre=CADRE, rideau=True):
        c.rect(x0, y0, x1, y1, coul=cadre, haut=92, rug=0.45)
        e, m = 0.055, (x0 + x1) / 2
        for a0, a1 in ((x0 + e, m - e / 2), (m + e / 2, x1 - e)):
            c.degrade(a0, y0 + e, a1, y1 - e, VITRE_H, VITRE_B)
            c.rect(a0, y0 + e, a1, y1 - e, haut=70, rug=0.05)
            if rideau:                                 # voilage derrière la vitre
                b = c.bx(a0, y0 + e, a1, y1 - e)
                voile = Image.new('RGB', (b[2] - b[0] + 1, b[3] - b[1] + 1), (215, 212, 204))
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
        for k in range(5):                              # coulures sous l'appui
            x = rng.uniform(x0, x1)
            c.ombre(x, y - rng.uniform(0.3, 0.75), x + 0.02, y - 0.16, 0.08)

    def volet(c, x0, y0, x1, y1, coul, ferme=False):
        img = _teinte(bois.crop((0, 0, 512, 1024)), coul, 0.55)
        c.ombre(x0 + 0.03, y0 - 0.04, x1 + 0.05, y1 - 0.03, 0.30)      # ombre portée sur le mur
        c.image(img, x0, y0, x1, y1, haut=168 if not ferme else 120, rug=0.62)
        n = max(3, int((x1 - x0) / 0.11))
        for k in range(1, n):                           # joints des planches
            x = x0 + (x1 - x0) * k / n
            c.rect(x - 0.004, y0, x + 0.004, y1, coul=tuple(int(v * 0.55) for v in coul), haut=140 if not ferme else 96)
        for y in (y0 + (y1 - y0) * 0.18, y0 + (y1 - y0) * 0.80):     # barres
            c.rect(x0, y - 0.045, x1, y + 0.045, coul=tuple(int(v * 0.9) for v in coul), haut=190 if not ferme else 140)
            c.ombre(x0, y - 0.065, x1, y - 0.045, 0.3)
        for y in (y0 + 0.12, y1 - 0.12):                # pentures
            c.rect(x0, y - 0.012, x0 + (x1 - x0) * 0.8, y + 0.012, coul=(28, 28, 30), haut=200, rug=0.5)

    def fenetre(c, coul_volet=None, etat='ouvert', x0=1.0, x1=2.0, y0=0.95, y1=2.30, cadre=CADRE):
        encadrement(c, x0, y0, x1, y1)
        if etat == 'ferme':
            volet(c, x0 + 0.02, y0 + 0.01, (x0 + x1) / 2 - 0.004, y1 - 0.07, coul_volet, True)
            volet(c, (x0 + x1) / 2 + 0.004, y0 + 0.01, x1 - 0.02, y1 - 0.07, coul_volet, True)
        else:
            vitrage(c, x0 + 0.07, y0 + 0.02, x1 - 0.03, y1 - 0.08, cadre=cadre)
            if coul_volet is not None:
                w = (x1 - x0) / 2
                volet(c, x0 - w - 0.03, y0, x0 - 0.03, y1, coul_volet)
                volet(c, x1 + 0.03, y0, x1 + w + 0.03, y1, coul_volet)
        appui(c, x0, x1, y0)

    def roulant(c, ouverture, x0=0.95, x1=2.05, y0=0.95, y1=2.30):
        encadrement(c, x0, y0, x1, y1)
        vitrage(c, x0 + 0.07, y0 + 0.02, x1 - 0.03, y1 - 0.20, croisillons=False)
        c.rect(x0 + 0.06, y1 - 0.22, x1 - 0.025, y1 - 0.06, coul=(226, 226, 222), haut=110, rug=0.5)   # coffre
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

    cells = []
    for nom in CELLULES:
        c = Cellule(crepi, crepi_n)
        if nom == 'volets_bleus': fenetre(c, BLEU)
        elif nom == 'volets_verts': fenetre(c, VERT)
        elif nom == 'volets_gris': fenetre(c, GRIS)
        elif nom == 'volets_fermes_bleus': fenetre(c, BLEU, 'ferme')
        elif nom == 'volets_fermes_bois': fenetre(c, BRUN, 'ferme')
        elif nom == 'roulant_mi': roulant(c, 0.45)
        elif nom == 'roulant_ferme': roulant(c, 0.0)
        elif nom == 'petite': fenetre(c, None, x0=1.2, x1=1.8, y0=1.45, y1=2.15)
        elif nom == 'porte_fenetre':
            encadrement(c, 0.95, 0.08, 2.05, 2.32)
            vitrage(c, 1.02, 0.10, 2.02, 2.24, croisillons=False)
            c.rect(0.86, 0.02, 2.14, 0.08, coul=PIERRE, haut=190, rug=0.85)             # dalle du balcon
            c.ombre(0.86, -0.02, 2.14, 0.02, 0.35)
            for k in range(13):                                                       # garde-corps en fer forgé
                x = 0.90 + k * 0.10
                c.rect(x - 0.008, 0.08, x + 0.008, 1.05, coul=(24, 24, 26), haut=215, rug=0.5)
            c.rect(0.88, 1.03, 2.12, 1.07, coul=(24, 24, 26), haut=220, rug=0.5)
            c.rect(0.88, 0.16, 2.12, 0.19, coul=(24, 24, 26), haut=220, rug=0.5)
        elif nom == 'porte_bois':
            encadrement(c, 1.02, 0.0, 1.98, 2.22)
            c.image(porte_bois, 1.09, 0.07, 1.955, 2.14, haut=96, rug=0.55)
            c.rect(1.80, 1.02, 1.87, 1.06, coul=(190, 170, 110), haut=150, rug=0.3)       # poignée
            c.rect(1.30, 1.45, 1.74, 1.52, coul=(40, 34, 28), haut=80)                    # boîte aux lettres
            seuil(c, 1.02, 1.98)
            c.rect(2.15, 1.50, 2.33, 1.62, coul=(30, 60, 140), haut=150, rug=0.4)         # plaque de numéro
        elif nom == 'porte_moderne':
            encadrement(c, 1.02, 0.0, 1.98, 2.20)
            c.rect(1.09, 0.07, 1.955, 2.12, coul=(70, 74, 80), haut=96, rug=0.4)
            c.degrade(1.25, 1.15, 1.50, 1.95, VITRE_H, VITRE_B)
            c.rect(1.25, 1.15, 1.50, 1.95, haut=80, rug=0.06)
            c.rect(1.82, 0.85, 1.86, 1.35, coul=(205, 205, 208), haut=160, rug=0.25)
            seuil(c, 1.02, 1.98)
        elif nom in ('garage_bois', 'garage_metal'):
            encadrement(c, 0.30, 0.0, 2.70, 2.20, 0.08)
            if nom == 'garage_bois':
                c.image(garage_bois, 0.39, 0.02, 2.67, 2.11, haut=90, rug=0.6)
            else:
                c.image(_teinte(lames, (214, 216, 214), 0.6), 0.39, 0.02, 2.67, 2.11, haut=90, rug=0.45)
                for k in range(1, 4):
                    c.rect(0.39, 2.11 * k / 4, 2.67, 2.11 * k / 4 + 0.012, coul=(150, 152, 150), haut=70)
            c.ombre(0.39, 1.95, 2.67, 2.11, 0.25)
        elif nom == 'nu_gouttiere':
            c.ombre(1.50, 0.0, 1.62, 3.0, 0.12)
            c.rect(1.44, 0.0, 1.52, 3.0, coul=(150, 146, 138), haut=215, rug=0.45)        # descente d'eau en zinc
            c.rect(1.455, 0.0, 1.475, 3.0, coul=(196, 192, 184), haut=225)
            for y in (0.6, 1.9):
                c.rect(1.42, y, 1.54, y + 0.04, coul=(90, 88, 84), haut=225)
        elif nom == 'nu_tache':
            for k in range(7):
                x, y = rng.uniform(0.2, 2.6), rng.uniform(0.3, 2.9)
                c.ombre(x, y - rng.uniform(0.3, 1.2), x + rng.uniform(0.03, 0.12), y, 0.05)
        if nom not in ('garage_bois', 'garage_metal', 'porte_bois', 'porte_moderne'):
            pass
        # soubassement légèrement sali (rejaillissement de la pluie) — appliqué par le maillage (travées du rez-de-chaussée)
        cells.append(c)

    atlas_c = Image.new('RGB', (4 * T, 4 * T))
    atlas_h = Image.new('L', (4 * T, 4 * T), 128)
    atlas_r = Image.new('L', (4 * T, 4 * T), 235)
    atlas_n0 = Image.new('RGB', (4 * T, 4 * T))
    for k, c in enumerate(cells):
        p = ((k % 4) * T, (k // 4) * T)
        atlas_c.paste(c.c, p); atlas_h.paste(c.h, p); atlas_r.paste(c.r, p); atlas_n0.paste(c.n0, p)
    # normales : relief des menuiseries + grain du crépi (là où le relief est neutre)
    h = np.asarray(atlas_h.filter(ImageFilter.GaussianBlur(1.0)), np.float32) / 255.0
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 7.0
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 7.0
    n0 = np.asarray(atlas_n0, np.float32) / 127.5 - 1.0
    crepi_m = (np.abs(np.asarray(atlas_h, np.float32) - 128) < 2)[..., None]
    nx = -dx + np.where(crepi_m[..., 0], n0[..., 0] * 0.8, 0)
    ny = dy + np.where(crepi_m[..., 0], n0[..., 1] * 0.8, 0)
    nz = np.ones_like(nx)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    f_c, f_n, f_o = [os.path.join(dossier, 'facades_' + s) for s in ('couleur.jpg', 'normale.jpg', 'orm.jpg')]
    atlas_c.save(f_c, quality=90)
    Image.fromarray(((np.stack([nx / l, ny / l, nz / l], -1) * 0.5 + 0.5) * 255).astype(np.uint8), 'RGB').save(f_n, quality=92)
    Image.merge('RGB', (Image.new('L', atlas_r.size, 255), atlas_r, Image.new('L', atlas_r.size, 0))).save(f_o, quality=90)
    return f_c, f_n, f_o


def uv_cellule(nom, s0, s1, t0, t1):
    """Coins UV (Blender, v vers le haut) de la portion [s0,s1] x [t0,t1] (0..1) d'une travée."""
    k = CELLULES.index(nom)
    col, lig = k % 4, k // 4
    m = 1.5 / T
    u = lambda s: (col + m + s * (1 - 2 * m)) / 4
    v = lambda t: (3 - lig + m + t * (1 - 2 * m)) / 4
    return u(s0), u(s1), v(t0), v(t1)
