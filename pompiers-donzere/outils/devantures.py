"""Devantures des commerces et enseignes des bâtiments publics de Donzère.

Chaque enseigne reçoit sa propre image (6 m x 3 m, 128 px/m) : bandeau au nom réel du commerce, vitrine, porte, détails du métier.
Les noms sont écrits en lettres simples : aucun logo de marque n'est reproduit.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import cc0
from facades import _base, _teinte

PXM = 128
CW, CH = 768, 384                 # 6 m x 3 m
COLS, LIGS = 5, 10
POL = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'polices')
POLICES = {'serif': 'YoungSerif-Regular.ttf', 'serif_gras': 'Lora-Bold.ttf', 'italique': 'Lora-BoldItalic.ttf', 'affiche': 'Gloock-Regular.ttf',
           'baton': 'Outfit-Bold.ttf', 'travail': 'WorkSans-Bold.ttf', 'etroit': 'BigShoulders-Bold.ttf', 'fin': 'PoiretOne-Regular.ttf',
           'elegant': 'Italiana-Regular.ttf', 'grotesque': 'BricolageGrotesque-Bold.ttf', 'massif': 'EricaOne-Regular.ttf'}
# type -> (couleur du bandeau, couleur du texte, couleur des menuiseries, police, majuscules)
STYLES = {
    'boulangerie': ((112, 62, 30), (246, 232, 200), (88, 50, 26), 'serif', False), 'boucherie': ((138, 22, 28), (250, 246, 240), (60, 20, 22), 'serif_gras', True),
    'pharmacie': ((18, 122, 72), (255, 255, 255), (230, 232, 230), 'travail', True), 'tabac': ((150, 22, 26), (255, 255, 255), (40, 40, 44), 'etroit', True),
    'bar': ((28, 58, 46), (226, 196, 120), (24, 44, 36), 'italique', False), 'restaurant': ((74, 26, 30), (244, 230, 204), (40, 22, 22), 'affiche', False),
    'coiffure': ((22, 22, 26), (240, 240, 240), (26, 26, 30), 'fin', True), 'banque': ((0, 98, 74), (255, 255, 255), (200, 204, 206), 'baton', True),
    'supermarche': ((204, 28, 36), (255, 255, 255), (70, 74, 80), 'massif', True), 'alimentation': ((34, 120, 60), (255, 255, 255), (60, 64, 60), 'baton', True),
    'fleuriste': ((58, 110, 66), (255, 250, 240), (44, 80, 50), 'elegant', False), 'garage': ((26, 58, 122), (255, 255, 255), (60, 66, 76), 'etroit', True),
    'hotel': ((38, 40, 62), (224, 196, 128), (36, 36, 48), 'serif_gras', True), 'sante': ((236, 240, 244), (20, 70, 140), (220, 224, 228), 'travail', False),
    'boutique': ((40, 52, 86), (255, 255, 255), (36, 40, 52), 'grotesque', False), 'bricolage': ((228, 120, 18), (255, 255, 255), (60, 60, 64), 'etroit', True),
    'station': ((20, 60, 130), (255, 255, 255), (70, 74, 80), 'baton', True), 'poste': ((250, 204, 20), (20, 50, 130), (60, 64, 72), 'baton', True),
    'gendarmerie': ((24, 52, 130), (255, 255, 255), (60, 64, 72), 'travail', True), 'pompiers': ((182, 22, 26), (255, 255, 255), (150, 20, 24), 'etroit', True),
    'public': ((222, 214, 196), (58, 50, 44), (92, 70, 52), 'serif_gras', True),
}
ACCENTS = {'Cafe': 'Café', 'Credit': 'Crédit', 'Rhone': 'Rhône', 'Beaute': 'Beauté', 'Donzere': 'Donzère', 'Hotel': 'Hôtel', 'Epicerie': 'Épicerie', 'Patisserie': 'Pâtisserie',
           'Jusquau': 'Jusqu\'au', 'A': 'à', 'Des': 'des', 'De': 'de', 'Du': 'du', 'La': 'la', 'Le': 'le', 'Et': 'et', 'Au': 'au', 'D': 'd', 'L': 'l'}
VITRE_H, VITRE_B = (58, 72, 88), (20, 25, 31)


def nom_propre(nom):
    mots = nom.replace('  ', ' ').split(' ')
    res = [ACCENTS.get(m, m) if i else ACCENTS.get(m, m)[:1].upper() + ACCENTS.get(m, m)[1:] for i, m in enumerate(mots)]
    return ' '.join(res)


def _texte(img, rug, boite, txt, police, coul, hmax, majuscules):
    """Écrit `txt` centré dans la boîte (pixels), à la plus grande taille possible."""
    x0, y0, x1, y1 = boite
    if majuscules:
        txt = txt.upper()
    taille = int(hmax)
    while taille > 9:
        f = ImageFont.truetype(os.path.join(POL, POLICES[police]), taille)
        l, t, r, b = f.getbbox(txt)
        if r - l <= (x1 - x0) * 0.92 and b - t <= (y1 - y0) * 0.78:
            break
        taille -= 2
    d = ImageDraw.Draw(img)
    d.text(((x0 + x1) / 2 - (l + r) / 2, (y0 + y1) / 2 - (t + b) / 2), txt, fill=coul, font=f)


class Devanture:
    def __init__(self, mur, teinte, largeur):
        self.w = min(6.0, largeur)
        a = np.asarray(mur, np.float32) * np.array(teinte, np.float32)[None, None, :]
        self.c = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGB')
        self.r = Image.new('L', (CW, CH), 235)
        self.dc, self.dr = ImageDraw.Draw(self.c), ImageDraw.Draw(self.r)

    def bx(self, x0, y0, x1, y1):
        return [int(round(min(x0, x1) * PXM)), int(round(CH - max(y0, y1) * PXM)), int(round(max(x0, x1) * PXM)) - 1, int(round(CH - min(y0, y1) * PXM)) - 1]

    def rect(self, x0, y0, x1, y1, coul=None, rug=None, rayon=0):
        b = self.bx(x0, y0, x1, y1)
        if b[2] <= b[0] or b[3] <= b[1]: return
        if coul is not None: self.dc.rounded_rectangle(b, rayon, fill=coul) if rayon else self.dc.rectangle(b, fill=coul)
        if rug is not None: self.dr.rectangle(b, fill=int(rug * 255))

    def vitre(self, x0, y0, x1, y1):
        b = self.bx(x0, y0, x1, y1)
        h = b[3] - b[1] + 1
        for k in range(h):
            f = k / max(h - 1, 1)
            self.dc.line([(b[0], b[1] + k), (b[2], b[1] + k)], fill=tuple(int(VITRE_H[i] + (VITRE_B[i] - VITRE_H[i]) * f) for i in range(3)))
        self.dr.rectangle(b, fill=12)

    def ombre(self, x0, y0, x1, y1, force=0.3):
        b = self.bx(x0, y0, x1, y1)
        if b[2] <= b[0] or b[3] <= b[1]: return
        z = self.c.crop((b[0], b[1], b[2] + 1, b[3] + 1))
        self.c.paste(Image.eval(z, lambda v: int(v * (1 - force))), (b[0], b[1]))


def peindre(e, mur, rng):
    """Peint une devanture. e : { nom, type, largeur, teinte }."""
    typ = e['type'] if e['type'] in STYLES else 'boutique'
    bandeau, texte, menuis, police, maj = STYLES[typ]
    if typ == 'boutique':
        bandeau = [(40, 52, 86), (96, 34, 60), (24, 86, 92), (52, 52, 56), (120, 60, 30)][int(rng.integers(5))]
    d = Devanture(mur, e.get('teinte', (0.9, 0.86, 0.78)), e.get('largeur', 6.0))
    w = d.w
    U = lambda lo, hi: float(rng.uniform(min(lo, hi), max(lo, hi)))        # tirage sûr même si l'intervalle est inversé
    nom = nom_propre(e['nom'])
    sombre = tuple(int(v * 0.72) for v in menuis)
    if typ in ('public', 'gendarmerie', 'poste', 'pompiers'):
        # bâtiment public : porte d'entrée et inscription au-dessus
        cx = w / 2
        d.rect(cx - 0.95, 0.0, cx + 0.95, 2.32, coul=(206, 198, 180), rug=0.85)                 # encadrement en pierre
        d.rect(cx - 0.8, 0.0, cx + 0.8, 2.2, coul=sombre, rug=0.5)
        for s in (-1, 1):
            d.rect(cx + s * 0.04, 0.06, cx + s * 0.76, 2.14, coul=menuis, rug=0.5)
            d.vitre(cx + s * 0.14, 0.95, cx + s * 0.66, 1.95)
            d.rect(cx + s * 0.08, 0.98, cx + s * 0.12, 1.3, coul=(196, 176, 110), rug=0.3)
        d.rect(cx - 1.05, 0.0, cx + 1.05, 0.08, coul=(190, 184, 170), rug=0.85)
        d.rect(0.2, 2.42, w - 0.2, 2.92, coul=bandeau, rug=0.6, rayon=4)
        if typ == 'public' and 'airie' in nom:                                               # drapeau tricolore de la mairie
            for k, coul in enumerate(((0, 60, 150), (245, 245, 245), (210, 30, 40))):
                d.rect(cx + 1.25 + k * 0.16, 1.5, cx + 1.41 + k * 0.16, 2.0, coul=coul, rug=0.7)
        _texte(d.c, d.r, d.bx(0.2, 2.42, w - 0.2, 2.92), nom, police, texte, 0.4 * PXM, maj)
        return d
    if typ == 'garage':
        d.rect(0.2, 2.34, w - 0.2, 2.92, coul=bandeau, rug=0.5, rayon=4)
        _texte(d.c, d.r, d.bx(0.2, 2.34, w - 0.2, 2.92), nom, police, texte, 0.44 * PXM, maj)
        lp = min(3.4, w - 1.7)
        d.rect(0.3, 0.0, 0.3 + lp, 2.26, coul=(52, 56, 62), rug=0.6)
        for k in range(6):
            d.rect(0.36, 0.04 + k * 0.365, 0.24 + lp, 0.38 + k * 0.365, coul=(170, 176, 182), rug=0.45)
        d.rect(lp + 0.55, 0.0, w - 0.35, 2.12, coul=sombre, rug=0.5)
        d.vitre(lp + 0.63, 0.9, w - 0.43, 2.04)
        return d
    grand = typ in ('supermarche', 'bricolage')
    yb = 2.12 if grand else 2.34
    d.rect(0.14, yb, w - 0.14, 2.94, coul=bandeau, rug=0.5, rayon=5)
    d.rect(0.14, yb, w - 0.14, yb + 0.03, coul=tuple(int(v * 0.6) for v in bandeau))
    marge = 0.62 if typ in ('pharmacie', 'tabac') else 0.14
    _texte(d.c, d.r, d.bx(marge + 0.05, yb, w - 0.19, 2.94), nom, police, texte, (0.6 if grand else 0.42) * PXM, maj)
    if typ == 'pharmacie':                                                                    # croix verte
        d.rect(0.2, yb + 0.06, 0.66, 2.88, coul=(255, 255, 255), rug=0.4, rayon=4)
        d.rect(0.37, yb + 0.12, 0.49, 2.82, coul=(20, 150, 80)); d.rect(0.25, yb + 0.24 + (2.94 - yb - 0.6) / 2, 0.61, yb + 0.36 + (2.94 - yb - 0.6) / 2, coul=(20, 150, 80))
    if typ == 'tabac':                                                                        # « carotte » rouge
        cxp, cyp = 0.42 * PXM, CH - (yb + (2.94 - yb) / 2) * PXM
        d.dc.polygon([(cxp, cyp - 30), (cxp + 18, cyp), (cxp, cyp + 30), (cxp - 18, cyp)], fill=(214, 30, 34), outline=(255, 255, 255))
    # menuiserie : soubassement, porte et vitrines
    haut = yb - 0.08
    d.ombre(0.2, haut, w - 0.2, yb, 0.35)
    d.rect(0.22, 0.0, w - 0.22, haut, coul=menuis, rug=0.5)
    d.rect(0.22, 0.0, w - 0.22, 0.34, coul=sombre, rug=0.55)
    porte_g = rng.random() < 0.5
    lp = 1.9 if grand else 0.98
    xp = 0.3 if porte_g else w - 0.3 - lp
    if grand:
        xp = w / 2 - lp / 2
    zones = [(0.3, xp - 0.08), (xp + lp + 0.08, w - 0.3)]
    for x0, x1 in zones:
        if x1 - x0 < 0.5:
            continue
        nb = max(1, int(round((x1 - x0) / 1.7)))
        for k in range(nb):
            a, b = x0 + (x1 - x0) * k / nb + 0.035, x0 + (x1 - x0) * (k + 1) / nb - 0.035
            d.vitre(a, 0.42, b, haut - 0.08)
            # intérieur entrevu : étagères, marchandises, affiches
            for y in (0.95, 1.45):
                d.rect(a + 0.06, y, b - 0.06, y + 0.025, coul=(74, 66, 56))
                for _ in range(int((b - a) / 0.22)):
                    xx = U(a + 0.08, b - 0.2)
                    coul = {'boulangerie': (176, 132, 78), 'boucherie': (150, 60, 60), 'fleuriste': (90, 140, 80), 'pharmacie': (210, 214, 216)}.get(typ, tuple(int(v) for v in rng.integers(70, 190, 3)))
                    d.rect(xx, y + 0.03, xx + U(0.08, 0.16), y + U(0.1, 0.24), coul=tuple(int(v * 0.34 + 14) for v in coul), rayon=3)
            if rng.random() < 0.7:
                xx, yy = U(a + 0.05, max(a + 0.06, b - 0.5)), U(1.55, haut - 0.6)
                g = int(rng.integers(150, 205))
                d.rect(xx, yy, xx + 0.3, yy + 0.42, coul=(g, g - 4, g - 14), rug=0.5)
                for q in range(4):
                    d.rect(xx + 0.04, yy + 0.07 + q * 0.08, xx + U(0.16, 0.26), yy + 0.085 + q * 0.08, coul=(70, 70, 72))
            if typ == 'pharmacie':
                d.rect(a + 0.2, 1.6, a + 0.3, 1.9, coul=(20, 150, 80)); d.rect(a + 0.1, 1.7, a + 0.4, 1.8, coul=(20, 150, 80))
            if typ == 'banque' and k == 0:                                                    # distributeur de billets
                d.rect(a + 0.1, 0.7, a + 0.75, 1.75, coul=(196, 198, 200), rug=0.4, rayon=4)
                d.rect(a + 0.2, 1.25, a + 0.65, 1.62, coul=(40, 90, 150), rug=0.2)
                d.rect(a + 0.25, 0.92, a + 0.6, 1.14, coul=(90, 92, 96), rug=0.5)
    # porte vitrée
    d.rect(xp, 0.0, xp + lp, haut - 0.02, coul=sombre, rug=0.5)
    battants = 2 if grand else 1
    for k in range(battants):
        a, b = xp + lp * k / battants + 0.06, xp + lp * (k + 1) / battants - 0.06
        d.vitre(a, 0.12, b, haut - 0.12)
        d.rect((b - 0.1) if (k == 0) else a + 0.04, 0.85, (b - 0.04) if (k == 0) else a + 0.1, 1.35, coul=(205, 206, 208), rug=0.25)
    d.rect(xp + 0.2, 1.42, xp + 0.5, 1.56, coul=(240, 240, 232), rug=0.5)                       # panneau « ouvert »
    d.rect(xp + 0.23, 1.47, xp + 0.47, 1.51, coul=(30, 120, 60))
    d.rect(xp - 0.05, 0.0, xp + lp + 0.05, 0.05, coul=(186, 180, 168), rug=0.85)
    _finition(d, rng, yb)
    if typ in ('bar', 'restaurant'):                                                          # ardoise du menu
        xa = 0.36 if not porte_g else w - 0.86
        d.rect(xa, 0.5, xa + 0.5, 1.3, coul=(30, 32, 30), rug=0.9, rayon=3)
        for q in range(6):
            d.rect(xa + 0.06, 0.62 + q * 0.1, xa + U(0.3, 0.44), 0.64 + q * 0.1, coul=(214, 214, 206))
    if typ == 'boucherie':                                                                    # lambrequin rayé
        for k in range(int(w / 0.18)):
            d.rect(0.2 + k * 0.18, yb - 0.2, 0.2 + (k + 1) * 0.18, yb, coul=(196, 30, 36) if k % 2 else (246, 244, 238), rug=0.8)
    return d


def _finition(d, rng, yb):
    """Donne un aspect moins « dessiné » : reflets du ciel sur les vitrages, salissures, grain."""
    a = np.asarray(d.c, np.float32)
    vitre = np.asarray(d.r, np.float32) < 40
    H, W = vitre.shape
    yy, xx = np.mgrid[0:H, 0:W]
    reflet = (np.sin((xx + yy * 0.7) / 90.0 + rng.uniform(0, 6)) * 0.5 + 0.5) ** 3 * 46 + (1 - yy / H) * 26
    a[vitre] += reflet[vitre][:, None] * np.array([0.8, 0.92, 1.0], np.float32)
    grain = rng.normal(0, 3.2, (H, W, 1)).astype(np.float32)
    bas = np.clip(1 - (H - yy) / (0.5 * PXM), 0, 1)[..., None] * 0.16          # salissures en pied de façade
    a = a * (1 - bas * (~vitre)[..., None]) + grain
    d.c = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGB')
    d.dc = ImageDraw.Draw(d.c)


def composer(dossier, enseignes, rng=None):
    """Peint toutes les devantures. Renvoie (liste des fichiers couleur/orm, liste des emplacements (atlas, u0, u1, v0, v1))."""
    rng = rng or np.random.default_rng(11)
    os.makedirs(dossier, exist_ok=True)
    murs = {'crepi': _base('plastered_wall_02', 256, (232, 227, 217))[0], 'galets': _base('plaster_stone_wall_02', 300, (196, 180, 156), 1.1)[0],
            'ancien': _base('plaster_stone_wall_01', 300, (214, 198, 170))[0], 'bardage': _base('corrugated_iron', 256, (205, 208, 208), 0.8)[0]}
    murs = {k: Image.new('RGB', (CW, CH)).copy() if False else _etendre(v) for k, v in murs.items()}
    par_atlas = COLS * LIGS
    nb = max(1, (len(enseignes) + par_atlas - 1) // par_atlas)
    T = 4096
    atlas = [(Image.new('RGB', (T, T), (128, 128, 128)), Image.new('L', (T, T), 235)) for _ in range(nb)]
    places = []
    for i, e in enumerate(enseignes):
        d = peindre(e, murs[e.get('famille', 'crepi')], rng)
        k, col, lig = i // par_atlas, (i % par_atlas) % COLS, (i % par_atlas) // COLS
        atlas[k][0].paste(d.c, (col * CW, lig * CH))
        atlas[k][1].paste(d.r, (col * CW, lig * CH))
        m = 1.0
        places.append((k, (col * CW + m) / T, (col * CW + d.w * PXM - m) / T, 1 - ((lig + 1) * CH - m) / T, 1 - (lig * CH + m) / T))
    fichiers = []
    for k, (c, r) in enumerate(atlas):
        fc, fo = os.path.join(dossier, f'devantures_{k}.jpg'), os.path.join(dossier, f'devantures_{k}_orm.jpg')
        c.save(fc, quality=90)
        Image.merge('RGB', (Image.new('L', (T, T), 255), r, Image.new('L', (T, T), 0))).resize((2048, 2048), Image.LANCZOS).save(fo, quality=88)
        fichiers.append((fc, fo))
    return fichiers, places


def _etendre(img):
    """Mur de base (512 px) répété sur la largeur d'une devanture."""
    res = Image.new('RGB', (CW, CH))
    t = img.resize((384, 384), Image.LANCZOS)
    for x in range(0, CW, 384):
        res.paste(t, (x, 0))
    return res


if __name__ == '__main__':                      # aperçu
    import json, sys
    ICI = os.path.dirname(os.path.abspath(__file__))
    com = json.load(open(os.path.join(ICI, '..', 'data', 'commerces.json')))
    ens = [dict(nom=c['nom'], type=c['type'], largeur=6.0, teinte=(0.88, 0.8, 0.68)) for c in com[:50]]
    f, p = composer(os.path.join(ICI, '..', '.cache', 'tex'), ens)
    Image.open(f[0][0]).crop((0, 0, 3840, 1920)).resize((1920, 960)).save(sys.argv[1], quality=85)
