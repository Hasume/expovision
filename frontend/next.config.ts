import type { NextConfig } from "next";

/** Backend origin for fetch/XHR (must match connect-src; not covered by 'self' when API is another host/port). */
function apiConnectOrigin(): string {
  const fallback = "http://localhost:4000";
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!raw) return fallback;
  try {
    return new URL(raw).origin;
  } catch {
    return fallback;
  }
}

const apiOrigin = apiConnectOrigin();

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js requires unsafe-inline for its inline scripts/_NEXT_DATA
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // Allow images from self, data URIs and CDN domains used by the platform
      `img-src 'self' data: blob: ${apiOrigin} https://images.unsplash.com https://kinescope.io https://*.kinescope.io`,
      // Media (Kinescope player, webinar iframes)
      "media-src 'self' blob: https://kinescope.io https://*.kinescope.io",
      "frame-src 'self' https://kinescope.io https://*.kinescope.io https://www.youtube.com",
      `connect-src 'self' ${apiOrigin} https://uploader.kinescope.io https://*.kinescope.io`,
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      { source: "/community/post/:id", destination: "/community/topics/:id" },
    ];
  },
};

export default nextConfig;
