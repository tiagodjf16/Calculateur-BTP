"""Relief du jeu d'après le relevé laser de l'IGN (MNT LiDAR HD) : remplace la grille d'altitudes de data/donzere.json.
Chaque nœud de la grille (un tous les 8,7 m) prend l'altitude moyenne du sol nu autour de lui.
Usage : python3 outils/lidar.py   puis   python3 outils/relief.py
"""
import base64, json, os
import numpy as np

R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
f = os.path.join(R, 'data', 'donzere.json')
D = json.load(open(f))
mnt = np.load(os.path.join(R, '.cache', 'lidar', 'mnt.npy')).astype(np.float64)
H, W = mnt.shape
n = D['relief']['n']
rayon = max(1, int(round(W / (n - 1) / 2)))                       # demi-maille, en pixels du relevé
# moyenne glissante (image intégrale)
I = np.zeros((H + 1, W + 1))
I[1:, 1:] = mnt.cumsum(0).cumsum(1)
alt = np.zeros((n, n))
for j in range(n):
    cj = int(round(j * (H - 1) / (n - 1)))
    j0, j1 = max(0, cj - rayon), min(H, cj + rayon + 1)
    for i in range(n):
        ci = int(round(i * (W - 1) / (n - 1)))
        i0, i1 = max(0, ci - rayon), min(W, ci + rayon + 1)
        alt[j, i] = (I[j1, i1] - I[j0, i1] - I[j1, i0] + I[j0, i0]) / ((j1 - j0) * (i1 - i0))
ancien = np.frombuffer(base64.b64decode(D['relief']['data']), '<u2').reshape(n, n) / 100 + D['relief']['min']
bas = float(np.floor(alt.min() * 100) / 100)
D['relief'] = dict(n=n, min=bas, data=base64.b64encode(np.round((alt - bas) * 100).astype('<u2').tobytes()).decode(), source='IGN LiDAR HD (MNT)')
json.dump(D, open(f, 'w'), ensure_ascii=False, separators=(',', ':'))
ec = alt - ancien
print('relief : %.1f à %.1f m | écart avec l\'ancien : moyen %.2f m, type %.2f m, max %.1f m' % (alt.min(), alt.max(), ec.mean(), ec.std(), np.abs(ec).max()))
