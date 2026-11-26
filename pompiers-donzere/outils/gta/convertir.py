"""Convertit un véhicule de mod GTA V (.yft + .ytd) en fichier GLB utilisable par le jeu.

Usage (avec le Python qui contient Blender/bpy) :
    python -I outils/gta/convertir.py modele.yft textures.ytd sortie.glb [--els fichier.xml] [--rendus dossier]

Le modèle reste la propriété de ses auteurs : ne pas redistribuer le GLB sans leur accord.
Dans le GLB : avant du véhicule vers +Z, gauche vers +X, sol à y = 0, unités en mètres.
"""
import sys, os, io, struct, math, argparse, collections, re, json
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)
sys.path.insert(0, os.path.dirname(ICI))
import numpy as np
from PIL import Image
from rsc import Res, joaat
import bpy
from mathutils import Vector, Matrix, Quaternion
import atelier as A

SHADERS = ['vehicle_paint1', 'vehicle_paint2', 'vehicle_paint3', 'vehicle_paint4', 'vehicle_paint5', 'vehicle_paint6', 'vehicle_paint7',
           'vehicle_paint8', 'vehicle_paint9', 'vehicle_paint1_enveff', 'vehicle_paint2_enveff', 'vehicle_paint3_enveff', 'vehicle_paint3_lvr',
           'vehicle_paint4_enveff', 'vehicle_paint4_emissive', 'vehicle_mesh', 'vehicle_mesh_enveff', 'vehicle_mesh2_enveff', 'vehicle_shuts',
           'vehicle_tire', 'vehicle_tire_emissive', 'vehicle_vehglass', 'vehicle_vehglass_inner', 'vehicle_lightsemissive',
           'vehicle_emissive_opaque', 'vehicle_emissive_alpha', 'vehicle_interior', 'vehicle_interior2', 'vehicle_dash_emissive',
           'vehicle_dash_emissive_opaque', 'vehicle_badges', 'vehicle_decal', 'vehicle_decal2', 'vehicle_detail', 'vehicle_detail2',
           'vehicle_licenseplate', 'vehicle_generic', 'vehicle_basic', 'vehicle_track', 'vehicle_track2', 'vehicle_cutout',
           'vehicle_nosplash', 'vehicle_nowater', 'vehicle_cloth', 'vehicle_cloth2', 'vehicle_lights', 'vehicle_blurredrotor']
PARAMS = ['DiffuseSampler', 'BumpSampler', 'SpecSampler', 'DiffuseSampler2', 'DirtSampler', 'DetailSampler', 'DamageSampler',
          'matDiffuseColor', 'matDiffuseColor2', 'emissiveMultiplier', 'reflectivePower', 'specularIntensityMult', 'detailSettings']
H_SHADER = {joaat(s): s for s in SHADERS}
H_PARAM = {joaat(s): s for s in PARAMS}

# textures du jeu absentes des mods : (couleur sRGB, rugosité, métal, alpha)
GENERIQUES = {
    'vehicle_generic_smallspecmap': ((128, 128, 130), 0.5, 0.0, 1.0),
    'black': ((8, 8, 8), 0.6, 0.0, 1.0),
    'dinghyblack': ((14, 14, 15), 0.75, 0.0, 1.0),
    'vehicle_generic_glasswindows2': ((70, 82, 88), 0.03, 0.0, 0.28),
    'vehicle_generic_tyrewallblack': ((12, 12, 12), 0.9, 0.0, 1.0),
}
DYNAMIQUES = re.compile(r'^(extra_\d+|headlight_.*|taillight_.*|brakelight_.*|indicator_.*|reversinglight_.*|extralight_.*|'
                        r'door_.*|boot|bonnet|steeringwheel|siren\d*)$')
TYPES = {1: ('<f2', 2), 2: ('<f4', 1), 3: ('<f2', 4), 4: ('<f4', 1), 5: ('<f4', 2), 6: ('<f4', 3), 7: ('<f4', 4),
         8: ('u1', 4), 9: ('u1', 4), 10: ('<u4', 1)}
SEM = ['pos', 'poids', 'indices', 'normale', 'coul0', 'coul1', 'uv0', 'uv1', 'uv2', 'uv3', 'uv4', 'uv5', 'uv6', 'uv7', 'tangente', 'binormale']


