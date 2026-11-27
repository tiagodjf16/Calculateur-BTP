"""Arbres en volume pour le centre-ville : platanes (tronc, charpentières, feuillage), jeunes arbres, olivier.

Le bois est généré (tubes effilés, écorce de platane de Poly Haven, CC0). Le feuillage est fait de « touffes » : des
portions du houppier d'un arbre très détaillé (Poly Haven, CC0) photographiées dans Blender sur fond transparent, puis
posées par dizaines sur des plans croisés autour des branches.

Sortie : modeles/arbres_brut.glb, à alléger ensuite :
    node outils/optimiser.mjs modeles/arbres_brut.glb modeles/arbres.glb 1 1024 0 14
Usage : python outils/arbres3d.py [apercu.png]
"""
import os, sys, math
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)
import numpy as np
import bpy
from mathutils import Vector
from PIL import Image
import cc0
import atelier as A

RACINE = os.path.join(ICI, '..')
TRAVAIL = os.path.join(RACINE, '.cache', 'arbres3d')
os.makedirs(TRAVAIL, exist_ok=True)
MODELE = 'tree_small_02'
CASE = 512
VERT = (56, 88, 37)                                      # couleur moyenne visée pour le feuillage (sRGB)
# portions du houppier photographiées : (centre x, y, z dans le modèle, azimut de la prise de vue en degrés)
VUES = [((-0.25, -0.35, 3.85), 40.0), ((0.55, -1.25, 3.25), 130.0), ((0.25, -0.9, 3.95), 250.0), ((-0.2, -1.55, 3.4), 310.0)]


def telecharger(ident, res='1k'):
    info = cc0.fichiers(ident)['gltf'][res]['gltf']
    d = os.path.join(cc0.CACHE, ident)
    os.makedirs(d, exist_ok=True)
    f = os.path.join(d, ident + '.gltf')
    cc0._get(info['url'], f)
    for chemin, v in info.get('include', {}).items():
        dest = os.path.join(d, chemin)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        cc0._get(v['url'], dest)
    return f


