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
