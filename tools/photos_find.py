"""Find openly licensed Wikimedia Commons photos for Pulse places.
usage: python3 -I photos_find.py <out_dir>
Writes candidates.json and downloads small preview thumbs + a contact sheet HTML.
"""
import json, subprocess, sys, pathlib, urllib.parse, re, time

out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
UA = 'pulse-demo-photo-finder/1.0 (student case-competition prototype)'
API = 'https://commons.wikimedia.org/w/api.php'
OK = re.compile(r'^(CC BY(-SA)? [0-9.]+|CC0|Public domain|PD|CC BY-SA [0-9.]+ .*|CC BY [0-9.]+ .*)', re.I)

PLACES = {
    't1': ['Drake Stadium UCLA', 'Drake Stadium track UCLA'],
    't2': ['Corsair Field Santa Monica College', 'Santa Monica College stadium'],
    't3': ['Venice High School Los Angeles'],
    't4': ['University High School Los Angeles'],
    't5': ['Culver City High School'],
    't6': ['Rancho Cienega Park', 'Rancho Cienega sports complex'],
    'westwood': ['Westwood Village Los Angeles', 'Westwood Boulevard Village'],
    'pier': ['Santa Monica Pier', 'Santa Monica Pier sunset'],
    'venice': ['Venice Beach boardwalk', 'Ocean Front Walk Venice'],
    'ballona': ['Ballona Creek bike path', 'Ballona Creek'],
    'overlook': ['Baldwin Hills Scenic Overlook stairs', 'Baldwin Hills Scenic Overlook'],
    'sanvicente': ['San Vicente Boulevard Brentwood coral trees', 'San Vicente Boulevard Santa Monica'],
    'ucla': ['UCLA Royce Hall', 'UCLA campus Janss Steps'],
    'mandeville': ['Mandeville Canyon'],
    'palms': ['Palms Park Los Angeles', 'Palms Los Angeles'],
}

def get(params):
    url = API + '?' + urllib.parse.urlencode({**params, 'format': 'json', 'formatversion': 2})
    for attempt in range(5):
        raw = subprocess.run(['curl', '-s', '-m', '40', '-A', UA, url], capture_output=True).stdout
        try:
            return json.loads(raw or b'{}')
        except ValueError:
            time.sleep(3 + attempt * 3)  # rate limited: back off and retry
    return {}

def strip(html):
    return re.sub(r'<[^>]+>', '', html or '').strip()

res = {}
for key, queries in PLACES.items():
    seen, cands = set(), []
    for q in queries:
        d = get({'action': 'query', 'generator': 'search', 'gsrsearch': f'{q} filetype:bitmap', 'gsrnamespace': 6, 'gsrlimit': 8,
                 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size|mime', 'iiurlwidth': 1000})
        for p in sorted(d.get('query', {}).get('pages', []), key=lambda p: p.get('index', 99)):
            t = p['title']
            if t in seen or 'imageinfo' not in p:
                continue
            seen.add(t)
            ii = p['imageinfo'][0]
            if ii.get('mime') not in ('image/jpeg', 'image/png') or ii.get('width', 0) < 800:
                continue
            md = ii.get('extmetadata', {})
            lic = strip(md.get('LicenseShortName', {}).get('value'))
            if not OK.match(lic):
                continue
            cands.append({'title': t, 'thumb': ii.get('thumburl'), 'page': ii.get('descriptionurl'), 'license': lic,
                          'licenseUrl': strip(md.get('LicenseUrl', {}).get('value')),
                          'artist': strip(md.get('Artist', {}).get('value'))[:80],
                          'desc': strip(md.get('ImageDescription', {}).get('value'))[:140], 'w': ii.get('width'), 'h': ii.get('height')})
        time.sleep(1.5)
    res[key] = cands[:6]
    print(key, len(cands))

(out / 'candidates.json').write_text(json.dumps(res, indent=1))
# contact sheet using hotlinked 1000px thumbs (preview only)
rows = []
for key, cs in res.items():
    cells = ''.join(f'<figure><img src="{c["thumb"]}" loading="lazy"><figcaption><b>{key}#{i}</b> {c["title"][5:60]}<br>{c["license"]} · {c["artist"][:40]}</figcaption></figure>' for i, c in enumerate(cs))
    rows.append(f'<h2>{key}</h2><div class="g">{cells}</div>')
(out / 'sheet.html').write_text('<meta charset="utf-8"><style>body{font:12px system-ui;background:#111;color:#eee;margin:8px}h2{margin:10px 0 4px;font-size:15px}.g{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}figure{margin:0}img{width:100%;height:110px;object-fit:cover;display:block}figcaption{font-size:10px;line-height:1.25;color:#bbb}</style>' + ''.join(rows))
print('done')
