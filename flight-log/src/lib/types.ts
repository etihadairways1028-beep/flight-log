// ───────────────────────────────────────────────────────────────────────────
// Flight Log core data model. All stored values use canonical units:
//   distance → kilometres, altitude → feet, speed → knots, durations → minutes,
//   instants → ISO-8601 UTC strings. Conversion happens only at display time.
// ───────────────────────────────────────────────────────────────────────────

export type WorkspaceId = 'personal' | 'demo';

export type FlightCategory =
  | 'real'        // real-world flight (passenger or crew)
  | 'simulator'   // MSFS, X-Plane, P3D … never counted as real-world time
  | 'training'
  | 'ferry'
  | 'private'
  | 'commercial'
  | 'other';

export type FlightStatus = 'completed' | 'planned' | 'cancelled' | 'diverted' | 'draft';

export type FlightRole =
  | ''
  | 'passenger'
  | 'pic'
  | 'sic'
  | 'dual'
  | 'instructor'
  | 'observer'
  | 'sim-pilot'
  | 'cabin-crew';

export type FlyingProfile = 'enthusiast' | 'simmer' | 'student' | 'pilot' | 'virtual-airline';

export interface AirportRef {
  ident: string;           // ICAO / GPS identifier (e.g. OMAA)
  iata: string;            // may be ''
  name: string;
  city: string;
  country: string;         // ISO-3166 alpha-2
  continent: string;       // AF AN AS EU NA OC SA
  lat: number | null;
  lon: number | null;
  tz: string;              // IANA zone; 'UTC' when unknown
  source: 'dataset' | 'custom';
}

export interface AircraftInfo {
  typeCode: string;        // ICAO type designator (A359, B789 …)
  manufacturer: string;
  model: string;
  variant: string;
  registration: string;
  nickname: string;
}

/** A recorded timestamp. Stored in UTC. */
export type Instant = string | null;

export interface FlightTimes {
  schedOut: Instant;
  schedIn: Instant;
  offBlock: Instant;
  takeoff: Instant;
  landing: Instant;
  onBlock: Instant;
}

export interface Flight {
  id: string;
  date: string;              // YYYY-MM-DD — departure date, local to the departure airport
  flightNumber: string;
  callsign: string;
  category: FlightCategory;
  status: FlightStatus;
  airline: string;           // airline / operator display name
  airlineCode: string;       // ICAO airline designator, optional
  operator: string;          // operating carrier, if different
  dep: AirportRef | null;
  arr: AirportRef | null;
  aircraft: AircraftInfo;
  times: FlightTimes;
  /** Airborne time (takeoff → landing) in minutes. */
  flightMinutes: number | null;
  flightMinutesSource: 'computed' | 'manual' | null;
  /** Block time (off-block → on-block) in minutes. Never inferred from flight time. */
  blockMinutes: number | null;
  blockMinutesSource: 'computed' | 'manual' | null;
  plannedRoute: string;
  actualRoute: string;
  distanceKm: number | null;       // great-circle, computed from airports
  recordedDistanceKm: number | null;
  cruiseAltitudeFt: number | null;
  flightLevel: string;
  avgGroundSpeedKt: number | null;
  maxGroundSpeedKt: number | null;
  configNotes: string;
  purpose: string;
  seat: string;
  role: FlightRole;
  crew: string;
  weather: string;
  passengers: number | null;
  fuel: number | null;
  fuelUnit: 'kg' | 'lb' | 'l' | 'gal';
  takeoffsDay: number | null;
  takeoffsNight: number | null;
  landingsDay: number | null;
  landingsNight: number | null;
  rating: number | null;           // 1–5
  tags: string[];
  photos: string[];                // photo ids (stored separately)
  notes: string;
  simulator: string;               // e.g. MSFS 2024, X-Plane 12
  /** Pilot logbook times (minutes) and counts. Optional — only pilots fill these in. */
  pilot?: PilotTimes;
  /** Filed flight plan (e.g. from a SimBrief OFP). */
  flightPlan?: FlightPlan;
  source: 'manual' | 'csv' | 'json' | 'simbrief' | 'demo' | 'duplicate';
  createdAt: string;
  updatedAt: string;
}

export interface PlanFix {
  ident: string;
  name: string;
  type: string;          // wpt, vor, ndb, apt, ltlg, toc, tod …
  lat: number;
  lon: number;
  altFt: number | null;
  airway: string;        // airway or DCT used to reach this fix
  stage: string;         // CLB / CRZ / DSC
  elapsedMin: number | null;
}

export interface FlightPlan {
  source: 'simbrief' | 'manual';
  route: string;
  fixes: PlanFix[];
  routeDistanceNm: number | null;
  airDistanceNm: number | null;
  plannedEteMin: number | null;
  cruiseFl: string;
  costIndex: string;
  alternate: string;
  airac: string;
  fuelUnit: 'kg' | 'lb';
  fuel: { ramp: number | null; takeoff: number | null; trip: number | null; reserve: number | null; alternate: number | null; contingency: number | null; landing: number | null };
  avgWind: string;
  ofpUrl: string;
  requestId: string;
  generatedAt: string | null;
}

export interface PilotTimes {
  pic: number | null;
  sic: number | null;
  dual: number | null;        // dual instruction received
  instructor: number | null;  // dual given
  solo: number | null;
  night: number | null;
  ifrActual: number | null;
  ifrSim: number | null;      // simulated instrument (hood)
  xc: number | null;          // cross-country
  approaches: number | null;
  holds: number | null;
}

