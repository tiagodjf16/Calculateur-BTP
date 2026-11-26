"""Atelier commun pour modéliser les véhicules dans Blender (module Python bpy).

Principe :
- la carrosserie est une « coque » lissée (surface de subdivision) construite à partir de sections ;
- la livrée (peinture, vitres, chevrons, bandes, lettrage, joints de portes) est peinte dans un
  atlas de textures par projection (côtés, avant, arrière, dessus) ;
- les pièces rapportées (pare-chocs, feux, rétroviseurs, roues…) sont de la géométrie.
"""
import math, os
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ICI = os.path.dirname(os.path.abspath(__file__))
POLICE = os.path.join(ICI, 'polices', 'RobotoCondensed-Bold.woff')
POLICE_PLAQUE = os.path.join(ICI, 'polices', 'BarlowCondensed-SemiBold.woff')


def lin(r, g, b):
    """Couleur sRGB 0-255 -> linéaire 0-1 (pour les matériaux Blender)."""
    f = lambda c: ((c / 255 + 0.055) / 1.055) ** 2.4 if c / 255 > 0.04045 else c / 255 / 12.92
    return (f(r), f(g), f(b))


def nouvelle_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def lier(o, parent=None):
    bpy.context.scene.collection.objects.link(o)
    if parent is not None:
        o.parent = parent
    return o


def vide(nom, position, parent=None):
    o = bpy.data.objects.new(nom, None)
    o.location = position
    return lier(o, parent)


# ------------------------------------------------------------------ matériaux
def materiau(nom, couleur, rug=0.5, metal=0.0, emission=None, force=0.0, alpha=1.0, vernis=0.0, double=False):
    m = bpy.data.materials.new(nom)
    m.use_nodes = True
    m.use_backface_culling = not double
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*couleur, 1)
    b.inputs['Roughness'].default_value = rug
    b.inputs['Metallic'].default_value = metal
    if vernis:
        b.inputs['Coat Weight'].default_value = vernis
        b.inputs['Coat Roughness'].default_value = 0.05
    if emission is not None:
        b.inputs['Emission Color'].default_value = (*emission, 1)
        b.inputs['Emission Strength'].default_value = force
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            m.blend_method = 'BLEND'
    return m


def materiau_texture(nom, f_couleur, f_orm=None, f_normale=None, vernis=0.0, double=False):
    m = bpy.data.materials.new(nom)
    m.use_nodes = True
    m.use_backface_culling = not double
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(f_couleur)
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if f_orm:
        o = nt.nodes.new('ShaderNodeTexImage')
        o.image = bpy.data.images.load(f_orm)
        o.image.colorspace_settings.name = 'Non-Color'
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(o.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
    if f_normale:
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = bpy.data.images.load(f_normale)
        n.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(n.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if vernis:
        b.inputs['Coat Weight'].default_value = vernis
        b.inputs['Coat Roughness'].default_value = 0.05
    return m


# ------------------------------------------------------------------ géométrie de base
def objet_bm(nom, bm, mat, angle=35.0, parent=None, lisse=True):
    """Crée un objet depuis un bmesh ; arêtes vives au-delà de `angle` degrés."""
    bm.normal_update()
    if lisse:
        lim = math.radians(angle)
        for f in bm.faces:
            f.smooth = True
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > lim:
                e.smooth = False
    me = bpy.data.meshes.new(nom)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(nom, me)
    for m in (mat if isinstance(mat, (list, tuple)) else [mat]):
        me.materials.append(m)
    return lier(o, parent)


def boite(nom, x0, x1, y0, y1, z0, z1, mat, rayon=0.0, seg=3, parent=None, rot=None):
    """Boîte aux arêtes arrondies. `rot` = (rx, ry, rz) en radians autour de son centre."""
    c = Vector(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Diagonal((abs(x1 - x0), abs(y1 - y0), abs(z1 - z0), 1)))
    if rayon > 0:
        r = min(rayon, 0.49 * min(abs(x1 - x0), abs(y1 - y0), abs(z1 - z0)))
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=r, segments=seg, profile=0.5, affect='EDGES')
    for f in bm.faces:
        f.smooth = rayon > 0
    me = bpy.data.meshes.new(nom)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(nom, me)
    me.materials.append(mat)
    o.location = c
    if rot:
        o.rotation_euler = rot
    if rayon > 0:
        mod = o.modifiers.new('normales', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True
        mod.weight = 80
    return lier(o, parent)


def cylindre(nom, centre, rayon, longueur, mat, axe='X', seg=24, rayon2=None, parent=None, angle=35.0):
    bm = bmesh.new()
    rot = {'X': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'Y': Matrix.Rotation(math.pi / 2, 4, 'X'),
           'Z': Matrix.Identity(4)}[axe]
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=rayon,
                          radius2=rayon if rayon2 is None else rayon2, depth=longueur, matrix=rot)
    o = objet_bm(nom, bm, mat, angle=angle, parent=parent)
    o.location = centre
    return o


def ellipsoide(nom, centre, rayons, mat, parent=None, u=14, v=8):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0, matrix=Matrix.Diagonal((*rayons, 1)))
    o = objet_bm(nom, bm, mat, angle=80, parent=parent)
    o.location = centre
    return o


