import React, { useEffect, useMemo, useRef, useState } from 'react';
import { geoNaturalEarth1, geoPath, geoGraticule10, geoInterpolate, type GeoProjection } from 'd3-geo';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { select } from 'd3-selection';
import 'd3-transition';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import type { Flight } from '../../lib/types';
import { isCounted, routeKey, bestPath } from '../../lib/flight';
import { cx } from '../ui';

const land = feature(world as any, (world as any).objects.countries) as any;
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
  onRoute?: (r: MapRoute, at: { x: number; y: number }) => void;
  onAirport?: (a: MapAirport, at: { x: number; y: number }) => void;
  onBackground?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export function WorldMap({ routes, airports, height = 420, center = 0, fit, interactive = true, wheelZoom = false, heat = false, selectedRoute, selectedAirport, showLabels = true, fixes, lines, live, onRoute, onAirport, onBackground, className, children }: WorldMapProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [size, setSize] = useState({ w: 800, h: 420 });
  const [k, setK] = useState(1);
  const [t, setT] = useState({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 420 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const projection: GeoProjection = useMemo(() => {
    const p = geoNaturalEarth1().rotate([-center, 0]).precision(0.2);
    if (fit && fit.length) {
      const pad = Math.min(size.w, size.h) * 0.18;
      const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: fit.length > 1 ? { type: 'LineString', coordinates: fit } : { type: 'Point', coordinates: fit[0] } }] } as any;
      const lo = fit.map((q) => q[0]), la = fit.map((q) => q[1]);
      const degenerate = fit.length === 1 || (Math.max(...lo) - Math.min(...lo) < 0.02 && Math.max(...la) - Math.min(...la) < 0.02);
      if (degenerate) p.scale(size.w * (live ? 30 : 2.2)).translate([size.w / 2, size.h / 2]);
      else p.fitExtent([[pad, pad], [size.w - pad, size.h - pad]], fc);
      const zmax = live ? 30 : 2.2;
      if (degenerate || !Number.isFinite(p.scale()) || p.scale() > size.w * zmax * 1.8) {
        p.scale(Math.min(Number.isFinite(p.scale()) ? p.scale() : Infinity, size.w * zmax));
        const c = p(fit[0])!;
        const [tx, ty] = p.translate();
        p.translate([tx + size.w / 2 - c[0], ty + size.h / 2 - c[1]]);
      }
    } else {
      p.fitExtent([[8, 8], [size.w - 8, size.h - 8]], { type: 'Sphere' } as any);
    }
    return p;
  }, [size.w, size.h, center, JSON.stringify(fit), !!live]);

  const path = useMemo(() => geoPath(projection), [projection]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !interactive) return;
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 14])
      .translateExtent([[-size.w * 0.2, -size.h * 0.2], [size.w * 1.2, size.h * 1.2]])
      .filter((ev: any) => (ev.type === 'wheel' ? wheelZoom || ev.ctrlKey || ev.metaKey : !ev.button))
      .on('zoom', (ev) => { setT({ x: ev.transform.x, y: ev.transform.y, k: ev.transform.k }); setK(ev.transform.k); });
    zoomRef.current = z;
    const sel = select(svg);
    sel.call(z as any);
    sel.on('dblclick.zoom', null);
    return () => { sel.on('.zoom', null); };
  }, [interactive, wheelZoom, size.w, size.h]);

  // reset zoom when the framing changes
  useEffect(() => {
    if (svgRef.current && zoomRef.current) select(svgRef.current).call(zoomRef.current.transform as any, zoomIdentity);
  }, [projection]);

  const zoomBy = (f: number) => svgRef.current && zoomRef.current && select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy as any, f);
  const reset = () => svgRef.current && zoomRef.current && select(svgRef.current).transition().duration(400).call(zoomRef.current.transform as any, zoomIdentity);

  const maxCount = Math.max(1, ...routes.map((r) => r.count));
  const maxVisits = Math.max(1, ...airports.map((a) => a.visits));
  const labelled = useMemo(() => new Set([...airports].sort((a, b) => b.visits - a.visits).slice(0, 14).map((a) => a.ident)), [airports]);

  const at = (e: React.MouseEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div ref={wrap} className={cx('relative min-w-0 w-full overflow-hidden', className)} style={{ height }}>
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        className={cx('absolute inset-0 block touch-none select-none', interactive && 'cursor-grab active:cursor-grabbing')}
        onClick={(e) => { if (e.target === e.currentTarget || (e.target as Element).getAttribute('data-bg')) onBackground?.(); }}
        role="img"
        aria-label={`World map with ${routes.length} routes and ${airports.length} airports`}
      >
        <defs>
          <radialGradient id="ocean" cx="50%" cy="40%" r="75%">
            <stop offset="0%" stopColor="#0b1a36" />
            <stop offset="100%" stopColor="#050c1c" />
          </radialGradient>
          <linearGradient id="routeGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#5b9bff" />
            <stop offset="100%" stopColor="#a9d4ff" />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="heatblur" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="14" /></filter>
        </defs>
        <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
          <path d={path({ type: 'Sphere' } as any) ?? ''} fill="url(#ocean)" stroke="rgb(255 255 255 / .08)" vectorEffect="non-scaling-stroke" data-bg="1" />
          <path d={path(graticule) ?? ''} fill="none" stroke="rgb(255 255 255 / .035)" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          <path d={path(land) ?? ''} fill="#13244a" stroke="rgb(169 212 255 / .14)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" data-bg="1" />
          {heat && (
            <g filter="url(#heatblur)" pointerEvents="none" style={{ mixBlendMode: 'screen' }}>
              {airports.map((a) => {
                const p = projection([a.lon, a.lat]);
                if (!p) return null;
                const w = a.visits / maxVisits;
                return <circle key={a.ident} cx={p[0]} cy={p[1]} r={(10 + 26 * Math.sqrt(w)) / Math.sqrt(t.k)} fill={w > 0.6 ? '#a9d4ff' : w > 0.25 ? '#5ee0ef' : '#3b82f6'} opacity={0.25 + 0.6 * w} />;
              })}
            </g>
          )}
          <g fill="none" strokeLinecap="round">
            {routes.map((r) => {
              const d = path({ type: 'LineString', coordinates: r.path ?? [r.a, r.b] } as any);
              if (!d) return null;
              const w = r.count / maxCount;
              const sel = selectedRoute === r.key, hov = hover === r.key;
              const dim = (selectedRoute && !sel) || (selectedAirport && !r.key.split('–').some((c) => airports.find((a) => a.ident === selectedAirport)?.label === c));
              return (
                <g key={r.key}>
                  <path d={d} stroke={sel || hov ? '#ffffff' : r.sim === r.count ? '#5ee0ef' : 'url(#routeGrad)'} strokeOpacity={dim ? 0.12 : sel || hov ? 1 : 0.35 + 0.6 * w} strokeWidth={sel || hov ? 2.6 : 1 + 2.4 * Math.sqrt(w)} vectorEffect="non-scaling-stroke" filter={sel ? 'url(#glow)' : undefined} strokeDasharray={r.sim === r.count ? '3 3' : undefined} pointerEvents="none" />
                  {onRoute && <path d={d} stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke" className="cursor-pointer" onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)} onClick={(e) => { e.stopPropagation(); onRoute(r, at(e)); }} />}
                </g>
              );
            })}
          </g>
          {lines?.map((ln, i) => {
            const d = ln.pts.length > 1 ? path({ type: 'LineString', coordinates: ln.pts } as any) : null;
            return d ? <path key={'ln' + i} d={d} fill="none" stroke={ln.color} strokeWidth={ln.width ?? 2.2} strokeDasharray={ln.dash} strokeLinecap="round" vectorEffect="non-scaling-stroke" pointerEvents="none" /> : null;
          })}
          {fixes && fixes.length > 0 && (
            <g pointerEvents="none">
              {fixes.map((x, i) => {
                const p = projection([x.lon, x.lat]);
                if (!p) return null;
                const s = 3.2 / Math.sqrt(t.k);
                const label = fixes.length <= 30 || t.k > 2.2 || i % Math.ceil(fixes.length / 18) === 0;
                return (
                  <g key={x.ident + i} transform={`translate(${p[0]},${p[1]})`}>
                    <rect x={-s} y={-s} width={s * 2} height={s * 2} transform="rotate(45)" fill="#0b1630" stroke="#5ee0ef" strokeWidth={1.2 / t.k} />
                    {label && <text x={5 / t.k} y={-5 / t.k} fontSize={9 / t.k} fontFamily="'Geist Mono Variable', ui-monospace, monospace" fill="rgb(94 224 239 / .9)" stroke="#050c1c" strokeWidth={2.5 / t.k} paintOrder="stroke">{x.ident}</text>}
                  </g>
                );
              })}
            </g>
          )}
          <g>
            {airports.map((a) => {
              const p = projection([a.lon, a.lat]);
              if (!p) return null;
              const w = a.visits / maxVisits;
              const r = (2.2 + 4 * Math.sqrt(w)) / Math.sqrt(t.k);
              const sel = selectedAirport === a.ident;
              return (
                <g key={a.ident} transform={`translate(${p[0]},${p[1]})`} className={onAirport ? 'cursor-pointer' : undefined} onClick={onAirport ? (e) => { e.stopPropagation(); onAirport(a, at(e)); } : undefined}>
                  <circle r={r * 2.6} fill="#5b9bff" opacity={sel ? 0.35 : 0.12} />
                  <circle r={r} fill={sel ? '#ffffff' : '#a9d4ff'} stroke="#050c1c" strokeWidth={1 / t.k} />
                  {onAirport && <circle r={Math.max(8, r * 3) / Math.sqrt(t.k)} fill="transparent" />}
                  {showLabels && (labelled.has(a.ident) || sel || t.k > 3) && (
                    <text x={r + 3 / t.k} y={3.5 / t.k} fontSize={10.5 / t.k} fontFamily="'Geist Mono Variable', ui-monospace, monospace" fill="rgb(241 245 251 / .85)" stroke="#050c1c" strokeWidth={3 / t.k} paintOrder="stroke" pointerEvents="none">{a.label}</text>
                  )}
                </g>
              );
            })}
          </g>
          {live && (() => {
            const p = projection([live.lon, live.lat]);
            if (!p) return null;
            const k = 1 / Math.sqrt(t.k);
            return (
              <g transform={`translate(${p[0]},${p[1]})`} pointerEvents="none">
                <circle r={16 * k} fill="#5ee0ef" opacity={0.18}><animate attributeName="r" values={`${10 * k};${22 * k};${10 * k}`} dur="2.4s" repeatCount="indefinite" /></circle>
                <g transform={`rotate(${live.hdg}) scale(${1.1 * k}) translate(-12 -12)`}>
                  <path fill="#ffffff" stroke="#050c1c" strokeWidth={1.2} d="M12 1.6c.7 0 1.2.9 1.2 2.2v5.3l8 4.6c.4.2.6.6.6 1v1.1c0 .3-.3.5-.6.4l-8-2.5v4.6l2.3 1.7c.2.2.3.4.3.6v.9c0 .3-.3.5-.6.4L12 21l-3.2.9c-.3.1-.6-.1-.6-.4v-.9c0-.2.1-.5.3-.6l2.3-1.7v-4.6l-8 2.5c-.3.1-.6-.1-.6-.4v-1.1c0-.4.2-.8.6-1l8-4.6V3.8c0-1.3.5-2.2 1.2-2.2Z" />
                </g>
              </g>
            );
          })()}
        </g>
      </svg>
      {interactive && (
        <div className="absolute right-3 top-3 flex flex-col gap-1.5 no-print">
          <button className="btn-icon glass h-9 w-9 rounded-xl" onClick={() => zoomBy(1.6)} aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
          <button className="btn-icon glass h-9 w-9 rounded-xl" onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
          <button className="btn-icon glass h-9 w-9 rounded-xl" onClick={reset} aria-label="Reset view" disabled={k === 1}><Maximize2 className="h-4 w-4" /></button>
        </div>
      )}
      {children}
    </div>
  );
}
