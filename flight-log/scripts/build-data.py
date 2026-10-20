"""Build compact airport + airline datasets for SkyLog.
Sources: OurAirports (public domain), mwgg/Airports (MIT, for IANA time zones), OpenFlights airlines (ODbL)."""
import csv, json, math, sys, os
src = sys.argv[1]; out = sys.argv[2]
mw = json.load(open(os.path.join(src, 'mwgg.json')))
tz_by = {}
pts = []
for k, a in mw.items():
    if a.get('tz'):
        tz_by[a['icao']] = a['tz']
        pts.append((a['lat'], a['lon'], a['tz']))
# grid index for nearest tz fallback
grid = {}
for la, lo, tz in pts:
    grid.setdefault((int(la // 2), int(lo // 2)), []).append((la, lo, tz))
def nearest_tz(la, lo):
    best = None
    for r in range(0, 6):
        for i in range(-r, r + 1):
            for j in range(-r, r + 1):
                for p in grid.get((int(la // 2) + i, int(lo // 2) + j), []):
                    d = (p[0] - la) ** 2 + ((p[1] - lo) * math.cos(math.radians(la))) ** 2
                    if best is None or d < best[0]: best = (d, p[2])
        if best: return best[1]
    return 'UTC'
core, ext = [], []
seen_iata = set()
for r in csv.DictReader(open(os.path.join(src, 'oa.csv'), encoding='utf-8')):
    t = r['type']
    if t in ('closed', 'heliport', 'balloonport', 'seaplane_base'): continue
    ident = (r['icao_code'] or r['gps_code'] or r['ident']).strip().upper()
    iata = r['iata_code'].strip().upper()
    if len(iata) != 3: iata = ''
    la, lo = float(r['latitude_deg']), float(r['longitude_deg'])
    tz = tz_by.get(ident) or tz_by.get(r['ident']) or nearest_tz(la, lo)
    size = {'large_airport': 'L', 'medium_airport': 'M'}.get(t, 'S')
    elev = int(float(r['elevation_ft'])) if r['elevation_ft'] else None
    rec = [ident, iata, r['name'].strip(), r['municipality'].strip(), r['iso_country'], round(la, 4), round(lo, 4), elev, tz, size, r['continent'], 1 if r['scheduled_service'] == 'yes' else 0]
    if size in ('L', 'M') or iata:
        core.append(rec)
    elif len(ident) == 4 and ident.isalpha():
        ext.append(rec)
json.dump(core, open(os.path.join(out, 'airports.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
json.dump(ext, open(os.path.join(out, 'airports-ext.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
# airlines
al = []
for row in csv.reader(open(os.path.join(src, 'airlines.dat'), encoding='utf-8')):
    _, name, alias, iata, icao, callsign, country, active = row
    clean = lambda v: '' if v in ('\\N', '-', 'N/A') else v.strip()
    iata, icao = clean(iata), clean(icao)
    if active != 'Y' or len(icao) != 3 or not icao.isalpha(): continue
    al.append([icao.upper(), iata.upper() if len(iata) == 2 else '', name.strip(), clean(callsign), clean(country)])
json.dump(al, open(os.path.join(out, 'airlines.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
print(len(core), len(ext), len(al))
