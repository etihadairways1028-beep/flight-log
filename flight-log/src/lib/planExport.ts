// Export a stored flight plan as simulator flight-plan files.
//   • MSFS 2020 / 2024: .PLN (AceXML)  — load via World Map → Load/Save.
//   • X-Plane 11 / 12:  .fms (v1100)    — copy into "Output/FMS plans" and load in the FMC.
import type { Flight, PlanFix } from './types';

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));

function dms(v: number, pos: string, neg: string) {
  const a = Math.abs(v), d = Math.floor(a), mFloat = (a - d) * 60, m = Math.floor(mFloat), sec = (mFloat - m) * 60;
  return `${v >= 0 ? pos : neg}${d}° ${m}' ${sec.toFixed(2)}"`;
}
const lla = (lat: number, lon: number, altFt: number | null) => `${dms(lat, 'N', 'S')},${dms(lon, 'E', 'W')},${(altFt ?? 0) >= 0 ? '+' : '-'}${String(Math.abs(altFt ?? 0).toFixed(2)).padStart(9, '0')}`;

const enroute = (f: Flight): PlanFix[] =>
  (f.flightPlan?.fixes ?? []).filter((x) => x.type !== 'toc' && x.type !== 'tod' && x.ident !== f.dep?.ident && x.ident !== f.arr?.ident && !/^RW\d/.test(x.ident));

const wpType = (t: string) => (t === 'vor' ? 'VOR' : t === 'ndb' ? 'NDB' : t === 'apt' ? 'Airport' : t === 'ltlg' ? 'User' : 'Intersection');

function rwyParts(r: string) {
  const m = r.replace(/^RW/i, '').match(/^(\d{1,2})([LRC]?)$/i);
  if (!m) return null;
  return { num: String(Number(m[1])), des: { L: 'LEFT', R: 'RIGHT', C: 'CENTER' }[m[2].toUpperCase() as 'L' | 'R' | 'C'] ?? 'NONE' };
}

