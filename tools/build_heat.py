"""Bake OpenStreetMap ways + foot routes into compact JS for the Pulse heatmap.

usage: python3 -I build_heat.py <ways.json> <out_dir>
Writes out_dir/streets.js and out_dir/routes.js
"""
import json, math, sys, time, subprocess, pathlib, hashlib

src, out = sys.argv[1], pathlib.Path(sys.argv[2])
LAT0, LNG0, Q = 33.965, -118.535, 1e5
COSLAT = math.cos(math.radians(34.03))
M_PER_DEG = 111320

def dist_m(a, b):
    return math.hypot((a[0] - b[0]) * M_PER_DEG, (a[1] - b[1]) * M_PER_DEG * COSLAT)

def dp(pts, tol):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ax, ay, bx, by = a[1] * COSLAT, a[0], b[1] * COSLAT, b[0]
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    best, idx = -1, 0
    for i in range(1, len(pts) - 1):
        px, py = pts[i][1] * COSLAT, pts[i][0]
        if L == 0:
            d = math.hypot(px - ax, py - ay)
        else:
            t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
            d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
        if d > best:
            best, idx = d, i
    if best > tol:
        return dp(pts[: idx + 1], tol)[:-1] + dp(pts[idx:], tol)
    return [a, b]

BASE = {'footway': .30, 'path': .42, 'cycleway': .45, 'pedestrian': .35, 'track': .38, 'steps': .35,
        'residential': .14, 'living_street': .16, 'unclassified': .16, 'tertiary': .26,
        'secondary': .30, 'primary': .26, 'trunk': .14}
NAMES = [('Marvin Braude', .95), ('Ocean Front Walk', .9), ('The Strand', .85), ('Ballona Creek', .85),
         ('San Vicente', .9), ('Ocean Avenue', .75), ('Montana Avenue', .5), ('Mandeville Canyon', .75),
         ('Westwood Boulevard', .5), ('Charles E Young', .7), ('Bruin Walk', .6), ('Sunset Boulevard', .42),
         ('Wilshire Boulevard', .38), ('Main Street', .45), ('Abbot Kinney', .5), ('Venice Boulevard', .38),
         ('Gayley Avenue', .5), ('Hilgard Avenue', .5), ('Le Conte Avenue', .45), ('Sawtelle', .35),
         ('Palisades Park', .7), ('Barrington Avenue', .3), ('Bundy Drive', .32), ('Overland Avenue', .32),
         ('Culver Boulevard', .5), ('Jefferson Boulevard', .3), ('Pacific Avenue', .4), ('Admiralty Way', .45),
         ('Via Marina', .45), ('Beethoven Street', .3), ('Motor Avenue', .4), ('Kenter Avenue', .55)]
HOT = [((34.0700, -118.4440), 700, .45),   # UCLA
       ((34.0716, -118.4467), 300, .5),    # Drake
       ((34.0094, -118.4973), 900, .45),   # SM pier
       ((33.9870, -118.4740), 900, .4),    # Venice beach
       ((34.0165, -118.4720), 350, .45),   # SMC
       ((34.0190, -118.3420), 450, .5),    # Rancho Cienega
       ((34.0183, -118.3825), 350, .6),    # Culver City stairs
       ((34.0108, -118.3958), 300, .35),   # Culver High
       ((34.0045, -118.4344), 300, .35),   # Venice High
       ((34.0430, -118.4556), 300, .3),    # Uni High
       ((34.0627, -118.4470), 500, .3),    # Westwood Village
       ((34.0300, -118.4050), 400, .25)]   # Palms Park
SKIP_FOOT = {'sidewalk', 'crossing', 'traffic_island', 'access_aisle', 'link'}

def noise(i):
    return (int(hashlib.md5(str(i).encode()).hexdigest()[:4], 16) / 65535 - .5) * .12

