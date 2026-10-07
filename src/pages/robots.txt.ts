import type { APIRoute } from "astro";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL("https://tung.codes");
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${new URL("/sitemap.xml", base).href}\n`, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" },
  });
};
