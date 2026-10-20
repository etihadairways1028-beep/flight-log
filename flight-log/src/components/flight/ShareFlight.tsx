import { useEffect, useRef, useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import type { Flight } from '../../lib/types';
import { Dialog, Toggle } from '../ui';
import { useFmt } from '../../lib/useFmt';
import { aircraftLabel } from '../../lib/flight';
import { code } from '../../lib/airports';
import { downloadBlob } from '../../lib/download';
import { sound } from '../../lib/sound';

/** Boarding-pass style image of one flight (1200×630, social-card size). */
export function ShareFlightDialog({ f, open, onOpenChange }: { f: Flight; open: boolean; onOpenChange: (v: boolean) => void }) {
  const fmt = useFmt();
  const ref = useRef<HTMLCanvasElement>(null);
  const [showDate, setShowDate] = useState(!fmt.s.privacyHideDatesInShare);
  const [showReg, setShowReg] = useState(false);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => draw());
    return () => cancelAnimationFrame(id);
  });

  function draw() {
    const c = ref.current;
    if (!c) return;
    const W = 1200, H = 630;
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0f2550'); bg.addColorStop(0.6, '#081430'); bg.addColorStop(1, '#040915');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W * 0.85, -40, 10, W * 0.85, -40, 700);
    glow.addColorStop(0, 'rgba(91,155,255,0.45)'); glow.addColorStop(1, 'rgba(91,155,255,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    // perforation
    g.setLineDash([6, 10]); g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(870, 40); g.lineTo(870, H - 40); g.stroke(); g.setLineDash([]);

    const sans = (w: number, s: number) => `${w} ${s}px 'Geist Variable', system-ui, sans-serif`;
    const mono = (w: number, s: number) => `${w} ${s}px 'Geist Mono Variable', ui-monospace, monospace`;
    g.fillStyle = '#cfe6ff'; g.font = "700 34px 'Fredoka', 'Geist Variable', sans-serif"; g.fillText('Flight Log', 64, 92);
    g.fillStyle = 'rgba(169,212,255,0.75)'; g.font = sans(500, 20);
    g.fillText([f.airline, f.flightNumber || f.callsign].filter(Boolean).join('  ·  ') || 'My flight', 64, 140);

    // codes
    g.fillStyle = '#ffffff'; g.font = mono(700, 132);
    g.fillText(code(f.dep), 60, 330);
    const arr = code(f.arr);
    const aw = g.measureText(arr).width;
    g.fillText(arr, 820 - aw, 330);
    g.fillStyle = 'rgba(148,163,189,1)'; g.font = sans(500, 24);
    g.fillText((f.dep?.city || f.dep?.name || '').slice(0, 22), 64, 372);
    const ac = (f.arr?.city || f.arr?.name || '').slice(0, 22);
    g.fillText(ac, 820 - g.measureText(ac).width, 372);
    // arc + plane
    const x0 = 64 + g.measureText(code(f.dep)).width * 0 + 330, x1 = 820 - aw - 40;
    g.strokeStyle = 'rgba(169,212,255,0.8)'; g.lineWidth = 3; g.setLineDash([2, 10]); g.lineCap = 'round';
    g.beginPath(); g.moveTo(Math.min(x0, x1 - 60), 270); g.quadraticCurveTo((x0 + x1) / 2, 200, Math.max(x1, x0 + 60), 270); g.stroke(); g.setLineDash([]);
    g.save(); g.translate((x0 + x1) / 2, 236); g.rotate(Math.PI / 2); g.fillStyle = '#fff';
    g.scale(2.2, 2.2); g.translate(-12, -12);
    g.fill(new Path2D('M12 1.6c.7 0 1.2.9 1.2 2.2v5.3l8 4.6c.4.2.6.6.6 1v1.1c0 .3-.3.5-.6.4l-8-2.5v4.6l2.3 1.7c.2.2.3.4.3.6v.9c0 .3-.3.5-.6.4L12 21l-3.2.9c-.3.1-.6-.1-.6-.4v-.9c0-.2.1-.5.3-.6l2.3-1.7v-4.6l-8 2.5c-.3.1-.6-.1-.6-.4v-1.1c0-.4.2-.8.6-1l8-4.6V3.8c0-1.3.5-2.2 1.2-2.2Z'));
    g.restore();

    // details row
    const items: [string, string][] = [
      ...(showDate ? [['DATE', fmt.date(f.date)] as [string, string]] : []),
      ...((f.aircraft.typeCode || f.aircraft.model) ? [['AIRCRAFT', f.aircraft.typeCode || f.aircraft.model] as [string, string]] : []),
      ['DISTANCE', fmt.dist(f.distanceKm)],
      ['TIME', f.flightMinutes != null ? fmt.dur(f.flightMinutes) : f.blockMinutes != null ? fmt.dur(f.blockMinutes) : '—'],
    ];
    let x = 64;
    for (const [k, v0] of items) {
      let v = v0, size = 30;
      g.font = mono(600, size);
      while (g.measureText(v).width > 240 && size > 18) { size -= 2; g.font = mono(600, size); }
      while (g.measureText(v).width > 240 && v.length > 4) v = v.slice(0, -2) + '…';
      g.fillStyle = 'rgba(98,114,143,1)'; g.font = sans(600, 16); g.fillText(k, x, 470);
      g.fillStyle = '#f1f5fb'; g.font = mono(600, size); g.fillText(v, x, 512);
      x += Math.max(g.measureText(v).width, 90) + 44;
      if (x > 830) break;
    }
    // stub
    g.fillStyle = 'rgba(98,114,143,1)'; g.font = sans(600, 16);
    const stub: [string, string][] = [['FROM', f.dep?.ident ?? '—'], ['TO', f.arr?.ident ?? '—'], ...(f.seat ? [['SEAT', f.seat] as [string, string]] : []), ...(showReg && f.aircraft.registration ? [['REG', f.aircraft.registration] as [string, string]] : [])];
    stub.slice(0, 4).forEach(([k, v], i) => {
      g.fillStyle = 'rgba(98,114,143,1)'; g.font = sans(600, 16); g.fillText(k, 920, 120 + i * 110);
      g.fillStyle = '#ffffff'; g.font = mono(700, 44); g.fillText(v, 920, 168 + i * 110);
    });
    g.fillStyle = 'rgba(169,212,255,0.55)'; g.font = sans(500, 16); g.fillText('Every flight tells a story.', 64, H - 50);
  }

  const save = () => ref.current?.toBlob((b) => { if (b) { downloadBlob(`flightlog-${code(f.dep)}-${code(f.arr)}-${f.date}.png`, b); sound.success(); } }, 'image/png');
  const share = () => ref.current?.toBlob(async (b) => {
    if (!b) return;
    const file = new File([b], `flightlog-${code(f.dep)}-${code(f.arr)}.png`, { type: 'image/png' });
    try { if ((navigator as any).canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `${code(f.dep)} → ${code(f.arr)}` }); else downloadBlob(file.name, b); } catch { /* cancelled */ }
  }, 'image/png');

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Share this flight" description="A boarding-pass style image. Notes, crew, times and booking details are never included." size="lg" footer={<>
      {'share' in navigator && <button className="btn-glass" onClick={share}><Share2 className="h-4 w-4" />Share</button>}
      <button className="btn-primary" onClick={save}><Download className="h-4 w-4" />Save image</button>
    </>}>
      <canvas ref={ref} className="w-full rounded-xl ring-1 ring-white/10" aria-label="Preview of the flight share image" />
      <div className="mt-4 flex flex-wrap gap-6 text-[13px]">
        <label className="flex items-center gap-2.5">Show date<Toggle checked={showDate} onChange={setShowDate} label="Show date" /></label>
        <label className="flex items-center gap-2.5">Show registration<Toggle checked={showReg} onChange={setShowReg} label="Show registration" /></label>
      </div>
    </Dialog>
  );
}
