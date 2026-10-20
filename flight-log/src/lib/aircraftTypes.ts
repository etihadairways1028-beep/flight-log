// Common ICAO aircraft type designators (ICAO Doc 8643). Only classification
// facts are recorded here (manufacturer, model, engine class, body class, wake
// category) — Flight Log does not invent performance specifications.

export type EngineClass = 'Jet' | 'Turboprop' | 'Piston' | 'Helicopter' | 'Electric' | 'Glider';
export type BodyClass = 'Wide-body' | 'Narrow-body' | 'Regional jet' | 'Turboprop airliner' | 'Business jet' | 'General aviation' | 'Rotorcraft' | 'Military' | 'Other';

export interface AircraftType {
  code: string;
  manufacturer: string;
  model: string;
  family: string;
  engine: EngineClass;
  body: BodyClass;
  wake: 'L' | 'M' | 'H' | 'J';
}

const T = (code: string, manufacturer: string, model: string, family: string, engine: EngineClass, body: BodyClass, wake: AircraftType['wake']): AircraftType =>
  ({ code, manufacturer, model, family, engine, body, wake });

export const AIRCRAFT_TYPES: AircraftType[] = [
  // Airbus
  T('A19N', 'Airbus', 'A319neo', 'A320 family', 'Jet', 'Narrow-body', 'M'),
  T('A20N', 'Airbus', 'A320neo', 'A320 family', 'Jet', 'Narrow-body', 'M'),
  T('A21N', 'Airbus', 'A321neo', 'A320 family', 'Jet', 'Narrow-body', 'M'),
  T('A318', 'Airbus', 'A318', 'A320 family', 'Jet', 'Narrow-body', 'M'),
  T('A319', 'Airbus', 'A319', 'A320 family', 'Jet', 'Narrow-body', 'M'),
  T('A320', 'Airbus', 'A320', 'A320 family', 'Jet', 'Narrow-body', 'M'),
  T('A321', 'Airbus', 'A321', 'A320 family', 'Jet', 'Narrow-body', 'M'),
  T('A332', 'Airbus', 'A330-200', 'A330', 'Jet', 'Wide-body', 'H'),
  T('A333', 'Airbus', 'A330-300', 'A330', 'Jet', 'Wide-body', 'H'),
  T('A338', 'Airbus', 'A330-800', 'A330neo', 'Jet', 'Wide-body', 'H'),
  T('A339', 'Airbus', 'A330-900', 'A330neo', 'Jet', 'Wide-body', 'H'),
  T('A343', 'Airbus', 'A340-300', 'A340', 'Jet', 'Wide-body', 'H'),
  T('A346', 'Airbus', 'A340-600', 'A340', 'Jet', 'Wide-body', 'H'),
  T('A359', 'Airbus', 'A350-900', 'A350', 'Jet', 'Wide-body', 'H'),
  T('A35K', 'Airbus', 'A350-1000', 'A350', 'Jet', 'Wide-body', 'H'),
  T('A388', 'Airbus', 'A380-800', 'A380', 'Jet', 'Wide-body', 'J'),
  T('BCS1', 'Airbus', 'A220-100', 'A220', 'Jet', 'Narrow-body', 'M'),
  T('BCS3', 'Airbus', 'A220-300', 'A220', 'Jet', 'Narrow-body', 'M'),
  T('A306', 'Airbus', 'A300-600', 'A300', 'Jet', 'Wide-body', 'H'),
  T('A310', 'Airbus', 'A310', 'A310', 'Jet', 'Wide-body', 'H'),
  // Boeing
  T('B712', 'Boeing', '717-200', '717', 'Jet', 'Narrow-body', 'M'),
  T('B733', 'Boeing', '737-300', '737 Classic', 'Jet', 'Narrow-body', 'M'),
  T('B734', 'Boeing', '737-400', '737 Classic', 'Jet', 'Narrow-body', 'M'),
  T('B735', 'Boeing', '737-500', '737 Classic', 'Jet', 'Narrow-body', 'M'),
  T('B736', 'Boeing', '737-600', '737 NG', 'Jet', 'Narrow-body', 'M'),
  T('B737', 'Boeing', '737-700', '737 NG', 'Jet', 'Narrow-body', 'M'),
  T('B738', 'Boeing', '737-800', '737 NG', 'Jet', 'Narrow-body', 'M'),
  T('B739', 'Boeing', '737-900', '737 NG', 'Jet', 'Narrow-body', 'M'),
  T('B37M', 'Boeing', '737 MAX 7', '737 MAX', 'Jet', 'Narrow-body', 'M'),
  T('B38M', 'Boeing', '737 MAX 8', '737 MAX', 'Jet', 'Narrow-body', 'M'),
  T('B39M', 'Boeing', '737 MAX 9', '737 MAX', 'Jet', 'Narrow-body', 'M'),
  T('B3XM', 'Boeing', '737 MAX 10', '737 MAX', 'Jet', 'Narrow-body', 'M'),
  T('B744', 'Boeing', '747-400', '747', 'Jet', 'Wide-body', 'H'),
  T('B748', 'Boeing', '747-8', '747', 'Jet', 'Wide-body', 'H'),
  T('B752', 'Boeing', '757-200', '757', 'Jet', 'Narrow-body', 'M'),
  T('B753', 'Boeing', '757-300', '757', 'Jet', 'Narrow-body', 'M'),
  T('B762', 'Boeing', '767-200', '767', 'Jet', 'Wide-body', 'H'),
  T('B763', 'Boeing', '767-300', '767', 'Jet', 'Wide-body', 'H'),
  T('B764', 'Boeing', '767-400', '767', 'Jet', 'Wide-body', 'H'),
  T('B772', 'Boeing', '777-200', '777', 'Jet', 'Wide-body', 'H'),
  T('B77L', 'Boeing', '777-200LR / 777F', '777', 'Jet', 'Wide-body', 'H'),
  T('B773', 'Boeing', '777-300', '777', 'Jet', 'Wide-body', 'H'),
  T('B77W', 'Boeing', '777-300ER', '777', 'Jet', 'Wide-body', 'H'),
  T('B778', 'Boeing', '777-8', '777X', 'Jet', 'Wide-body', 'H'),
  T('B779', 'Boeing', '777-9', '777X', 'Jet', 'Wide-body', 'H'),
  T('B788', 'Boeing', '787-8 Dreamliner', '787', 'Jet', 'Wide-body', 'H'),
  T('B789', 'Boeing', '787-9 Dreamliner', '787', 'Jet', 'Wide-body', 'H'),
  T('B78X', 'Boeing', '787-10 Dreamliner', '787', 'Jet', 'Wide-body', 'H'),
  T('MD11', 'McDonnell Douglas', 'MD-11', 'MD-11', 'Jet', 'Wide-body', 'H'),
  T('MD88', 'McDonnell Douglas', 'MD-88', 'MD-80', 'Jet', 'Narrow-body', 'M'),
  // Regional
  T('E170', 'Embraer', 'E170', 'E-Jet', 'Jet', 'Regional jet', 'M'),
  T('E75L', 'Embraer', 'E175', 'E-Jet', 'Jet', 'Regional jet', 'M'),
  T('E190', 'Embraer', 'E190', 'E-Jet', 'Jet', 'Regional jet', 'M'),
  T('E195', 'Embraer', 'E195', 'E-Jet', 'Jet', 'Regional jet', 'M'),
  T('E290', 'Embraer', 'E190-E2', 'E-Jet E2', 'Jet', 'Regional jet', 'M'),
  T('E295', 'Embraer', 'E195-E2', 'E-Jet E2', 'Jet', 'Regional jet', 'M'),
  T('E145', 'Embraer', 'ERJ-145', 'ERJ', 'Jet', 'Regional jet', 'M'),
  T('CRJ2', 'Bombardier', 'CRJ200', 'CRJ', 'Jet', 'Regional jet', 'M'),
  T('CRJ7', 'Bombardier', 'CRJ700', 'CRJ', 'Jet', 'Regional jet', 'M'),
  T('CRJ9', 'Bombardier', 'CRJ900', 'CRJ', 'Jet', 'Regional jet', 'M'),
  T('CRJX', 'Bombardier', 'CRJ1000', 'CRJ', 'Jet', 'Regional jet', 'M'),
  T('SU95', 'Sukhoi', 'Superjet 100', 'SSJ100', 'Jet', 'Regional jet', 'M'),
  T('C919', 'COMAC', 'C919', 'C919', 'Jet', 'Narrow-body', 'M'),
  T('AT45', 'ATR', 'ATR 42-500', 'ATR 42', 'Turboprop', 'Turboprop airliner', 'M'),
  T('AT72', 'ATR', 'ATR 72', 'ATR 72', 'Turboprop', 'Turboprop airliner', 'M'),
  T('AT76', 'ATR', 'ATR 72-600', 'ATR 72', 'Turboprop', 'Turboprop airliner', 'M'),
  T('DH8A', 'De Havilland Canada', 'Dash 8-100', 'Dash 8', 'Turboprop', 'Turboprop airliner', 'M'),
  T('DH8D', 'De Havilland Canada', 'Dash 8-400', 'Dash 8', 'Turboprop', 'Turboprop airliner', 'M'),
  T('SF34', 'Saab', '340', 'Saab 340', 'Turboprop', 'Turboprop airliner', 'M'),
  T('DHC6', 'De Havilland Canada', 'DHC-6 Twin Otter', 'Twin Otter', 'Turboprop', 'Turboprop airliner', 'L'),
  // General aviation
  T('C152', 'Cessna', '152', 'Cessna single', 'Piston', 'General aviation', 'L'),
  T('C172', 'Cessna', '172 Skyhawk', 'Cessna single', 'Piston', 'General aviation', 'L'),
  T('C182', 'Cessna', '182 Skylane', 'Cessna single', 'Piston', 'General aviation', 'L'),
  T('C208', 'Cessna', '208 Caravan', 'Caravan', 'Turboprop', 'General aviation', 'L'),
  T('P28A', 'Piper', 'PA-28 Cherokee / Warrior', 'PA-28', 'Piston', 'General aviation', 'L'),
  T('P28R', 'Piper', 'PA-28R Arrow', 'PA-28', 'Piston', 'General aviation', 'L'),
  T('PA34', 'Piper', 'PA-34 Seneca', 'Seneca', 'Piston', 'General aviation', 'L'),
  T('DA40', 'Diamond', 'DA40', 'DA40', 'Piston', 'General aviation', 'L'),
  T('DA42', 'Diamond', 'DA42 Twin Star', 'DA42', 'Piston', 'General aviation', 'L'),
  T('DA62', 'Diamond', 'DA62', 'DA62', 'Piston', 'General aviation', 'L'),
  T('SR20', 'Cirrus', 'SR20', 'SR', 'Piston', 'General aviation', 'L'),
  T('SR22', 'Cirrus', 'SR22', 'SR', 'Piston', 'General aviation', 'L'),
  T('BE36', 'Beechcraft', 'Bonanza A36', 'Bonanza', 'Piston', 'General aviation', 'L'),
  T('BE58', 'Beechcraft', 'Baron 58', 'Baron', 'Piston', 'General aviation', 'L'),
  T('BE20', 'Beechcraft', 'King Air 200', 'King Air', 'Turboprop', 'General aviation', 'L'),
  T('B350', 'Beechcraft', 'King Air 350', 'King Air', 'Turboprop', 'General aviation', 'L'),
  T('PC12', 'Pilatus', 'PC-12', 'PC-12', 'Turboprop', 'General aviation', 'L'),
  T('TBM9', 'Daher', 'TBM 900 series', 'TBM', 'Turboprop', 'General aviation', 'L'),
  T('KODI', 'Daher', 'Kodiak 100', 'Kodiak', 'Turboprop', 'General aviation', 'L'),
  T('VELI', 'Pipistrel', 'Velis Electro', 'Velis', 'Electric', 'General aviation', 'L'),
  T('ICON', 'ICON', 'A5', 'A5', 'Piston', 'General aviation', 'L'),
  // Business
  T('C25A', 'Cessna', 'Citation CJ2', 'Citation', 'Jet', 'Business jet', 'L'),
  T('C25B', 'Cessna', 'Citation CJ3', 'Citation', 'Jet', 'Business jet', 'L'),
  T('C510', 'Cessna', 'Citation Mustang', 'Citation', 'Jet', 'Business jet', 'L'),
  T('C68A', 'Cessna', 'Citation Latitude', 'Citation', 'Jet', 'Business jet', 'M'),
  T('C700', 'Cessna', 'Citation Longitude', 'Citation', 'Jet', 'Business jet', 'M'),
  T('PC24', 'Pilatus', 'PC-24', 'PC-24', 'Jet', 'Business jet', 'M'),
  T('SF50', 'Cirrus', 'Vision Jet SF50', 'Vision Jet', 'Jet', 'Business jet', 'L'),
  T('E55P', 'Embraer', 'Phenom 300', 'Phenom', 'Jet', 'Business jet', 'M'),
  T('GLF6', 'Gulfstream', 'G650', 'Gulfstream', 'Jet', 'Business jet', 'M'),
  T('GLEX', 'Bombardier', 'Global Express', 'Global', 'Jet', 'Business jet', 'M'),
  T('CL35', 'Bombardier', 'Challenger 350', 'Challenger', 'Jet', 'Business jet', 'M'),
  // Rotorcraft
  T('R22', 'Robinson', 'R22', 'Robinson', 'Helicopter', 'Rotorcraft', 'L'),
  T('R44', 'Robinson', 'R44', 'Robinson', 'Helicopter', 'Rotorcraft', 'L'),
  T('EC35', 'Airbus Helicopters', 'H135', 'H135', 'Helicopter', 'Rotorcraft', 'L'),
  T('EC45', 'Airbus Helicopters', 'H145', 'H145', 'Helicopter', 'Rotorcraft', 'L'),
  T('B06', 'Bell', '206 JetRanger', 'Bell 206', 'Helicopter', 'Rotorcraft', 'L'),
  T('A139', 'Leonardo', 'AW139', 'AW139', 'Helicopter', 'Rotorcraft', 'M'),
];

