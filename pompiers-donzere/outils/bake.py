"""Télécharge les données réelles de Donzère (IGN BD TOPO, photo aérienne IGN,
relief) et les prépare pour le jeu : data/donzere.json + data/ortho.jpg.

Usage : python3 outils/bake.py   (depuis le dossier pompiers-donzere)
"""
import io, json, math, os, struct, base64, urllib.request, urllib.parse, time
from PIL import Image

# Zone du jeu : de la caserne (Centre de Secours du Val de Berre) au centre-ville
LAT_MIN, LAT_MAX = 44.4265, 44.4465
LON_MIN, LON_MAX = 4.7000, 4.7280
LAT0, LON0 = (LAT_MIN + LAT_MAX) / 2, (LON_MIN + LON_MAX) / 2
MX = math.cos(math.radians(LAT0)) * 111320.0   # mètres par degré de longitude
MZ = 110574.0                                     # mètres par degré de latitude

OUT = os.path.join(os.path.dirname(__file__), '..', 'data')
CACHE = os.path.join(os.path.dirname(__file__), '..', '.cache')
os.makedirs(OUT, exist_ok=True); os.makedirs(CACHE, exist_ok=True)
UA = {'User-Agent': 'jeu-pompiers-donzere/1.0'}


def get(url, cache_name=None):
    if cache_name:
        p = os.path.join(CACHE, cache_name)
        if os.path.exists(p):
            return open(p, 'rb').read()
    for essai in range(4):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read()
            break
        except Exception as e:
            print('  nouvel essai', essai, e); time.sleep(2 + essai * 3)
    else:
        raise RuntimeError(url)
    if cache_name:
        open(p, 'wb').write(data)
    return data


def local(lon, lat):
    """lon/lat -> mètres locaux (x vers l'est, z vers le sud)."""
    return round((lon - LON0) * MX, 2), round(-(lat - LAT0) * MZ, 2)


def wfs(layer):
    feats, start = [], 0
    while True:
        q = urllib.parse.urlencode({
            'SERVICE': 'WFS', 'VERSION': '2.0.0', 'REQUEST': 'GetFeature',
            'TYPENAMES': 'BDTOPO_V3:' + layer, 'OUTPUTFORMAT': 'application/json',
            'COUNT': 5000, 'STARTINDEX': start,
            'BBOX': f'{LAT_MIN},{LON_MIN},{LAT_MAX},{LON_MAX},urn:ogc:def:crs:EPSG::4326'})
        d = json.loads(get('https://data.geopf.fr/wfs/ows?' + q, f'{layer}_{start}.json'))
        feats += d['features']
        if len(d['features']) < 5000:
            break
        start += 5000
    print(layer, len(feats))
    return feats


def rings(geom):
    t, c = geom['type'], geom['coordinates']
    polys = [c] if t == 'Polygon' else c if t == 'MultiPolygon' else []
    return polys


def lines(geom):
    t, c = geom['type'], geom['coordinates']
    return [c] if t == 'LineString' else c if t == 'MultiLineString' else []


def conv_ring(r):
    return [v for p in r for v in local(p[0], p[1])]


# ---------------------------------------------------------------- bâtiments
batiments = []
for f in wfs('batiment'):
    p = f['properties']
    for poly in rings(f['geometry']):
        if not poly or len(poly[0]) < 4:
            continue
        h = p.get('hauteur') or (3.0 * (p.get('nombre_d_etages') or 1))
        batiments.append({
            'p': conv_ring(poly[0][:-1]),                       # contour extérieur
            't': [conv_ring(r[:-1]) for r in poly[1:] if len(r) > 3],  # cours intérieures
            'h': round(max(2.5, float(h)), 1),
            'u': p.get('usage_1') or '', 'n': p.get('nature') or '',
            'l': bool(p.get('construction_legere')),
            'e': p.get('nombre_d_etages') or 0,
            # élévation du faîtage au-dessus de la gouttière (0 = toit plat)
            'r': round(max(0.0, min(6.0, (p.get('altitude_maximale_toit') or 0) - (p.get('altitude_minimale_toit') or 0))), 1),
        })

# ---------------------------------------------------------------- routes
routes = []
for f in wfs('troncon_de_route'):
    p = f['properties']
    nat = p.get('nature') or ''
    larg = p.get('largeur_de_chaussee') or {'Route à 2 chaussées': 7, 'Rond-point': 7,
            'Route à 1 chaussée': 5.5, 'Route empierrée': 3.5, 'Chemin': 3,
            'Sentier': 1.5, 'Escalier': 2, 'Bretelle': 5}.get(nat, 4)
    for ln in lines(f['geometry']):
        routes.append({'p': conv_ring(ln), 'w': round(float(larg), 1), 'n': nat,
                       'nom': p.get('nom_collaboratif_gauche') or p.get('nom_1_gauche') or ''})

# ---------------------------------------------------------------- végétation / eau / lieux
vegetation = [{'p': conv_ring(poly[0][:-1]), 'n': f['properties'].get('nature') or ''}
              for f in wfs('zone_de_vegetation') for poly in rings(f['geometry'])]
eau = [{'p': conv_ring(poly[0][:-1]), 'n': f['properties'].get('nature') or ''}
       for f in wfs('surface_hydrographique') for poly in rings(f['geometry'])]
lieux = []
for f in wfs('zone_d_activite_ou_d_interet'):
    p = f['properties']
    for poly in rings(f['geometry']):
        pts = poly[0]
        cx = sum(q[0] for q in pts) / len(pts); cy = sum(q[1] for q in pts) / len(pts)
        x, z = local(cx, cy)
        lieux.append({'x': x, 'z': z, 'n': p.get('nature') or '', 'nom': p.get('toponyme') or ''})

