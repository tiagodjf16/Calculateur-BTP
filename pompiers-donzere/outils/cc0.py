"""Téléchargement (avec cache) de ressources libres CC0 de Poly Haven : textures, ciels HDRI, modèles.

Les fichiers vont dans .cache/cc0/ (non versionné) ; seules les versions allégées utiles au jeu sont copiées dans le projet.
"""
import json, os, urllib.request

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.cache', 'cc0')
os.makedirs(CACHE, exist_ok=True)
UA = {'User-Agent': 'curl/8.5'}


def _get(url, dest=None):
    if dest and os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180).read()
    if dest:
        open(dest, 'wb').write(data)
        return dest
    return data


def fichiers(ident):
    f = os.path.join(CACHE, ident + '.files.json')
    if not os.path.exists(f):
        open(f, 'wb').write(_get('https://api.polyhaven.com/files/' + ident))
    return json.load(open(f))


def texture(ident, carte='Diffuse', res='1k', fmt='jpg'):
    """Télécharge une carte de texture ('Diffuse', 'nor_gl', 'Rough', 'arm', 'Displacement'…). Renvoie le chemin local."""
    info = fichiers(ident)
    if carte not in info:
        raise KeyError(f'{ident}: cartes disponibles {list(info)}')
    url = info[carte][res][fmt]['url']
    return _get(url, os.path.join(CACHE, f'{ident}_{carte}_{res}.{fmt}'))


def hdri(ident, res='1k', fmt='hdr'):
    info = fichiers(ident)
    return _get(info['hdri'][res][fmt]['url'], os.path.join(CACHE, f'{ident}_{res}.{fmt}'))


def hdri_jpg(ident):
    info = fichiers(ident)
    return _get(info['tonemapped']['url'], os.path.join(CACHE, f'{ident}_tonemapped.jpg'))
