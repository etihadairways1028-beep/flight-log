import type { Flight, FlightFilters } from './types';
import { routeKey, typeKey } from './flight';

export const emptyFilters = (): FlightFilters => ({
  q: '', from: '', to: '', categories: [], statuses: [], aircraft: '', registration: '', airline: '', airport: '', route: '', operator: '', tag: '',
});

export function activeFilterCount(f: FlightFilters): number {
  let n = 0;
  if (f.q) n++;
  if (f.from || f.to) n++;
  if (f.categories.length) n++;
  if (f.statuses.length) n++;
  for (const k of ['aircraft', 'registration', 'airline', 'airport', 'route', 'operator', 'tag'] as const) if (f[k]) n++;
  return n;
}

export function flightHaystack(f: Flight): string {
  return [
    f.flightNumber, f.callsign, f.airline, f.airlineCode, f.operator,
    f.dep?.ident, f.dep?.iata, f.dep?.name, f.dep?.city, f.arr?.ident, f.arr?.iata, f.arr?.name, f.arr?.city,
    f.aircraft.typeCode, f.aircraft.manufacturer, f.aircraft.model, f.aircraft.variant, f.aircraft.registration, f.aircraft.nickname,
    f.tags.join(' '), f.notes, f.simulator, f.date,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function applyFilters(flights: Flight[], f: FlightFilters): Flight[] {
  const q = f.q.trim().toLowerCase();
  const words = q ? q.split(/\s+/) : [];
  return flights.filter((x) => {
    if (f.from && x.date < f.from) return false;
    if (f.to && x.date > f.to) return false;
    if (f.categories.length && !f.categories.includes(x.category)) return false;
    if (f.statuses.length && !f.statuses.includes(x.status)) return false;
    if (f.aircraft && typeKey(x) !== f.aircraft.toUpperCase()) return false;
    if (f.registration && x.aircraft.registration.toUpperCase() !== f.registration.toUpperCase()) return false;
    if (f.airline && x.airline.toLowerCase() !== f.airline.toLowerCase()) return false;
    if (f.operator && (x.operator || x.airline).toLowerCase() !== f.operator.toLowerCase()) return false;
    if (f.airport && x.dep?.ident !== f.airport && x.arr?.ident !== f.airport) return false;
    if (f.route && routeKey(x) !== f.route) return false;
    if (f.tag && !x.tags.includes(f.tag)) return false;
    if (words.length) {
      const h = flightHaystack(x);
      if (!words.every((w) => h.includes(w))) return false;
    }
    return true;
  });
}
