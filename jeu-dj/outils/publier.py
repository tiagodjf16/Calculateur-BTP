#!/usr/bin/env python3
"""Prépare le dossier publication/ : uniquement les fichiers que la page charge (à publier tel quel)."""
import pathlib
import shutil

RACINE = pathlib.Path(__file__).resolve().parent.parent
SORTIE = RACINE / 'publication'
shutil.rmtree(SORTIE, ignore_errors=True)
fichiers = ['index.html', 'style.css', 'vendor/three.module.min.js'] + sorted(str(p.relative_to(RACINE)) for p in (RACINE / 'js').rglob('*.js'))
total = 0
for f in fichiers:
    (SORTIE / f).parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(RACINE / f, SORTIE / f)
    total += (SORTIE / f).stat().st_size
shutil.copy2(RACINE / 'vendor' / 'LICENSE', SORTIE / 'vendor' / 'licence-three.txt')
print(f'{len(fichiers) + 1} fichiers, {total / 1024:.0f} Ko dans {SORTIE}')
for f in fichiers + ['vendor/licence-three.txt']:
    print(' ', f)
