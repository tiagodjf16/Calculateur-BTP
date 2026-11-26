"""Prépare les textures de sol du jeu à partir de matériaux libres Poly Haven (CC0)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import cc0

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'textures')
os.makedirs(OUT, exist_ok=True)
# grain du sol : détail neutre (moyenne 0,5) qui module la photo aérienne vue de près
g = np.asarray(Image.open(cc0.texture('leafy_grass', 'Diffuse', '1k')).convert('L').resize((512, 512), Image.LANCZOS), np.float32)
g = (g - g.mean()) / g.std() * 34 + 128
Image.fromarray(np.clip(g, 0, 255).astype(np.uint8), 'L').convert('RGB').save(os.path.join(OUT, 'grain_sol.jpg'), quality=86)
# enrobé des routes
Image.open(cc0.texture('asphalt_02', 'Diffuse', '1k')).convert('RGB').save(os.path.join(OUT, 'enrobe.jpg'), quality=84)
Image.open(cc0.texture('asphalt_02', 'nor_gl', '1k')).convert('RGB').resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'enrobe_n.jpg'), quality=88)
print({f: os.path.getsize(os.path.join(OUT, f)) // 1024 for f in os.listdir(OUT)})
