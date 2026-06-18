import { sendTelegramTestMessage } from "../server/telegramProvider.js";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const rateLimitBuckets = new Map();
const LOCAL_DEV_ORIGIN_HOSTS = new Set([
  "127.0.0.1:5173",
  "localhost:5173",
]);

function normalizeOriginHost(value = "") {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return String(value).replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  }
}

function allowedOriginHosts(request) {
  return new Set([
    request.headers.host,
    process.env.FRONTEND_ORIGIN,
    process.env.VERCEL_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ].filter(Boolean).map(normalizeOriginHost));
}

function isAllowedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return process.env.NODE_ENV !== "production";
  const originHost = normalizeOriginHost(origin);
  return LOCAL_DEV_ORIGIN_HOSTS.has(originHost) || allowedOriginHosts(request).has(originHost);
}

function clientKey(request) {
  return String(request.headers["x-forwarded-for"] || request.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

function isRateLimited(request) {
  const now = Date.now();
  const key = clientKey(request);
  const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  return bucket.count > RATE_LIMIT_MAX_REQUESTS;
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  if (origin && isAllowedOrigin(request)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

export default async function handler(request, response) {
  setCorsHeaders(request, response);

  if (request.method === "OPTIONS") {
    response.status(isAllowedOrigin(request) ? 204 : 403).end();
    return;
  }

  if (!["GET", "POST"].includes(request.method)) {
    response.status(405).json({ error: "Method not allowed", sent: false });
    return;
  }

  if (!isAllowedOrigin(request)) {
    console.warn("Telegram test rejected: disallowed origin", { origin: request.headers.origin });
    response.status(403).json({ error: "Forbidden", sent: false });
    return;
  }

  if (isRateLimited(request)) {
    console.warn("Telegram test rejected: rate limited", { client: clientKey(request) });
    response.status(429).json({ error: "Too many Telegram test requests", sent: false });
    return;
  }

  try {
    const result = await sendTelegramTestMessage();
    if (result.sent === false) {
      console.error("Telegram test skipped", { reason: result.reason });
      response.status(400).json(result);
      return;
    }
    response.status(200).json(result);
  } catch (error) {
    console.error("Telegram test failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to send Telegram test message",
      sent: false,
    });
  }
}
