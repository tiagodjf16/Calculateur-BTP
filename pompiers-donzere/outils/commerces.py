"""Commerces et services réels de Donzère d'après l'annuaire officiel des entreprises (base Sirene, API Recherche d'entreprises).

Produit data/commerces.json : [{ nom, type, x, z, adresse }]. Les noms de personnes (entrepreneurs individuels sans enseigne)
ne sont jamais repris : on affiche alors seulement le métier (« Boulangerie », « Coiffure »…).
"""
import json, math, os, time, urllib.request, urllib.parse

ICI = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(ICI, '..', '.cache')
D = json.load(open(os.path.join(ICI, '..', 'data', 'donzere.json')))
LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = 44.4265, 44.4465, 4.7000, 4.7280
LAT0, LON0 = (LAT_MIN + LAT_MAX) / 2, (LON_MIN + LON_MAX) / 2
MX, MZ = math.cos(math.radians(LAT0)) * 111320.0, 110574.0

# code NAF -> (type, libellé d'enseigne générique, vitrine obligatoire même sans enseigne)
NAF = {
    '47.11B': ('alimentation', 'Alimentation', 1), '47.11C': ('alimentation', 'Supérette', 1), '47.11D': ('supermarche', 'Supermarché', 1), '47.11F': ('supermarche', 'Hypermarché', 1),
    '47.21Z': ('alimentation', 'Primeur', 1), '47.22Z': ('boucherie', 'Boucherie', 1), '47.23Z': ('alimentation', 'Poissonnerie', 1), '47.24Z': ('boulangerie', 'Boulangerie', 1),
    '10.71C': ('boulangerie', 'Boulangerie Pâtisserie', 1), '10.71D': ('boulangerie', 'Pâtisserie', 1), '10.13B': ('boucherie', 'Charcuterie', 1), '47.25Z': ('alimentation', 'Cave', 1),
    '47.26Z': ('tabac', 'Tabac Presse', 1), '47.29Z': ('alimentation', 'Épicerie fine', 0), '47.30Z': ('station', 'Station-service', 1), '47.41Z': ('boutique', 'Informatique', 0),
    '47.51Z': ('boutique', 'Mercerie', 0), '47.52A': ('boutique', 'Quincaillerie', 1), '47.52B': ('bricolage', 'Bricolage', 1), '47.54Z': ('boutique', 'Électroménager', 0),
    '47.59A': ('boutique', 'Meubles', 0), '47.61Z': ('boutique', 'Librairie', 1), '47.62Z': ('tabac', 'Presse', 1), '47.64Z': ('boutique', 'Sport', 0), '47.71Z': ('boutique', 'Prêt-à-porter', 0),
    '47.72A': ('boutique', 'Chaussures', 0), '47.73Z': ('pharmacie', 'Pharmacie', 1), '47.75Z': ('boutique', 'Parfumerie', 0), '47.76Z': ('fleuriste', 'Fleuriste', 1),
    '47.77Z': ('boutique', 'Bijouterie', 0), '47.78A': ('boutique', 'Opticien', 1), '56.10A': ('restaurant', 'Restaurant', 1), '56.10C': ('restaurant', 'Restauration rapide', 0),
    '56.30Z': ('bar', 'Bar', 1), '55.10Z': ('hotel', 'Hôtel', 1), '96.02A': ('coiffure', 'Coiffure', 0), '96.02B': ('coiffure', 'Institut de beauté', 0),
    '45.20A': ('garage', 'Garage', 0), '45.11Z': ('garage', 'Automobiles', 0), '64.19Z': ('banque', 'Banque', 1), '53.10Z': ('poste', 'La Poste', 1),
    '86.21Z': ('sante', 'Cabinet médical', 0), '86.23Z': ('sante', 'Cabinet dentaire', 0), '75.00Z': ('sante', 'Vétérinaire', 0), '68.31Z': ('boutique', 'Agence immobilière', 0),
    '66.22Z': ('banque', 'Assurances', 0), '96.01B': ('boutique', 'Pressing', 1), '96.03Z': ('boutique', 'Pompes funèbres', 1),
}
UA = {'User-Agent': 'jeu-pompiers-donzere/1.0'}


