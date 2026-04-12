/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: '#F6F1E7',
          50: '#FDFBF7',
          100: '#FAF5EC',
          200: '#F3EBDB',
          300: '#E9DFC8',
        },
        espresso: {
          DEFAULT: '#2A1E17',
          900: '#1B120D',
          800: '#2A1E17',
          700: '#3F2F24',
          600: '#5A4535',
          500: '#7A604C',
          400: '#9E8673',
          300: '#C2AE9A',
        },
        sage: {
          DEFAULT: '#8A9A7B',
          deep: '#5E6E52',
          soft: '#C8D1BA',
        },
        ochre: {
          DEFAULT: '#B88746',
          soft: '#D9B788',
        },
        rose: {
          DEFAULT: '#B06A5B',
          soft: '#D9B0A6',
        },
        slate: {
          stone: '#8D8578',
        },
      },
      fontFamily: {
        serif: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        'eyebrow': '0.22em',
        'display': '-0.02em',
      },
      boxShadow: {
        'soft-xl': '0 30px 60px -20px rgba(42, 30, 23, 0.18), 0 12px 24px -10px rgba(42, 30, 23, 0.08)',
        'soft-lg': '0 18px 40px -16px rgba(42, 30, 23, 0.14), 0 6px 14px -6px rgba(42, 30, 23, 0.06)',
        'soft-md': '0 10px 24px -10px rgba(42, 30, 23, 0.12), 0 3px 8px -3px rgba(42, 30, 23, 0.05)',
        'soft-sm': '0 4px 12px -4px rgba(42, 30, 23, 0.08)',
        'inner-highlight': 'inset 0 1px 1px rgba(255, 255, 255, 0.75), inset 0 -1px 0 rgba(42, 30, 23, 0.03)',
        'inner-well': 'inset 0 1px 2px rgba(42, 30, 23, 0.08), inset 0 -1px 0 rgba(255, 255, 255, 0.5)',
        'bezel-outer': '0 1px 0 rgba(255, 255, 255, 0.8), 0 20px 40px -18px rgba(42, 30, 23, 0.2)',
      },
      borderRadius: {
        'squircle': '1.75rem',
        'squircle-lg': '2.25rem',
      },
      transitionTimingFunction: {
        'silk': 'cubic-bezier(0.32, 0.72, 0, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'glide': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(18px)', filter: 'blur(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)', filter: 'blur(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'orb-drift': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(30px, -20px) scale(1.05)' },
          '66%': { transform: 'translate(-20px, 25px) scale(0.98)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96) translateY(8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 700ms cubic-bezier(0.32, 0.72, 0, 1) both',
        'fade-in': 'fade-in 500ms cubic-bezier(0.32, 0.72, 0, 1) both',
        'shimmer': 'shimmer 2.4s linear infinite',
        'orb-drift': 'orb-drift 18s cubic-bezier(0.45, 0, 0.55, 1) infinite',
        'scale-in': 'scale-in 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
      },
    },
  },
  plugins: [],
};
