"""Prépare le dossier `publication/` pour un hébergement qui n'accepte que les types de fichiers courants du web :
les modèles .glb deviennent des glTF au format texte (.json, données intégrées en base64), le ciel .hdr un .json.
Usage : python3 outils/publier.py   (le dossier publication/ n'est pas versionné)
"""
import base64, json, os, shutil, struct

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(RACINE, 'publication')
shutil.rmtree(OUT, ignore_errors=True)
SERVIS = ('.html', '.css', '.js', '.json', '.jpg', '.png', '.webp')


def glb_vers_json(src, dest):
    d = open(src, 'rb').read()
    magie, version, total = struct.unpack_from('<4sII', d, 0)
    assert magie == b'glTF'
    pos, doc, binaire = 12, None, b''
    while pos < total:
        taille, genre = struct.unpack_from('<I4s', d, pos)
        bloc = d[pos + 8:pos + 8 + taille]
        if genre == b'JSON': doc = json.loads(bloc)
        elif genre[:3] == b'BIN': binaire = bloc
        pos += 8 + taille
    doc['buffers'][0]['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(binaire[:doc['buffers'][0]['byteLength']]).decode()
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    json.dump(doc, open(dest, 'w'), separators=(',', ':'))


fichiers = ['index.html', 'style.css']
for dossier in ('js', 'vendor', 'data', 'ciel', 'textures'):
    for chemin, _, noms in os.walk(os.path.join(RACINE, dossier)):
        fichiers += [os.path.relpath(os.path.join(chemin, n), RACINE) for n in noms]
for f in fichiers:
    if f.endswith(SERVIS) and not f.endswith('commerces.json'):
        os.makedirs(os.path.dirname(os.path.join(OUT, f)) or OUT, exist_ok=True)
        shutil.copy(os.path.join(RACINE, f), os.path.join(OUT, f))
glb_vers_json(os.path.join(RACINE, 'modeles', 'batiments.glb'), os.path.join(OUT, 'modeles', 'batiments.json'))
prive = os.path.join(RACINE, 'modeles_prives', 'vsav_bspp_web.glb')
if os.path.exists(prive):
    glb_vers_json(prive, os.path.join(OUT, 'modeles_prives', 'vsav_bspp_web.json'))
else:
    glb_vers_json(os.path.join(RACINE, 'modeles', 'vsav.glb'), os.path.join(OUT, 'modeles', 'vsav.json'))
json.dump({'hdr': base64.b64encode(open(os.path.join(RACINE, 'ciel', 'env.hdr'), 'rb').read()).decode()}, open(os.path.join(OUT, 'ciel', 'env.json'), 'w'))
liste = []
for chemin, _, noms in os.walk(OUT):
    liste += [os.path.relpath(os.path.join(chemin, n), OUT) for n in noms]
json.dump([{'as': f.replace(os.sep, '/'), 'path': os.path.abspath(os.path.join(OUT, f))} for f in sorted(liste)], open(os.path.join(OUT, '..', '.cache', 'publication.json'), 'w'))
print(len(liste), 'fichiers,', round(sum(os.path.getsize(os.path.join(OUT, f)) for f in liste) / 1048576, 1), 'Mo ; plus gros :',
      sorted(((os.path.getsize(os.path.join(OUT, f)) // 1024, f) for f in liste), reverse=True)[:3])
