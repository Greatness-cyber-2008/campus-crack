/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#12172B',
        inkLight: '#1B2140',
        paper: '#F5F0E1',
        stamp: '#C23B22',
        stampText: '#EE6A52', // AA-contrast red for small text on the dark backgrounds
        gold: '#E8B84B',
        slate: '#8B92A8',
      },
      fontFamily: {
        display: ['var(--font-archivo)', '"Archivo Black"', '"Arial Black"', 'sans-serif'],
        body: ['var(--font-inter)', '"Inter"', 'system-ui', 'sans-serif'],
        mono: ['var(--font-plex-mono)', '"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
