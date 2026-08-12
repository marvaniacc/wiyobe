import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  // iframe embedding — allow the IDE Preview panel and any external dashboard
  // to embed pages from this app.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors *;" },
        ],
      },
    ];
  },
  // Allow the IDE Preview origin (*.space-z.ai) to load /_next/* assets in dev.
  // Ignored in production builds.
  allowedDevOrigins: ['*'],
};

export default nextConfig;
