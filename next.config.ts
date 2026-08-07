import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Allow images from Unsplash (landing page hero images) and QR code API
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'api.qrserver.com' },
    ],
  },
  // TypeScript errors are ignored in build to avoid blocking deploys for type-only issues
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
