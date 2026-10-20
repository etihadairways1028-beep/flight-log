// Cinematic aviation photography from Unsplash (free to use under the Unsplash License,
// https://unsplash.com/license). Photos are atmospheric — Flight Log never claims a stock
// photo shows the specific aircraft or registration you logged.
import type { BodyClass } from './aircraftTypes';

export interface Photo { id: string; alt: string; pos?: string }

const u = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=72`;
export const photoUrl = (p: Photo, w = 1200) => u(p.id, w);
export const photoSrcSet = (p: Photo) => [640, 1080, 1600, 2200].map((w) => `${u(p.id, w)} ${w}w`).join(', ');

export const PHOTOS = {
  wingClouds: { id: '1593182440709-4b7b56482c55', alt: 'Aircraft wing above a layer of white clouds', pos: 'center 60%' },
  wingClouds2: { id: '1647363377737-8d0ad7c2f494', alt: 'Wing of an airliner flying above the clouds' },
  aboveClouds: { id: '1551748629-08d916ed6682', alt: 'Airliner flying over a sea of clouds' },
  jetClouds: { id: '1559070041-bd63cfe57127', alt: 'Jetliner cruising over white clouds under a clear blue sky' },
  overClouds: { id: '1558882423-bebedae70ea8', alt: 'White airliner flying over the clouds' },
  goldenHour: { id: '1565614873782-ec6ef19e18f1', alt: 'Airliner flying at golden hour' },
  sunsetTakeoff: { id: '1769834628918-693863b58f68', alt: 'Airliner taking off at sunset under dramatic clouds' },
  duskCity: { id: '1767053853581-895341cd45d5', alt: 'Aircraft taking off at dusk above city lights' },
  runwayDusk: { id: '1790175482420-5a6ef1194c62', alt: 'Runway lights under a soft grey and pink dusk sky' },
  landingSunset: { id: '1758837573876-63871cc70fd6', alt: 'Airliner landing on a runway at sunset' },
  cockpitNight: { id: '1587408811730-1a978e6c407d', alt: 'Illuminated airliner cockpit at night with a glowing horizon' },
  throttles: { id: '1552773346-ca6976a5d4ca', alt: 'Throttle levers lit by warm instrument panel light' },
  gate: { id: '1553619948-505cc1cdc320', alt: 'Airliner parked at a terminal jet bridge' },
  gateWindow: { id: '1758531491352-7887c1fe45b3', alt: 'Airliner at the gate seen through the terminal window' },
  tarmac: { id: '1708673438435-28b7fd3e3aa4', alt: 'Widebody jetliner on the airport apron' },
  inFlightBlue: { id: '1655753971985-ec92f77f748d', alt: 'Airliner in flight against a blue sky' },
  departing: { id: '1610642372651-fe6e7bc209ef', alt: 'Passenger jet climbing out in daylight' },
} satisfies Record<string, Photo>;

export type PhotoKey = keyof typeof PHOTOS;

/** Representative atmosphere photo by aircraft class. */
export function photoForBody(body: BodyClass | 'Unknown' | undefined, seed = 0): Photo {
  const pools: Record<string, Photo[]> = {
    'Wide-body': [PHOTOS.jetClouds, PHOTOS.goldenHour, PHOTOS.tarmac, PHOTOS.aboveClouds],
    'Narrow-body': [PHOTOS.inFlightBlue, PHOTOS.departing, PHOTOS.overClouds, PHOTOS.sunsetTakeoff],
    'Regional jet': [PHOTOS.departing, PHOTOS.inFlightBlue],
    'Turboprop airliner': [PHOTOS.runwayDusk, PHOTOS.departing],
    'Business jet': [PHOTOS.duskCity, PHOTOS.landingSunset],
    'General aviation': [PHOTOS.throttles, PHOTOS.runwayDusk],
    Rotorcraft: [PHOTOS.runwayDusk],
  };
  const pool = pools[body ?? ''] ?? [PHOTOS.wingClouds2, PHOTOS.overClouds, PHOTOS.goldenHour];
  return pool[Math.abs(seed) % pool.length];
}

export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export const AIRPORT_PHOTOS: Photo[] = [PHOTOS.gate, PHOTOS.gateWindow, PHOTOS.runwayDusk, PHOTOS.landingSunset, PHOTOS.duskCity, PHOTOS.tarmac];

/** Wide, cinematic shots that work behind the dashboard greeting. */
export const HERO_POOL: Photo[] = [
  PHOTOS.wingClouds, PHOTOS.wingClouds2, PHOTOS.aboveClouds, PHOTOS.jetClouds, PHOTOS.overClouds, PHOTOS.goldenHour,
  PHOTOS.sunsetTakeoff, PHOTOS.duskCity, PHOTOS.runwayDusk, PHOTOS.landingSunset, PHOTOS.cockpitNight, PHOTOS.gate,
  PHOTOS.gateWindow, PHOTOS.tarmac, PHOTOS.inFlightBlue, PHOTOS.departing,
];

/** A different hero photo on every visit — never the same one twice in a row. */
export function nextHeroPhoto(): Photo {
  let last = -1;
  try { last = Number(localStorage.getItem('skylog:hero') ?? -1); } catch { /* ignore */ }
  let i = Math.floor(Math.random() * HERO_POOL.length);
  if (i === last) i = (i + 1 + Math.floor(Math.random() * (HERO_POOL.length - 1))) % HERO_POOL.length;
  try { localStorage.setItem('skylog:hero', String(i)); } catch { /* ignore */ }
  return HERO_POOL[i];
}