def tour(nom, profil, mat, pas=40, angle=38.0, parent=None):
    """Pièce de révolution autour de l'axe X. profil = [(x, rayon), ...]."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, 0.0, max(r, 0.0015))) for x, r in profil]
    es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(1, 0, 0), angle=2 * math.pi, steps=pas, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return objet_bm(nom, bm, mat, angle=angle, parent=parent)


def appliquer_modificateurs(o):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    ancien = o.data
    o.modifiers.clear()
    o.data = me
    bpy.data.meshes.remove(ancien)
    return o


def balayage(nom, chemin, profil, mat, niveaux=1, parent=None, centre=(0.0, 0.0)):
    """Extrude un profil fermé [(décalage vers l'extérieur, z)] le long d'un chemin en plan [(x, y)]."""
    bm = bmesh.new()
    n = len(chemin)
    anneaux = []
    for i, (x, y) in enumerate(chemin):
        a = Vector(chemin[max(i - 1, 0)])
        b = Vector(chemin[min(i + 1, n - 1)])
        t = (b - a).normalized()
        nrm = Vector((t.y, -t.x))
        if nrm.dot(Vector((x - centre[0], y - centre[1]))) < 0:
            nrm = -nrm
        anneaux.append([bm.verts.new((x + nrm.x * d, y + nrm.y * d, z)) for d, z in profil])
    m = len(profil)
    for r0, r1 in zip(anneaux, anneaux[1:]):
        for j in range(m):
            bm.faces.new((r0[j], r0[(j + 1) % m], r1[(j + 1) % m], r1[j]))
    bm.faces.new(anneaux[0])
    bm.faces.new(anneaux[-1])
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    for f in bm.faces:
        f.smooth = True
    me = bpy.data.meshes.new(nom)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(nom, me)
    me.materials.append(mat)
    lier(o, parent)
    if niveaux:
        mod = o.modifiers.new('subdivision', 'SUBSURF')
        mod.levels = mod.render_levels = niveaux
        appliquer_modificateurs(o)
    return o


def arc(cx, cy, r, a0, a1, n=6):
    """Points d'un arc de cercle en plan (angles en degrés)."""
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


# ------------------------------------------------------------------ coque lissée
def section(st):
    """Demi-section (x >= 0) du bas de caisse jusqu'au milieu du toit : 9 points (x, z)."""
    hw, zt, zl = st['hw'], st['zt'], st['zl']
    k = st.get('k', 0.06)            # rentrée des flancs vers le haut
    rv = st.get('rv', 0.16)          # arrondi de toit (vertical)
    rh = st.get('rh', 0.20)          # arrondi de toit (horizontal)
    bombe = st.get('bombe', 0.015)   # bombé du toit
    z1, z2 = st.get('z1', 0.80), st.get('z2', 1.20)
    rentre = st.get('rentre', 0.03)
    H = zt - zl
    rv = min(rv, 0.3 * H)
    zc = zt - rv
    a1 = min(z1, zl + 0.35 * (zc - zl))
    a2 = min(z2, a1 + 0.5 * (zc - a1))
    a3 = a2 + 0.5 * (zc - a2)
    a4 = a2 + 0.85 * (zc - a2)
    kk = k * max(0.0, min(1.0, (zc - a2) / 1.1))
    rh = min(rh, 0.45 * hw)
    return [(hw - rentre, zl), (hw, a1), (hw, a2), (hw - 0.35 * kk, a3), (hw - 0.8 * kk, a4),
            (hw - kk - 0.1 * rh, zc), (hw - kk - rh, zt - 0.1 * rv),
            (0.5 * (hw - kk - rh), zt + 0.75 * bombe), (0.0, zt + bombe)]


def stations(cles, zl, y_supp=(), pas=0.3):
    """Interpole les sections entre des sections clés ; zl(y) donne le bas de caisse."""
    cles = sorted(cles, key=lambda c: c['y'])
    ys = sorted(set([c['y'] for c in cles] + [y for y in y_supp if cles[0]['y'] < y < cles[-1]['y']]))
    complet = []
    for a, b in zip(ys, ys[1:]):
        complet.append(a)
        n = int(math.ceil((b - a) / pas))
        complet += [a + (b - a) * i / n for i in range(1, n)]
    complet.append(ys[-1])
    filtre = [complet[0]]
    for y in complet[1:]:
        if y - filtre[-1] > 0.012:
            filtre.append(y)
    res = []
    for y in filtre:
        i = max(j for j, c in enumerate(cles) if c['y'] <= y + 1e-9)
        a = cles[i]
        b = cles[min(i + 1, len(cles) - 1)]
        t = 0.0 if b is a else (y - a['y']) / (b['y'] - a['y'])
        st = {}
        for cle in set(a) | set(b):
            va, vb = a.get(cle, b.get(cle)), b.get(cle, a.get(cle))
            st[cle] = va + (vb - va) * t
        st['y'] = y
        st['zl'] = zl(y)
        res.append(st)
    return res


def coque(nom, sts, mat, niveaux=2, levre=0.035, parent=None, cap_av=True, cap_ar=True):
    """Construit la carrosserie lissée à partir des sections. Renvoie l'objet (maillage final)."""
    bm = bmesh.new()
    anneaux = []
    for st in sts:
        demi = section(st)
        anneaux.append([bm.verts.new((x, st['y'], z)) for x, z in demi]
                       + [bm.verts.new((-x, st['y'], z)) for x, z in reversed(demi[:-1])])
    n = len(anneaux[0])
    for a, b in zip(anneaux, anneaux[1:]):
        for i in range(n - 1):
            bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))

    def bouchon(r):
        m = n // 2
        for i in range(m - 1):
            bm.faces.new((r[i], r[i + 1], r[n - 2 - i], r[n - 1 - i]))
        bm.faces.new((r[m - 1], r[m], r[m + 1]))
    if cap_av:
        bouchon(anneaux[0])
    if cap_ar:
        bouchon(anneaux[-1])
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    me = bpy.data.meshes.new(nom)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(nom, me)
    me.materials.append(mat)
    lier(o, parent)
    mod = o.modifiers.new('subdivision', 'SUBSURF')
    mod.levels = mod.render_levels = niveaux
    appliquer_modificateurs(o)

    # lèvre : retour de tôle vers l'intérieur sur les bords libres (bas de caisse, passages de roue)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    hw_max = max(abs(v.co.x) for v in bm.verts)
    y_mil = 0.5 * (min(v.co.y for v in bm.verts) + max(v.co.y for v in bm.verts))
    bord = [e for e in bm.edges if e.is_boundary]
    for e in bord:
        e.smooth = False
    marque = bm.faces.layers.int.new('levre')
    if levre and bord:
        r = bmesh.ops.extrude_edge_only(bm, edges=bord)
        for f in (g for g in r['geom'] if isinstance(g, bmesh.types.BMFace)):
            f[marque] = 1
        for v in (g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)):
            if abs(v.co.x) > 0.6 * hw_max:
                v.co.x -= math.copysign(levre, v.co.x)
            else:
                v.co.y -= math.copysign(levre, v.co.y - y_mil)
    for f in bm.faces:
        f.smooth = True
    bm.normal_update()
    bm.to_mesh(o.data)
    bm.free()
    return o


# ------------------------------------------------------------------ atlas de textures
class Region:
    """Zone de l'atlas recevant une projection plane de la carrosserie."""

    def __init__(self, nom, genre, px, py, larg, haut, axe_u, axe_v, u0, v0, ech):
        self.nom, self.genre = nom, genre            # genre : 'cote', 'bout' ou 'dessus'
        self.px, self.py, self.larg, self.haut = px, py, larg, haut
        self.au, self.av, self.u0, self.v0, self.ech = Vector(axe_u), Vector(axe_v), u0, v0, ech

    def pix(self, p):
        p = Vector(p)
        return ((p.dot(self.au) - self.u0) * self.ech, self.haut - (p.dot(self.av) - self.v0) * self.ech)


