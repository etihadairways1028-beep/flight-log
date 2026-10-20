// Airline directory from OpenFlights (ODbL). Used for autocomplete only;
// users can always type any operator name.
type Row = [string, string, string, string, string]; // icao, iata, name, callsign, country
export interface Airline { icao: string; iata: string; name: string; callsign: string; country: string }

let airlines: Airline[] = [];
let p: Promise<void> | null = null;

export function loadAirlines(): Promise<void> {
  if (!p) {
    const base = (import.meta as any).env?.BASE_URL ?? './';
    p = fetch(`${base}data/airlines.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Row[]) => {
        airlines = rows.map(([icao, iata, name, callsign, country]) => ({ icao, iata, name, callsign, country }));
      })
      .catch(() => {
        p = null;
      });
  }
  return p;
}

export function searchAirlines(q: string, limit = 8): Airline[] {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return [];
  const out: [number, Airline][] = [];
  for (const a of airlines) {
    const n = a.name.toLowerCase();
    let sc = -1;
    if (a.icao.toLowerCase() === s || a.iata.toLowerCase() === s) sc = 0;
    else if (n.startsWith(s)) sc = 1;
    else if (n.includes(s)) sc = 2;
    else if (a.callsign.toLowerCase().startsWith(s)) sc = 3;
    if (sc >= 0) out.push([sc, a]);
  }
  return out.sort((a, b) => a[0] - b[0]).slice(0, limit).map((x) => x[1]);
}

export function airlineByIcao(code: string): Airline | undefined {
  const c = code.toUpperCase();
  return airlines.find((a) => a.icao === c);
}

export function airlineByIata(code: string): Airline | undefined {
  const c = code.toUpperCase().trim();
  if (c.length !== 2) return undefined;
  return airlines.find((a) => a.iata === c);
}

/** Exposed for tests. */
export function ingestAirlines(rows: [string, string, string, string, string][]) {
  airlines = rows.map(([icao, iata, name, callsign, country]) => ({ icao, iata, name, callsign, country }));
}
