import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // BlockNote editor packages must remain external to the server bundle to
  // keep ProseMirror schema isolation intact (see components/editor/blocknote-editor.tsx).
  serverExternalPackages: ["@blocknote/core", "@blocknote/react", "@blocknote/mantine"],
  // Allow images from Unsplash (landing page hero images) and QR code API
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'api.qrserver.com' },
    ],
  },
  // NOTE: TypeScript and ESLint build errors are NO LONGER ignored — broken
  // types / lint failures will block `next build`. Fix them at the source.
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