class Toile:
    """Toile de peinture d'une région (sur-échantillonnée, puis réduite dans l'atlas)."""

    def __init__(self, reg, fond, rug=0.28, ss=2):
        self.reg, self.ss = reg, ss
        t = (reg.larg * ss, reg.haut * ss)
        self.c = Image.new('RGB', t, fond)
        self.r = Image.new('L', t, int(rug * 255))
        self.m = Image.new('L', t, 0)
        self.v = Image.new('L', t, 255)      # vernis (masque)
        self.h = Image.new('L', t, 128)      # relief
        self.d = {k: ImageDraw.Draw(getattr(self, k)) for k in 'crmvh'}

    def p(self, a, b):
        g = self.reg.genre
        q = (0, a, b) if g == 'cote' else (a, 0, b) if g == 'bout' else (a, b, 0)
        x, y = self.reg.pix(q)
        return (x * self.ss, y * self.ss)

    def _vals(self, coul=None, rug=None, metal=None, vernis=None, haut=None):
        return [('c', coul), ('r', None if rug is None else int(rug * 255)),
                ('m', None if metal is None else int(metal * 255)),
                ('v', None if vernis is None else int(vernis * 255)), ('h', haut)]

    def poly(self, pts, **k):
        q = [self.p(a, b) for a, b in pts]
        for cle, val in self._vals(**k):
            if val is not None:
                self.d[cle].polygon(q, fill=val)

    def rect(self, a0, b0, a1, b1, rayon=0.0, **k):
        (x0, y0), (x1, y1) = self.p(a0, b0), self.p(a1, b1)
        bx = [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)]
        r = rayon * self.reg.ech * self.ss
        for cle, val in self._vals(**k):
            if val is not None:
                self.d[cle].rounded_rectangle(bx, r, fill=val) if r > 0 else self.d[cle].rectangle(bx, fill=val)

    def ligne(self, pts, larg, **k):
        q = [self.p(a, b) for a, b in pts]
        w = max(1, int(round(larg * self.reg.ech * self.ss)))
        for cle, val in self._vals(**k):
            if val is not None:
                self.d[cle].line(q, fill=val, width=w, joint='curve')

    def cercle(self, a, b, r, **k):
        x, y = self.p(a, b)
        rr = r * self.reg.ech * self.ss
        for cle, val in self._vals(**k):
            if val is not None:
                self.d[cle].ellipse([x - rr, y - rr, x + rr, y + rr], fill=val)

    def joint(self, pts, larg=0.005):
        """Joint de porte : trait sombre + creux."""
        self.ligne(pts, larg, coul=(10, 10, 11), rug=0.7, vernis=0.0, haut=20)

    def vitre(self, a0, b0, a1, b1, rayon=0.06, bord=0.022, coul=(9, 12, 15)):
        """Vitre affleurante avec son joint noir."""
        lo_a, hi_a, lo_b, hi_b = min(a0, a1), max(a0, a1), min(b0, b1), max(b0, b1)
        self.rect(lo_a - bord, lo_b - bord, hi_a + bord, hi_b + bord, rayon + bord, coul=(14, 14, 15), rug=0.55, vernis=0.0, haut=112)
        self.rect(lo_a, lo_b, hi_a, hi_b, rayon, coul=coul, rug=0.03, vernis=1.0, haut=120)

    def texte(self, a, b, s, h, coul, police=POLICE, etroit=1.0, rot=0.0, rug=0.4, ancre='m', espace=0):
        """Texte dont les capitales font `h` mètres de haut ; ancre 'g', 'm' ou 'd'."""
        cible = h * self.reg.ech * self.ss
        f0 = ImageFont.truetype(police, 200)
        l, t, r, bb = f0.getbbox('H')
        f = ImageFont.truetype(police, max(4, int(round(200 * cible / (bb - t)))))
        l, t, r, bb = f.getbbox(s)
        extra = espace * (len(s) - 1)
        m = Image.new('L', (r - l + 8 + extra, bb - t + 8), 0)
        dm = ImageDraw.Draw(m)
        if espace:
            x = 4 - l
            for ch in s:
                dm.text((x, 4 - t), ch, fill=255, font=f)
                x += f.getlength(ch) + espace
        else:
            dm.text((4 - l, 4 - t), s, fill=255, font=f)
        if etroit != 1.0:
            m = m.resize((max(1, int(m.width * etroit)), m.height), Image.LANCZOS)
        if rot:
            m = m.rotate(rot, expand=True, resample=Image.BICUBIC)
        x, y = self.p(a, b)
        ox = {'g': 0, 'm': m.width / 2, 'd': m.width}[ancre] if not rot else m.width / 2
        bx = (int(x - ox), int(y - m.height / 2))
        self.c.paste(coul, bx, m)
        self.r.paste(int(rug * 255), bx, m)
        return m.width / (self.reg.ech * self.ss)

    def chevrons(self, a0, b0, a1, b1, c1, c2, periode=0.28, centre=0.0, rug=0.42, sens=1):
        """Chevrons à 45° montant vers `centre` (sens=1) ou descendant (sens=-1)."""
        (x0, y0), (x1, y1) = self.p(a0, b0), self.p(a1, b1)
        X0, X1, Y0, Y1 = int(min(x0, x1)), int(max(x0, x1)), int(min(y0, y1)), int(max(y0, y1))
        xs = np.arange(X0, X1)
        ys = np.arange(Y0, Y1)
        a = a0 + (xs + 0.5 - x0) / (x1 - x0) * (a1 - a0)
        b = b0 + (ys + 0.5 - y0) / (y1 - y0) * (b1 - b0)
        A, B = np.meshgrid(a, b)
        val = np.floor((B + sens * np.abs(A - centre)) / (periode / 2)).astype(int) % 2
        img = np.where(val[..., None] == 0, np.array(c1, np.uint8), np.array(c2, np.uint8)).astype(np.uint8)
        self.c.paste(Image.fromarray(img, 'RGB'), (X0, Y0))
        self.d['r'].rectangle([X0, Y0, X1, Y1], fill=int(rug * 255))