export const PILOT_FIELDS: { key: keyof PilotTimes; label: string; kind: 'time' | 'count'; tip: string }[] = [
  { key: 'pic', label: 'PIC', kind: 'time', tip: 'Pilot in command time.' },
  { key: 'sic', label: 'SIC / co-pilot', kind: 'time', tip: 'Second in command / co-pilot time.' },
  { key: 'dual', label: 'Dual received', kind: 'time', tip: 'Instruction received from an instructor.' },
  { key: 'instructor', label: 'Instructor', kind: 'time', tip: 'Instruction given (dual given).' },
  { key: 'solo', label: 'Solo', kind: 'time', tip: 'Solo flight time as a student.' },
  { key: 'night', label: 'Night', kind: 'time', tip: 'Time flown at night. Use “Estimate” to calculate it from the route and the sun.' },
  { key: 'ifrActual', label: 'Actual instrument', kind: 'time', tip: 'Flight in actual instrument meteorological conditions.' },
  { key: 'ifrSim', label: 'Simulated instrument', kind: 'time', tip: 'Instrument flight under a hood or view-limiting device.' },
  { key: 'xc', label: 'Cross-country', kind: 'time', tip: 'Cross-country time, as your authority defines it.' },
  { key: 'approaches', label: 'Approaches', kind: 'count', tip: 'Instrument approaches flown.' },
  { key: 'holds', label: 'Holds', kind: 'count', tip: 'Holding procedures flown.' },
];

export const emptyPilot = (): PilotTimes => ({ pic: null, sic: null, dual: null, instructor: null, solo: null, night: null, ifrActual: null, ifrSim: null, xc: null, approaches: null, holds: null });

export interface PhotoRecord {
  id: string;
  dataUrl: string;
  caption: string;
  createdAt: string;
}

export type DistanceUnit = 'km' | 'nm' | 'mi';
export type AltitudeUnit = 'ft' | 'm';
export type SpeedUnit = 'kt' | 'kmh' | 'mph';

export interface Settings {
  onboarded: boolean;
  displayName: string;
  avatar: string | null;           // data URL
  profile: FlyingProfile;
  homeAirport: string;
  distanceUnit: DistanceUnit;
  altitudeUnit: AltitudeUnit;
  speedUnit: SpeedUnit;
  timeFormat: '24h' | '12h';
  dateFormat: 'dd MMM yyyy' | 'yyyy-MM-dd' | 'MM/dd/yyyy' | 'dd/MM/yyyy';
  timeZone: string;                // preferred display zone ('local' = browser)
  timeEntryZone: 'airport' | 'utc';
  durationFormat: 'hm' | 'decimal';
  theme: 'midnight' | 'twilight';
  reduceTransparency: boolean;
  defaultCategory: FlightCategory;
  defaultAircraft: string;         // ICAO type code
  defaultSimulator: string;
  dashboardCards: string[];        // ordered stat card keys
  dashboardCharts: string[];
  showPhotos: boolean;
  privacyHideRegistrations: boolean;
  privacyHideDatesInShare: boolean;
  achievementsEnabled: boolean;
  calendarConvention: 'departure-local' | 'utc';
  simbriefUser: string;
  sounds: boolean;
  soundVolume: number;           // 0–1
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: FlightFilters;
}

export interface FlightFilters {
  q: string;
  from: string;      // YYYY-MM-DD
  to: string;
  categories: FlightCategory[];
  statuses: FlightStatus[];
  aircraft: string;  // type code
  registration: string;
  airline: string;
  airport: string;   // ident – matches dep or arr
  route: string;     // "DEP-ARR"
  operator: string;
  tag: string;
}

export interface AppNotification {
  id: string;
  kind: 'achievement' | 'import' | 'info' | 'warning';
  title: string;
  body: string;
  at: string;
  read: boolean;
  href?: string;
}

export interface IntegrationState {
  id: string;
  lastSync: string | null;
  lastError: string | null;
}

export interface WorkspaceData {
  flights: Flight[];
  presets: FilterPreset[];
  notifications: AppNotification[];
  achievementsSeen: string[];
  integrations: Record<string, IntegrationState>;
  customAircraft: CustomAircraft[];
}

export interface CustomAircraft {
  id: string;
  registration: string;
  typeCode: string;
  manufacturer: string;
  model: string;
  variant: string;
  operator: string;
  nickname: string;
  notes: string;
  photo: string | null;   // data URL
}

export const CATEGORY_LABEL: Record<FlightCategory, string> = {
  real: 'Real-world',
  simulator: 'Simulator',
  training: 'Training',
  ferry: 'Ferry',
  private: 'Private',
  commercial: 'Commercial',
  other: 'Other',
};

/** Categories whose time counts as real-world flying. Simulator never does. */
export const REAL_CATEGORIES: FlightCategory[] = ['real', 'training', 'ferry', 'private', 'commercial', 'other'];

export const STATUS_LABEL: Record<FlightStatus, string> = {
  completed: 'Completed',
  planned: 'Planned',
  cancelled: 'Cancelled',
  diverted: 'Diverted',
  draft: 'Incomplete',
};

export const ROLE_LABEL: Record<FlightRole, string> = {
  '': '—',
  passenger: 'Passenger',
  pic: 'Pilot in command',
  sic: 'Second in command',
  dual: 'Dual (student)',
  instructor: 'Instructor',
  observer: 'Observer / jump seat',
  'sim-pilot': 'Sim pilot',
  'cabin-crew': 'Cabin crew',
};

export const PROFILE_LABEL: Record<FlyingProfile, string> = {
  enthusiast: 'Aviation enthusiast',
  simmer: 'Flight simulation pilot',
  student: 'Student pilot',
  pilot: 'Licensed pilot',
  'virtual-airline': 'Virtual airline pilot',
};
