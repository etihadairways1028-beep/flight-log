import { useId } from 'react';
import { cx } from '../ui';
import banner from '../../assets/flight-log-banner.jpg';

export const APP_NAME = 'Flight Log';
export const BANNER_URL = banner;

/** Glossy blue app icon: rounded glass tile, glowing plane, optional FLIGHT LOG caption. */
export function LogoMark({ size = 36, caption = false, className }: { size?: number; caption?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '');
  const h = caption ? size * (600 / 512) : size;
  return (
    <svg viewBox={caption ? '0 0 512 600' : '0 0 512 512'} width={size} height={h} className={cx('shrink-0 drop-shadow-[0_6px_18px_rgba(59,130,246,0.55)]', className)} aria-hidden="true">
      <defs>
        <radialGradient id={`b${id}`} cx="45%" cy="40%" r="72%">
          <stop offset="0%" stopColor="#0a1f4a" />
          <stop offset="45%" stopColor="#0f3a86" />
          <stop offset="82%" stopColor="#1f6fd1" />
          <stop offset="100%" stopColor="#7cc0ff" />
        </radialGradient>
        <linearGradient id={`r${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#eef7ff" stopOpacity=".95" />
          <stop offset="35%" stopColor="#7fbfff" stopOpacity=".45" />
          <stop offset="70%" stopColor="#1b4f9e" stopOpacity=".35" />
          <stop offset="100%" stopColor="#bfe0ff" stopOpacity=".9" />
        </linearGradient>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity=".5" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`p${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#cfe6ff" />
        </linearGradient>
        <filter id={`f${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="14" result="x" />
          <feMerge><feMergeNode in="x" /><feMergeNode in="x" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {caption ? (
        <>
          <rect x="8" y="8" width="496" height="584" rx="112" fill={`url(#b${id})`} />
          <rect x="8" y="8" width="496" height="584" rx="112" fill="none" stroke={`url(#r${id})`} strokeWidth="10" />
          <path d="M40 140 Q 40 40 140 40 L 372 40 Q 472 40 472 140 L 472 170 Q 256 230 40 190 Z" fill={`url(#g${id})`} />
          <g filter={`url(#f${id})`} transform="translate(256 262) rotate(45) scale(13) translate(-12 -12)">
            <path fill={`url(#p${id})`} d={PLANE} />
          </g>
          <text x="256" y="520" textAnchor="middle" fontFamily="'Fredoka', 'Geist Variable', Arial, sans-serif" fontWeight="700" fontSize="58" letterSpacing="10" fill="#e6f2ff">FLIGHT LOG</text>
        </>
      ) : (
        <>
          <rect x="8" y="8" width="496" height="496" rx="120" fill={`url(#b${id})`} />
          <rect x="8" y="8" width="496" height="496" rx="120" fill="none" stroke={`url(#r${id})`} strokeWidth="12" />
          <path d="M40 150 Q 40 40 150 40 L 362 40 Q 472 40 472 150 L 472 175 Q 256 235 40 195 Z" fill={`url(#g${id})`} />
          <g filter={`url(#f${id})`} transform="translate(256 262) rotate(45) scale(15) translate(-12 -12)">
            <path fill={`url(#p${id})`} d={PLANE} />
          </g>
        </>
      )}
    </svg>
  );
}

const PLANE = 'M12 1.6c.7 0 1.2.9 1.2 2.2v5.3l8 4.6c.4.2.6.6.6 1v1.1c0 .3-.3.5-.6.4l-8-2.5v4.6l2.3 1.7c.2.2.3.4.3.6v.9c0 .3-.3.5-.6.4L12 21l-3.2.9c-.3.1-.6-.1-.6-.4v-.9c0-.2.1-.5.3-.6l2.3-1.7v-4.6l-8 2.5c-.3.1-.6-.1-.6-.4v-1.1c0-.4.2-.8.6-1l8-4.6V3.8c0-1.3.5-2.2 1.2-2.2Z';

/** Liquid-glass bubble lettering, matching the Flight Log banner. */
export function Wordmark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <span className={cx('wordmark', className)} style={{ fontSize: size }}>
      Flight Log
    </span>
  );
}

/** The full banner artwork (sky, clouds, glass lettering). */
export function Banner({ className }: { className?: string }) {
  return (
    <div className={cx('relative overflow-hidden rounded-xl3 shadow-lift ring-1 ring-white/15', className)}>
      <img src={banner} alt="Flight Log" className="block h-full w-full object-cover" />
    </div>
  );
}