class Atlas:
    def __init__(self, taille=4096, fond=(128, 128, 128)):
        self.taille = taille
        self.c = Image.new('RGB', (taille, taille), fond)
        self.r = Image.new('L', (taille, taille), 128)
        self.m = Image.new('L', (taille, taille), 0)
        self.v = Image.new('L', (taille, taille), 255)
        self.h = Image.new('L', (taille, taille), 128)
        self.regions = {}

    def region(self, nom, genre, px, py, larg, haut, axe_u, axe_v, u0, v0, ech):
        self.regions[nom] = Region(nom, genre, px, py, larg, haut, axe_u, axe_v, u0, v0, ech)
        return self.regions[nom]

    def coller(self, toile):
        reg = toile.reg
        for k in 'crmvh':
            img = getattr(toile, k).resize((reg.larg, reg.haut), Image.LANCZOS)
            getattr(self, k).paste(img, (reg.px, reg.py))

    def uv(self, reg, p):
        x, y = reg.pix(p)
        return ((reg.px + x) / self.taille, 1.0 - (reg.py + y) / self.taille)

    def sauver(self, prefixe, force=5.0, taille_orm=2048):
        """Écrit couleur, ORM (R = vernis, V = rugosité, B = métal) et normales. Renvoie les 3 chemins."""
        f_c, f_o, f_n = prefixe + '_couleur.png', prefixe + '_orm.png', prefixe + '_normale.png'
        self.c.save(f_c, optimize=True)
        t = (taille_orm, taille_orm)
        Image.merge('RGB', (self.v.resize(t, Image.LANCZOS), self.r.resize(t, Image.LANCZOS),
                            self.m.resize(t, Image.LANCZOS))).save(f_o, optimize=True)
        h = np.asarray(self.h.filter(ImageFilter.GaussianBlur(1.2)).resize(t, Image.LANCZOS), np.float32) / 255.0
        dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * force
        dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * force
        nz = 1.0 / np.sqrt(dx * dx + dy * dy + 1.0)
        n = np.stack([-dx * nz, dy * nz, nz], -1)
        Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8), 'RGB').save(f_n, optimize=True)
        return f_c, f_o, f_n


def projeter_uv(o, atlas, seuil_dessus=0.72):
    """UV par projection : chaque face va dans la région qui lui fait face."""
    R = atlas.regions
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    marque = bm.faces.layers.int.get('levre')
    M = o.matrix_world
    hw = max(abs((M @ v.co).x) for v in bm.verts)
    for f in bm.faces:
        nrm = (M.to_3x3() @ f.normal).normalized()
        c = M @ f.calc_center_median()
        if marque is not None and f[marque]:          # retour de tôle : même peinture que le panneau voisin
            if abs(c.x) > 0.6 * hw:
                reg = R['gauche'] if c.x > 0 else R['droite']
            else:
                reg = R['avant'] if c.y < 0 else R['arriere']
        elif nrm.z > seuil_dessus:
            reg = R['dessus']
        elif abs(nrm.x) >= abs(nrm.y) or nrm.z < -seuil_dessus:
            reg = R['gauche'] if c.x > 0 else R['droite']
        else:
            reg = R['avant'] if nrm.y < 0 else R['arriere']
        for l in f.loops:
            l[uv].uv = atlas.uv(reg, M @ l.vert.co)
    bm.to_mesh(o.data)
    bm.free()


def plaque_uv(o, atlas, reg, normale, au, av):
    """UV d'un petit panneau : la face tournée vers `normale` reçoit la région, le reste un pixel du bord."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    nrm, au, av = Vector(normale), Vector(au), Vector(av)
    T = atlas.taille
    for f in bm.faces:
        face = f.normal.dot(nrm) > 0.9
        vs = [l.vert.co for l in f.loops]
        us = [v.dot(au) for v in vs]
        ws = [v.dot(av) for v in vs]
        for l, u, w in zip(f.loops, us, ws):
            if face:
                s = (u - min(us)) / max(1e-9, max(us) - min(us))
                t = (w - min(ws)) / max(1e-9, max(ws) - min(ws))
                l[uv].uv = ((reg.px + 2 + s * (reg.larg - 4)) / T, 1 - (reg.py + reg.haut - 2 - t * (reg.haut - 4)) / T)
            else:
                l[uv].uv = ((reg.px + 3) / T, 1 - (reg.py + 3) / T)
    bm.to_mesh(o.data)
    bm.free()


def peindre_plaque(atlas, reg, numero='GD-426-SP', dept='26'):
    """Plaque d'immatriculation française (numéro fictif) dans la région `reg` de l'atlas."""
    ss = 2
    W, H = reg.larg * ss, reg.haut * ss
    img = Image.new('RGB', (W, H), (246, 246, 240))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([3, 3, W - 4, H - 4], 16, outline=(18, 18, 18), width=6)
    bw = int(W * 0.088)
    bleu = (0, 56, 150)
    d.rounded_rectangle([9, 9, 9 + bw, H - 10], 10, fill=bleu)
    d.rounded_rectangle([W - 10 - bw, 9, W - 10, H - 10], 10, fill=bleu)
    f = ImageFont.truetype(POLICE_PLAQUE, int(H * 0.98))
    l, t, r, b = f.getbbox(numero)
    d.text(((W - (r - l)) / 2 - l, (H - (b - t)) / 2 - t), numero, fill=(12, 12, 12), font=f)
    fp = ImageFont.truetype(POLICE_PLAQUE, int(H * 0.36))
    for txt, cx in (('F', 9 + bw / 2), (dept, W - 10 - bw / 2)):
        l, t, r, b = fp.getbbox(txt)
        d.text((cx - (r - l) / 2 - l, H * 0.80 - (b - t) - t), txt, fill=(245, 245, 245), font=fp)
    for k in range(12):   # étoiles européennes
        a = 2 * math.pi * k / 12
        x, y = 9 + bw / 2 + math.cos(a) * bw * 0.27, H * 0.30 + math.sin(a) * bw * 0.27
        d.ellipse([x - 2.5, y - 2.5, x + 2.5, y + 2.5], fill=(250, 205, 30))
    bx = (reg.px, reg.py)
    atlas.c.paste(img.resize((reg.larg, reg.haut), Image.LANCZOS), bx)
    for k, val in (('r', 90), ('m', 0), ('v', 255), ('h', 128)):
        getattr(atlas, k).paste(val, (reg.px, reg.py, reg.px + reg.larg, reg.py + reg.haut))


def passage_de_roue(nom, x_ext, y, z, rayon, profondeur, mat, cote=1, z_coupe=0.28, parent=None):
    """Garniture sombre de passage de roue : demi-tambour ouvert vers l'extérieur."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=28, radius1=rayon, radius2=rayon, depth=profondeur,
                          matrix=Matrix.Rotation(math.pi / 2, 4, 'Y'))
    ext = max((f for f in bm.faces if len(f.verts) > 4), key=lambda f: f.calc_center_median().x * cote)
    bmesh.ops.delete(bm, geom=[ext], context='FACES')
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=(0, 0, z_coupe - z),
                           plane_no=(0, 0, 1), clear_inner=True)
    bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    o = objet_bm(nom, bm, mat, angle=60, parent=parent)
    o.location = (x_ext - cote * profondeur / 2, y, z)
    return o