const BY_CODE = new Map(AIRCRAFT_TYPES.map((t) => [t.code, t]));

export function aircraftType(code: string | undefined | null): AircraftType | undefined {
  if (!code) return undefined;
  return BY_CODE.get(code.trim().toUpperCase());
}

export function searchAircraftTypes(q: string, limit = 12): AircraftType[] {
  const s = q.trim().toLowerCase();
  if (!s) return AIRCRAFT_TYPES.slice(0, limit);
  const scored: [number, AircraftType][] = [];
  for (const t of AIRCRAFT_TYPES) {
    const hay = `${t.code} ${t.manufacturer} ${t.model} ${t.family}`.toLowerCase();
    if (t.code.toLowerCase() === s) scored.push([0, t]);
    else if (t.code.toLowerCase().startsWith(s)) scored.push([1, t]);
    else if (hay.includes(s)) scored.push([2, t]);
    else if (s.split(/\s+/).every((p) => hay.includes(p))) scored.push([3, t]);
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map((x) => x[1]);
}

/** Classification for a flight's aircraft, falling back gracefully when the type is unknown. */
export function classify(code: string): { engine: EngineClass | 'Unknown'; body: BodyClass | 'Unknown' } {
  const t = aircraftType(code);
  return t ? { engine: t.engine, body: t.body } : { engine: 'Unknown', body: 'Unknown' };
}
