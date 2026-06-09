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
  return allowedOriginHosts(request).has(normalizeOriginHost(origin));
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  if (origin && isAllowedOrigin(request)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
}

function getSelfBaseUrl(request) {
  const host = request.headers.host || "127.0.0.1:8787";
  const proto = request.headers["x-forwarded-proto"] || "http";
  return `${proto}://${host}`;
}

export default async function handler(request, response) {
  setCorsHeaders(request, response);

  if (request.method === "OPTIONS") {
    response.status(isAllowedOrigin(request) ? 204 : 403).end();
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed", sent: false });
    return;
  }

  if (!isAllowedOrigin(request)) {
    response.status(403).json({ error: "Forbidden", sent: false });
    return;
  }

  if (!process.env.INTERNAL_API_SECRET) {
    response.status(500).json({ error: "Server misconfigured", sent: false });
    return;
  }

  try {
    const proxyResponse = await fetch(`${getSelfBaseUrl(request)}/api/telegram-notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-secret": process.env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify(request.body || {}),
    });

    const result = await proxyResponse.json().catch(() => ({}));
    response.status(proxyResponse.status).json(result);
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Internal proxy failed", sent: false });
  }
}
