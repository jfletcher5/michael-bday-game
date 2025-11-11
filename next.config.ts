import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable static export for Firebase Hosting
  output: 'export',
  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
