"""Arbres du jeu : des modèles 3D très détaillés (Poly Haven, CC0 — plusieurs millions de polygones) sont « photographiés »
dans Blender sous deux angles, sur fond transparent. Le jeu affiche ces photos sur deux plans croisés (imposteurs).

Sortie : textures/arbres.png (atlas) + textures/arbres.json. Usage : python outils/arbres.py
"""
import os, sys, json, math, urllib.request
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)
import numpy as np
import bpy
from mathutils import Vector
from PIL import Image
import cc0

RACINE = os.path.join(ICI, '..')
ESPECES = [
    dict(id='tree_small_02', hauteur=8.5, zones='Bois|Forêt|Haie|Verger|Lande', poids=3),
]
CASE_L, CASE_H = 512, 768


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


def photographier(ident):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=telecharger(ident))
    scene = bpy.context.scene
    objs = [o for o in scene.objects if o.type == 'MESH']
    mn, mx = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in objs:
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c)
            mn = Vector((min(mn.x, p.x), min(mn.y, p.y), min(mn.z, p.z)))
            mx = Vector((max(mx.x, p.x), max(mx.y, p.y), max(mx.z, p.z)))
    centre, taille = (mn + mx) / 2, mx - mn
    print(ident, 'dimensions', [round(v, 2) for v in taille], 'triangles ~', sum(len(o.data.polygons) for o in objs))
    # lumière douce et uniforme : le jeu rajoute son propre soleil
    w = bpy.data.worlds.new('w')
    scene.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 1.15
    sol = bpy.data.objects.new('soleil', bpy.data.lights.new('soleil', 'SUN'))
    sol.data.energy = 1.6
    sol.rotation_euler = (math.radians(35), 0, math.radians(30))
    scene.collection.objects.link(sol)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.type = 'ORTHO'
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.cycles.transparent_max_bounces = 16
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    try:
        scene.view_settings.view_transform = 'Standard'
    except Exception:
        pass
    vues = []
    for k, az in enumerate((0.0, 90.0)):
        larg = max(taille.x, taille.y) * 1.04
        haut = taille.z * 1.03
        cam.data.ortho_scale = max(larg, haut * CASE_L / CASE_H)
        scene.render.resolution_x, scene.render.resolution_y = CASE_L, CASE_H
        a = math.radians(az)
        cam.location = centre + Vector((math.sin(a), -math.cos(a), 0)) * (max(taille) * 3)
        # cadrage : pied de l'arbre en bas de l'image
        cam.location.z = mn.z + (cam.data.ortho_scale * CASE_H / CASE_L) / 2
        cam.rotation_euler = (math.radians(90), 0, a)
        f = os.path.join(cc0.CACHE, f'{ident}_vue{k}.png')
        scene.render.filepath = f
        bpy.ops.render.render(write_still=True)
        vues.append(f)
    echelle = cam.data.ortho_scale                     # largeur couverte par la case, en mètres du modèle
    return vues, echelle, taille.z


atlas = Image.new('RGBA', (CASE_L * 2 * len(ESPECES), CASE_H), (0, 0, 0, 0))
infos = []
for i, e in enumerate(ESPECES):
    vues, echelle, h_modele = photographier(e['id'])
    for k, f in enumerate(vues):
        img = Image.open(f).convert('RGBA')
        a = np.asarray(img, np.float32)
        a[..., :3] = np.clip(a[..., :3] * 0.92, 0, 255)
        atlas.paste(Image.fromarray(a.astype(np.uint8), 'RGBA'), ((i * 2 + k) * CASE_L, 0))
    k_ech = e['hauteur'] / h_modele                   # mise à l'échelle vers la hauteur voulue dans le jeu
    n = 2 * len(ESPECES)
    infos.append(dict(nom=e['id'], zones=e['zones'], poids=e['poids'], hauteur=round(echelle * CASE_H / CASE_L * k_ech, 2), largeur=round(echelle * k_ech, 2),
                      vues=[[(i * 2 + k) / n, (i * 2 + k + 1) / n] for k in range(2)]))
# bords : on étale la couleur des feuilles sous les pixels transparents pour éviter les liserés sombres
a = np.asarray(atlas, np.float32)
rgb, alpha = a[..., :3].copy(), a[..., 3]
plein = alpha > 100
for _ in range(6):
    vide = ~plein
    acc, nb = np.zeros_like(rgb), np.zeros(alpha.shape, np.float32)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        acc += np.roll(rgb * plein[..., None], (dy, dx), (0, 1))
        nb += np.roll(plein, (dy, dx), (0, 1))
    gagne = vide & (nb > 0)
    rgb[gagne] = acc[gagne] / nb[gagne][:, None]
    plein = plein | gagne
moy = rgb[alpha > 100].mean(0)
rgb[~plein] = moy
Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8), 'RGBA').save(os.path.join(RACINE, 'textures', 'arbres.png'), optimize=True)
json.dump(dict(source='Poly Haven (CC0) : ' + ', '.join(e['id'] for e in ESPECES), especes=infos), open(os.path.join(RACINE, 'textures', 'arbres.json'), 'w'), indent=1)
print('arbres prêts', os.path.getsize(os.path.join(RACINE, 'textures', 'arbres.png')) // 1024, 'Ko', infos)
