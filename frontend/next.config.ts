import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * What a page may load and where it may send data.
 *
 * Every outside host the site uses is named here; anything else is refused by
 * the browser. `'unsafe-inline'` stays on scripts and styles because Next
 * writes its start-up script inline and Leaflet styles its map inline, and the
 * site has no per-request nonce. So this policy limits where code and data can
 * come from and go to; it is not a defence against an injected inline script,
 * which the code avoids by never writing unescaped text into HTML.
 */
function contentSecurityPolicy(frameAncestors: string): string {
  return [
    "default-src 'self'",
    // Development needs eval for hot reload; production does not get it.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://va.vercel-scripts.com`,
    "style-src 'self' 'unsafe-inline'",
    // Map tiles: Mapbox when a token is set, Esri otherwise.
    "img-src 'self' data: blob: https://api.mapbox.com https://*.arcgisonline.com",
    "font-src 'self' data:",
    // The forecast, and analytics when it is configured.
    `connect-src 'self' https://api.open-meteo.com https://*.posthog.com https://vitals.vercel-insights.com${isDev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");
}

const BASE_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The map's "find my locality" button is the only use of a device feature.
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=()" },
  // Ignored over plain http, so it does nothing on localhost.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // No "X-Powered-By: Next.js": it tells a scanner which exploits to try first.
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Everything except the embed cards may only be framed by the site itself.
        source: "/((?!embed/).*)",
        headers: [
          ...BASE_HEADERS,
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy("'self'") },
        ],
      },
      {
        // The embed cards exist to be placed on other sites.
        source: "/embed/:path*",
        headers: [...BASE_HEADERS, { key: "Content-Security-Policy", value: contentSecurityPolicy("*") }],
      },
    ];
  },
};

export default nextConfig;
