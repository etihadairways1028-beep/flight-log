import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ArrowLeft, Binoculars, Gamepad2, GraduationCap, PlaneTakeoff, Building2, Upload, FlaskConical, PenLine, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { Photo, cx } from '../components/ui';
import { Logo } from '../components/layout/AppShell';
import { Banner } from '../components/layout/Brand';
import { PHOTOS } from '../lib/images';
import type { FlyingProfile, Settings } from '../lib/types';
import { sound } from '../lib/sound';

const PROFILES: { id: FlyingProfile; title: string; body: string; icon: any; defaults: Partial<Settings> }[] = [
  { id: 'enthusiast', title: 'Aviation enthusiast', body: 'I log the flights I take as a passenger and the aircraft I see.', icon: Binoculars, defaults: { defaultCategory: 'real', timeEntryZone: 'airport' } },
  { id: 'simmer', title: 'Flight sim pilot', body: 'MSFS, X-Plane and friends. Sim time stays separate from real time.', icon: Gamepad2, defaults: { defaultCategory: 'simulator', timeEntryZone: 'utc', distanceUnit: 'nm' } },
  { id: 'student', title: 'Student pilot', body: 'Tracking lessons, dual time and progress toward a licence.', icon: GraduationCap, defaults: { defaultCategory: 'training', timeEntryZone: 'utc', distanceUnit: 'nm' } },
  { id: 'pilot', title: 'Licensed pilot', body: 'Recording real-world hours across aircraft and operators.', icon: PlaneTakeoff, defaults: { defaultCategory: 'real', timeEntryZone: 'utc', distanceUnit: 'nm' } },
  { id: 'virtual-airline', title: 'Virtual airline pilot', body: 'Flying a VA schedule with callsigns, fleets and routes.', icon: Building2, defaults: { defaultCategory: 'simulator', timeEntryZone: 'utc', distanceUnit: 'nm' } },
];

