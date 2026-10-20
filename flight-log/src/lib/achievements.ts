import type { Flight } from './types';
import { isCounted, isSim, typeKey } from './flight';
import { isOceanCrossing } from './geo';
import { summarize } from './stats';

export interface AchievementDef {
  id: string;
  title: string;
  description: string;    // threshold, stated plainly
  group: 'Flights' | 'Hours' | 'Distance' | 'Places' | 'Aircraft' | 'Journeys';
  target: number;
  measure: (ctx: Ctx) => number;
  unit?: string;
}

interface Ctx {
  flights: Flight[];   // counted flights, sorted ascending by date
  sum: ReturnType<typeof summarize>;
}

export interface AchievementState {
  def: AchievementDef;
  value: number;
  unlocked: boolean;
  unlockedOn: string | null;   // date of the flight that crossed the threshold
  unlockedBy: string | null;   // flight id
  progress: number;            // 0–1
}

const LONG_HAUL_MIN = 6 * 60;
const LONG_HAUL_KM = 4800;
export const isLongHaul = (f: Flight) => (f.flightMinutes != null ? f.flightMinutes >= LONG_HAUL_MIN : f.distanceKm != null && f.distanceKm >= LONG_HAUL_KM);

const countFlights = (n: number): Omit<AchievementDef, 'id' | 'title' | 'description'> => ({ group: 'Flights', target: n, measure: (c) => c.flights.length, unit: 'flights' });

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-flight', title: 'First Flight Logged', description: 'Log your first completed flight.', ...countFlights(1) },
  { id: 'ten-flights', title: 'First 10 Flights', description: 'Log 10 flights.', ...countFlights(10) },
  { id: 'fifty-flights', title: 'Half Century', description: 'Log 50 flights.', ...countFlights(50) },
  { id: 'hundred-flights', title: 'Centurion', description: 'Log 100 flights.', ...countFlights(100) },
  { id: 'ten-hours', title: '10 Flight Hours', description: 'Record 10 hours of flight time (simulator and real-world combined).', group: 'Hours', target: 10, measure: (c) => c.sum.flightMinutes / 60, unit: 'h' },
  { id: 'hundred-hours', title: '100 Flight Hours', description: 'Record 100 hours of flight time (simulator and real-world combined).', group: 'Hours', target: 100, measure: (c) => c.sum.flightMinutes / 60, unit: 'h' },
  { id: 'hundred-real-hours', title: '100 Real-World Hours', description: 'Record 100 hours of non-simulator flight time.', group: 'Hours', target: 100, measure: (c) => c.sum.realMinutes / 60, unit: 'h' },
  { id: 'hundred-sim-hours', title: '100 Simulator Hours', description: 'Record 100 hours in the simulator category.', group: 'Hours', target: 100, measure: (c) => c.sum.simMinutes / 60, unit: 'h' },
  { id: 'long-haul', title: 'First Long-Haul Flight', description: 'A flight of 6 h or more flight time (or 4,800 km when no time is recorded).', group: 'Journeys', target: 1, measure: (c) => c.flights.filter(isLongHaul).length },
  { id: 'ocean', title: 'First Ocean Crossing', description: 'A flight between the Americas and Europe, Africa, Asia or Oceania.', group: 'Journeys', target: 1, measure: (c) => c.flights.filter((f) => isOceanCrossing(f.dep?.continent ?? '', f.arr?.continent ?? '')).length },
  { id: 'red-eye', title: 'Night Owl', description: 'A flight that departs on one date and lands on the next (UTC).', group: 'Journeys', target: 1, measure: (c) => c.flights.filter((f) => f.times.takeoff && f.times.landing && f.times.takeoff.slice(0, 10) !== f.times.landing.slice(0, 10)).length },
  { id: 'ten-airports', title: '10 Unique Airports', description: 'Visit 10 different airports.', group: 'Places', target: 10, measure: (c) => c.sum.uniqueAirports, unit: 'airports' },
  { id: 'fifty-airports', title: '50 Unique Airports', description: 'Visit 50 different airports.', group: 'Places', target: 50, measure: (c) => c.sum.uniqueAirports, unit: 'airports' },
  { id: 'ten-countries', title: '10 Countries', description: 'Visit airports in 10 different countries.', group: 'Places', target: 10, measure: (c) => c.sum.uniqueCountries, unit: 'countries' },
  { id: 'five-types', title: 'Five Aircraft Types', description: 'Fly on 5 different ICAO aircraft types.', group: 'Aircraft', target: 5, measure: (c) => c.sum.uniqueTypes, unit: 'types' },
  { id: 'fifteen-types', title: 'Fleet Collector', description: 'Fly on 15 different ICAO aircraft types.', group: 'Aircraft', target: 15, measure: (c) => c.sum.uniqueTypes, unit: 'types' },
  { id: 'distance-10k', title: '10,000 km Recorded', description: 'Accumulate 10,000 km of great-circle distance.', group: 'Distance', target: 10_000, measure: (c) => c.sum.distanceKm, unit: 'km' },
  { id: 'distance-100k', title: '100,000 km Recorded', description: 'Accumulate 100,000 km of great-circle distance.', group: 'Distance', target: 100_000, measure: (c) => c.sum.distanceKm, unit: 'km' },
  { id: 'around-world', title: 'Around the World', description: 'Accumulate 40,075 km — the length of the equator.', group: 'Distance', target: 40_075, measure: (c) => c.sum.distanceKm, unit: 'km' },
];

/** Evaluate every achievement and find the flight on which each one was earned. */
export function evaluateAchievements(all: Flight[]): AchievementState[] {
  const flights = all.filter(isCounted).sort((a, b) => a.date.localeCompare(b.date) || (a.times.takeoff ?? '').localeCompare(b.times.takeoff ?? ''));
  const full: Ctx = { flights, sum: summarize(flights) };
  return ACHIEVEMENTS.map((def) => {
    const value = def.measure(full);
    const unlocked = value >= def.target;
    let unlockedOn: string | null = null, unlockedBy: string | null = null;
    if (unlocked) {
      // binary search the prefix length where the threshold is first met
      let lo = 1, hi = flights.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const pre = flights.slice(0, mid);
        if (def.measure({ flights: pre, sum: summarize(pre) }) >= def.target) hi = mid; else lo = mid + 1;
      }
      unlockedOn = flights[lo - 1]?.date ?? null;
      unlockedBy = flights[lo - 1]?.id ?? null;
    }
    return { def, value, unlocked, unlockedOn, unlockedBy, progress: Math.max(0, Math.min(1, value / def.target)) };
  });
}

export function uniqueTypeCount(fs: Flight[]) {
  return new Set(fs.map(typeKey).filter((k) => k !== 'UNKNOWN')).size;
}
export const simShare = (fs: Flight[]) => (fs.length ? fs.filter(isSim).length / fs.length : 0);