# ---------------------------------------------------------------- textures (.ytd)
def _dds(larg, haut, fmt, donnees):
    hdr = bytearray(124)
    pf = bytearray(32)
    struct.pack_into('<I', pf, 0, 32)
    if fmt[:2] in (b'DX', b'AT', b'BC'):
        struct.pack_into('<I4s', pf, 4, 0x4, fmt)
        struct.pack_into('<7I', hdr, 0, 124, 0x81007, haut, larg, len(donnees), 0, 1)
    else:
        code = struct.unpack('<I', fmt)[0]
        if code in (21, 22, 32):
            m = (0xFF0000, 0xFF00, 0xFF, 0xFF000000) if code != 32 else (0xFF, 0xFF00, 0xFF0000, 0xFF000000)
            struct.pack_into('<II5I', pf, 4, 0x41, 0, 32, *m)
        elif code in (28, 50):
            struct.pack_into('<II5I', pf, 4, 0x20000 if code == 50 else 0x2, 0, 8, 0xFF if code == 50 else 0, 0, 0, 0xFF if code == 28 else 0)
        else:
            raise ValueError('format de texture inconnu %r' % fmt)
        struct.pack_into('<7I', hdr, 0, 124, 0x100F, haut, larg, larg * (4 if code in (21, 22, 32) else 1), 0, 1)
    hdr[72:104] = pf
    struct.pack_into('<I', hdr, 104, 0x1000)
    return b'DDS ' + bytes(hdr) + donnees


