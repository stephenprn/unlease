"""
Drafts the collection emblems, the "Non classé" tray and the label tag (packages/design/src/emblems.ts):
shapes cut from painted paper, after Matisse, on a 100-unit grid. Each outline is a list of points
joined by smooth curves; a 'c' point is a scissor corner, a 'k' point a softened one, and a seeded
jitter keeps every cut a little off true. Prints the paths as JSON and writes a proof sheet:

    python3 tools/emblems/draft_emblems.py proof.svg > emblems.json && rsvg-convert -o proof.png proof.svg
"""
import json, math, random, sys

def fmt(v):
    s = f"{v:.1f}"
    s = s[:-2] if s.endswith('.0') else s
    return '0' if s == '-0' else s

def P(x, y, kind='s', k=1.0):
    """A point: 's' smooth, 'c' a scissor corner, 'k' a soft corner; k scales its handles."""
    return (x, y, kind, k)

def jitter(points, amount, seed):
    """The hand: every point moved a little, the same way on every run."""
    rnd = random.Random(seed)
    return [(x + rnd.uniform(-amount, amount), y + rnd.uniform(-amount, amount), kind, k) for (x, y, kind, k) in points]

def wobble(points, amount, seed, min_len=14):
    """A point pushed off the middle of each long edge: the scissors never run quite straight."""
    rnd = random.Random(seed)
    out = []
    for i, a in enumerate(points):
        b = points[(i + 1) % len(points)]
        out.append(a)
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy)
        if length >= min_len:
            t, off = rnd.uniform(0.4, 0.6), rnd.uniform(-amount, amount)
            out.append((a[0] + dx * t - dy / length * off, a[1] + dy * t + dx / length * off, 's', 1.0))
    return out

def segments(points, tension=1.0):
    """Cubic segments through the points: Catmull-Rom tangents, none at a corner, short at a soft one."""
    n = len(points)
    handles = []
    for i, (x, y, kind, k) in enumerate(points):
        (px, py), (qx, qy) = points[i - 1][:2], points[(i + 1) % n][:2]
        if kind == 'c':
            handles.append(((x, y), (x, y)))
            continue
        tx, ty = (qx - px) / 6 * tension * k, (qy - py) / 6 * tension * k
        if kind == 'k':
            tx, ty = tx * 0.45, ty * 0.45
        # A handle never reaches past a third of its own edge, so a short edge cannot loop.
        lt = math.hypot(tx, ty) or 1
        s_in = min(1, math.hypot(x - px, y - py) / 3 / lt)
        s_out = min(1, math.hypot(qx - x, qy - y) / 3 / lt)
        handles.append(((x - tx * s_in, y - ty * s_in), (x + tx * s_out, y + ty * s_out)))
    return [(points[i][:2], handles[i][1], handles[(i + 1) % n][0], points[(i + 1) % n][:2]) for i in range(n)]

def path(points, tension=1.0, shift=(0, 0)):
    segs = segments(points, tension)
    dx, dy = shift
    pt = lambda p: f"{fmt(p[0] + dx)} {fmt(p[1] + dy)}"
    return f"M{pt(segs[0][0])}" + ''.join(f"C{pt(c1)} {pt(c2)} {pt(b)}" for (_, c1, c2, b) in segs) + 'Z'

def circle(cx, cy, r):
    """A punched hole (even-odd)."""
    return f"M{fmt(cx - r)} {fmt(cy)}A{fmt(r)} {fmt(r)} 0 1 1 {fmt(cx + r)} {fmt(cy)}A{fmt(r)} {fmt(r)} 0 1 1 {fmt(cx - r)} {fmt(cy)}Z"

def polar(cx, cy, r, deg):
    a = math.radians(deg)
    return (cx + r * math.cos(a), cy + r * math.sin(a))

def bounds(points):
    """The outline's box, sampled along its curves."""
    xs, ys = [], []
    for (a, c1, c2, b) in segments(points):
        for i in range(25):
            t = i / 24
            u = 1 - t
            xs.append(u**3 * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t**3 * b[0])
            ys.append(u**3 * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t**3 * b[1])
    return min(xs), min(ys), max(xs), max(ys)

# --- The emblems ------------------------------------------------------------------------------