export function toMsfsPln(f: Flight): string {
  const fp = f.flightPlan!;
  const dep = f.dep!, arr = f.arr!;
  const cruise = fp.initialAltFt ?? f.cruiseAltitudeFt ?? 35000;
  const dr = rwyParts(fp.depBrief?.runway ?? ''), ar = rwyParts(fp.arrBrief?.runway ?? '');
  const fixes = enroute(f);
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>', '<SimBase.Document Type="AceXML" version="1,0">', '  <Descr>AceXML Document</Descr>', '  <FlightPlan.FlightPlan>');
  lines.push(`    <Title>${esc(dep.ident)} to ${esc(arr.ident)}</Title>`, '    <FPType>IFR</FPType>', `    <RouteType>${cruise >= 18000 ? 'HighAlt' : 'LowAlt'}</RouteType>`, `    <CruisingAlt>${Math.round(cruise)}</CruisingAlt>`);
  lines.push(`    <DepartureID>${esc(dep.ident)}</DepartureID>`, `    <DepartureLLA>${lla(dep.lat!, dep.lon!, fp.depBrief?.elevationFt ?? 0)}</DepartureLLA>`);
  lines.push(`    <DestinationID>${esc(arr.ident)}</DestinationID>`, `    <DestinationLLA>${lla(arr.lat!, arr.lon!, fp.arrBrief?.elevationFt ?? 0)}</DestinationLLA>`);
  lines.push(`    <Descr>${esc(dep.ident)}, ${esc(arr.ident)} created by Flight Log</Descr>`);
  if (fp.depBrief?.runway) lines.push(`    <DeparturePosition>${esc(fp.depBrief.runway.replace(/^RW/i, ''))}</DeparturePosition>`);
  lines.push(`    <DepartureName>${esc(dep.name)}</DepartureName>`, `    <DestinationName>${esc(arr.name)}</DestinationName>`);
  lines.push('    <AppVersion>', '      <AppVersionMajor>11</AppVersionMajor>', '      <AppVersionBuild>282174</AppVersionBuild>', '    </AppVersion>');
  const wp = (id: string, type: string, lat: number, lon: number, alt: number | null, extra: string[] = [], region = '') => {
    lines.push(`    <ATCWaypoint id="${esc(id)}">`, `      <ATCWaypointType>${type}</ATCWaypointType>`, `      <WorldPosition>${lla(lat, lon, alt)}</WorldPosition>`, ...extra.map((e) => `      ${e}`), '      <ICAO>', ...(region ? [`        <ICAORegion>${esc(region)}</ICAORegion>`] : []), `        <ICAOIdent>${esc(id)}</ICAOIdent>`, '      </ICAO>', '    </ATCWaypoint>');
  };
  wp(dep.ident, 'Airport', dep.lat!, dep.lon!, fp.depBrief?.elevationFt ?? 0);
  fixes.forEach((x, i) => {
    const extra: string[] = [];
    const isFirstProc = x.isSidStar && i < fixes.length / 2;
    if (x.airway && x.airway !== 'DCT') {
      if (x.isSidStar && isFirstProc && x.airway === fp.sid) {
        extra.push(`<DepartureFP>${esc(x.airway)}</DepartureFP>`);
        if (dr) extra.push(`<RunwayNumberFP>${dr.num}</RunwayNumberFP>`, `<RunwayDesignatorFP>${dr.des}</RunwayDesignatorFP>`);
      } else if (x.isSidStar && x.airway === fp.star) {
        extra.push(`<ArrivalFP>${esc(x.airway)}</ArrivalFP>`);
        if (ar) extra.push(`<RunwayNumberFP>${ar.num}</RunwayNumberFP>`, `<RunwayDesignatorFP>${ar.des}</RunwayDesignatorFP>`);
      } else extra.push(`<ATCAirway>${esc(x.airway)}</ATCAirway>`);
    }
    if (x.type === 'ltlg') wp(x.ident, 'User', x.lat, x.lon, x.altFt, extra);
    else wp(x.ident, wpType(x.type), x.lat, x.lon, x.altFt, extra, x.region ?? '');
  });
  wp(arr.ident, 'Airport', arr.lat!, arr.lon!, fp.arrBrief?.elevationFt ?? 0);
  lines.push('  </FlightPlan.FlightPlan>', '</SimBase.Document>', '');
  return lines.join('\r\n');
}

export function toXplaneFms(f: Flight): string {
  const fp = f.flightPlan!;
  const dep = f.dep!, arr = f.arr!;
  const all = enroute(f);
  // procedures are loaded by name, so their fixes are left out of the enroute list
  const enr = all.filter((x) => !(x.isSidStar && (x.airway === fp.sid || x.airway === fp.star)));
  const code = (t: string) => (t === 'ndb' ? 2 : t === 'vor' ? 3 : t === 'ltlg' ? 28 : 11);
  const n = (v: number) => v.toFixed(6);
  const rows: string[] = [];
  rows.push(`1 ${dep.ident} ADEP ${(fp.depBrief?.elevationFt ?? 0).toFixed(6)} ${n(dep.lat!)} ${n(dep.lon!)}`);
  for (const x of enr) {
    const via = x.airway && x.airway !== 'DCT' && !x.isSidStar ? x.airway : 'DRCT';
    rows.push(`${code(x.type)} ${x.type === 'ltlg' ? x.ident.replace(/\s/g, '') : x.ident} ${via} ${(x.altFt ?? 0).toFixed(6)} ${n(x.lat)} ${n(x.lon)}`);
  }
  rows.push(`1 ${arr.ident} ADES ${(fp.arrBrief?.elevationFt ?? 0).toFixed(6)} ${n(arr.lat!)} ${n(arr.lon!)}`);
  const head = ['I', '1100 Version'];
  if (fp.airac) head.push(`CYCLE ${fp.airac}`);
  head.push(`ADEP ${dep.ident}`);
  if (fp.depBrief?.runway) head.push(`DEPRWY RW${fp.depBrief.runway.replace(/^RW/i, '')}`);
  if (fp.sid) head.push(`SID ${fp.sid}`);
  head.push(`ADES ${arr.ident}`);
  if (fp.arrBrief?.runway) head.push(`DESRWY RW${fp.arrBrief.runway.replace(/^RW/i, '')}`);
  if (fp.star) head.push(`STAR ${fp.star}`);
  head.push(`NUMENR ${rows.length}`);
  return [...head, ...rows, ''].join('\n');
}

