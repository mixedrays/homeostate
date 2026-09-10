/** @type {import('tailwindcss').Config} */
const accent = (shade) => `rgb(var(--accent-${shade}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          50: accent(50),
          100: accent(100),
          200: accent(200),
          500: accent(500),
          600: accent(600),
          700: accent(700),
        },
      },
    },
  },
  plugins: [],
};