def lire_textures(chemin):
    r = Res(chemin)
    res = {}
    for t in r.liste_ptr(0x30):
        nom = r.chaine(r.ptr(t + 0x28))
        w, h, fmt = r.u16(t + 0x50), r.u16(t + 0x52), r.d[t + 0x58:t + 0x5C]
        blocs = max(1, (w + 3) // 4) * max(1, (h + 3) // 4)
        n = blocs * 8 if fmt in (b'DXT1', b'ATI1') else blocs * 16 if fmt[:2] in (b'DX', b'AT', b'BC') else \
            w * h * (4 if struct.unpack('<I', fmt)[0] in (21, 22, 32) else 1)
        dp = r.ptr(t + 0x70)
        try:
            img = Image.open(io.BytesIO(_dds(w, h, fmt, r.d[dp:dp + n])))
            img.load()
            res[nom.lower()] = img.convert('RGBA')
        except Exception as e:
            print('  texture illisible', nom, fmt, e)
    return res


# ---------------------------------------------------------------- modèle (.yft)
def lire_squelette(r, dr):
    sk = r.ptr(dr + 0x18)
    nb, bones = r.u16(sk + 0x5E), r.ptr(sk + 0x20)
    os_ = []
    for i in range(nb):
        b = bones + 80 * i
        q = r.f32(b, 4)
        M = Matrix.Translation(Vector(r.f32(b + 0x10, 3))) @ Quaternion((q[3], q[0], q[1], q[2])).to_matrix().to_4x4()
        parent = r.i16(b + 0x32)
        os_.append(dict(nom=r.chaine(r.ptr(b + 0x38)), parent=parent, tag=r.u16(b + 0x44),
                        M=(os_[parent]['M'] @ M) if parent >= 0 else M))
    return os_


def lire_shaders(r, dr):
    sg = r.ptr(dr + 0x10)
    res = []
    for s in r.liste_ptr(sg + 0x10):
        pp, n = r.ptr(s), r.u8(s + 0x10)
        pos = pp + 16 * n + sum(16 * r.u8(pp + 16 * k) for k in range(n))
        tex, vec = {}, {}
        for k in range(n):
            dt, dp = r.u8(pp + 16 * k), r.ptr(pp + 16 * k + 8)
            h = r.u32(pos + 4 * k)
            nom = H_PARAM.get(h, hex(h))
            if dt == 0:
                if dp is not None:
                    tex[nom] = (r.chaine(r.ptr(dp + 0x28)) or '').lower()
            else:
                vec[nom] = r.f32(dp, 4)
        h = r.u32(s + 0x08)
        res.append(dict(nom=H_SHADER.get(h, hex(h)), bucket=r.u8(s + 0x11), tex=tex, vec=vec))
    return res


def lire_geometries(r, dr):
    """Renvoie [(indice de shader, sommets structurés, triangles (n,3), palette d'os)] du niveau de détail le plus fin."""
    mh = r.ptr(dr + 0x50)
    res = []
    for m in (r.liste_ptr(mh) if mh is not None else []):
        gp, gn, smap = r.ptr(m + 0x08), r.u16(m + 0x10), r.ptr(m + 0x20)
        for gi in range(gn):
            g = r.ptr(gp + 8 * gi)
            vb, ib = r.ptr(g + 0x18), r.ptr(g + 0x38)
            decl = r.ptr(vb + 0x30)
            flags, types = r.u32(decl), r.u64(decl + 8)
            dt = np.dtype([(SEM[i], *TYPES[(types >> (4 * i)) & 0xF][:1], (TYPES[(types >> (4 * i)) & 0xF][1],))
                           for i in range(16) if flags & (1 << i)])
            assert dt.itemsize == r.u16(vb + 0x08), 'format de sommet inattendu'
            V = np.frombuffer(r.d, dt, r.u32(vb + 0x18), r.ptr(vb + 0x10))
            I = np.frombuffer(r.d, '<u2', r.u32(ib + 0x08), r.ptr(ib + 0x10)).astype(np.int32).reshape(-1, 3)
            pal_p = r.ptr(g + 0x68)
            pal = np.frombuffer(r.d, '<u2', r.u16(g + 0x72), pal_p) if pal_p is not None else None
            res.append((r.u16(smap + 2 * gi), V, I, pal))
    return res


def lire_enfants(r):
    """Pièces détachées du fragment (roues) : [(tag d'os, offset du drawable)]."""
    lg = r.ptr(0xF0)
    if lg is None:
        return []
    lod = r.ptr(lg + 0x10)
    ch, n = r.ptr(lod + 0xD0), r.u8(lod + 0x11D)
    res = []
    for i in range(n):
        c = r.ptr(ch + 8 * i)
        d1 = r.ptr(c + 0xA0)
        if d1 is not None:
            res.append((r.u16(c + 0x12), d1))
    return res


# ---------------------------------------------------------------- matériaux Blender
def moyenne(img):
    a = np.asarray(img.convert('RGBA'), np.float32)
    return tuple(a[..., :3].reshape(-1, 3).mean(0)), float(a[..., 3].min()) / 255, float(a[..., 3].mean()) / 255


def creer_materiau(i, sh, textures, dossier):
    nom_sh = sh['nom']
    t_nom = sh['tex'].get('DiffuseSampler2') if nom_sh.startswith('vehicle_paint3') and sh['tex'].get('DiffuseSampler2') in textures \
        else sh['tex'].get('DiffuseSampler', '')
    mat = bpy.data.materials.new(f'{i:02d}_{nom_sh.replace("vehicle_", "")}_{t_nom}'[:60])
    mat.use_nodes = True
    nt = mat.node_tree
    b = nt.nodes['Principled BSDF']
    verre = 'vehglass' in nom_sh
    lumiere = 'lightsemissive' in nom_sh or 'emissive' in nom_sh
    peinture = 'paint' in nom_sh
    pneu = 'tire' in nom_sh
    teinte = sh['vec'].get('matDiffuseColor', (1, 1, 1, 0))
    teinte = (1.0, 1.0, 1.0) if teinte[0] >= 1.999 else tuple(teinte[:3])
    rug, metal, alpha_mode, alpha_fixe = 0.5, 0.0, 'OPAQUE', 1.0
    img = textures.get(t_nom)
    if img is not None:
        coul, a_min, a_moy = moyenne(img)
        lum = sum(coul) / 3
        opaque = a_min > 0.98
        f = os.path.join(dossier, re.sub(r'[^a-z0-9_]+', '_', t_nom) + ('.jpg' if opaque else '.png'))
        if not os.path.exists(f):
            (img.convert('RGB').save(f, quality=92) if opaque else img.save(f))
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = bpy.data.images.load(f)
        if teinte != (1.0, 1.0, 1.0):
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type, mix.blend_type = 'RGBA', 'MULTIPLY'
            mix.inputs[0].default_value = 1.0
            nt.links.new(tn.outputs['Color'], mix.inputs[6])
            mix.inputs[7].default_value = (*teinte, 1)
            nt.links.new(mix.outputs[2], b.inputs['Base Color'])
        else:
            nt.links.new(tn.outputs['Color'], b.inputs['Base Color'])
        if verre and not opaque:
            nt.links.new(tn.outputs['Alpha'], b.inputs['Alpha'])
            alpha_mode = 'BLEND'
        elif lumiere and not opaque and sh['bucket'] != 0:
            nt.links.new(tn.outputs['Alpha'], b.inputs['Alpha'])
            alpha_mode = 'CLIP'
    else:
        coul, rug_g, metal_g, alpha_fixe = GENERIQUES.get(t_nom, ((128, 128, 128), 0.5, 0.0, 1.0))
        if t_nom not in GENERIQUES:
            print('  texture absente (gris par défaut) :', repr(t_nom), 'pour', nom_sh)
        lum = sum(coul) / 3
        b.inputs['Base Color'].default_value = (*[c * t for c, t in zip(A.lin(*coul), teinte)], 1)
        rug, metal = rug_g, metal_g
        if alpha_fixe < 1:
            b.inputs['Alpha'].default_value = alpha_fixe
            alpha_mode = 'BLEND'
    if peinture:
        rug = 0.32
        b.inputs['Coat Weight'].default_value = 1.0
        b.inputs['Coat Roughness'].default_value = 0.06
    elif verre:
        rug = 0.05
    elif lumiere:
        rug = 0.22
    elif pneu:
        rug, metal = (0.88, 0.0) if lum < 60 else (0.36, 0.85)
    elif img is not None:
        rug = 0.62 if lum < 70 else 0.5
    b.inputs['Roughness'].default_value = rug
    b.inputs['Metallic'].default_value = metal
    # carte de normales (convention DirectX -> OpenGL : canal vert inversé)
    n_nom = sh['tex'].get('BumpSampler')
    if n_nom in textures and not verre:
        f = os.path.join(dossier, re.sub(r'[^a-z0-9_]+', '_', n_nom) + '_gl.png')
        if not os.path.exists(f):
            a = np.asarray(textures[n_nom].convert('RGB')).copy()
            a[..., 1] = 255 - a[..., 1]
            Image.fromarray(a, 'RGB').save(f)
        nn = nt.nodes.new('ShaderNodeTexImage')
        nn.image = bpy.data.images.load(f)
        nn.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = 0.6
        nt.links.new(nn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if alpha_mode == 'BLEND':
        try:
            mat.surface_render_method = 'BLENDED'
        except Exception:
            mat.blend_method = 'BLEND'
    elif alpha_mode == 'CLIP':                             # découpe : alpha arrondi (reconnu par l'export glTF)
        lien = b.inputs['Alpha'].links[0]
        src = lien.from_socket
        nt.links.remove(lien)
        arr = nt.nodes.new('ShaderNodeMath')
        arr.operation = 'ROUND'
        nt.links.new(src, arr.inputs[0])
        nt.links.new(arr.outputs[0], b.inputs['Alpha'])
    mat.use_backface_culling = False       # les maillages de mods ne sont pas toujours orientés proprement
    mat['shader_gta'] = nom_sh
    return mat


def creer_maillage(nom, pos, nor, uv, tri, mat):
    me = bpy.data.meshes.new(nom)
    nv, ntri = len(pos), len(tri)
    me.vertices.add(nv)
    me.vertices.foreach_set('co', np.ascontiguousarray(pos, np.float32).ravel())
    me.loops.add(ntri * 3)
    me.loops.foreach_set('vertex_index', np.ascontiguousarray(tri, np.int32).ravel())
    me.polygons.add(ntri)
    me.polygons.foreach_set('loop_start', np.arange(0, ntri * 3, 3, dtype=np.int32))
    try:
        me.polygons.foreach_set('loop_total', np.full(ntri, 3, dtype=np.int32))
    except Exception:
        pass
    me.polygons.foreach_set('use_smooth', np.ones(ntri, dtype=bool))
    couche = me.uv_layers.new(name='UVMap')
    couche.data.foreach_set('uv', np.ascontiguousarray(uv[tri.ravel()], np.float32).ravel())
    me.update(calc_edges=True)
    me.validate(clean_customdata=False)
    n = np.ascontiguousarray(nor, np.float64)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
    me.normals_split_custom_set_from_vertices(n.tolist())
    me.materials.append(mat)
    return me


def compacter(pos, nor, uv, tri):
    """Ne garde que les sommets utilisés par les triangles."""
    utilises = np.unique(tri)
    table = np.full(len(pos), -1, np.int32)
    table[utilises] = np.arange(len(utilises), dtype=np.int32)
    return pos[utilises], nor[utilises], uv[utilises], table[tri]


# ---------------------------------------------------------------- conversion
def convertir(f_yft, f_ytd, f_glb, f_els=None, d_rendus=None, credits=''):
    A.nouvelle_scene()
    cache = os.path.join(os.path.dirname(os.path.abspath(f_glb)), '.textures_' + os.path.splitext(os.path.basename(f_glb))[0])
    os.makedirs(cache, exist_ok=True)
    textures = lire_textures(f_ytd)
    r = Res(f_yft)
    dr = r.ptr(0x30)
    os_ = lire_squelette(r, dr)
    shaders = lire_shaders(r, dr)
    par_tag = {}
    for i, o in enumerate(os_):
        par_tag.setdefault(o['tag'], i)
    par_nom = {}
    for i, o in enumerate(os_):
        par_nom.setdefault(o['nom'], i)
    print(len(os_), 'os,', len(shaders), 'matériaux,', len(textures), 'textures')

    # ---- roues (pièces détachées) : rayon et niveau du sol
    roues = []
    for tag, d1 in lire_enfants(r):
        geos = lire_geometries(r, d1)
        if geos and tag in par_tag and os_[par_tag[tag]]['nom'].startswith('wheel'):
            roues.append((par_tag[tag], geos))
    sol, rayon = 0.0, 0.35
    if roues:
        io_, geos = roues[0]
        centre = os_[io_]['M'].translation
        tout = np.concatenate([g[1]['pos'] for g in geos])
        local = abs(tout.mean(0)[1]) < 0.5 and abs(tout.mean(0)[0]) < 0.3        # déjà centrée sur la roue ?
        zs = tout[:, 2] if local else tout[:, 2] - centre.z
        rayon = float((zs.max() - zs.min()) / 2)
        sol = centre.z - rayon
        print('roue : rayon', round(rayon, 3), 'largeur', round(float(np.ptp(tout[:, 0])), 3), '| repère local' if local else '| repère véhicule', '| sol z =', round(sol, 3))

    def conv(p):          # GTA (avant +Y, droite +X) -> Blender du jeu (avant -Y, gauche +X), sol à z = 0
        q = np.array(p, np.float32, copy=True)
        q[:, 0] *= -1
        q[:, 1] *= -1
        return q

    def conv_pt(v):
        return Vector((-v.x, -v.y, v.z - sol))

    # ---- nœuds dynamiques (portes, feux, extras…) ; le reste est fusionné en « statique »
    noeud_de = []
    for i, o in enumerate(os_):
        j = i
        while j >= 0 and not DYNAMIQUES.match(os_[j]['nom']):
            j = os_[j]['parent']
        noeud_de.append(i if (j >= 0 and j != i) else j)        # os enfant d'un os dynamique : son propre nœud
    racine = A.vide('vehicule', (0, 0, 0))
    racine['credits'] = credits
    objets, noms_pris = {}, collections.Counter()

    def noeud(i):
        if i < 0:
            return racine
        if i not in objets:
            o = os_[i]
            noms_pris[o['nom']] += 1
            nom = o['nom'] if noms_pris[o['nom']] == 1 else f"{o['nom']}_{noms_pris[o['nom']]}"
            parent_os = o['parent']
            while parent_os >= 0 and noeud_de[parent_os] < 0:
                parent_os = os_[parent_os]['parent']
            parent = noeud(parent_os) if parent_os >= 0 else racine
            e = A.vide(nom, (0, 0, 0), parent)
            e.location = conv_pt(o['M'].translation) - (conv_pt(os_[parent_os]['M'].translation) if parent_os >= 0 else Vector((0, 0, 0)))
            objets[i] = e
        return objets[i]

    mats = {}

    def mat(i):
        if i not in mats:
            mats[i] = creer_materiau(i, shaders[i], textures, cache)
        return mats[i]

    # ---- carrosserie : regroupement des triangles par (nœud, matériau)
    lots = collections.defaultdict(lambda: [[], [], [], [], 0])
    tot_v = tot_t = inverses = 0
    for si, V, I, pal in lire_geometries(r, dr):
        sh = shaders[si]
        cle_uv = 'uv1' if (sh['nom'].startswith('vehicle_paint3') and sh['tex'].get('DiffuseSampler2') in textures and 'uv1' in V.dtype.names) else 'uv0'
        pos, nor = conv(V['pos']), conv(V['normale'])
        uv = np.array(V[cle_uv], np.float32, copy=True)
        uv[:, 1] = 1.0 - uv[:, 1]
        if pal is not None and 'indices' in V.dtype.names:
            k = np.argmax(V['poids'], axis=1)
            os_sommet = pal[V['indices'][np.arange(len(V)), k]].astype(np.int32)
        else:
            os_sommet = np.zeros(len(V), np.int32)
        nd = np.array(noeud_de, np.int32)[os_sommet[I[:, 0]]]
        # sens des triangles : doit correspondre aux normales
        g = np.cross(pos[I[:, 1]] - pos[I[:, 0]], pos[I[:, 2]] - pos[I[:, 0]])
        mauvais = (g * nor[I[:, 0]]).sum(1) < 0
        if mauvais.mean() > 0.5:
            I = I[:, ::-1]
            inverses += 1
        for n_id in np.unique(nd):
            sel = I[nd == n_id]
            lot = lots[(int(n_id), si)]
            lot[0].append(pos); lot[1].append(nor); lot[2].append(uv); lot[3].append(sel + lot[4])
            lot[4] += len(pos)
        tot_v += len(V); tot_t += len(I)
    print('carrosserie :', tot_v, 'sommets,', tot_t, 'triangles,', len(lots), 'lots,', inverses, 'géométries retournées')
    for (n_id, si), (P, N, U, T, _) in sorted(lots.items()):
        pos, nor, uv, tri = compacter(np.concatenate(P), np.concatenate(N), np.concatenate(U), np.concatenate(T))
        parent = noeud(n_id)
        pos[:, 2] -= sol                                   # repère du véhicule, sol à z = 0
        if n_id >= 0:                                      # puis repère du nœud (pivot de porte, feu…)
            pos -= np.array(conv_pt(os_[n_id]['M'].translation), np.float32)
        nom = f"{parent.name if n_id >= 0 else 'statique'}_{si:02d}"
        o = bpy.data.objects.new(nom, creer_maillage(nom, pos, nor, uv, tri, mat(si)))
        A.lier(o, parent)

    # ---- roues : remplacées par des roues réalistes modélisées dans Blender (pneu sculpté, jante tôle)
    if roues:
        partage = {}
        for nom_os, nom, cote in (('wheel_lf', 'roue_AV_G', 1), ('wheel_rf', 'roue_AV_D', -1), ('wheel_lr', 'roue_AR_G', 1), ('wheel_rr', 'roue_AR_D', -1)):
            if nom_os not in par_nom:
                continue
            c = os_[par_nom[nom_os]]['M'].translation
            e = A.roue_realiste(nom, (-c.x, -c.y, rayon), rayon, 0.235, 0.2032 * rayon / 0.359, cache, cote=cote, cache=partage)
            e.parent = racine

    # ---- couleurs des feux « extras » (fichier ELS)
    if f_els and os.path.exists(f_els):
        xml = open(f_els, encoding='utf-8', errors='replace').read()
        for num, coul in re.findall(r'<Extra(\d+)[^>]*Color="(\w+)"', xml):
            for i, e in objets.items():
                if os_[i]['nom'] == f'extra_{int(num)}':
                    e['couleur'] = coul
    print('nœuds :', ', '.join(sorted(o.name + ('(' + o['couleur'] + ')' if 'couleur' in o else '') for o in objets.values())))
    A.exporter(f_glb)
    if d_rendus:
        A.decor_apercu(elevation=34.0, azimut=205.0)
        base = os.path.splitext(os.path.basename(f_glb))[0]
        A.rendu(os.path.join(d_rendus, base + '_arriere.png'), (-4.3, 6.4, 1.55), (0, 0.3, 1.1), focale=42)
        A.rendu(os.path.join(d_rendus, base + '_avant.png'), (-4.6, -6.6, 1.6), (0, -0.2, 1.05), focale=42)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('yft'); ap.add_argument('ytd'); ap.add_argument('glb')
    ap.add_argument('--els'); ap.add_argument('--rendus'); ap.add_argument('--credits', default='')
    a = ap.parse_args()
    convertir(a.yft, a.ytd, a.glb, a.els, a.rendus, a.credits)
