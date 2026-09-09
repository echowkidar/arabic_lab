/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        emerald: {
          950: '#061a14',
          900: '#0b291f',
          800: '#0f3d2e',
          500: '#10b981',
          400: '#34d399',
        },
      },
    },
  },
  plugins: [],
}