def pages(section):
    res, page = [], 1
    while True:
        f = os.path.join(CACHE, f'sirene_{section}_{page}.json')
        if not os.path.exists(f):
            q = urllib.parse.urlencode({'code_commune': '26116', 'section_activite_principale': section, 'etat_administratif': 'A', 'per_page': 25, 'page': page})
            for essai in range(8):
                try:
                    data = urllib.request.urlopen(urllib.request.Request('https://recherche-entreprises.api.gouv.fr/search?' + q, headers=UA), timeout=60).read()
                    json.loads(data)
                    break
                except Exception as e:
                    print('  nouvel essai', section, page, repr(e)[:80])
                    time.sleep(3 + 3 * essai)
            else:
                raise RuntimeError('API indisponible')
            open(f, 'wb').write(data)
            time.sleep(1.0)
        d = json.load(open(f))
        res += d['results']
        if page >= d.get('total_pages', 1):
            return res
        page += 1


def dans(poly, x, z):
    ok = False
    for i in range(0, len(poly), 2):
        j = (i - 2) % len(poly)
        xi, zi, xj, zj = poly[i], poly[i + 1], poly[j], poly[j + 1]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            ok = not ok
    return ok


vus, commerces = set(), []
for section in 'GICKQS':
    for r in pages(section):
        individuel = str(r.get('nature_juridique', '')) == '1000'
        for e in r.get('matching_etablissements', []):
            naf = e.get('activite_principale')
            if naf not in NAF or e.get('etat_administratif') != 'A' or e.get('commune') != '26116' or e['siret'] in vus:
                continue
            if not e.get('latitude') or not e.get('longitude'):
                continue
            typ, generique, vitrine = NAF[naf]
            enseignes = [s for s in (e.get('liste_enseignes') or []) if s and len(s) > 2]
            commercial = e.get('nom_commercial')
            if enseignes or commercial:
                nom = (enseignes[0] if enseignes else commercial).strip()
            elif individuel:
                if not vitrine:
                    continue                      # ex. coiffeur à domicile : pas de boutique
                nom = generique
            else:
                nom = (r.get('sigle') or r.get('nom_raison_sociale') or generique).strip()
                if len(nom) > 26 or not vitrine and not enseignes:
                    nom = generique if vitrine else nom
            x = (float(e['longitude']) - LON0) * MX
            z = -(float(e['latitude']) - LAT0) * MZ
            if abs(x) > D['taille'][0] / 2 - 20 or abs(z) > D['taille'][1] / 2 - 20:
                continue
            vus.add(e['siret'])
            commerces.append({'nom': nom.title() if nom.isupper() else nom, 'type': typ, 'metier': generique, 'x': round(x, 1), 'z': round(z, 1),
                              'adresse': (e.get('adresse') or '').replace(' 26290 DONZERE', '').title()})
# rattachement au bâtiment réel le plus proche (à moins de 30 m)
for c in commerces:
    meilleur, md = -1, 30.0
    for i, b in enumerate(D['batiments']):
        p = b['p']
        cx, cz = sum(p[0::2]) / (len(p) / 2), sum(p[1::2]) / (len(p) / 2)
        d = 0.0 if dans(p, c['x'], c['z']) else math.hypot(cx - c['x'], cz - c['z'])
        if d < md:
            md, meilleur = d, i
    c['bat'] = meilleur
commerces = [c for c in commerces if c['bat'] >= 0]
# les artisans installés à domicile n'ont pas de boutique : on ne garde garages, boutiques et coiffeurs que sur les rues commerçantes
import re
RUES = re.compile(r'BOURGADE|CHAMP DE MARS|GRANDE RUE|JEAN MOULIN|CENTRE COMMERCIAL|RN ?7|ZI |PLACE|COURS|ENCLOS', re.I)
commerces = [c for c in commerces if c['type'] not in ('garage', 'boutique', 'coiffure', 'sante') or RUES.search(c['adresse'])]
json.dump(commerces, open(os.path.join(ICI, '..', 'data', 'commerces.json'), 'w'), ensure_ascii=False, indent=0)
print(len(commerces), 'commerces et services rattachés à un bâtiment')
import collections
print(collections.Counter(c['type'] for c in commerces).most_common())
for c in sorted(commerces, key=lambda c: c['type']):
    print(f"  {c['type']:12s} {c['nom'][:34]:34s} {c['adresse'][:40]}")