export default function Onboarding() {
  const s = useStore((x) => x.settings);
  const update = useStore((x) => x.updateSettings);
  const setWorkspace = useStore((x) => x.setWorkspace);
  const openForm = useStore((x) => x.openForm);
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(s.displayName);
  const [profile, setProfile] = useState<FlyingProfile>(s.profile);
  const [units, setUnits] = useState({ distanceUnit: s.distanceUnit, altitudeUnit: s.altitudeUnit, timeFormat: s.timeFormat });
  const [sounds, setSounds] = useState(s.sounds);

  const go = (n: number) => { sound.tap(); setStep(n); };
  async function finish(start: 'empty' | 'demo' | 'import') {
    const p = PROFILES.find((x) => x.id === profile)!;
    await update({ ...p.defaults, ...units, displayName: name.trim(), profile, sounds, onboarded: true });
    sound.success();
    if (start === 'demo') { await setWorkspace('demo'); nav('/'); }
    else if (start === 'import') { await setWorkspace('personal'); nav('/reports#import'); }
    else { await setWorkspace('personal'); nav('/'); setTimeout(() => openForm(), 350); }
  }

  const steps = ['Welcome', 'Flying', 'Units', 'Start'];
  return (
    <div className="relative min-h-[100dvh] overflow-hidden">
      <Photo photo={PHOTOS.wingClouds} className="fixed inset-0" priority sizes="100vw" overlay={false} />
      <div className="fixed inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/30" />
      <div className="fixed inset-0 bg-gradient-to-t from-ink via-transparent to-ink/60" />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-5 py-8 md:px-10">
        <div className="flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`}>
            {steps.map((l, i) => <span key={l} className={cx('h-1.5 rounded-full transition-all', i === step ? 'w-8 bg-ice' : i < step ? 'w-3 bg-ice/50' : 'w-3 bg-white/15')} />)}
          </div>
        </div>
        <div className="flex flex-1 items-center py-10">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }} className="w-full max-w-xl">
              {step === 0 && (
                <div>
                  <Banner className="mb-8 aspect-[1030/345] w-full max-w-[520px]" />
                  <div className="label mb-4 text-ice">Every flight tells a story</div>
                  <h1 className="text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] md:text-[64px] text-balance">Your logbook,<br />beautifully kept.</h1>
                  <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted">Log real and simulated flights, see your routes across the globe, and watch the hours add up. Your data stays on this device unless you export it.</p>
                  <div className="mt-8 max-w-sm">
                    <label htmlFor="ob-name" className="mb-1.5 block text-[12px] font-medium text-muted">What should we call you?</label>
                    <input id="ob-name" autoFocus className="input h-12 text-base" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go(1)} />
                  </div>
                  <button className="btn-primary mt-6 h-12 px-6 text-[15px]" onClick={() => go(1)}>Get started <ArrowRight className="h-4 w-4" /></button>
                </div>
              )}
              {step === 1 && (
                <div>
                  <h2 className="text-[32px] font-semibold tracking-[-0.03em]">How do you fly?</h2>
                  <p className="mt-2 text-muted">This sets sensible defaults. You can log any kind of flight, and change this later.</p>
                  <div className="mt-6 grid gap-2.5">
                    {PROFILES.map((p) => (
                      <button key={p.id} onClick={() => { sound.tap(); setProfile(p.id); }} className={cx('glass glass-hover flex items-center gap-4 rounded-xl2 p-4 text-left', profile === p.id && 'ring-2 ring-accent/70')} aria-pressed={profile === p.id}>
                        <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1', profile === p.id ? 'bg-accent/25 text-ice ring-accent/40' : 'bg-white/[0.05] text-muted ring-white/10')}><p.icon className="h-5 w-5" /></span>
                        <span className="min-w-0 flex-1"><span className="block font-medium">{p.title}</span><span className="block text-[13px] text-muted">{p.body}</span></span>
                        {profile === p.id && <Check className="h-5 w-5 text-ice" />}
                      </button>
                    ))}
                  </div>
                  {(profile === 'pilot' || profile === 'student') && <p className="mt-4 text-[12.5px] leading-relaxed text-warn/90">Flight Log is a personal record, not an approved regulatory logbook. Keep your official logbook as your authority requires.</p>}
                  <Nav back={() => go(0)} next={() => go(2)} />
                </div>
              )}
              {step === 2 && (
                <div>
                  <h2 className="text-[32px] font-semibold tracking-[-0.03em]">Units & feel</h2>
                  <p className="mt-2 text-muted">Data is stored in standard units and converted for display, so you can switch any time.</p>
                  <div className="mt-6 grid gap-4">
                    <Choice label="Distance" value={units.distanceUnit} onChange={(v) => setUnits({ ...units, distanceUnit: v })} options={[['km', 'Kilometres'], ['nm', 'Nautical miles'], ['mi', 'Miles']]} />
                    <Choice label="Altitude" value={units.altitudeUnit} onChange={(v) => setUnits({ ...units, altitudeUnit: v })} options={[['ft', 'Feet'], ['m', 'Metres']]} />
                    <Choice label="Clock" value={units.timeFormat} onChange={(v) => setUnits({ ...units, timeFormat: v })} options={[['24h', '24-hour'], ['12h', '12-hour']]} />
                    <Choice label="Interface sounds" value={sounds ? 'on' : 'off'} onChange={(v) => { setSounds(v === 'on'); if (v === 'on') setTimeout(() => sound.logged(), 30); }} options={[['on', 'Soft chimes'], ['off', 'Silent']]} />
                  </div>
                  <Nav back={() => go(1)} next={() => go(3)} />
                </div>
              )}
              {step === 3 && (
                <div>
                  <h2 className="text-[32px] font-semibold tracking-[-0.03em]">Where would you like to start?</h2>
                  <p className="mt-2 text-muted">Your logbook and the demo are kept completely separate.</p>
                  <div className="mt-6 grid gap-2.5">
                    <StartCard icon={PenLine} title="Log my first flight" body="Start with an empty logbook and add a flight now." onClick={() => finish('empty')} primary />
                    <StartCard icon={Upload} title="Import existing records" body="Bring flights in from a CSV file or a Flight Log backup." onClick={() => finish('import')} />
                    <StartCard icon={FlaskConical} title="Explore the demo workspace" body="Two years of fictional flights, clearly marked DEMO. Switch to your own logbook any time." onClick={() => finish('demo')} />
                  </div>
                  <button className="btn-ghost mt-5" onClick={() => go(2)}><ArrowLeft className="h-4 w-4" />Back</button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <p className="text-[11px] text-faint">Photography from Unsplash. Airport data from OurAirports (public domain).</p>
      </div>
    </div>
  );
}

function Nav({ back, next }: { back: () => void; next: () => void }) {
  return (
    <div className="mt-7 flex gap-2">
      <button className="btn-glass h-11" onClick={back}><ArrowLeft className="h-4 w-4" />Back</button>
      <button className="btn-primary h-11 px-6" onClick={next}>Continue <ArrowRight className="h-4 w-4" /></button>
    </div>
  );
}

function Choice<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-medium text-muted">{label}</div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} role="radio" aria-checked={value === v} onClick={() => { sound.tap(); onChange(v); }} className={cx('h-10 rounded-xl px-4 text-[13.5px] font-medium ring-1 transition', value === v ? 'bg-accent/25 text-fg ring-accent/50' : 'bg-white/[0.04] text-muted ring-white/10 hover:text-fg')}>{l}</button>
        ))}
      </div>
    </div>
  );
}

function StartCard({ icon: Icon, title, body, onClick, primary }: { icon: any; title: string; body: string; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} className={cx('glass glass-hover group flex items-center gap-4 rounded-xl2 p-4 text-left', primary && 'ring-1 ring-accent/50')}>
      <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1', primary ? 'bg-accent text-white ring-accent' : 'bg-white/[0.05] text-ice ring-white/10')}><Icon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1"><span className="block font-medium">{title}</span><span className="block text-[13px] text-muted">{body}</span></span>
      <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