# ------------------------------------------------------------------ roues
def roue(nom, position, rayon, largeur, r_jante, mats, cote=1, style='tole', double=False, ecrous=5):
    """Roue complète (pneu sculpté, jante, écrous). cote = +1 à gauche (x > 0), -1 à droite."""
    pneu_m, jante_m, noir_m = mats
    racine = vide(nom, position)
    pivot = vide(nom + '_pivot', (0, 0, 0), racine)
    if cote < 0:
        pivot.rotation_euler = (0, 0, math.pi)

    def une_roue(dx, creuse):
        w = largeur / 2
        flanc = rayon - r_jante
        profil = [(-w * 0.80, r_jante - 0.012), (-w * 0.86, r_jante), (-w * 1.02, r_jante + 0.35 * flanc),
                  (-w * 1.03, r_jante + 0.6 * flanc), (-w * 0.93, rayon - 0.022), (-w * 0.82, rayon - 0.004)]
        nb = 4 if largeur < 0.26 else 5
        pas_s = 2 * w * 0.82 / nb
        for i in range(nb):       # sculptures : rainures circulaires
            a = -w * 0.82 + i * pas_s
            profil += [(a + 0.004, rayon), (a + pas_s - 0.014, rayon)]
            if i < nb - 1:
                profil += [(a + pas_s - 0.012, rayon - 0.011), (a + pas_s - 0.002, rayon - 0.011)]
        profil += [(w * 0.82, rayon - 0.004), (w * 0.93, rayon - 0.022), (w * 1.03, r_jante + 0.6 * flanc),
                   (w * 1.02, r_jante + 0.35 * flanc), (w * 0.86, r_jante), (w * 0.80, r_jante - 0.012)]
        p = tour(nom + '_pneu', profil, pneu_m, pas=44, angle=30, parent=pivot)
        p.location.x = dx
        rj = r_jante
        if style == 'tole':       # jante tôle d'utilitaire
            prof_j = [(-w * 0.78, rj - 0.015), (-w * 0.80, rj + 0.012), (-w * 0.74, rj + 0.012), (-w * 0.70, rj - 0.02),
                      (w * 0.55, rj - 0.02), (w * 0.74, rj - 0.004), (w * 0.82, rj + 0.012), (w * 0.86, rj + 0.010),
                      (w * 0.80, rj - 0.012), (w * 0.62, rj - 0.03), (w * 0.44, rj * 0.80), (w * 0.52, rj * 0.62),
                      (w * 0.66, rj * 0.44), (w * 0.66, rj * 0.30), (w * 0.80, rj * 0.27), (w * 0.84, rj * 0.12), (w * 0.84, 0.0)]
        elif not creuse:          # roue avant de camion : moyeu saillant
            prof_j = [(-w * 0.78, rj - 0.015), (-w * 0.80, rj + 0.014), (-w * 0.72, rj - 0.02), (w * 0.6, rj - 0.02),
                      (w * 0.80, rj + 0.014), (w * 0.84, rj + 0.012), (w * 0.78, rj - 0.015), (w * 0.55, rj - 0.035),
                      (w * 0.30, rj * 0.80), (w * 0.40, rj * 0.60), (w * 0.62, rj * 0.50), (w * 0.95, rj * 0.36),
                      (w * 1.02, rj * 0.30), (w * 1.02, 0.0)]
        else:                     # roue arrière jumelée : voile en creux
            prof_j = [(-w * 0.78, rj - 0.015), (-w * 0.80, rj + 0.014), (-w * 0.72, rj - 0.02), (w * 0.6, rj - 0.02),
                      (w * 0.80, rj + 0.014), (w * 0.84, rj + 0.012), (w * 0.78, rj - 0.015), (w * 0.60, rj - 0.035),
                      (-w * 0.20, rj * 0.70), (-w * 0.30, rj * 0.50), (-w * 0.30, rj * 0.36), (-w * 0.05, rj * 0.30),
                      (-w * 0.05, 0.0)]
        j = tour(nom + '_jante', prof_j, jante_m, pas=40, angle=40, parent=pivot)
        j.location.x = dx
        if style == 'tole':
            for k in range(12):   # trous de ventilation
                a = 2 * math.pi * k / 12
                ellipsoide(f'{nom}_trou{k}', (dx + w * 0.50, math.cos(a) * rj * 0.70, math.sin(a) * rj * 0.70),
                           (0.012, 0.016, 0.016), noir_m, parent=pivot, u=10, v=6)
            x_e, r_e, t_e = dx + w * 0.69, rj * 0.37, 0.011
        elif not creuse:
            for k in range(8):
                a = 2 * math.pi * (k + 0.5) / 8
                ellipsoide(f'{nom}_trou{k}', (dx + w * 0.38, math.cos(a) * rj * 0.70, math.sin(a) * rj * 0.70),
                           (0.014, 0.026, 0.026), noir_m, parent=pivot, u=10, v=6)
            x_e, r_e, t_e = dx + w * 0.80, rj * 0.43, 0.016
        else:
            for k in range(8):
                a = 2 * math.pi * (k + 0.5) / 8
                ellipsoide(f'{nom}_trou{k}', (dx - w * 0.26, math.cos(a) * rj * 0.60, math.sin(a) * rj * 0.60),
                           (0.014, 0.026, 0.026), noir_m, parent=pivot, u=10, v=6)
            x_e, r_e, t_e = dx - w * 0.28, rj * 0.43, 0.016
        for k in range(ecrous):
            a = 2 * math.pi * k / ecrous
            cylindre(f'{nom}_ecrou{k}', (x_e, math.cos(a) * r_e, math.sin(a) * r_e), t_e, 0.03, jante_m, 'X', 6, parent=pivot)

    if double:
        une_roue(largeur * 0.56, True)
        une_roue(-largeur * 0.56, True)
    else:
        une_roue(0.0, False)
    return racine


# ------------------------------------------------------------------ roue réaliste (pneu sculpté + jante tôle)
def _lisse(points, par_segment=6):
    """Courbe de Catmull-Rom passant par les points (profil de flanc bien rond)."""
    P = [np.array(p, float) for p in points]
    P = [2 * P[0] - P[1]] + P + [2 * P[-1] - P[-2]]
    res = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(par_segment):
            s = k / par_segment
            res.append(0.5 * (2 * p1 + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s + (-p0 + 3 * p1 - 3 * p2 + p3) * s ** 3))
    res.append(P[-2])
    return res