def touffes():
    """Photographie quatre portions de feuillage et les range dans un atlas 2 x 2 (avec transparence)."""
    atlas_f = os.path.join(TRAVAIL, 'feuillage.png')
    if os.path.exists(atlas_f):
        return atlas_f
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=telecharger(MODELE))
    scene = bpy.context.scene
    # on ne garde que les feuilles : le bois du modèle devient invisible (le jeu a ses propres branches)
    for m in bpy.data.materials:
        if 'leaves' not in m.name:
            m.use_nodes = True
            m.node_tree.nodes.clear()
            sortie = m.node_tree.nodes.new('ShaderNodeOutputMaterial')
            m.node_tree.links.new(m.node_tree.nodes.new('ShaderNodeBsdfTransparent').outputs[0], sortie.inputs[0])
    w = bpy.data.worlds.new('w')
    scene.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 1.25
    sol = bpy.data.objects.new('soleil', bpy.data.lights.new('soleil', 'SUN'))
    sol.data.energy = 1.2
    sol.rotation_euler = (math.radians(30), 0, math.radians(30))
    scene.collection.objects.link(sol)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 1.0
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = False
    scene.cycles.transparent_max_bounces = 16
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.resolution_x = scene.render.resolution_y = CASE
    try:
        scene.view_settings.view_transform = 'Standard'
    except Exception:
        pass
    rng = np.random.default_rng(7)
    atlas = np.zeros((CASE * 2, CASE * 2, 4), np.float32)
    yy, xx = np.mgrid[0:CASE, 0:CASE]
    for k, (c, az) in enumerate(VUES):
        a = math.radians(az)
        vers = Vector((math.sin(a), -math.cos(a), 0.25)).normalized()
        cam.location = Vector(c) + vers * 5.0
        cam.rotation_euler = (-vers).to_track_quat('-Z', 'Y').to_euler()
        cam.data.clip_start, cam.data.clip_end = 5.0 - 0.3, 5.0 + 0.3        # tranche de feuillage de 60 cm d'épaisseur : on voit le jour entre les feuilles
        f = os.path.join(TRAVAIL, f'touffe{k}.png')
        scene.render.filepath = f
        bpy.ops.render.render(write_still=True)
        img = np.asarray(Image.open(f).convert('RGBA'), np.float32)
        # contour irrégulier : rayon variable selon l'angle, pour une silhouette de branche feuillue et non un carré
        ang = np.arctan2(yy - CASE / 2, xx - CASE / 2)
        ray = np.hypot(yy - CASE / 2, xx - CASE / 2) / (CASE / 2)
        lim = 0.84 + sum(0.06 * np.sin(n * ang + rng.uniform(0, 6.28)) for n in (2, 3, 5, 7))
        masque = np.clip((lim - ray) / 0.16, 0, 1)
        img[..., 3] *= masque
        atlas[(k // 2) * CASE:(k // 2 + 1) * CASE, (k % 2) * CASE:(k % 2 + 1) * CASE] = img
    # couleur des feuilles étalée sous les pixels transparents (pas de liseré sombre aux bords)
    rgb, alpha = atlas[..., :3].copy(), atlas[..., 3]
    plein = alpha > 110
    for _ in range(10):
        acc, nb = np.zeros_like(rgb), np.zeros(alpha.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            acc += np.roll(rgb * plein[..., None], (dy, dx), (0, 1))
            nb += np.roll(plein, (dy, dx), (0, 1))
        gagne = ~plein & (nb > 0)
        rgb[gagne] = acc[gagne] / nb[gagne][:, None]
        plein = plein | gagne
    rgb[~plein] = rgb[alpha > 110].mean(0)
    # vert de platane en été (le modèle d'origine a un feuillage plus clair et plus gris), contraste conservé
    rgb *= np.array(VERT, np.float32) / rgb[alpha > 128].mean(0)
    alpha = np.clip(alpha * 1.5, 0, 255)                # un peu plus couvrant : le feuillage ne s'éclaircit pas trop de loin
    print('feuillage : opacité moyenne', round(float((alpha > 128).mean()), 2), '| couleur moyenne', [int(v) for v in rgb[alpha > 128].mean(0)])
    Image.fromarray(np.dstack([rgb, alpha]).clip(0, 255).astype(np.uint8), 'RGBA').save(atlas_f)
    return atlas_f


# ------------------------------------------------------------------------------------------ maillages
class Maillage:
    def __init__(self):
        self.v, self.f, self.uv, self.n, self.c = [], [], [], [], []

    def tube(self, points, rayons, cotes, v0=0.0, pas_v=1.1):
        """Tube effilé le long d'une polyligne. Renvoie la coordonnée v atteinte (pour enchaîner les branches)."""
        pts = [Vector(p) for p in points]
        tang = [(pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(len(pts))]
        n = tang[0].orthogonal().normalized()
        tours = max(1, round(2 * math.pi * rayons[0] / 1.1))            # répétitions de l'écorce autour du tube
        base, v = len(self.v), v0
        for i, (p, t, r) in enumerate(zip(pts, tang, rayons)):
            if i:
                v += (p - pts[i - 1]).length / pas_v
            n = (n - t * n.dot(t)).normalized()
            b = t.cross(n)
            for k in range(cotes + 1):
                a = 2 * math.pi * k / cotes
                d = n * math.cos(a) + b * math.sin(a)
                self.v.append(tuple(p + d * r))
                self.uv.append((tours * k / cotes, v))
                self.n.append(tuple(d))
        for i in range(len(pts) - 1):
            for k in range(cotes):
                a = base + i * (cotes + 1) + k
                self.f.append((a, a + 1, a + cotes + 2, a + cotes + 1))
        return v

    def carte(self, centre, u, v, taille, case, normales, teinte, miroir=False):
        """Un plan carré portant une touffe de feuillage, visible des deux côtés (deux faces dos à dos, mêmes normales :
        l'éclairage reste celui du volume de l'arbre, quel que soit le côté regardé)."""
        cx, cy = case % 2, case // 2
        coins = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        geo = u.cross(v).normalized()
        for cote in (1, -1):
            b = len(self.v)
            for (su, sv), nrm in zip(coins, normales):
                self.v.append(tuple(centre + u * su * taille / 2 + v * sv * taille / 2 + geo * cote * 0.004))
                uu = (1 - su if miroir else 1 + su) / 2
                self.uv.append(((cx + 0.004 + uu * 0.992) / 2, 1 - (cy + 0.004 + (1 - sv) / 2 * 0.992) / 2))
                self.n.append(tuple(nrm))
                self.c.append((teinte, teinte, teinte, 1.0))
            self.f.append((b, b + 1, b + 2, b + 3) if cote == 1 else (b + 3, b + 2, b + 1, b))

    def objet(self, nom, mat, couleurs=False):
        me = bpy.data.meshes.new(nom)
        me.from_pydata(self.v, [], self.f)
        me.update()
        boucles = np.zeros(len(me.loops), np.int32)
        me.loops.foreach_get('vertex_index', boucles)
        me.uv_layers.new(name='UVMap').data.foreach_set('uv', np.asarray(self.uv, np.float32)[boucles].ravel())
        if couleurs:
            me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER').data.foreach_set('color', np.asarray(self.c, np.float32)[boucles].ravel())
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        me.normals_split_custom_set_from_vertices([Vector(n).normalized() for n in self.n])
        me.materials.append(mat)
        o = bpy.data.objects.new(nom, me)
        bpy.context.scene.collection.objects.link(o)
        return o


def bezier(p0, p1, p2, n):
    return [p0 * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + p2 * t * t for t in np.linspace(0, 1, n)]


ESPECES = {
    # platane d'alignement : tronc court et épais, charpentières montantes puis étalées, houppier large
    'platane': dict(tronc_h=(3.4, 4.3), tronc_r=(0.38, 0.5), charp=(4, 5), ecart=(2.6, 3.6), montee=(4.4, 5.6), charp_r=0.52, second=(2, 3),
                    sec_l=(2.2, 3.0), touffes=120, taille=(3.3, 4.5), remplissage=0.5, marge=1.75, cotes=(10, 7, 5)),
    # jeune arbre tuteuré
    'jeune': dict(tronc_h=(2.1, 2.5), tronc_r=(0.06, 0.08), charp=(3, 4), ecart=(0.8, 1.2), montee=(1.5, 2.0), charp_r=0.6, second=(1, 2),
                  sec_l=(0.7, 1.0), touffes=20, taille=(1.5, 1.9), remplissage=0.3, cotes=(6, 5, 4)),
    # olivier : tronc trapu, houppier rond et bas
    'olivier': dict(tronc_h=(1.0, 1.3), tronc_r=(0.2, 0.26), charp=(3, 4), ecart=(1.2, 1.6), montee=(1.4, 1.8), charp_r=0.5, second=(2, 2),
                    sec_l=(0.9, 1.2), touffes=34, taille=(1.4, 1.8), remplissage=0.35, cotes=(8, 6, 4)),
}


def arbre(nom, espece, graine, mats):
    e, rng = ESPECES[espece], np.random.default_rng(graine)
    u = lambda ab: float(rng.uniform(*ab))
    bois, attaches = Maillage(), []
    # tronc : léger dévers, empattement au pied
    h, r0 = u(e['tronc_h']), u(e['tronc_r'])
    devers = Vector((u((-0.25, 0.25)), u((-0.25, 0.25)), 0)) * (h / 4)
    pts = [Vector((0, 0, -0.25)), Vector((0, 0, 0.12)), devers * 0.25 + Vector((0, 0, h * 0.4)), devers * 0.7 + Vector((0, 0, h * 0.75)), devers + Vector((0, 0, h))]
    v = bois.tube(pts, [r0 * 1.5, r0 * 1.22, r0, r0 * 0.94, r0 * 0.98], e['cotes'][0])
    fourche = pts[-1]
    nb = int(rng.integers(e['charp'][0], e['charp'][1] + 1))
    az0 = u((0, 6.28))
    for i in range(nb):
        az = az0 + i * 2 * math.pi / nb + u((-0.3, 0.3))
        dehors = Vector((math.cos(az), math.sin(az), 0))
        ecart, montee = u(e['ecart']), u(e['montee'])
        p2 = fourche + dehors * ecart + Vector((0, 0, montee))
        p1 = fourche + dehors * ecart * 0.28 + Vector((0, 0, montee * 0.62)) + Vector((u((-0.3, 0.3)), u((-0.3, 0.3)), 0)) * ecart * 0.25
        charp = bezier(fourche - Vector((0, 0, r0 * 0.6)), p1, p2, 7)
        r1 = r0 * e['charp_r']
        bois.tube(charp, list(np.linspace(r1, r1 * 0.3, 7)), e['cotes'][1], v)
        attaches += [(charp[-1], 1.0), (charp[-2], 0.8), (charp[4], 0.5), (charp[3], 0.3)]
        for _ in range(int(rng.integers(e['second'][0], e['second'][1] + 1))):
            t = u((0.4, 0.88))
            k = t * 6
            depart = charp[int(k)].lerp(charp[min(int(k) + 1, 6)], k - int(k))
            a2 = az + u((-1.25, 1.25))
            direction = (Vector((math.cos(a2), math.sin(a2), 0)) * u((0.75, 1.0)) + Vector((0, 0, u((0.15, 0.75))))).normalized()
            long = u(e['sec_l'])
            fin = depart + direction * long
            milieu = depart + direction * long * 0.5 + Vector((0, 0, long * 0.12))
            sec = bezier(depart, milieu, fin, 4)
            rs = r1 * (1 - t * 0.7) * 0.55
            bois.tube(sec, list(np.linspace(rs, rs * 0.3, 4)), e['cotes'][2], v)
            attaches += [(sec[-1], 1.0), (sec[2], 0.7)]
    # houppier : ellipsoïde englobant les extrémités
    P = np.array([p for p, _ in attaches])
    centre = Vector(((P[:, 0].min() + P[:, 0].max()) / 2, (P[:, 1].min() + P[:, 1].max()) / 2, (P[:, 2].min() + P[:, 2].max()) / 2 + 0.2))
    mg = e.get('marge', 1.0)                                              # le feuillage déborde des branches (on ne voit pas de bois nu au bord du houppier)
    rayons = Vector((max((P[:, 0].max() - P[:, 0].min()) / 2, 0.5) + 0.9 * mg * u(e['taille']) / 3, max((P[:, 1].max() - P[:, 1].min()) / 2, 0.5) + 0.9 * mg * u(e['taille']) / 3,
                     max((P[:, 2].max() - P[:, 2].min()) / 2, 0.4) + 1.35 * mg * u(e['taille']) / 3))
    centres = []
    poids = np.array([w for _, w in attaches])
    for _ in range(int(e['touffes'] * (1 - e['remplissage']))):
        p = attaches[int(rng.choice(len(attaches), p=poids / poids.sum()))][0]
        centres.append(p + Vector((u((-0.5, 0.5)), u((-0.5, 0.5)), u((-0.2, 0.55)))) * (rayons.x / 5))
    while len(centres) < e['touffes']:                                   # remplissage du volume, plutôt en périphérie et en haut
        d = Vector((u((-1, 1)), u((-1, 1)), u((-0.85, 1))))
        if 0.45 < d.length < 1.0:
            centres.append(centre + Vector((d.x * rayons.x, d.y * rayons.y, d.z * rayons.z)) * 0.92)
    haut = Vector((0, 0, 1))

    def feuillage(suffixe, pas, grossi):
        m = Maillage()
        for i, c in enumerate(centres):
            if i % pas:
                continue
            rel = Vector(((c.x - centre.x) / rayons.x, (c.y - centre.y) / rayons.y, (c.z - centre.z) / rayons.z))
            teinte = float(np.clip(0.34 + 0.6 * rel.length + 0.16 * rel.z, 0.36, 1.0)) * u((0.88, 1.04))
            t = u(e['taille']) * grossi
            a = u((0, 6.28))
            h1 = Vector((math.cos(a), math.sin(a), 0))
            h2 = Vector((-math.sin(a), math.cos(a), 0))
            plans = [(h1, (haut + h2 * u((-0.3, 0.3))).normalized()),                                   # plan debout
                     (h2, (h1 * math.cos(b := u((-0.5, 0.5))) + haut * math.sin(b)).normalized()),      # plan couché (vu du dessous et du dessus)
                     ((h1 + h2).normalized(), (haut * 0.8 + (h1 - h2) * 0.4).normalized())]            # plan oblique
            for k, (pu, pv) in enumerate(plans[i % 3:i % 3 + 2] if i % 3 < 2 else (plans[2], plans[0])):
                coins = [c + pu * su * t / 2 + pv * sv * t / 2 for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
                # normales « gonflées » : vers l'extérieur du houppier et vers le haut, pour un éclairage de volume
                nrm = [(Vector(((q.x - centre.x) / rayons.x, (q.y - centre.y) / rayons.y, (q.z - centre.z) / rayons.z)) + haut * 0.55).normalized() for q in coins]
                m.carte(c, pu, pv, t, int(rng.integers(0, 4)), nrm, teinte, bool(rng.integers(0, 2)))
        return m.objet(f'{nom}_feuilles{suffixe}', mats['feuillage'], couleurs=True)

    o = [bois.objet(f'{nom}_bois', mats['ecorce']), feuillage('', 1, 1.0), feuillage('_leger', 2, 1.3)]
    print(nom, '| tronc', round(h, 1), 'm | hauteur', round(centre.z + rayons.z, 1), 'm | envergure', round(rayons.x * 2, 1), 'm | bois', len(o[0].data.polygons) * 2, 'tri | feuillage',
          len(o[1].data.polygons) * 2, '/', len(o[2].data.polygons) * 2, 'tri')
    return o


if __name__ == '__main__':
    atlas = touffes()
    A.nouvelle_scene()
    ecorce = os.path.join(TRAVAIL, 'ecorce.jpg')
    Image.open(cc0.texture('bark_platanus', 'Diffuse')).convert('RGB').resize((512, 512), Image.LANCZOS).save(ecorce, quality=90)
    ecorce_n = os.path.join(TRAVAIL, 'ecorce_n.jpg')
    Image.open(cc0.texture('bark_platanus', 'nor_gl')).convert('RGB').resize((512, 512), Image.LANCZOS).save(ecorce_n, quality=90)
    mats = dict(ecorce=A.materiau_texture('ecorce', ecorce, f_normale=ecorce_n))
    # feuillage : couleur et transparence prises dans l'atlas, teinte par sommet (cœur du houppier plus sombre)
    mf = bpy.data.materials.new('feuillage')
    mf.use_nodes = True
    nt = mf.node_tree
    bsdf = nt.nodes['Principled BSDF']
    img = nt.nodes.new('ShaderNodeTexImage')
    img.image = bpy.data.images.load(atlas)
    col = nt.nodes.new('ShaderNodeVertexColor')
    col.layer_name = 'Col'
    mul = nt.nodes.new('ShaderNodeMixRGB')
    mul.blend_type = 'MULTIPLY'
    mul.inputs[0].default_value = 1.0
    nt.links.new(img.outputs['Color'], mul.inputs[1])
    nt.links.new(col.outputs['Color'], mul.inputs[2])
    nt.links.new(mul.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(img.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = 0.78
    mf.use_backface_culling = False
    mats['feuillage'] = mf
    for nom, espece, graine in (('platane_a', 'platane', 11), ('platane_b', 'platane', 23), ('platane_c', 'platane', 37), ('jeune_a', 'jeune', 5), ('olivier_a', 'olivier', 9)):
        arbre(nom, espece, graine, mats)
    if len(sys.argv) > 1:                                  # image de contrôle : les trois platanes côte à côte
        for o in bpy.data.objects:
            if '_leger' in o.name or not o.name.startswith('platane'):
                o.hide_render = True
            else:
                o.location.x = {'a': -11.0, 'b': 0.0, 'c': 11.0}[o.name.split('_')[1]]
        A.decor_apercu(elevation=52.0, azimut=150.0)
        bpy.context.scene.cycles.samples = 48
        A.rendu(sys.argv[1], (4.0, -30.0, 3.2), cible=(0, 0, 6.2), focale=30, res=(1500, 800))
        for o in [o for o in bpy.data.objects if o.type != 'MESH' or not o.name.split('_')[0] in ESPECES]:
            bpy.data.objects.remove(o)
        for o in bpy.data.objects:
            o.hide_render = False
            o.location.x = 0.0
    try:
        bpy.ops.export_scene.gltf(filepath=os.path.join(RACINE, 'modeles', 'arbres_brut.glb'), export_format='GLB', export_apply=True, export_yup=True,
                                  export_texcoords=True, export_normals=True, export_vertex_color='ACTIVE', export_all_vertex_colors=False)
    except TypeError:
        A.exporter(os.path.join(RACINE, 'modeles', 'arbres_brut.glb'))
    print('exporté', os.path.getsize(os.path.join(RACINE, 'modeles', 'arbres_brut.glb')) // 1024, 'Ko')
