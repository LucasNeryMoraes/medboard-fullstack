import { NextRequest } from "next/server";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function sanitizeText(value: unknown) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .trim();
}

export function rateLimit(req: NextRequest, limit = 80, windowMs = 60_000) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const key = `${ip}:${req.nextUrl.pathname}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  bucket.count += 1;
  return { ok: bucket.count <= limit, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
}