export const planFileName = (f: Flight, ext: string) => `${f.dep?.ident ?? 'DEP'}${f.arr?.ident ?? 'ARR'}.${ext}`;

// ─── Google Earth (KML) and GPX exports of the whole logbook ────────────────
import { geoInterpolate } from 'd3-geo';
import { bestPath } from './flight';

/** Coordinates to draw for a flight: recorded track, else filed plan, else the great circle. */
export function flightLine(f: Flight): { pts: [number, number, number][]; kind: 'track' | 'plan' | 'great-circle' } | null {
  if (f.track && f.track.length >= 2) return { pts: f.track.map((p) => [p.lon, p.lat, Math.round((p.altFt ?? 0) * 0.3048)]), kind: 'track' };
  const b = bestPath(f);
  if (b) return { pts: b.pts.map(([lo, la]) => [lo, la, 0]), kind: 'plan' };
  if (f.dep?.lon == null || f.arr?.lon == null || f.dep.lat == null || f.arr.lat == null) return null;
  if (f.dep.ident === f.arr.ident) return null;
  const ip = geoInterpolate([f.dep.lon, f.dep.lat], [f.arr.lon, f.arr.lat]);
  return { pts: Array.from({ length: 65 }, (_, i) => { const [lo, la] = ip(i / 64); return [+lo.toFixed(5), +la.toFixed(5), 0]; }), kind: 'great-circle' };
}

const label = (f: Flight) => `${f.date} ${f.dep?.iata || f.dep?.ident || '?'}–${f.arr?.iata || f.arr?.ident || '?'}${f.flightNumber ? ` ${f.flightNumber}` : ''}`;