def feuille():
    # A seaweed frond: a stem and alternating rounded lobes, never mirrored.
    pts = [
        P(45, 97.5, 'k'), P(49.5, 97, 'k'), P(51, 86),
        P(54, 80, 'c'), P(64, 80), P(79, 73), P(71, 66), P(57, 66, 'c'),
        P(71, 59), P(88, 47), P(77, 40), P(59, 46, 'c'),
        P(67, 35), P(76, 22), P(64, 24), P(57, 31, 'c'),
        P(61, 18), P(54, 3), P(46, 14), P(47, 30, 'c'),
        P(37, 26), P(23, 21), P(29, 34), P(45, 41, 'c'),
        P(29, 44), P(11, 52), P(26, 60), P(44, 59, 'c'),
        P(33, 69), P(20, 80), P(37, 81), P(46, 78, 'c'),
        P(46.5, 88),
    ]
    return path(jitter(pts, 0.6, 1))

def etoile():
    # Five uneven arms, one reaching higher: (angle, tip radius, valley radius, valley offset).
    arms = [(-95, 50, 17, 30), (-20, 44, 22, 41), (50, 49, 17, 36), (126, 40, 21, 34), (196, 47, 18, 38)]
    pts = []
    for (a, tip, valley, offset) in arms:
        pts += [P(*polar(50, 54, tip, a), 'c'), P(*polar(50, 54, valley, a + offset), 'k')]
    return path(wobble(pts, 1.6, 4, 16))

def soleil():
    # Eleven flames around a disc, each leaning the same way.
    rnd = random.Random(9)
    pts = []
    for i in range(11):
        a = -90 + i * 360 / 11 + rnd.uniform(-5, 5)
        tip, width = rnd.uniform(43, 49), rnd.uniform(11, 15)
        pts += [P(*polar(50, 51, 30 + rnd.uniform(-1.5, 1.5), a - width)), P(*polar(50, 51, tip, a + 7), 'c')]
    return path(pts)

def fleur():
    # Five petals, no two alike: (angle, length, width).
    rnd = random.Random(21)
    pts = []
    for (a, r, w) in [(-88, 45, 34), (-14, 43, 30), (58, 47, 36), (130, 41, 31), (202, 44, 33)]:
        pts += [
            P(*polar(50, 52, 12 + rnd.uniform(-1, 2), a - w / 2 - 6), 'c'),
            P(*polar(50, 52, r * 0.78, a - w * 0.62)),
            P(*polar(50, 52, r, a + rnd.uniform(-4, 4)), 's', 1.15),
            P(*polar(50, 52, r * 0.8, a + w * 0.6)),
        ]
    return path(pts)

def trefle():
    # Three heart-shaped leaflets on a curving stem.
    pts = [
        P(66, 97, 'k'), P(70, 95, 'k'), P(62, 80), P(55, 64, 'c'),
        P(70, 66), P(86, 62), P(93, 50), P(86, 41, 'c'), P(90, 30), P(80, 24), P(66, 30), P(56, 46, 'c'),
        P(64, 34), P(70, 20), P(64, 9), P(55, 12, 'c'), P(46, 4), P(34, 10), P(34, 24), P(47, 44, 'c'),
        P(32, 34), P(18, 32), P(9, 42), P(14, 52, 'c'), P(8, 62), P(16, 72), P(32, 70), P(50, 57, 'c'),
        P(57, 76), P(63, 95),
    ]
    return path(jitter(pts, 0.5, 2))

def galet():
    # A river stone worn through, its hole off-centre (even-odd).
    stone = [P(50, 10), P(72, 12), P(89, 27), P(95, 50), P(88, 74), P(68, 89), P(42, 91), P(20, 81), P(7, 60), P(10, 36), P(26, 18)]
    hole = [P(58, 36), P(68, 40), P(70, 51), P(62, 58), P(52, 55), P(49, 45)]
    return path(jitter(stone, 1.0, 5)) + path(hole)

def coeur():
    # Lopsided: the left lobe fuller, the point pulled right.
    pts = [P(56, 91, 'c'), P(38, 77), P(17, 59), P(9, 37), P(16, 19), P(32, 12), P(45, 18), P(52, 29, 'c'), P(60, 16), P(75, 11), P(89, 19), P(93, 38), P(86, 60), P(72, 76)]
    return path(jitter(pts, 0.8, 6))

