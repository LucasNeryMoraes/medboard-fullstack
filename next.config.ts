import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"]
  },
  poweredByHeader: false,
  reactStrictMode: true
};

export default nextConfig;
