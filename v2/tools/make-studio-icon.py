"""Builds the Studio's icon files from the artwork.   python3 v2/tools/make-studio-icon.py path/to/artwork.png
The artwork is a rounded square on a black background. This crops to it, then fills the corners (the black outside the
rounded edge) with the border's own colours so the home-screen icon is a full square (iOS rounds it itself).
Writes: icons/studio-180.png (home screen), studio-512.png, studio-32.png (browser tab, with see-through corners)."""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

src = sys.argv[1] if len(sys.argv) > 1 else None
if not src: sys.exit(__doc__)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
a = np.array(Image.open(src).convert('RGB'))
lit = a.max(axis=2) > 40
ys, xs = np.where(lit)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
side = min(x1 - x0 + 1, y1 - y0 + 1)
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
sx, sy = cx - side // 2, cy - side // 2
a = a[sy:sy + side, sx:sx + side]                       # square crop of just the artwork

# "outside" = the near-black that is connected to the image edge (never the dark parts inside the art)
dark = a.max(axis=2) <= 40
labels, _ = ndimage.label(dark)
edge = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
outside = np.isin(labels, list(edge))
outside = ndimage.binary_dilation(outside, iterations=2)  # also take the anti-aliased fringe

# fill outside with the nearest border colour
idx = ndimage.distance_transform_edt(outside, return_distances=False, return_indices=True)
filled = a[idx[0], idx[1]]
full = Image.fromarray(np.where(outside[..., None], filled, a).astype(np.uint8))   # full-bleed square

os.makedirs(OUT, exist_ok=True)
full.resize((180, 180), Image.LANCZOS).save(os.path.join(OUT, 'studio-180.png'))
full.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'studio-512.png'))
rgba = Image.fromarray(np.dstack([a, np.where(outside, 0, 255).astype(np.uint8)]), 'RGBA')   # see-through corners
rgba.resize((32, 32), Image.LANCZOS).save(os.path.join(OUT, 'studio-32.png'))
print('wrote', sorted(f for f in os.listdir(OUT) if f.startswith('studio')), '| artwork', side, 'px')