d = json.load(open(src))
ways = []
for e in d['elements']:
    t = e.get('tags', {})
    hw = t.get('highway')
    if hw not in BASE or 'geometry' not in e:
        continue
    if hw == 'footway' and t.get('footway') in SKIP_FOOT:
        continue
    if t.get('access') in ('private', 'no'):
        continue
    pts = [(g['lat'], g['lon']) for g in e['geometry']]
    length = sum(dist_m(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
    name = t.get('name', '')
    if length < (25 if hw in ('path', 'cycleway', 'track', 'steps') else 45) and not name:
        continue
    w = BASE[hw]
    for key, val in NAMES:
        if key.lower() in name.lower():
            w = max(w, val)
    mid = pts[len(pts) // 2]
    for (c, sigma, amp) in HOT:
        dd = dist_m(mid, c)
        w += amp * math.exp(-dd * dd / (2 * sigma * sigma))
    w += noise(e['id'])
    w = max(.06, min(1, w))
    simp = dp(pts, 0.000035)
    ways.append((w, simp))

# ---- foot routes (real paths) ----
def route(wps, loop_back=False):
    seq = wps + (wps[-2::-1] if loop_back else [])
    coords = ';'.join(f'{lng},{lat}' for lat, lng in seq)
    url = f'https://routing.openstreetmap.de/routed-foot/route/v1/foot/{coords}?overview=full&geometries=geojson'
    for attempt in range(4):
        try:
            raw = subprocess.run(['curl', '-s', '-m', '40', '-A', 'demo-map-builder/1.0', url], capture_output=True, check=True).stdout
            j = json.loads(raw)
            g = j['routes'][0]['geometry']['coordinates']
            pts = [(round(la, 5), round(ln, 5)) for ln, la in g]
            return dp(pts, 0.00002), j['routes'][0]['distance']
        except Exception as ex:
            print('retry', attempt, ex)
            time.sleep(2 + attempt * 2)
    raise SystemExit('routing failed')

ROUTES = {
    'c1': ([(34.0627, -118.4470), (34.0662, -118.4452), (34.0722, -118.4452), (34.0758, -118.4412), (34.0728, -118.4382), (34.0662, -118.4410), (34.0627, -118.4470)], False),
    'c4': ([(34.0094, -118.4973), (33.9945, -118.4812), (33.9850, -118.4730)], True),
    'c6': ([(34.0300, -118.4050), (34.0262, -118.3995), (34.0205, -118.4085), (34.0245, -118.4140), (34.0300, -118.4050)], False),
    'c7': ([(34.0722, -118.4932), (34.0830, -118.4960), (34.0925, -118.4985)], True),
    'r1': ([(34.0688, -118.4520), (34.0752, -118.4512), (34.0765, -118.4405), (34.0705, -118.4392), (34.0640, -118.4420), (34.0688, -118.4520)], False),
    'r2': ([(34.0318, -118.5110), (34.0445, -118.4960), (34.0540, -118.4800), (34.0592, -118.4690)], True),
    'r3': ([(34.0094, -118.4973), (33.9945, -118.4812), (33.9850, -118.4730), (33.9775, -118.4680)], False),
    'r4': ([(34.0172, -118.3932), (34.0060, -118.4120), (33.9925, -118.4330), (33.9800, -118.4500)], False),
    'r5': ([(34.0205, -118.3790), (34.0183, -118.3825), (34.0165, -118.3855), (34.0183, -118.3825), (34.0205, -118.3790)], False),
}
routes_out = {}
for k, (wps, back) in ROUTES.items():
    pts, meters = route(wps, back)
    routes_out[k] = {'pts': pts, 'mi': round(meters / 1609.34, 2)}
    ways.append((.95 if k.startswith('r') else .8, pts))  # routes glow hottest
    print(k, len(pts), 'pts', routes_out[k]['mi'], 'mi')
    time.sleep(1)

# ---- encode ----
ways.sort(key=lambda x: x[0])
enc = []
npts = 0
for w, pts in ways:
    q = [(round((la - LAT0) * Q), round((ln - LNG0) * Q)) for la, ln in pts]
    row = [round(w * 100), q[0][0], q[0][1]]
    for i in range(1, len(q)):
        row += [q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]]
    enc.append(row)
    npts += len(q)
out.mkdir(parents=True, exist_ok=True)
(out / 'streets.js').write_text(
    '/* Westside LA streets, paths and trails from OpenStreetMap (© OpenStreetMap contributors, ODbL),\n'
    '   simplified, with a baked popularity weight (0-100). Format per way: [weight, lat0, lng0, dLat, dLng, ...]\n'
    '   in 1e-5 degree steps from the origin. Generated by tools/build_heat.py. */\n'
    f'const STREETS = {{ o: [{LAT0}, {LNG0}], q: {Q:g}, w: ' + json.dumps(enc, separators=(',', ':')) + ' };\n')
(out / 'routes.js').write_text(
    '/* Run routes along real paths (OSRM foot routing over OpenStreetMap data). Generated by tools/build_heat.py. */\n'
    'const ROUTE_GEO = ' + json.dumps(routes_out, separators=(',', ':')) + ';\n')
print('ways', len(enc), 'points', npts, 'streets.js bytes', (out / 'streets.js').stat().st_size)
