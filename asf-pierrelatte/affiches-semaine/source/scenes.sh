#!/bin/bash
# Scènes de fond des affiches v4 : 3 formats x domicile / extérieur.
O=/tmp/claude-0/-home-user-Calculateur-BTP/291990b4-76f7-5681-9dee-a94b37165096/scratchpad/affiches/directions/outils
D=/tmp/claude-0/-home-user-Calculateur-BTP/291990b4-76f7-5681-9dee-a94b37165096/scratchpad/affiches/v4
DOM='{"dist":0.85,"haut":0.15,"lacet":-0.22,"taille":0.42,"tribG":1.7,"expo":1.6,"ouv":0.004}'
EXT='{"dist":0.85,"haut":0.15,"lacet":0.38,"taille":0.42,"tribG":1.7,"expo":1.6,"ouv":0.004}'
# format : largeur hauteur cx cy rayon
for f in "fb 1080 2160 840 610 165" "story 1080 1920 845 566 150" "insta 1080 1350 870 330 118"; do
  set -- $f
  z=$(python3 -c "print(round($6/(0.42*0.85/((0.85**2-0.11**2)**0.5)),1))")
  python3 $O/scene.py $D scene-$1-dom $2 $3 $4 $5 $z "$DOM"
  python3 $O/scene.py $D scene-$1-ext $2 $3 $4 $5 $z "$EXT"
done