def profil_pneu(R, largeur, r_j):
    """Profil complet du pneu, du talon intérieur (x < 0) au talon extérieur : x, rayon, v (0..1) + repères."""
    w, Hf = largeur / 2, R - r_j
    xb = 0.76 * w                              # demi-largeur de la bande de roulement
    bombe = 0.006 / xb ** 2
    gw, gd = 0.0095, 0.0075                    # rainures : largeur, profondeur
    centres = [-0.68 * xb, -0.24 * xb, 0.24 * xb, 0.68 * xb]
    haut = lambda x: R - bombe * x * x
    bande = [(-xb, haut(-xb), haut(-xb))]
    for i, g in enumerate(centres):
        prec = bande[-1][0]
        for k in (1, 2):                       # points intermédiaires sur la nervure
            x = prec + (g - gw / 2 - prec) * k / 3
            bande.append((x, haut(x), haut(x)))
        for dx, fond in ((-gw / 2 - 0.0006, 0), (-gw / 2 + 0.0012, 1), (gw / 2 - 0.0012, 1), (gw / 2 + 0.0006, 0)):
            x = g + dx
            bande.append((x, haut(x) - gd * fond, haut(x)))
    prec = bande[-1][0]
    for k in (1, 2):
        x = prec + (xb - prec) * k / 3
        bande.append((x, haut(x), haut(x)))
    bande.append((xb, haut(xb), haut(xb)))
    flanc = _lisse([(xb, R - 0.006), (0.865 * w, R - 0.0165), (0.945 * w, R - 0.036), (0.99 * w, R - 0.36 * Hf), (1.0 * w, R - 0.48 * Hf),
                    (0.965 * w, R - 0.65 * Hf), (0.88 * w, R - 0.81 * Hf), (0.775 * w, R - 0.93 * Hf), (0.725 * w, R - 0.975 * Hf),
                    (0.705 * w, r_j - 0.004)])[1:]
    pts = [(-p[0], p[1], p[1]) for p in reversed(flanc)] + bande + [(p[0], p[1], p[1]) for p in flanc]
    L = [0.0]
    for a, b in zip(pts, pts[1:]):
        L.append(L[-1] + math.hypot(b[0] - a[0], b[2] - a[2]))
    v = [l / L[-1] for l in L]
    xs = [p[0] for p in pts]
    v_de = lambda x: float(np.interp(x, [p[0] for p in bande], v[len(flanc):len(flanc) + len(bande)]))
    info = dict(longueur=L[-1], v_bord_g=v_de(-xb), v_bord_d=v_de(xb), v_rainures=[v_de(g) for g in centres], gw=gw, R=R, xb=xb)
    return xs, [p[1] for p in pts], v, info


