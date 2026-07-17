/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * Xbox. #107C10 is the brand green; everything else is the console's own
         * black plus two derivatives of that green.
         *
         * The ground is true black, not a dark grey — a console dashboard on an
         * OLED is black, and #07070c reads as a website in a dark theme. The
         * greys are not neutral either: each carries a slight green bias, so
         * they read as chosen rather than inherited.
         */
        void: '#000000',
        xbox: { DEFAULT: '#107C10', lift: '#16A116' },
        velocity: '#9BF00B',
        bg: {
          0: '#000000',
          1: '#0B0C0B',
          2: '#141614',
          3: '#1F221F',
        },
        line: '#232622',
        ink: { DEFAULT: '#FFFFFF', 2: '#9BA39B', 3: '#5E655E' },
        /**
         * accent is Xbox green now, not cyan. Kept under its old name so every
         * existing `bg-accent` / `text-accent` moves to the brand in one edit,
         * instead of a rename sweep touching every component at once.
         */
        accent: {
          DEFAULT: '#107C10',
          soft: '#16A116',
          glow: '#9BF00B',
        },
        neon: '#16A116',
      },
      fontFamily: {
        /**
         * Xbox's own dashboard runs on Segoe, and Segoe UI Variable ships with
         * Windows 11 — so this is both the right face for the subject and one
         * that cannot silently fall back or fail to download. Cascadia is
         * Microsoft's mono, for stream stats where the digits must line up.
         */
        display: ['Segoe UI Variable Display', 'Segoe UI', 'system-ui', 'sans-serif'],
        sans: ['Segoe UI Variable Text', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['Cascadia Code', 'Consolas', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(155,240,11,0.5), 0 0 24px rgba(16,124,16,0.55)',
        card: '0 8px 30px rgba(0,0,0,0.6)',
        focus: '0 0 0 2.5px #9BF00B, 0 18px 44px rgba(0,0,0,0.8)',
      },
      backdropBlur: { xs: '2px' },
      keyframes: {
        fadeIn: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: { fadeIn: 'fadeIn .3s ease both' },
    },
  },
  plugins: [],
}
