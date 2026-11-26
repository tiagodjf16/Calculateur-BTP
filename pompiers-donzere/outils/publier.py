"""Prépare le dossier `publication/` pour un hébergement qui n'accepte que les types de fichiers courants du web :
les modèles .glb et le ciel .hdr sont encodés en base64 dans des fichiers .json, que le jeu décode lui-même.
Usage : python3 outils/publier.py   (le dossier publication/ n'est pas versionné)
"""
import base64, json, os, shutil

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(RACINE, 'publication')
shutil.rmtree(OUT, ignore_errors=True)
SERVIS = ('.html', '.css', '.js', '.json', '.jpg', '.png', '.webp')


def glb_vers_json(src, dest):
    """Le .glb tel quel, encodé en base64 dans un fichier JSON : { "glb": "…" } (le jeu le décode lui-même)."""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    json.dump({'glb': base64.b64encode(open(src, 'rb').read()).decode()}, open(dest, 'w'))


fichiers = ['index.html', 'style.css']
for dossier in ('js', 'vendor', 'data', 'ciel', 'textures'):
    for chemin, _, noms in os.walk(os.path.join(RACINE, dossier)):
        fichiers += [os.path.relpath(os.path.join(chemin, n), RACINE) for n in noms]
for f in fichiers:
    if f.endswith(SERVIS) and not f.endswith('commerces.json'):
        os.makedirs(os.path.dirname(os.path.join(OUT, f)) or OUT, exist_ok=True)
        shutil.copy(os.path.join(RACINE, f), os.path.join(OUT, f))
# modèles : version complète (ordinateur) et version allégée (téléphone), cette dernière si elle existe
for nom in ('batiments', 'batiments_leger'):
    src = os.path.join(RACINE, 'modeles', nom + '.glb')
    if os.path.exists(src):
        glb_vers_json(src, os.path.join(OUT, 'modeles', nom + '.json'))
prive = os.path.join(RACINE, 'modeles_prives', 'vsav_bspp_web.glb')
if os.path.exists(prive):
    for nom in ('vsav_bspp_web', 'vsav_bspp_leger'):
        src = os.path.join(RACINE, 'modeles_prives', nom + '.glb')
        if os.path.exists(src):
            glb_vers_json(src, os.path.join(OUT, 'modeles_prives', nom + '.json'))
else:
    glb_vers_json(os.path.join(RACINE, 'modeles', 'vsav.glb'), os.path.join(OUT, 'modeles', 'vsav.json'))
json.dump({'hdr': base64.b64encode(open(os.path.join(RACINE, 'ciel', 'env.hdr'), 'rb').read()).decode()}, open(os.path.join(OUT, 'ciel', 'env.json'), 'w'))
liste = []
for chemin, _, noms in os.walk(OUT):
    liste += [os.path.relpath(os.path.join(chemin, n), OUT) for n in noms]
json.dump([{'as': f.replace(os.sep, '/'), 'path': os.path.abspath(os.path.join(OUT, f))} for f in sorted(liste)], open(os.path.join(OUT, '..', '.cache', 'publication.json'), 'w'))
print(len(liste), 'fichiers,', round(sum(os.path.getsize(os.path.join(OUT, f)) for f in liste) / 1048576, 1), 'Mo ; plus gros :',
      sorted(((os.path.getsize(os.path.join(OUT, f)) // 1024, f) for f in liste), reverse=True)[:3])