def texture_pneu(prefixe, info, W=4096, H=1024, pas=64):
    """Peint le pneu : sculptures, lamelles, épaulements, marquages de flanc. Renvoie (couleur, orm, normales)."""
    rng = np.random.default_rng(7)
    Lm = info['longueur']
    pv = H / Lm                                 # pixels par mètre en travers
    pu = W / (2 * math.pi * info['R'])          # pixels par mètre le long de la circonférence
    h = Image.new('L', (W, H), 128)
    d = ImageDraw.Draw(h)
    yg, yd = info['v_bord_g'] * H, info['v_bord_d'] * H
    rain = [v * H for v in info['v_rainures']]
    gpx = info['gw'] * pv
    P = W / pas
    # --- bande de roulement
    bords = [yg] + [r_ for g in rain for r_ in (g - gpx / 2, g + gpx / 2)] + [yd]
    nervures = [(bords[2 * i], bords[2 * i + 1]) for i in range(5)]
    for k in range(pas):
        x0 = k * P
        dec = P * 0.5 * (k % 2) * 0.0
        # épaules : rainures transversales qui débordent sur l'épaulement
        for (a, b), sens, deb in ((nervures[0], 1, -0.016 * pv), (nervures[4], -1, 0.016 * pv)):
            bord, fin = (a, b - 0.006 * pv) if sens == 1 else (b, a + 0.006 * pv)
            d.line([(x0 + P * 0.30, bord + deb), (x0 + P * 0.42, bord), (x0 + P * 0.62, fin)], fill=22, width=max(3, int(0.0042 * pu)))
            d.line([(x0 + P * 0.88, bord + deb * 0.6), (x0 + P * 0.93, bord + (fin - bord) * 0.55)], fill=58, width=2)
        # nervures intermédiaires : encoches + lamelles en biais
        for (a, b), s in ((nervures[1], 1), (nervures[3], -1)):
            m = (b - a)
            d.line([(x0 + P * 0.15, a), (x0 + P * (0.15 + 0.22 * s), a + m * 0.42)], fill=26, width=max(3, int(0.0035 * pu)))
            d.line([(x0 + P * 0.65, b), (x0 + P * (0.65 - 0.22 * s), b - m * 0.42)], fill=26, width=max(3, int(0.0035 * pu)))
            d.line([(x0 + P * 0.40, a + 2), (x0 + P * (0.40 + 0.30 * s), b - 2)], fill=62, width=2)
            d.line([(x0 + P * 0.90, a + 2), (x0 + P * (0.90 + 0.30 * s), b - 2)], fill=62, width=2)
        # nervure centrale : petites encoches alternées et lamelle en zigzag
        a, b = nervures[2]
        m = b - a
        d.line([(x0 + P * 0.10, a), (x0 + P * 0.22, a + m * 0.30)], fill=30, width=max(3, int(0.003 * pu)))
        d.line([(x0 + P * 0.60, b), (x0 + P * 0.72, b - m * 0.30)], fill=30, width=max(3, int(0.003 * pu)))
        d.line([(x0 + P * 0.35, a + m * 0.2), (x0 + P * 0.45, a + m * 0.5), (x0 + P * 0.35, a + m * 0.8)], fill=66, width=2)
        d.line([(x0 + P * 0.85, a + m * 0.2), (x0 + P * 0.95, a + m * 0.5), (x0 + P * 0.85, a + m * 0.8)], fill=66, width=2)
    for g in rain:                                # rainures circonférentielles
        d.rectangle([0, g - gpx / 2, W, g + gpx / 2], fill=10)
    # --- flancs
    cote_ext = (yd, H, 1)
    cote_int = (yg, 0, -1)
    try:
        police = ImageFont.truetype(POLICE, max(8, int(0.0175 * pv / 0.72)))
        petite = ImageFont.truetype(POLICE, max(6, int(0.009 * pv / 0.72)))
    except Exception:
        police = petite = ImageFont.load_default()
    for bord, fin, s in (cote_ext, cote_int):
        Y = lambda m: bord + s * m * pv       # m = distance en mètres depuis le bord de la bande
        long_flanc = abs(fin - bord) / pv
        d.rectangle([0, min(Y(0.020), Y(0.026)), W, max(Y(0.020), Y(0.026))], fill=112)           # gorge d'épaulement
        for x in range(0, W, 7):                                                               # bande striée
            d.line([(x, Y(0.028)), (x, Y(0.040))], fill=150, width=3)
        for m in (0.043, 0.047):
            d.line([(0, Y(m)), (W, Y(m))], fill=172, width=3)
        d.rectangle([0, min(Y(0.052), Y(0.098)), W, max(Y(0.052), Y(0.098))], fill=136)           # bandeau des marquages
        for m in (long_flanc - 0.040, long_flanc - 0.034, long_flanc - 0.022):
            d.line([(0, Y(m)), (W, Y(m))], fill=170, width=3)
        d.rectangle([0, min(Y(long_flanc - 0.016), Y(long_flanc)), W, max(Y(long_flanc - 0.016), Y(long_flanc))], fill=150)   # protège-jante
        textes = [('225/65 R 16 C   112/110 R', police, 0.03), ('TUBELESS  •  RADIAL', petite, 0.20), ('TRANSPORT  LT', police, 0.33),
                  ('M+S    3PMSF', petite, 0.47), ('225/65 R 16 C   112/110 R', police, 0.53), ('MAX LOAD 1120 KG  •  475 kPa', petite, 0.70),
                  ('TRANSPORT  LT', police, 0.83), ('ROTATION  ►', petite, 0.955)]
        for txt, f, u in textes:
            l, t_, r_, b_ = f.getbbox(txt)
            m = Image.new('L', (r_ - l + 6, b_ - t_ + 6), 0)
            ImageDraw.Draw(m).text((3 - l, 3 - t_), txt, fill=255, font=f)
            m = m.transpose(Image.FLIP_LEFT_RIGHT if s == 1 else Image.FLIP_TOP_BOTTOM)
            h.paste(214, (int(u * W), int(Y(0.075) - m.height / 2)), m)
    # --- couleur, rugosité, normales
    ha = np.asarray(h, np.float32) / 255.0
    flou = np.asarray(h.filter(ImageFilter.GaussianBlur(5)), np.float32) / 255.0
    ombre = np.clip(0.55 + 0.9 * np.minimum(ha, flou), 0.35, 1.0)        # creux plus sombres
    bruit = np.asarray(Image.fromarray(rng.integers(0, 255, (H // 4, W // 4), dtype=np.uint8)).resize((W, H), Image.BICUBIC), np.float32) / 255.0
    rows = np.arange(H)[:, None]
    bande_m = ((rows >= yg) & (rows <= yd)).astype(np.float32)
    base = 21.0 + 6.0 * bande_m                                           # la bande de roulement, plus mate et poussiéreuse
    c = base * ombre * (0.9 + 0.2 * bruit)
    col = np.stack([c * 1.0, c * 0.985, c * 0.97], -1)
    f_c, f_o, f_n = prefixe + '_couleur.png', prefixe + '_orm.png', prefixe + '_normale.png'
    Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), 'RGB').save(f_c)
    rug = np.clip(0.70 + 0.22 * bande_m + 0.06 * (1 - ha) + 0.04 * (bruit - 0.5), 0, 1)
    Image.merge('RGB', (Image.new('L', (W, H), 255), Image.fromarray((rug * 255).astype(np.uint8), 'L'), Image.new('L', (W, H), 0))).save(f_o)
    hb = np.asarray(h.filter(ImageFilter.GaussianBlur(1.1)), np.float32) / 255.0
    force = 9.0
    dx = (np.roll(hb, -1, 1) - np.roll(hb, 1, 1)) * force
    dy = (np.roll(hb, -1, 0) - np.roll(hb, 1, 0)) * force
    nz = 1.0 / np.sqrt(dx * dx + dy * dy + 1.0)
    Image.fromarray(((np.stack([-dx * nz, dy * nz, nz], -1) * 0.5 + 0.5) * 255).astype(np.uint8), 'RGB').save(f_n)
    return f_c, f_o, f_n


def lisser(o, angle=35.0):
    """Faces lisses, arêtes vives au-delà de `angle` degrés."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.normal_update()
    lim = math.radians(angle)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0.0) > lim)
    bm.to_mesh(o.data)
    bm.free()


def pneu_realiste(nom, R, largeur, r_j, mat, parent=None, segments=112):
    xs, rs, vs, info = profil_pneu(R, largeur, r_j)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    n = len(xs)
    anneaux = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        anneaux.append([bm.verts.new((xs[j], rs[j] * math.cos(a), rs[j] * math.sin(a))) for j in range(n)])
    for i in range(segments):
        a, b = anneaux[i], anneaux[(i + 1) % segments]
        u0, u1 = i / segments, (i + 1) / segments
        for j in range(n - 1):
            f = bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
            for l, (uu, vv) in zip(f.loops, ((u0, vs[j]), (u1, vs[j]), (u1, vs[j + 1]), (u0, vs[j + 1]))):
                l[uv].uv = (uu, 1.0 - vv)
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    f0 = bm.faces[len(bm.faces) // 2]
    c = f0.calc_center_median()
    if f0.normal.dot(Vector((0, c.y, c.z))) < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    return objet_bm(nom, bm, mat, angle=42, parent=parent), info


def jante_tole(nom, r_j, mats, parent=None, trous=12, ecrous=5):
    """Jante tôle d'utilitaire : rebord, voile percé de trous de ventilation, écrous, cache-moyeu, tambour."""
    m_jante, m_cache, m_acier, m_fonte, m_noir = mats
    f = r_j / 0.2032
    prof = [(0.070, 0.2030), (0.082, 0.2036), (0.0865, 0.2110), (0.0885, 0.2195), (0.0850, 0.2215), (0.0795, 0.2195),
            (0.0775, 0.2110), (0.0760, 0.1990), (0.0700, 0.1935), (0.0520, 0.1905), (0.0400, 0.1885), (0.0390, 0.1810),
            (0.0450, 0.1730), (0.0550, 0.1610), (0.0650, 0.1490), (0.0715, 0.1320), (0.0720, 0.1150), (0.0665, 0.1030),
            (0.0660, 0.0700), (0.0690, 0.0640), (0.0690, 0.0600)]
    disque = tour(nom + '_jante', [(x * f, r * f) for x, r in prof], m_jante, pas=72, angle=40, parent=parent)
    bm = bmesh.new()
    for k in range(trous):
        a = 2 * math.pi * (k + 0.5) / trous
        bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.0138 * f, radius2=0.0138 * f, depth=0.07 * f,
                              matrix=Matrix.Translation((0.052 * f, math.cos(a) * 0.166 * f, math.sin(a) * 0.166 * f)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    coupe = objet_bm(nom + '_coupe', bm, m_noir, parent=parent)      # même repère que la jante
    ep = disque.modifiers.new('epaisseur', 'SOLIDIFY')
    ep.thickness, ep.offset = 0.0045 * f, -1.0
    bo = disque.modifiers.new('trous', 'BOOLEAN')
    bo.operation, bo.object = 'DIFFERENCE', coupe
    try:
        bo.solver = 'EXACT'
    except Exception:
        pass
    appliquer_modificateurs(disque)
    bpy.data.objects.remove(coupe)
    lisser(disque, 38)
    tour(nom + '_cache', [(0.066 * f, 0.0660 * f), (0.074 * f, 0.0645 * f), (0.083 * f, 0.058 * f), (0.0885 * f, 0.046 * f),
                          (0.0905 * f, 0.036 * f), (0.0880 * f, 0.033 * f), (0.0885 * f, 0.022 * f), (0.0915 * f, 0.018 * f),
                          (0.0920 * f, 0.0)], m_cache, pas=48, angle=30, parent=parent)
    for k in range(ecrous):
        a = 2 * math.pi * k / ecrous + 0.3
        y, z = math.cos(a) * 0.086 * f, math.sin(a) * 0.086 * f
        cylindre(f'{nom}_rondelle{k}', (0.0685 * f, y, z), 0.0165 * f, 0.004 * f, m_acier, 'X', 20, parent=parent)
        e = cylindre(f'{nom}_ecrou{k}', (0.079 * f, y, z), 0.0125 * f, 0.018 * f, m_acier, 'X', 6, rayon2=0.0105 * f, parent=parent)
        e.rotation_euler = (a, 0, 0)
        cylindre(f'{nom}_goujon{k}', (0.090 * f, y, z), 0.0060 * f, 0.006 * f, m_acier, 'X', 10, parent=parent)
    cylindre(nom + '_tambour', (-0.012 * f, 0, 0), 0.172 * f, 0.105 * f, m_fonte, 'X', 40, parent=parent)
    cylindre(nom + '_fond', (-0.075 * f, 0, 0), 0.196 * f, 0.02 * f, m_noir, 'X', 40, parent=parent)
    v = cylindre(nom + '_valve', (0.072 * f, 0, 0.1975 * f), 0.0042 * f, 0.030 * f, m_noir, 'X', 10, parent=parent)
    v.rotation_euler = (0, -0.5, 0)
    return disque


def roue_realiste(nom, position, rayon, largeur, r_jante, dossier_tex, cote=1, cache=None):
    """Roue complète. Les quatre roues partagent les mêmes maillages (passer le même dictionnaire `cache`)."""
    cache = {} if cache is None else cache
    racine = vide(nom, position)
    pivot = vide(nom + '_pivot', (0, 0, 0), racine)
    if cote < 0:
        pivot.rotation_euler = (0, 0, math.pi)
    if 'objets' in cache:
        for src in cache['objets']:
            o = src.copy()
            o.name = nom + src.name[len(cache['nom']):]
            lier(o, pivot)
        return racine
    os.makedirs(dossier_tex, exist_ok=True)
    _, _, _, info = profil_pneu(rayon, largeur, r_jante)
    f_c, f_o, f_n = texture_pneu(os.path.join(dossier_tex, 'pneu'), info)
    m_pneu = materiau_texture('pneu', f_c, f_o, f_n)
    m_jante = materiau('jante_tole', lin(176, 179, 183), rug=0.36, metal=0.9)
    m_cache = materiau('cache_moyeu', lin(38, 39, 41), rug=0.42)
    m_acier = materiau('ecrou', lin(150, 152, 155), rug=0.34, metal=1.0)
    m_fonte = materiau('tambour', lin(46, 42, 40), rug=0.8, metal=0.6)
    m_noir = materiau('caoutchouc', lin(12, 12, 12), rug=0.85)
    pneu_realiste(nom + '_pneu', rayon, largeur, r_jante, m_pneu, parent=pivot)
    jante_tole(nom, r_jante, (m_jante, m_cache, m_acier, m_fonte, m_noir), parent=pivot)
    cache['objets'] = list(pivot.children)
    cache['nom'] = nom
    return racine


# ------------------------------------------------------------------ export et aperçu
def exporter(chemin):
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=chemin, export_format='GLB', export_apply=True, export_yup=True,
                              export_image_format='AUTO', export_texcoords=True, export_normals=True, export_extras=True)
    print('exporté', chemin, os.path.getsize(chemin) // 1024, 'Ko')


def decor_apercu(elevation=38.0, azimut=140.0):
    scene = bpy.context.scene
    w = bpy.data.worlds.new('ciel')
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    ciel = nt.nodes.new('ShaderNodeTexSky')
    try:
        ciel.sky_type = 'MULTIPLE_SCATTERING'
    except Exception:
        pass
    ciel.sun_elevation = math.radians(elevation)
    ciel.sun_rotation = math.radians(azimut)
    fond = nt.nodes['Background']
    nt.links.new(ciel.outputs['Color'], fond.inputs['Color'])
    fond.inputs['Strength'].default_value = 0.075
    try:
        scene.view_settings.view_transform = 'AgX'
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=60)
    sol = objet_bm('sol_apercu', bm, materiau('sol_apercu', (0.07, 0.07, 0.072), rug=0.8), lisse=False)
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 40
    try:
        scene.cycles.use_denoising = True
    except Exception:
        pass
    scene.render.film_transparent = False
    return sol


def rendu(chemin, position, cible=(0, 0, 1.1), focale=45, res=(1280, 720)):
    scene = bpy.context.scene
    cam = bpy.data.objects.get('cam_apercu')
    if cam is None:
        cam = lier(bpy.data.objects.new('cam_apercu', bpy.data.cameras.new('cam_apercu')))
    cam.data.lens = focale
    cam.location = position
    cam.rotation_euler = (Vector(cible) - Vector(position)).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.filepath = chemin
    bpy.ops.render.render(write_still=True)
    print('rendu', chemin)
