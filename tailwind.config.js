import containerQueries from '@tailwindcss/container-queries'

/** @type {import('tailwindcss').Config} */
const c = (v) => `rgb(var(--${v}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'LatD', 'Peyda', '"Vazirmatn Variable"', 'system-ui', 'sans-serif'],
        fa: ['LatD', 'Peyda', '"Vazirmatn Variable"', 'Tahoma', 'sans-serif'],
        mono: ['"Geist Mono"', 'LatD', 'Peyda', 'ui-monospace', 'monospace'],
      },
      colors: {
        bg: c('bg'),
        surface: c('surface'),
        muted: c('muted'),
        line: c('line'),
        'line-strong': c('line-strong'),
        ink: c('ink'),
        sub: c('sub'),
        brand: c('brand'),
        'brand-soft': c('brand-soft'),
        wine: c('wine'),
        good: c('good'),
        warn: c('warn'),
        bad: c('bad'),
        band: c('band'),
        'on-band': c('on-band'),
        'band-sub': c('band-sub'),
        'band-line': c('band-line'),
      },
      borderRadius: { xl: '14px', '2xl': '24px', '3xl': '28px' },
      boxShadow: {
        card: '0 1px 2px rgb(15 26 46 / 0.04), 0 12px 32px -14px rgb(15 26 46 / 0.14)',
        float: '0 2px 6px rgb(15 26 46 / 0.05), 0 26px 50px -18px rgb(15 26 46 / 0.28)',
        pop: '0 18px 48px -16px rgb(10 12 16 / 0.42)',
      },
      // Container sizes for the main content area (pages respond to the space they actually get, not the viewport).
      containers: { sm: '26rem', md: '36rem', lg: '46rem', xl: '56rem', '2xl': '74rem', '3xl': '92rem' },
      transitionTimingFunction: { spring: 'cubic-bezier(.2,.9,.3,1.2)' },
    },
  },
  plugins: [containerQueries],
}
