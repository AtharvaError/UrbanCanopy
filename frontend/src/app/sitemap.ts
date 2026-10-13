import type { MetadataRoute } from "next";

// Falls back to the production domain (see layout.tsx's siteUrl for why), so a
// deploy with no env vars set still emits real URLs instead of localhost ones.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const routes = [
    { path: "/", priority: 1 },
    { path: "/dashboard", priority: 0.9 },
    { path: "/plan", priority: 0.8 },
    { path: "/data", priority: 0.7 },
    { path: "/calculator", priority: 0.7 },
    { path: "/simulate", priority: 0.6 },
    { path: "/legal", priority: 0.2 },
  ];

  return routes.map(({ path, priority }) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    priority,
  }));
}
