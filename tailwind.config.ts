import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff1f2",
          100: "#ffe4e6",
          500: "#dc2626",
          600: "#b91c1c",
          700: "#991b1b"
        },
        ink: "#101828"
      },
      boxShadow: {
        soft: "0 12px 30px rgba(15, 23, 42, 0.08)",
        glow: "0 20px 50px rgba(185, 28, 28, 0.16)"
      }
    }
  },
  plugins: []
};

export default config;