def lune():
    pts = [P(63, 5, 'c'), P(37, 13), P(18, 33), P(13, 57), P(24, 80), P(46, 93), P(70, 93), P(90, 80, 'c'), P(69, 81), P(51, 73), P(41, 55), P(42, 34), P(51, 17)]
    return path(jitter(pts, 0.6, 7))

def goutte():
    # A drop whose tip bends away, like a flame.
    pts = [P(63, 3, 'c'), P(66, 22), P(80, 42), P(86, 62), P(80, 82), P(62, 95), P(40, 95), P(22, 84), P(16, 64), P(24, 42), P(43, 23)]
    return path(jitter(pts, 0.6, 8))

def nuage():
    pts = [P(14, 77, 'k'), P(5, 66), P(9, 53), P(22, 49, 'k'), P(26, 34), P(40, 24), P(55, 26), P(62, 35, 'k'), P(73, 30), P(87, 36), P(95, 51), P(89, 67), P(79, 73, 'k'), P(63, 77), P(46, 73), P(30, 78)]
    return path(jitter(pts, 0.6, 9))

def vague():
    # A wave rising from the left, its crest breaking into three claws of foam.
    pts = [
        P(3, 95, 'k'), P(9, 72), P(24, 51), P(45, 37), P(66, 30), P(84, 33),
        P(96, 44, 'c'), P(85, 43), P(91, 53, 'c'), P(80, 50), P(83, 62, 'c'), P(72, 54), P(64, 62),
        P(65, 76), P(76, 86), P(97, 92, 'k'), P(96, 96, 'k'), P(50, 96), P(10, 98, 'k'),
    ]
    return path(jitter(pts, 0.5, 10))

def poisson():
    # A fish with a forked tail and two fins; its eye is punched through (even-odd).
    pts = [
        P(5, 53, 'k'), P(18, 37), P(36, 29), P(47, 15, 'c'), P(57, 28), P(70, 34), P(80, 45, 'c'),
        P(96, 27, 'c'), P(90, 51, 'c'), P(97, 75, 'c'), P(80, 59, 'c'),
        P(67, 68), P(53, 72), P(46, 84, 'c'), P(40, 73), P(21, 68),
    ]
    return path(jitter(pts, 0.5, 11)) + circle(21, 47, 4)

def oiseau():
    # A swallow: swept wings, a forked tail.
    pts = [
        P(4, 45, 'c'), P(13, 38), P(29, 36), P(72, 5, 'c'), P(53, 37, 'k'), P(66, 44),
        P(97, 30, 'c'), P(81, 52, 'c'), P(95, 71, 'c'), P(64, 58), P(52, 60, 'k'), P(64, 93, 'c'), P(34, 59), P(19, 55),
    ]
    return path(jitter(pts, 0.5, 12))

def arche():
    # An arch on two uneven feet.
    pts = [
        P(13, 95, 'k'), P(14, 64), P(21, 35), P(38, 15), P(59, 11), P(77, 23), P(86, 47), P(88, 94, 'k'),
        P(65, 95, 'k'), P(64, 64), P(58, 46), P(49, 41), P(40, 47), P(36, 66), P(35, 94, 'k'),
    ]
    return path(jitter(pts, 0.6, 13))

def bac():
    # "Non classé": a tray with a loose sheet dropped in it, the sheet's two lines cut out (even-odd).
    sheet = [P(29, 10, 'k'), P(47, 6), P(65, 3, 'k'), P(71, 10, 'k'), P(72, 25), P(75, 39, 'k'), P(68, 46, 'k'), P(51, 47), P(35, 50, 'k'), P(28, 43, 'k'), P(27, 28), P(23, 16, 'k')]
    first = [P(34, 18, 'k'), P(56, 15, 'k'), P(57.5, 19.5, 'k'), P(35, 23, 'k')]
    second = [P(36, 29, 'k'), P(51, 27, 'k'), P(52, 31.5, 'k'), P(37, 33.5, 'k')]
    tray = [P(5, 52, 'k'), P(19, 48), P(31, 48, 'k'), P(37, 59, 'k'), P(50, 60), P(62, 58, 'k'), P(68, 48, 'k'), P(82, 49), P(95, 50, 'k'), P(93, 70), P(90, 87, 'k'), P(82, 94, 'k'), P(50, 92), P(18, 95, 'k'), P(10, 88, 'k'), P(8, 70)]
    return path(jitter(sheet, 0.4, 14)) + path(first) + path(second) + path(jitter(tray, 0.6, 15))

