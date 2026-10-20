import type { Flight, Settings } from './types';
import { summarize, monthly, groupBy, airportVisits, domesticSplit } from './stats';
import { aircraftLabel, isCounted, routeKey, typeKey } from './flight';
import { fmtDurationLong, monthLabel, monthKey } from './time';
import { fmtDistance } from './units';
import { DateTime } from 'luxon';

export interface Insight {
  id: string;
  title: string;
  detail: string;
  how: string;          // how it was calculated
  tone: 'neutral' | 'up' | 'down';
  href?: string;
}

/** Insights are generated strictly from saved records. Each returns nothing when the data can't support it. */
export function generateInsights(all: Flight[], s: Settings, now = DateTime.local()): Insight[] {
  const flights = all.filter(isCounted);
  const out: Insight[] = [];
  if (flights.length < 2) return out;
  const sum = summarize(flights);
  const months = monthly(flights);

  // busiest month
  const busiest = [...months].sort((a, b) => b.flights - a.flights || b.minutes - a.minutes)[0];
  if (busiest && busiest.flights >= 2 && months.length >= 2) {
    out.push({
      id: 'busiest-month', title: `Your busiest month was ${monthLabel(busiest.month, true)}.`,
      detail: `${busiest.flights} flights${busiest.minutes ? ` and ${fmtDurationLong(busiest.minutes)} of flight time` : ''}.`,
      how: 'Counted completed, diverted and incomplete flights per calendar month (departure date).', tone: 'neutral', href: '/analytics?tab=time',
    });
  }

  // this month vs last month (hours)
  const thisKey = now.toFormat('yyyy-MM'), lastKey = now.minus({ months: 1 }).toFormat('yyyy-MM');
  const thisM = flights.filter((f) => monthKey(f.date) === thisKey), lastM = flights.filter((f) => monthKey(f.date) === lastKey);
  const mins = (fs: Flight[]) => fs.reduce((a, f) => a + (f.flightMinutes ?? 0), 0);
  if (thisM.length && lastM.length) {
    const diff = mins(thisM) - mins(lastM);
    if (Math.abs(diff) >= 30) {
      out.push({
        id: 'month-delta', title: `You logged ${fmtDurationLong(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} flight time than last month.`,
        detail: `${monthLabel(thisKey, true)} so far versus all of ${monthLabel(lastKey, true)}.`,
        how: 'Sum of recorded flight time this month compared with the previous calendar month. Flights without a flight time are not included.', tone: diff > 0 ? 'up' : 'down',
      });
    }
  }

  // most flown aircraft
  const types = groupBy(flights, typeKey, aircraftLabel).filter((g) => g.key !== 'UNKNOWN');
  if (types[0] && types[0].flights >= 2) {
    out.push({
      id: 'top-aircraft', title: `Your most frequently flown aircraft is the ${types[0].label}.`,
      detail: `${types[0].flights} of ${flights.length} flights (${Math.round((types[0].flights / flights.length) * 100)}%).`,
      how: 'Grouped by ICAO type designator; ranked by number of flights.', tone: 'neutral', href: '/aircraft',
    });
  }

  // longest route by distance
  if (sum.longestDistance?.dep && sum.longestDistance.arr) {
    const f = sum.longestDistance;
    out.push({
      id: 'longest-route', title: `Your longest recorded route was ${f.dep!.city || f.dep!.name} to ${f.arr!.city || f.arr!.name}.`,
      detail: `${fmtDistance(f.distanceKm, s.distanceUnit)} great-circle${f.flightMinutes ? ` · ${fmtDurationLong(f.flightMinutes)}` : ''}.`,
      how: 'Great-circle distance between the departure and arrival airport coordinates.', tone: 'neutral', href: `/flights/${f.id}`,
    });
  }

  // most frequent route
  const routes = groupBy(flights, (f) => routeKey(f));
  if (routes[0] && routes[0].flights >= 2) {
    out.push({
      id: 'top-route', title: `${routes[0].key} is your most flown route.`,
      detail: `${routes[0].flights} flights in either direction.`, how: 'Routes are counted in both directions as one city pair.', tone: 'neutral', href: '/map',
    });
  }

  // home base
  const visits = airportVisits(flights);
  if (visits[0] && visits[0].total >= 3) {
    out.push({
      id: 'top-airport', title: `${visits[0].name} is your most visited airport.`,
      detail: `${visits[0].departures} departures and ${visits[0].arrivals} arrivals.`, how: 'Each departure and each arrival counts as one visit.', tone: 'neutral', href: `/airports/${visits[0].ident}`,
    });
  }

  // international share
  const split = domesticSplit(flights);
  const known = split.domestic + split.international;
  if (known >= 4) {
    const pct = Math.round((split.international / known) * 100);
    out.push({
      id: 'intl-share', title: `${pct}% of your flights crossed a border.`,
      detail: `${split.international} international, ${split.domestic} domestic.`, how: 'International means departure and arrival airports are in different countries.', tone: 'neutral',
    });
  }

  // year over year
  const thisYear = now.year;
  const ytd = flights.filter((f) => f.date.startsWith(String(thisYear)) && f.date.slice(5) <= now.toFormat('MM-dd'));
  const lastYtd = flights.filter((f) => f.date.startsWith(String(thisYear - 1)) && f.date.slice(5) <= now.toFormat('MM-dd'));
  if (ytd.length && lastYtd.length >= 3) {
    const d = ytd.length - lastYtd.length;
    if (d !== 0) out.push({
      id: 'yoy', title: `${Math.abs(d)} ${d > 0 ? 'more' : 'fewer'} flights than this time last year.`,
      detail: `${ytd.length} flights in ${thisYear} to date versus ${lastYtd.length} by the same date in ${thisYear - 1}.`,
      how: 'Year-to-date flight counts, comparing the same calendar span.', tone: d > 0 ? 'up' : 'down',
    });
  }

  // sim vs real share
  if (sum.simFlights && sum.realFlights) {
    out.push({
      id: 'sim-real', title: `${Math.round((sum.simFlights / sum.flights) * 100)}% of your log is simulator flying.`,
      detail: `Simulator time is kept separate from real-world time in every total.`, how: 'Share of counted flights with the Simulator category.', tone: 'neutral',
    });
  }
  return out;
}
