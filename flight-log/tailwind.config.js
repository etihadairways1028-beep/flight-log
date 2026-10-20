/** @type {import('tailwindcss').Config} */
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: v('ink'), night: v('night'), deep: v('deep'),
        fg: v('fg'), muted: v('muted'), faint: v('faint'),
        accent: v('accent'), ice: v('ice'), live: v('live'),
        good: v('good'), warn: v('warn'), bad: v('bad'),
      },
      fontFamily: {
        sans: ['"Geist Variable"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"Geist Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { xl2: '1.25rem', xl3: '1.75rem' },
      boxShadow: {
        glass: '0 1px 0 0 rgb(255 255 255 / 0.06) inset, 0 0 0 1px rgb(255 255 255 / 0.06) inset, 0 20px 50px -24px rgb(0 0 0 / 0.7)',
        lift: '0 1px 0 0 rgb(255 255 255 / 0.08) inset, 0 0 0 1px rgb(255 255 255 / 0.09) inset, 0 28px 60px -24px rgb(0 0 0 / 0.8)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        rise: { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: { shimmer: 'shimmer 1.6s infinite', rise: 'rise .35s cubic-bezier(.2,.7,.2,1) both' },
    },
  },
  plugins: [],
};
