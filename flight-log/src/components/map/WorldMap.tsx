import React, { useEffect, useMemo, useRef, useState } from 'react';
import { geoOrthographic, geoPath, geoGraticule10, geoInterpolate, geoDistance, geoCentroid, geoRotation } from 'd3-geo';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import { allAirports, onAirportsChange } from '../../lib/airports';
import type { Flight } from '../../lib/types';
import { isCounted, routeKey, bestPath } from '../../lib/flight';
import { cx } from '../ui';
import { plural } from '../../lib/units';

const land = feature(world as any, (world as any).objects.countries) as any;
const borders = { type: 'MultiLineString', coordinates: (land.features as any[]).flatMap((f) => (f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.flat() : [])) } as any;
const graticule = geoGraticule10();

export interface MapRoute { key: string; a: [number, number]; b: [number, number]; count: number; flights: string[]; sim: number; label: string; path?: [number, number][] }
export interface MapAirport { ident: string; label: string; name: string; lon: number; lat: number; visits: number }

export function buildMapData(flights: Flight[]) {
  const routes = new Map<string, MapRoute>();
  const airports = new Map<string, MapAirport>();
  for (const f of flights) {
    if (!isCounted(f) && f.status !== 'planned') continue;
    const d = f.dep, a = f.arr;
    for (const x of [d, a]) {
      if (!x || x.lat == null || x.lon == null) continue;
      const v = airports.get(x.ident) ?? { ident: x.ident, label: x.iata || x.ident, name: x.name, lon: x.lon, lat: x.lat, visits: 0 };
      if (isCounted(f)) v.visits++;
      airports.set(x.ident, v);
    }
    if (!d || !a || d.lat == null || d.lon == null || a.lat == null || a.lon == null || d.ident === a.ident) continue;
    const k = routeKey(f)!;
    const r = routes.get(k) ?? { key: k, a: [d.lon, d.lat], b: [a.lon, a.lat], count: 0, flights: [], sim: 0, label: k };
    r.count++; r.flights.push(f.id);
    if (!r.path) { const p = bestPath(f); if (p) r.path = p.pts; }
    if (f.category === 'simulator') r.sim++;
    routes.set(k, r);
  }
  return { routes: [...routes.values()].sort((x, y) => x.count - y.count), airports: [...airports.values()].sort((x, y) => x.visits - y.visits) };
}

/** Midpoint longitude along the great circle — used to centre a single route (handles the antimeridian). */
export function routeCenter(a: [number, number], b: [number, number]): [number, number] {
  const m = geoInterpolate(a, b)(0.5);
  return [m[0], m[1]];
}

export interface WorldMapProps {
  routes: MapRoute[];
  airports: MapAirport[];
  height?: number | string;
  center?: number;               // central meridian
  fit?: [number, number][];      // lon/lat points to fit
  interactive?: boolean;
  wheelZoom?: boolean;
  heat?: boolean;
  selectedRoute?: string | null;
  selectedAirport?: string | null;
  showLabels?: boolean;
  fixes?: { ident: string; lon: number; lat: number }[];
  lines?: { pts: [number, number][]; color: string; dash?: string; width?: number }[];
  live?: { lat: number; lon: number; hdg: number } | null;
  spin?: boolean;                // slow auto-rotation (decorative maps)
  closeZoom?: boolean;           // allow zooming in to a few km (live tracking)
  onRoute?: (r: MapRoute, at: { x: number; y: number }) => void;
  onAirport?: (a: MapAirport, at: { x: number; y: number }) => void;
  onBackground?: () => void;
  className?: string;
  children?: React.ReactNode;
}


type V3 = [number, number, number];
const RAD = Math.PI / 180;
const toVec = (lon: number, lat: number): V3 => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];

