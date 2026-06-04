/** @type {import('tailwindcss').Config} */

// Paleta del proyecto: AZUL institucional (Farmacia / USM). Marca 100% azul,
// sin ámbar. `primary`/`accent` son escalas semánticas; además sobreescribimos
// `blue` con el azul de marca para que las clases existentes (bg-blue-600,
// text-blue-700…) queden alineadas sin barrer cada componente.
const blue = {
  50: '#E5F2FD',
  100: '#CCE4FB',
  200: '#99C9F7',
  300: '#66ADF3',
  400: '#3392EE',
  500: '#0077EA',
  600: '#005EB8',
  700: '#004B93',
  800: '#00386E',
  900: '#002549',
  950: '#001224',
};

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: blue,
        accent: blue, // sin ámbar — marca 100% azul
        blue,
        // Branding institucional USM (navy + azul de acento)
        brand: {
          navy: '#011023',
          blue: '#052558',
          accent: '#0077EA', // azul vivo (antes ámbar) → logo, nav activo, etc.
          light: '#7C9FC9',
          pale: '#C2E8FF',
        },
      },
    },
  },
  plugins: [],
};