export function toKml(flights: Flight[], title = 'Flight Log'): string {
  const airports = new Map<string, NonNullable<Flight['dep']>>();
  for (const f of flights) for (const a of [f.dep, f.arr]) if (a && a.lat != null && a.lon != null) airports.set(a.ident, a);
  const pm = flights.map((f) => {
    const l = flightLine(f); if (!l) return '';
    const style = l.kind === 'track' ? '#track' : f.category === 'simulator' ? '#sim' : '#real';
    const desc = [f.airline, f.aircraft.typeCode, f.aircraft.registration, l.kind === 'track' ? 'Recorded track' : l.kind === 'plan' ? 'Filed route' : 'Great-circle path'].filter(Boolean).join(' · ');
    return `<Placemark><name>${esc(label(f))}</name><description>${esc(desc)}</description><styleUrl>${style}</styleUrl><LineString><tessellate>1</tessellate>${l.kind === 'track' ? '<altitudeMode>absolute</altitudeMode>' : ''}<coordinates>${l.pts.map((p) => p.join(',')).join(' ')}</coordinates></LineString></Placemark>`;
  }).filter(Boolean).join('\n');
  const ap = [...airports.values()].map((a) => `<Placemark><name>${esc(a.iata || a.ident)}</name><description>${esc(a.name || '')}</description><styleUrl>#apt</styleUrl><Point><coordinates>${a.lon},${a.lat},0</coordinates></Point></Placemark>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(title)}</name>
<Style id="real"><LineStyle><color>ff6ee05e</color><width>2</width></LineStyle></Style>
<Style id="sim"><LineStyle><color>fff6823b</color><width>2</width></LineStyle></Style>
<Style id="track"><LineStyle><color>ffffffff</color><width>2.5</width></LineStyle></Style>
<Style id="apt"><IconStyle><scale>0.7</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/airports.png</href></Icon></IconStyle></Style>
<Folder><name>Flights</name>
${pm}
</Folder><Folder><name>Airports</name>
${ap}
</Folder></Document></kml>
`;
}

export function toGpx(flights: Flight[]): string {
  const trk = flights.map((f) => {
    const l = flightLine(f); if (!l) return '';
    const times = f.track && l.kind === 'track' ? f.track : null;
    const pts = l.pts.map((p, i) => `<trkpt lat="${p[1]}" lon="${p[0]}">${l.kind === 'track' ? `<ele>${p[2]}</ele>` : ''}${times?.[i]?.t ? `<time>${new Date(times[i].t * 1000).toISOString()}</time>` : ''}</trkpt>`).join('');
    return `<trk><name>${esc(label(f))}</name><type>${l.kind}</type><trkseg>${pts}</trkseg></trk>`;
  }).filter(Boolean).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Flight Log" xmlns="http://www.topografix.com/GPX/1/1">
${trk}
</gpx>
`;
}

// ─── Route import: typed routes, MSFS .pln, X-Plane .fms, GPX and KML ───────
import type { FlightPlan, TrackPoint, AirportRef } from './types';
import { findAirport } from './airports';
import { haversineKm } from './geo';

type NavRec = [string, string, string, number, number, string];
let navIdx: Map<string, NavRec[]> | null = null;
let navP: Promise<void> | null = null;
/** VOR / DME / NDB / TACAN positions from OurAirports (public domain), lazy-loaded. */
export function loadNavaids(): Promise<void> {
  if (!navP) {
    const base = (import.meta as any).env?.BASE_URL ?? './';
    navP = fetch(`${base}data/navaids.json`).then((r) => (r.ok ? r.json() : [])).then((rows: NavRec[]) => {
      navIdx = new Map();
      for (const r of rows) { const a = navIdx.get(r[0]); if (a) a.push(r); else navIdx.set(r[0], [r]); }
    }).catch(() => { navP = null; });
  }
  return navP;
}
export const navaidsReady = () => !!navIdx;

const AIRWAY = /^(?:U?[ABGHJKLMNPQRTVWYZ]|[A-Z]{1,2})\d{1,4}[A-Z]?$/;
const PROC = /^[A-Z]{2,5}\d[A-Z]?$/;               // SID/STAR names such as BUBI1A, KITO1B, ALDE2E
const SPEEDLVL = /^[NKM]\d{3,4}[FASMV]\d{3,4}$/;    // N0480F370
const fix = (ident: string, type: string, lat: number, lon: number, airway = '', name = ''): PlanFix => ({ ident, name, type, lat, lon, altFt: null, airway, stage: '', elapsedMin: null });

/** Coordinates written in a route: 2530N05500E, 25N055E, N25E055, N2530.5E05500.2, 25.5/55.2 */
export function parseLatLon(t: string): { lat: number; lon: number } | null {
  let m = t.match(/^(\d{2})(\d{2})?(\d{2})?([NS])(\d{3})(\d{2})?(\d{2})?([EW])$/);
  if (m) {
    const lat = (+m[1] + (+(m[2] ?? 0)) / 60 + (+(m[3] ?? 0)) / 3600) * (m[4] === 'S' ? -1 : 1);
    const lon = (+m[5] + (+(m[6] ?? 0)) / 60 + (+(m[7] ?? 0)) / 3600) * (m[8] === 'W' ? -1 : 1);
    return lat <= 90 && lon <= 180 ? { lat, lon } : null;
  }
  m = t.match(/^([NS])(\d{2})(\d{2}(?:\.\d+)?)?([EW])(\d{3})(\d{2}(?:\.\d+)?)?$/);
  if (m) {
    const lat = (+m[2] + (+(m[3] ?? 0)) / 60) * (m[1] === 'S' ? -1 : 1);
    const lon = (+m[5] + (+(m[6] ?? 0)) / 60) * (m[4] === 'W' ? -1 : 1);
    return lat <= 90 && lon <= 180 ? { lat, lon } : null;
  }
  m = t.match(/^(-?\d{1,2}(?:\.\d+)?)[/,](-?\d{1,3}(?:\.\d+)?)$/);
  if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) return { lat: +m[1], lon: +m[2] };
  return null;
}

export interface RouteImport {
  route: string;
  fixes: PlanFix[];
  unresolved: string[];
  sid?: string; star?: string;
  depIdent?: string; arrIdent?: string; depRwy?: string; arrRwy?: string;
  cruiseFt?: number | null;
  track?: TrackPoint[];
  source: 'manual' | 'file';
  label: string;
}

/** Resolve a typed ICAO-style route. Airways can't be expanded without a nav database, so their endpoints are joined. */
export function parseRouteString(text: string, dep?: AirportRef | null, arr?: AirportRef | null): RouteImport {
  const toks = text.toUpperCase().replace(/[,;]+/g, ' ').split(/\s+/).filter(Boolean);
  const fixes: PlanFix[] = [], unresolved: string[] = [], kept: string[] = [];
  let via = 'DCT', sid: string | undefined, star: string | undefined, depIdent = dep?.ident, arrIdent = arr?.ident, depRwy: string | undefined, arrRwy: string | undefined, cruise: number | null = null;
  let prev: { lat: number; lon: number } | null = dep && dep.lat != null ? { lat: dep.lat, lon: dep.lon! } : null;
  const target = arr && arr.lat != null ? { lat: arr.lat, lon: arr.lon! } : null;
  toks.forEach((raw, i) => {
    const [tok, rwy] = raw.split('/');
    if (tok === 'DCT' || tok === 'SID' || tok === 'STAR') { via = 'DCT'; if (tok === 'DCT') kept.push(tok); return; }
    if (SPEEDLVL.test(raw)) { const m = raw.match(/[FA](\d{3,4})$/); if (m) cruise = +m[1] * 100; return; }
    if (/^(IFR|VFR)$/.test(tok)) return;
    const ap = /^[A-Z]{4}$/.test(tok) ? findAirport(tok) : undefined;
    if (ap && ap.lat != null) {
      if (i > 0 && i === toks.length - 1) { arrIdent = tok; arrRwy = rwy; return; }
      if (i === 0 && (!depIdent || tok === depIdent)) { depIdent = tok; depRwy = rwy; prev = { lat: ap.lat, lon: ap.lon! }; return; }
      fixes.push(fix(tok, 'apt', ap.lat, ap.lon!, via, ap.name)); prev = { lat: ap.lat, lon: ap.lon! }; via = 'DCT'; kept.push(raw); return;
    }
    const ll = parseLatLon(tok);
    if (ll) { fixes.push(fix(tok, 'ltlg', ll.lat, ll.lon, via)); prev = ll; via = 'DCT'; kept.push(raw); return; }
    if (PROC.test(tok) && !AIRWAY.test(tok)) {
      if (!fixes.length && !sid) sid = tok; else star = tok;
      via = tok; return;   // SID/STAR are added around the route by routeToPlan
    }
    if (AIRWAY.test(tok) && i > 0 && i < toks.length - 1) { via = tok; kept.push(tok); return; }
    const cands = navIdx?.get(tok);
    if (cands?.length) {
      const ref = prev ?? target;
      const best = ref ? cands.reduce((a, b) => (haversineKm(ref.lat, ref.lon, a[3], a[4]) <= haversineKm(ref.lat, ref.lon, b[3], b[4]) ? a : b)) : cands[0];
      const nearEnd = target ? cands.find((c) => haversineKm(target.lat, target.lon, c[3], c[4]) < 1200) : undefined;
      const pick = ref && haversineKm(ref.lat, ref.lon, best[3], best[4]) < 4000 ? best : nearEnd;
      if (!ref || pick) {
        const best2 = pick ?? best;
        const f = fix(tok, best2[1] === 'NDB' ? 'ndb' : 'vor', best2[3], best2[4], via, best2[2]);
        if (best2[5]) f.frequency = best2[5];
        fixes.push(f); prev = { lat: best2[3], lon: best2[4] }; via = 'DCT'; kept.push(raw); return;
      }
    }
    if (/^[A-Z0-9]{2,7}$/.test(tok)) { unresolved.push(tok); kept.push(raw); }
    via = 'DCT';
  });
  // drop leading/trailing DCTs left over from removed airports
  while (kept[0] === 'DCT') kept.shift();
  while (kept[kept.length - 1] === 'DCT') kept.pop();
  return { route: kept.join(' '), fixes, unresolved, sid, star, depIdent, arrIdent, depRwy, arrRwy, cruiseFt: cruise, source: 'manual', label: 'Typed route' };
}


// Minimal XML reading (no DOM needed, so it also runs in tests and workers)
const unent = (v: string) => v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
function xtags(xml: string, name: string): { attrs: string; inner: string }[] {
  const out: { attrs: string; inner: string }[] = [];
  const re = new RegExp(`<(?:[\\w-]+:)?${name}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>)`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push({ attrs: m[1] ?? '', inner: m[2] ?? '' });
  return out;
}
const xtext = (xml: string, name: string) => { const t = xtags(xml, name)[0]; return t ? unent(t.inner) : ''; };
const xattr = (attrs: string, name: string) => { const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i')); return m ? unent(m[1]) : ''; };

const dmsToDec = (s: string) => {
  const m = s.trim().match(/^([NSEW])\s*(\d+)°\s*(\d+)'\s*([\d.]+)"?$/);
  if (!m) return NaN;
  return (+m[2] + +m[3] / 60 + +m[4] / 3600) * (m[1] === 'S' || m[1] === 'W' ? -1 : 1);
};

/** Read a route/track file. Throws with a readable message when the file isn't understood. */
export function parseRouteFile(name: string, text: string): RouteImport {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const t = text.trim();
  if (ext === 'pln' || /<SimBase\.Document/i.test(t)) {
    const q = (sel: string) => xtext(t, sel);
    const fixes: PlanFix[] = []; let sid: string | undefined, star: string | undefined;
    for (const wp of xtags(t, 'ATCWaypoint')) {
      const g = (tag: string) => xtext(wp.inner, tag);
      const [la, lo, al] = g('WorldPosition').split(',');
      const lat = dmsToDec(la ?? ''), lon = dmsToDec(lo ?? '');
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const type = g('ATCWaypointType').toLowerCase();
      const f = fix(xattr(wp.attrs, 'id') || g('ICAOIdent') || '?', type === 'airport' ? 'apt' : type === 'vor' ? 'vor' : type === 'ndb' ? 'ndb' : type === 'user' ? 'ltlg' : 'wpt', lat, lon, g('ATCAirway') || g('DepartureFP') || g('ArrivalFP') || 'DCT');
      const alt = parseFloat(al ?? ''); if (Number.isFinite(alt) && alt > 0) f.altFt = Math.round(alt);
      if (g('DepartureFP')) { sid = g('DepartureFP'); f.isSidStar = true; }
      if (g('ArrivalFP')) { star = g('ArrivalFP'); f.isSidStar = true; }
      fixes.push(f);
    }
    if (!fixes.length) throw new Error('No waypoints found in this .pln file.');
    const depIdent = q('DepartureID') || undefined, arrIdent = q('DestinationID') || undefined;
    const inner = fixes.filter((x) => x.ident !== depIdent && x.ident !== arrIdent);
    return { route: inner.map((x) => x.ident).join(' '), fixes: inner, unresolved: [], sid, star, depIdent, arrIdent, cruiseFt: +q('CruisingAlt') || null, source: 'file', label: 'MSFS flight plan (.pln)' };
  }
  if (ext === 'fms' || /^I\s*\n\s*(1100|3) Version/m.test(t)) {
    const lines = t.split(/\r?\n/).map((l) => l.trim());
    const fixes: PlanFix[] = []; let depIdent, arrIdent, sid, star, depRwy, arrRwy;
    for (const l of lines) {
      const p = l.split(/\s+/);
      if (p[0] === 'ADEP') depIdent = p[1]; else if (p[0] === 'ADES') arrIdent = p[1];
      else if (p[0] === 'SID') sid = p[1]; else if (p[0] === 'STAR') star = p[1];
      else if (p[0] === 'DEPRWY') depRwy = p[1]?.replace(/^RW/, ''); else if (p[0] === 'DESRWY') arrRwy = p[1]?.replace(/^RW/, '');
      else if (/^(1|2|3|11|28)$/.test(p[0]) && p.length >= 5) {
        const v1100 = p.length >= 6;
        const [ident, via, alt, lat, lon] = v1100 ? [p[1], p[2], +p[3], +p[4], +p[5]] : [p[1], 'DCT', +p[2], +p[3], +p[4]];
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const f = fix(ident, { '1': 'apt', '2': 'ndb', '3': 'vor', '11': 'wpt', '28': 'ltlg' }[p[0]]!, lat, lon, /^(ADEP|ADES|DRCT)$/.test(via) ? 'DCT' : via);
        if (alt > 0) f.altFt = Math.round(alt);
        fixes.push(f);
      }
    }
    if (!fixes.length) throw new Error('No waypoints found in this .fms file.');
    depIdent ??= fixes[0].type === 'apt' ? fixes[0].ident : undefined;
    arrIdent ??= fixes[fixes.length - 1].type === 'apt' ? fixes[fixes.length - 1].ident : undefined;
    const inner = fixes.filter((x) => x.ident !== depIdent && x.ident !== arrIdent);
    return { route: inner.map((x) => x.ident).join(' '), fixes: inner, unresolved: [], sid, star, depIdent, arrIdent, depRwy, arrRwy, source: 'file', label: 'X-Plane flight plan (.fms)' };
  }
  if (ext === 'gpx' || /<gpx[\s>]/i.test(t)) {
    const pts = (tag: string) => xtags(t, tag).map((e) => ({ lat: parseFloat(xattr(e.attrs, 'lat')), lon: parseFloat(xattr(e.attrs, 'lon')), name: xtext(e.inner, 'name'), ele: parseFloat(xtext(e.inner, 'ele')), time: xtext(e.inner, 'time') })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    const trk = pts('trkpt');
    if (trk.length >= 2) {
      const track: TrackPoint[] = [];
      let t0 = Date.parse(trk[0].time) / 1000; if (!Number.isFinite(t0)) t0 = 0;
      trk.forEach((p, i) => {
        const tt = Date.parse(p.time) / 1000;
        const prevP = track[track.length - 1];
        const t = Number.isFinite(tt) ? tt : t0 + i * 10;
        const gs = prevP && t > prevP.t ? Math.round((haversineKm(prevP.lat, prevP.lon, p.lat, p.lon) / 1.852) / ((t - prevP.t) / 3600)) : 0;
        track.push({ t: Math.round(t), lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5), altFt: Number.isFinite(p.ele) ? Math.round(p.ele / 0.3048) : 0, gsKt: Math.min(gs, 1200) });
      });
      const step = Math.ceil(track.length / 1500);
      return { route: '', fixes: [], unresolved: [], track: track.filter((_, i) => i % step === 0 || i === track.length - 1), source: 'file', label: Number.isFinite(Date.parse(trk[0].time)) ? 'GPX track (flown path)' : 'GPX track (no timestamps)' };
    }
    const rte = pts('rtept').length ? pts('rtept') : pts('wpt');
    if (!rte.length) throw new Error('No route or track points found in this GPX file.');
    const fixes = rte.map((p, i) => fix((p.name || `WP${i + 1}`).toUpperCase().slice(0, 12), 'wpt', p.lat, p.lon));
    return { route: fixes.map((x) => x.ident).join(' '), fixes, unresolved: [], source: 'file', label: 'GPX route' };
  }
  if (ext === 'kml' || /<kml[\s>]/i.test(t)) {
    const points = xtags(t, 'Placemark').map((m) => ({ name: xtext(m.inner, 'name'), c: xtags(m.inner, 'Point')[0] ? xtext(xtags(m.inner, 'Point')[0].inner, 'coordinates') : '' })).filter((p) => p.c);
    let fixes: PlanFix[] = points.map((p, i) => { const [lo, la] = p.c!.split(',').map(Number); return fix((p.name || `WP${i + 1}`).toUpperCase().slice(0, 12), 'wpt', la, lo); }).filter((x) => Number.isFinite(x.lat));
    if (fixes.length < 2) {
      const lsTag = xtags(t, 'LineString')[0];
      const ls = lsTag ? xtext(lsTag.inner, 'coordinates') : '';
      const c = ls.split(/\s+/).map((q) => q.split(',').map(Number)).filter((q) => q.length >= 2 && Number.isFinite(q[0]) && Number.isFinite(q[1]));
      const step = Math.ceil(c.length / 200);
      fixes = c.filter((_, i) => i % step === 0 || i === c.length - 1).map((q, i) => fix(`WP${i + 1}`, 'ltlg', q[1], q[0]));
    }
    if (!fixes.length) throw new Error('No placemarks or lines found in this KML file.');
    return { route: fixes.map((x) => x.ident).join(' '), fixes, unresolved: [], source: 'file', label: 'KML route' };
  }
  // anything else: treat as a typed route (e.g. a .txt with "OMAA DCT VTK …")
  if (t.length < 4000 && /^[A-Z0-9/ \n\r\t.,-]+$/i.test(t)) return { ...parseRouteString(t), source: 'file', label: 'Route text file' };
  throw new Error('Unsupported file. Use an MSFS .pln, X-Plane .fms, GPX, KML or a text route.');
}

/** Turn an imported route into the stored flight plan (cumulative distances included). */
export function routeToPlan(r: RouteImport, dep: AirportRef | null, arr: AirportRef | null, prev?: FlightPlan): FlightPlan {
  let cum = 0, last = dep && dep.lat != null ? { lat: dep.lat, lon: dep.lon! } : null;
  const fixes = r.fixes.map((x) => {
    const leg = last ? haversineKm(last.lat, last.lon, x.lat, x.lon) / 1.852 : 0;
    cum += leg; last = { lat: x.lat, lon: x.lon };
    return { ...x, legNm: Math.round(leg), cumNm: Math.round(cum) };
  });
  if (last && arr && arr.lat != null) cum += haversineKm(last.lat, last.lon, arr.lat, arr.lon!) / 1.852;
  const brief = (rw?: string) => (rw ? { runway: rw, transAlt: null, transLevel: null, metar: '', taf: '', elevationFt: null } : undefined);
  return {
    source: r.source === 'file' ? 'file' : 'manual', route: r.route,
    fullRoute: [dep ? `${dep.ident}${r.depRwy ? '/' + r.depRwy : ''}` : '', r.sid, r.route, r.star, arr ? `${arr.ident}${r.arrRwy ? '/' + r.arrRwy : ''}` : ''].filter(Boolean).join(' '),
    sid: r.sid, star: r.star, depBrief: brief(r.depRwy), arrBrief: brief(r.arrRwy), initialAltFt: r.cruiseFt ?? prev?.initialAltFt ?? null,
    fixes, unresolved: r.unresolved, routeDistanceNm: fixes.length && dep && arr ? Math.round(cum) : null, airDistanceNm: null, plannedEteMin: null,
    cruiseFl: r.cruiseFt ? `FL${Math.round(r.cruiseFt / 100)}` : '', costIndex: '', alternate: '', airac: '', fuelUnit: 'kg',
    fuel: { ramp: null, takeoff: null, trip: null, reserve: null, alternate: null, contingency: null, landing: null },
    avgWind: '', ofpUrl: '', downloads: [], requestId: '', generatedAt: null, label: r.label,
  };
}
