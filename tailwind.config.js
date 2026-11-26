/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        plum: {
          950: '#12080a',
          900: '#1c0d10',
          800: '#2b1318',
          700: '#421b22',
          500: '#b8323e',
          400: '#e04856',
          300: '#f57c86',
        },
        ember: {
          500: '#d97736',
          400: '#f59e42',
          300: '#fbbf6b',
        },
      },
      keyframes: {
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'float-slow': 'floatSlow 4s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