/** Interactive 3D night globe: drag to spin, wheel / buttons to zoom. Same props as the old flat map. */
export function WorldMap({ routes, airports, height = 420, center = 0, fit, interactive = true, wheelZoom = false, heat = false, selectedRoute, selectedAirport, showLabels = true, fixes, lines, live, closeZoom, spin, onRoute, onAirport, onBackground, className, children }: WorldMapProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 420 });
  const [hover, setHover] = useState<string | null>(null);
  const [lightsV, setLightsV] = useState(0);
  const view = useRef({ rot: [0, -20] as [number, number], k: 1, fitR: 200, auto: 0 });
  const [, redraw] = useState(0);
  const tick = () => redraw((n) => (n + 1) % 1e9);
  const drag = useRef<{ x: number; y: number; rot: [number, number]; moved: boolean } | null>(null);
  const hits = useRef<{ routes: { key: string; pts: [number, number][] }[]; aps: { a: MapAirport; x: number; y: number }[] }>({ routes: [], aps: [] });

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 420 }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => { const off = onAirportsChange(() => setLightsV((v) => v + 1)); return () => { off(); }; }, []);

  // framing: centre on what matters and pick a zoom that fits it
  const fitKey = JSON.stringify(fit ?? null) + routes.length + airports.length + center + size.w + size.h;
  useEffect(() => {
    const pts: [number, number][] = fit && fit.length ? fit : airports.length ? airports.map((a) => [a.lon, a.lat]) : [];
    const half = Math.min(size.w, size.h) / 2;
    let rot: [number, number] = [-(center || 20), -22], R = half * 0.86;
    if (pts.length) {
      const c = geoCentroid({ type: 'MultiPoint', coordinates: pts } as any);
      const cLon = center && !fit ? center : c[0];
      rot = [-cLon, -Math.max(-60, Math.min(60, c[1]))];
      const ctr: [number, number] = [-rot[0], -rot[1]];
      const dmax = Math.max(0.0005, ...pts.map((p) => geoDistance(p, ctr)));
      const need = fit ? half * 0.8 / Math.sin(Math.min(dmax, Math.PI / 2)) : half * 0.86;
      R = Math.min(need, half * (closeZoom ? 900 : fit ? 40 : 0.86 / Math.sin(Math.min(Math.max(dmax, 0.6), Math.PI / 2))));
      R = Math.max(R, half * 0.86);
    }
    view.current = { ...view.current, rot, k: 1, fitR: R };
    tick();
  }, [fitKey]);

  // gentle spin for decorative globes
  useEffect(() => {
    if (!spin) return;
    let raf = 0, last = performance.now();
    const loop = (now: number) => { const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!drag.current) { view.current.rot = [view.current.rot[0] + dt * 6, view.current.rot[1]]; tick(); } raf = requestAnimationFrame(loop); };
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [spin]);

  const R = view.current.fitR * view.current.k;
  const maxVisits = Math.max(1, ...airports.map((a) => a.visits));
  const maxCount = Math.max(1, ...routes.map((r) => r.count));

  // ─── draw ───
  useEffect(() => {
    const canvas = cv.current; if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = size.w, H = size.h;
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const c = canvas.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, rot = view.current.rot;
    const proj = geoOrthographic().rotate([rot[0], rot[1], 0]).scale(R).translate([cx, cy]).clipAngle(90).precision(0.4);
    const path = geoPath(proj, c);
    const rotate = geoRotation([rot[0], rot[1], 0]);
    const center: [number, number] = [-rot[0], -rot[1]];
    const sp = (lon: number, lat: number, lift = 0): [number, number, boolean] => {
      const [l, p] = rotate([lon, lat]);
      const cl = Math.cos(p * RAD), r = R * (1 + lift);
      const x = cx + r * cl * Math.sin(l * RAD), y = cy - r * Math.sin(p * RAD), z = cl * Math.cos(l * RAD);
      const vis = z > 0 || Math.hypot(x - cx, y - cy) > R;
      return [x, y, vis];
    };
    const zoomed = R / (Math.min(W, H) / 2);
    // atmosphere + ocean
    let g = c.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.22);
    g.addColorStop(0, 'rgba(96,170,255,.42)'); g.addColorStop(0.35, 'rgba(70,130,255,.14)'); g.addColorStop(1, 'rgba(40,80,200,0)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R * 1.22, 0, 6.2832); c.fill();
    g = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
    g.addColorStop(0, '#12306a'); g.addColorStop(0.6, '#08183c'); g.addColorStop(1, '#040b1f');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, 6.2832); c.fill();
    // graticule, land, borders
    c.beginPath(); path(graticule); c.strokeStyle = 'rgba(140,190,255,.06)'; c.lineWidth = 0.6; c.stroke();
    c.beginPath(); path(land); g = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R); g.addColorStop(0, '#173064'); g.addColorStop(1, '#0d1d42'); c.fillStyle = g; c.fill();
    c.beginPath(); path(borders); c.strokeStyle = 'rgba(150,200,255,.16)'; c.lineWidth = 0.6; c.stroke();
    // city lights (every airport we know about), dimmer when zoomed far out
    c.globalCompositeOperation = 'lighter';
    const all = allAirports();
    const lightA = Math.min(0.85, 0.35 + zoomed * 0.08);
    for (let i = 0; i < all.length; i++) {
      const a = all[i]; if (a.lat == null || a.lon == null) continue;
      const [x, y, vis] = sp(a.lon, a.lat); if (!vis || Math.hypot(x - cx, y - cy) > R) continue;
      if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
      const big = a.size === 'L' ? 1.6 : a.size === 'M' ? 1.1 : 0.7;
      c.fillStyle = `rgba(255,${200 + ((i * 37) % 40)},140,${lightA * (0.35 + 0.4 * (big / 1.6))})`;
      c.fillRect(x - big / 2, y - big / 2, big, big);
    }
    if (heat) {
      for (const a of airports) {
        const [x, y, vis] = sp(a.lon, a.lat); if (!vis) continue;
        const w = a.visits / maxVisits, rr = (14 + 40 * Math.sqrt(w)) * Math.min(2.2, Math.sqrt(zoomed));
        const hg = c.createRadialGradient(x, y, 0, x, y, rr);
        hg.addColorStop(0, `rgba(${w > 0.5 ? '255,220,150' : '94,224,239'},${0.25 + 0.5 * w})`); hg.addColorStop(1, 'rgba(59,130,246,0)');
        c.fillStyle = hg; c.beginPath(); c.arc(x, y, rr, 0, 6.2832); c.fill();
      }
    }
    c.globalCompositeOperation = 'source-over';
    // limb shading
    g = c.createRadialGradient(cx, cy, R * 0.6, cx, cy, R);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(2,6,18,.55)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, 6.2832); c.fill();

    // custom surface lines (filed route, flown track)
    for (const ln of lines ?? []) {
      if (ln.pts.length < 2) continue;
      c.beginPath(); path({ type: 'LineString', coordinates: ln.pts } as any);
      c.setLineDash(ln.dash ? ln.dash.split(/\s+/).map(Number) : []);
      c.strokeStyle = ln.color; c.lineWidth = ln.width ?? 2.2; c.lineCap = 'round'; c.stroke();
      c.setLineDash([]);
    }
    // routes: arcs lifted off the surface, glowing
    const hitR: { key: string; pts: [number, number][] }[] = [];
    const sorted = [...routes].sort((a, b) => (a.key === selectedRoute || a.key === hover ? 1 : 0) - (b.key === selectedRoute || b.key === hover ? 1 : 0));
    const apSel = selectedAirport ? airports.find((a) => a.ident === selectedAirport)?.label : null;
    for (const r of sorted) {
      const src = r.path && r.path.length > 1 ? r.path : null;
      const dist = geoDistance(r.a, r.b);
      const n = src ? src.length : Math.max(12, Math.round(dist * 40));
      const ip = src ? null : geoInterpolate(r.a, r.b);
      const lift = src ? 0 : Math.min(0.22, 0.05 + dist * 0.09);
      const pts: [number, number][] = []; const vis: boolean[] = [];
      for (let i = 0; i < n; i++) {
        const u = src ? i / (n - 1) : i / (n - 1);
        const [lo, la] = src ? src[i] : ip!(u);
        const [x, y, v] = sp(lo, la, lift * Math.sin(Math.PI * u));
        pts.push([x, y]); vis.push(v);
      }
      const sel = r.key === selectedRoute, hov = r.key === hover;
      const dim = (selectedRoute && !sel) || (apSel && !r.key.split('–').includes(apSel));
      const w = r.count / maxCount;
      const sim = r.sim === r.count;
      const stroke = (width: number, color: string) => {
        c.beginPath(); let on = false;
        for (let i = 0; i < pts.length; i++) { if (vis[i]) { on ? c.lineTo(pts[i][0], pts[i][1]) : c.moveTo(pts[i][0], pts[i][1]); on = true; } else on = false; }
        c.lineWidth = width; c.strokeStyle = color; c.stroke();
      };
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.setLineDash(sim && !sel ? [4, 4] : []);
      if (!dim) stroke((sel || hov ? 7 : 4 + 3 * w), sel || hov ? 'rgba(255,255,255,.18)' : sim ? 'rgba(94,224,239,.10)' : 'rgba(91,155,255,.12)');
      stroke(sel || hov ? 2.4 : 1 + 1.4 * Math.sqrt(w), dim ? 'rgba(140,180,255,.12)' : sel || hov ? '#ffffff' : sim ? 'rgba(94,224,239,.9)' : `rgba(${Math.round(120 + 100 * w)},${Math.round(175 + 50 * w)},255,${0.55 + 0.4 * w})`);
      c.setLineDash([]);
      hitR.push({ key: r.key, pts: pts.filter((_, i) => vis[i]) });
    }
    // flight-plan fixes
    if (fixes?.length) {
      c.font = "600 9.5px 'Geist Mono Variable', ui-monospace, monospace";
      fixes.forEach((x, i) => {
        const [px, py, v] = sp(x.lon, x.lat); if (!v || Math.hypot(px - cx, py - cy) > R) return;
        c.save(); c.translate(px, py); c.rotate(Math.PI / 4); c.fillStyle = '#0b1630'; c.strokeStyle = '#5ee0ef'; c.lineWidth = 1.2; c.fillRect(-3, -3, 6, 6); c.strokeRect(-3, -3, 6, 6); c.restore();
        if (fixes.length <= 30 || zoomed > 3 || i % Math.ceil(fixes.length / 16) === 0) { c.lineWidth = 3; c.strokeStyle = '#050c1c'; c.strokeText(x.ident, px + 6, py - 5); c.fillStyle = 'rgba(94,224,239,.95)'; c.fillText(x.ident, px + 6, py - 5); }
      });
    }
    // airports
    const hitA: { a: MapAirport; x: number; y: number }[] = [];
    const labelled = new Set([...airports].sort((a, b) => b.visits - a.visits).slice(0, zoomed > 2.5 ? 60 : 14).map((a) => a.ident));
    c.font = "600 11px 'Geist Mono Variable', ui-monospace, monospace";
    for (const a of airports) {
      const [x, y, v] = sp(a.lon, a.lat); if (!v || Math.hypot(x - cx, y - cy) > R) continue;
      const w = a.visits / maxVisits, rr = 2.2 + 3.2 * Math.sqrt(w), sel = a.ident === selectedAirport;
      const gl = c.createRadialGradient(x, y, 0, x, y, rr * 4); gl.addColorStop(0, sel ? 'rgba(255,255,255,.55)' : 'rgba(120,180,255,.45)'); gl.addColorStop(1, 'rgba(91,155,255,0)');
      c.fillStyle = gl; c.beginPath(); c.arc(x, y, rr * 4, 0, 6.2832); c.fill();
      c.fillStyle = sel ? '#ffffff' : '#cfe6ff'; c.beginPath(); c.arc(x, y, rr, 0, 6.2832); c.fill();
      if (showLabels && (labelled.has(a.ident) || sel)) { c.lineWidth = 3.5; c.strokeStyle = 'rgba(3,8,22,.9)'; c.strokeText(a.label, x + rr + 4, y + 4); c.fillStyle = 'rgba(241,245,251,.92)'; c.fillText(a.label, x + rr + 4, y + 4); }
      hitA.push({ a, x, y });
    }
    // live aircraft
    if (live) {
      const [x, y, v] = sp(live.lon, live.lat);
      if (v) {
        const d = 0.3; const ahead = sp(live.lon + Math.sin(live.hdg * RAD) * d / Math.max(0.2, Math.cos(live.lat * RAD)), live.lat + Math.cos(live.hdg * RAD) * d);
        const ang = Math.atan2(ahead[0] - x, -(ahead[1] - y));
        const pulse = c.createRadialGradient(x, y, 0, x, y, 26); pulse.addColorStop(0, 'rgba(94,224,239,.45)'); pulse.addColorStop(1, 'rgba(94,224,239,0)');
        c.fillStyle = pulse; c.beginPath(); c.arc(x, y, 26, 0, 6.2832); c.fill();
        c.save(); c.translate(x, y); c.rotate(ang); c.scale(1.15, 1.15); c.translate(-12, -12);
        c.fillStyle = '#ffffff'; c.strokeStyle = '#050c1c'; c.lineWidth = 1.2; const pth = new Path2D(PLANE_ICON); c.fill(pth); c.stroke(pth); c.restore();
      }
    }
    hits.current = { routes: hitR, aps: hitA };
  });

  // ─── interaction ───
  const local = (e: { clientX: number; clientY: number }) => { const r = wrap.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const findRoute = (x: number, y: number) => {
    let best: string | null = null, bd = 9;
    for (const r of hits.current.routes) for (let i = 1; i < r.pts.length; i++) {
      const [x1, y1] = r.pts[i - 1], [x2, y2] = r.pts[i]; const dx = x2 - x1, dy = y2 - y1; const L2 = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L2)); const d = Math.hypot(x - x1 - u * dx, y - y1 - u * dy);
      if (d < bd) { bd = d; best = r.key; }
    }
    return best;
  };
  const findAp = (x: number, y: number) => { let best: MapAirport | null = null, bd = 11; for (const h of hits.current.aps) { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h.a; } } return best; };
  const zoomBy = (f: number) => { const lim = closeZoom ? 900 : fit ? 60 : 14; view.current.k = Math.max(0.6, Math.min(lim, view.current.k * f)); tick(); };
  const reset = () => { view.current.k = 1; tick(); };
  useEffect(() => {
    const el = cv.current; if (!el || !interactive) return;
    const onWheel = (e: WheelEvent) => { if (!(wheelZoom || e.ctrlKey || e.metaKey)) return; e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0015)); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [interactive, wheelZoom, closeZoom, fit]);

  return (
    <div ref={wrap} className={cx('relative min-w-0 w-full overflow-hidden', className)} style={{ height }}>
      <canvas
        ref={cv}
        role="img"
        aria-label={`Globe with ${plural(routes.length, 'route')} and ${plural(airports.length, 'airport')}`}
        className={cx('absolute inset-0 block h-full w-full touch-none select-none', interactive && (hover ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'))}
        onPointerDown={(e) => { if (!interactive) return; (e.target as Element).setPointerCapture(e.pointerId); drag.current = { ...local(e), rot: [...view.current.rot] as [number, number], moved: false }; }}
        onPointerMove={(e) => {
          const p = local(e);
          if (drag.current) {
            const dx = p.x - drag.current.x, dy = p.y - drag.current.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true;
            const deg = 180 / Math.PI / R;
            view.current.rot = [drag.current.rot[0] + dx * deg, Math.max(-85, Math.min(85, drag.current.rot[1] - dy * deg))];
            tick(); return;
          }
          if (interactive && onRoute) { const k = findRoute(p.x, p.y); if (k !== hover) setHover(k); }
        }}
        onPointerUp={(e) => {
          const d = drag.current; drag.current = null; if (!d || d.moved) return;
          const p = local(e);
          const a = onAirport ? findAp(p.x, p.y) : null;
          if (a) { onAirport!(a, p); return; }
          const rk = onRoute ? findRoute(p.x, p.y) : null;
          const r = rk ? routes.find((x) => x.key === rk) : null;
          if (r) onRoute!(r, p); else onBackground?.();
        }}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={() => interactive && zoomBy(1.8)}
      />
      {interactive && (
        <div className="absolute right-3 top-3 flex flex-col gap-1.5 no-print">
          <button className="btn-icon glass h-9 w-9 rounded-xl" onClick={() => zoomBy(1.6)} aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
          <button className="btn-icon glass h-9 w-9 rounded-xl" onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
          <button className="btn-icon glass h-9 w-9 rounded-xl" onClick={reset} aria-label="Reset view" disabled={view.current.k === 1}><Maximize2 className="h-4 w-4" /></button>
        </div>
      )}
      <span className="sr-only">{lightsV}</span>
      {children}
    </div>
  );
}

const PLANE_ICON = 'M12 1.6c.7 0 1.2.9 1.2 2.2v5.3l8 4.6c.4.2.6.6.6 1v1.1c0 .3-.3.5-.6.4l-8-2.5v4.6l2.3 1.7c.2.2.3.4.3.6v.9c0 .3-.3.5-.6.4L12 21l-3.2.9c-.3.1-.6-.1-.6-.4v-.9c0-.2.1-.5.3-.6l2.3-1.7v-4.6l-8 2.5c-.3.1-.6-.1-.6-.4v-1.1c0-.4.2-.8.6-1l8-4.6V3.8c0-1.3.5-2.2 1.2-2.2Z';