# ---------------------------------------------------------------- relief (tuiles Terrarium, z15)
def tile_xy(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y

Z_DEM = 15
x0, y0 = tile_xy(LON_MIN, LAT_MAX, Z_DEM); x1, y1 = tile_xy(LON_MAX, LAT_MIN, Z_DEM)
dem_tiles = {}
for tx in range(int(x0), int(x1) + 1):
    for ty in range(int(y0), int(y1) + 1):
        raw = get(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z_DEM}/{tx}/{ty}.png',
                  f'dem_{Z_DEM}_{tx}_{ty}.png')
        dem_tiles[(tx, ty)] = Image.open(io.BytesIO(raw)).convert('RGB').load()

def altitude(lon, lat):
    fx, fy = tile_xy(lon, lat, Z_DEM)
    px, py = fx * 256 - 0.5, fy * 256 - 0.5
    ix, iy = math.floor(px), math.floor(py)
    def h(X, Y):
        r, g, b = dem_tiles[(X // 256, Y // 256)][X % 256, Y % 256]
        return r * 256 + g + b / 256 - 32768
    ax, ay = px - ix, py - iy
    return (h(ix, iy) * (1 - ax) * (1 - ay) + h(ix + 1, iy) * ax * (1 - ay)
            + h(ix, iy + 1) * (1 - ax) * ay + h(ix + 1, iy + 1) * ax * ay)

N = 257
hauteurs = []
for j in range(N):
    lat = LAT_MAX - (LAT_MAX - LAT_MIN) * j / (N - 1)
    for i in range(N):
        lon = LON_MIN + (LON_MAX - LON_MIN) * i / (N - 1)
        hauteurs.append(altitude(lon, lat))
hmin = min(hauteurs)
relief = base64.b64encode(struct.pack(f'<{N*N}H', *[int(round((h - hmin) * 100)) for h in hauteurs])).decode()
print('relief', round(hmin, 1), round(max(hauteurs), 1))

# ---------------------------------------------------------------- photo aérienne IGN (z19, 20 cm par pixel)
Z_IMG = 19
x0, y0 = tile_xy(LON_MIN, LAT_MAX, Z_IMG); x1, y1 = tile_xy(LON_MAX, LAT_MIN, Z_IMG)
W, H = (int(x1) - int(x0) + 1) * 256, (int(y1) - int(y0) + 1) * 256
Image.MAX_IMAGE_PIXELS = None
mosaique = Image.new('RGB', (W, H))
for tx in range(int(x0), int(x1) + 1):
    for ty in range(int(y0), int(y1) + 1):
        url = ('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0'
               '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM'
               f'&TILEMATRIX={Z_IMG}&TILECOL={tx}&TILEROW={ty}&FORMAT=image/jpeg')
        img = Image.open(io.BytesIO(get(url, f'ortho_{Z_IMG}_{tx}_{ty}.jpg'))).convert('RGB')
        mosaique.paste(img, ((tx - int(x0)) * 256, (ty - int(y0)) * 256))
# découpe exacte sur la zone (sur 2 km la déformation Mercator est négligeable)
crop = mosaique.crop((round((x0 - int(x0)) * 256), round((y0 - int(y0)) * 256),
                      round((x1 - int(x0)) * 256), round((y1 - int(y0)) * 256)))
print('photo aérienne', crop.size)
del mosaique
grand = crop.resize((8192, 8192), Image.LANCZOS)
for j in range(2):          # 4 dalles de 4096 px pour les ordinateurs
    for i in range(2):
        grand.crop((i * 4096, j * 4096, (i + 1) * 4096, (j + 1) * 4096)).save(
            os.path.join(OUT, f'ortho_{i}_{j}.jpg'), quality=84, optimize=True, progressive=True)
petit = grand.resize((2048, 2048), Image.LANCZOS)      # version légère (téléphones, mini-carte)
petit.save(os.path.join(OUT, 'ortho.jpg'), quality=84, optimize=True, progressive=True)

# couleur réelle de chaque toit, lue sur la photo aérienne
px = petit.load()
TX, TZ = (LON_MAX - LON_MIN) * MX, (LAT_MAX - LAT_MIN) * MZ
for b in batiments:
    xs, zs = b['p'][0::2], b['p'][1::2]
    cx, cz = sum(xs) / len(xs), sum(zs) / len(zs)
    acc, n = [0, 0, 0], 0
    for k in range(len(xs) + 1):
        x, z = (cx, cz) if k == len(xs) else (cx + (xs[k] - cx) * 0.5, cz + (zs[k] - cz) * 0.5)
        i, j = int((x + TX / 2) / TX * 2048), int((z + TZ / 2) / TZ * 2048)
        if 0 <= i < 2048 and 0 <= j < 2048:
            c = px[i, j]
            acc = [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]]; n += 1
    b['c'] = [round(v / max(n, 1)) for v in acc]

json.dump({
    'nom': 'Donzère (26290)',
    'source': 'IGN BD TOPO® et ORTHO® (Licence Ouverte Etalab 2.0), relief AWS Terrain Tiles',
    'taille': [round((LON_MAX - LON_MIN) * MX, 1), round((LAT_MAX - LAT_MIN) * MZ, 1)],
    'relief': {'n': N, 'min': round(hmin, 2), 'data': relief},
    'batiments': batiments, 'routes': routes, 'vegetation': vegetation, 'eau': eau, 'lieux': lieux,
}, open(os.path.join(OUT, 'donzere.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('ok', os.path.getsize(os.path.join(OUT, 'donzere.json')) // 1024, 'Ko')
