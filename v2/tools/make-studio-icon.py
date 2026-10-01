"""Draws the Studio's home-screen icon as 36x36 pixel art and writes crisp PNGs.  python3 v2/tools/make-studio-icon.py
36 divides 180 exactly (5px per pixel), which is the size iOS uses for the home screen, so that one is razor sharp."""
from PIL import Image
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
N = 36
C = dict(ink='#1b1330', bgTop='#ff9a3c', bgMid='#ff6f4e', bgBot='#e83f7a', dither='#ff845a', dither2='#f4565f',
         panel='#f6f1ff', panel2='#d9cff5', heart='#e43b44', heartHi='#ffd0d4', wood='#f2c48d', woodDk='#d9a066', lead='#3a3358',
         body='#ffd93d', bodyDk='#f0a91b', bodyHi='#fff3a8', metal='#c9d3e0', metalDk='#8a96aa', rub='#ff8fa3', rubDk='#e2607a', spark='#fff3a8')
px = [[None] * N for _ in range(N)]
def put(x, y, c):
    if 0 <= x < N and 0 <= y < N: px[y][x] = C.get(c, c)

# background: three bands with a checker dither where they meet
for y in range(N):
    band = 'bgTop' if y < 11 else 'bgMid' if y < 24 else 'bgBot'
    for x in range(N): put(x, y, band)
for y, (a, b) in {10: ('bgTop', 'dither'), 11: ('dither', 'bgMid'), 23: ('bgMid', 'dither2'), 24: ('dither2', 'bgBot')}.items():
    for x in range(N): put(x, y, a if (x + y) % 2 else b)

# the canvas: a checkerboard panel (transparent-pixel look) with an ink outline
PX0, PY0, PW = 4, 11, 20
for y in range(PY0 - 1, PY0 + PW + 1):
    for x in range(PX0 - 1, PX0 + PW + 1): put(x, y, 'ink')
for y in range(PY0, PY0 + PW):
    for x in range(PX0, PX0 + PW): put(x, y, 'panel' if ((x - PX0) // 2 + (y - PY0) // 2) % 2 == 0 else 'panel2')
# a pixel heart on it
HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...']
for j, row in enumerate(HEART):
    for i, ch in enumerate(row):
        if ch == 'X': put(PX0 + 4 + i * 1 + 0, PY0 + 5 + j, 'heart')
for (i, j) in [(1, 0), (0, 1), (1, 1)]: put(PX0 + 4 + i, PY0 + 5 + j, 'heartHi')

# the pencil: a solid diagonal stripe. For a pixel at (dx, dy) from the tip, A = dx - dy runs along the pencil and
# B = dx + dy runs across it, so a colour band is just a range of A and a shading lane is a range of B.
TX, TY, A_MAX, BW = 15, 26, 35, 4
pen = {}
def band(a):
    return ('lead' if a < 3 else 'wood' if a < 9 else 'body' if a < 27 else 'metal' if a < 30 else 'rub')
for y in range(N):
    for x in range(N):
        dx, dy = x - TX, y - TY; a, b = dx - dy, dx + dy
        if a < 0 or a >= A_MAX or abs(b) > min(BW, a): continue   # min(BW, a): the point tapers
        k = band(a)
        if k == 'lead': c = 'lead'
        elif k == 'wood': c = 'woodDk' if abs(b) >= 3 else 'wood'
        elif k == 'body': c = 'bodyDk' if abs(b) >= 3 else 'bodyHi' if -1 <= b <= 0 else 'body'
        elif k == 'metal': c = 'metalDk' if abs(b) >= 3 else 'metal'
        else: c = 'rubDk' if abs(b) >= 3 else 'rub'
        if k == 'metal' and a % 2 == 0 and abs(b) < 3: c = 'metalDk'   # ridges on the ferrule
        pen[(x, y)] = c
for (x, y), c in pen.items(): put(x, y, c)
# ink outline around the pencil
for (x, y) in list(pen):
    for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
        if (x + dx, y + dy) not in pen and 0 <= x + dx < N and 0 <= y + dy < N: put(x + dx, y + dy, 'ink')

# sparkles
for (sx, sy) in [(6, 5), (30, 27), (27, 4)]:
    for dx, dy in [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)]: put(sx + dx, sy + dy, 'spark')

img = Image.new('RGB', (N, N))
for y in range(N):
    for x in range(N): img.putpixel((x, y), tuple(int(px[y][x][i:i + 2], 16) for i in (1, 3, 5)))
os.makedirs(OUT, exist_ok=True)
img.resize((180, 180), Image.NEAREST).save(os.path.join(OUT, 'studio-180.png'))               # apple-touch-icon (exact 5x)
img.resize((N * 14, N * 14), Image.NEAREST).resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'studio-512.png'))
img.resize((32, 32), Image.LANCZOS).save(os.path.join(OUT, 'studio-32.png'))                # browser tab
print('wrote', sorted(os.listdir(OUT)))
