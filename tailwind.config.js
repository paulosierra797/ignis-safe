/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#b11217',
        dark: '#1f2937',
        light: '#f5f5f5',
      },
    },
  },
  plugins: [],
}