def label_tag():
    """A paper tag, its point blunt and its eyelet punched, its tail snipped like a ribbon end; moved onto its own box."""
    pts = jitter([P(4, 51, 'k'), P(22, 22, 'k'), P(44, 17), P(70, 20), P(97, 18, 'c'), P(84, 49, 'c'), P(98, 80, 'c'), P(66, 83), P(42, 81), P(23, 81, 'k')], 0.5, 33)
    x0, y0, x1, y1 = bounds(pts)
    margin = 1
    shift = (margin - x0, margin - y0)
    box = (math.ceil(x1 - x0 + 2 * margin), math.ceil(y1 - y0 + 2 * margin))
    return path(pts, shift=shift) + circle(25 + shift[0], 50.5 + shift[1], 8), box

EMBLEMS = {name: draw() for name, draw in [
    ('feuille', feuille), ('etoile', etoile), ('soleil', soleil), ('fleur', fleur), ('trefle', trefle), ('galet', galet), ('coeur', coeur),
    ('lune', lune), ('goutte', goutte), ('nuage', nuage), ('vague', vague), ('poisson', poisson), ('oiseau', oiseau), ('arche', arche),
]}
TRAY = bac()
TAG, TAG_BOX = label_tag()
EVEN_ODD = {'galet', 'poisson'}

def proof(out):
    """Every emblem large on a card, then in a row at chip, drawer and footer sizes, then the tag."""
    fills = ['#B77619', '#C2410C', '#BD332C', '#9F2946', '#7B2036', '#8A65AE', '#6B4A8C', '#2F5D8C', '#2F8787', '#2F6B52', '#8A7514', '#956014', '#8C491A', '#7A8A5E']
    names = list(EMBLEMS) + ['bac']
    shape = lambda n: TRAY if n == 'bac' else EMBLEMS[n]
    fill = lambda i, n: '#7A8A5E' if n == 'bac' else fills[i % len(fills)]
    o = ['<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="620"><rect width="1240" height="620" fill="#EDE8D0"/>']
    for i, n in enumerate(names):
        x, y = 20 + (i % 8) * 150, 20 + (i // 8) * 160
        o.append(f'<rect x="{x}" y="{y}" width="136" height="136" rx="26" fill="#F8F5E6"/>')
        o.append(f'<g transform="translate({x + 14},{y + 14}) scale(1.08)"><path d="{shape(n)}" fill="{fill(i, n)}" fill-rule="evenodd"/></g>')
        o.append(f'<text x="{x + 68}" y="{y + 152}" font-family="Helvetica" font-size="12" text-anchor="middle" fill="#6A675D">{n}</text>')
    for row, size in enumerate([30, 24, 20]):
        y = 360 + row * 44
        for i, n in enumerate(names):
            o.append(f'<g transform="translate({20 + i * (size + 14)},{y}) scale({size / 100})"><path d="{shape(n)}" fill="{fill(i, n)}" fill-rule="evenodd"/></g>')
    for j, size in enumerate([80, 28, 20, 14]):
        x = 20 + sum([80, 28, 20, 14][:j]) + j * 24
        o.append(f'<g transform="translate({x},520) scale({size / TAG_BOX[0]})"><path d="{TAG}" fill="#BD332C" fill-rule="evenodd"/></g>')
    o.append('</svg>')
    with open(out, 'w') as handle:
        handle.write(''.join(o))

if __name__ == '__main__':
    proof(sys.argv[1] if len(sys.argv) > 1 else 'proof.svg')
    print(json.dumps({'emblems': EMBLEMS, 'bac': TRAY, 'evenOdd': sorted(EVEN_ODD), 'tag': TAG, 'tagBox': TAG_BOX}, indent=1))
