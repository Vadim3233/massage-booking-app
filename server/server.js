import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sendTransactionalEmail } from "./emailProvider.js";
import { isAllowedTelegramEventType, sendAdminTelegramNotification, sendTelegramTestMessage } from "./telegramProvider.js";

function loadLocalEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value.replace(/^["']|["']$/g, "");
    }
  }
}

loadLocalEnv();

const PORT = Number(process.env.API_PORT || 8787);
const ALLOWED_ORIGIN = process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5173";
const REMOTE_API_BASE_URL = process.env.VITE_API_BASE_URL || process.env.REMOTE_API_BASE_URL || "";
const TELEGRAM_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const TELEGRAM_RATE_LIMIT_MAX_REQUESTS = 20;
const telegramRateLimitBuckets = new Map();

function telegramClientKey(request) {
  return String(request.headers["x-forwarded-for"] || request.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

function isTelegramRateLimited(request) {
  const now = Date.now();
  const key = telegramClientKey(request);
  const bucket = telegramRateLimitBuckets.get(key) || { count: 0, resetAt: now + TELEGRAM_RATE_LIMIT_WINDOW_MS };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + TELEGRAM_RATE_LIMIT_WINDOW_MS;
  }

  bucket.count += 1;
  telegramRateLimitBuckets.set(key, bucket);
  return bucket.count > TELEGRAM_RATE_LIMIT_MAX_REQUESTS;
}

function hasValidInternalApiSecret(request) {
  return (
    typeof process.env.INTERNAL_API_SECRET === "string"
    && process.env.INTERNAL_API_SECRET !== ""
    && request.headers["x-internal-api-secret"] === process.env.INTERNAL_API_SECRET
  );
}

function getSelfBaseUrl(request) {
  const host = request.headers.host || `127.0.0.1:${PORT}`;
  const proto = request.headers["x-forwarded-proto"] || "http";
  return `${proto}://${host}`;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function sendTelegramTestWithFallback() {
  const localResult = await sendTelegramTestMessage();

  if (localResult.sent || !REMOTE_API_BASE_URL) {
    return localResult;
  }

  if (!["missing_telegram_bot_token", "missing_telegram_chat_id"].includes(localResult.reason)) {
    return localResult;
  }

  const remoteResponse = await fetch(`${REMOTE_API_BASE_URL.replace(/\/$/, "")}/api/telegram-test`, {
    headers: { "Content-Type": "application/json" },
    method: "POST",
    body: JSON.stringify({ source: "local-dev-proxy" }),
  });
  const remoteResult = await remoteResponse.json().catch(() => ({}));

  if (!remoteResponse.ok || remoteResult.sent === false) {
    throw new Error(remoteResult.reason || remoteResult.error || `Remote Telegram API returned ${remoteResponse.status}`);
  }

  return remoteResult;
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && request.url === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      provider: process.env.EMAIL_PROVIDER || "resend",
      replyToEmail: process.env.REPLY_TO_EMAIL || process.env.SENDER_REPLY_TO || "bookings@vadmassage.com",
      senderEmail: process.env.SENDER_EMAIL || "bookings@mydomain.com",
    });
    return;
  }

  if (request.method === "POST" && request.url === "/api/internal-transactional-emails") {
    try {
      const body = await readJsonBody(request);

      if (!process.env.INTERNAL_API_SECRET) {
        sendJson(response, 500, { error: "Server misconfigured", sent: false });
        return;
      }

      const proxyResponse = await fetch(`${getSelfBaseUrl(request)}/api/transactional-emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-api-secret": process.env.INTERNAL_API_SECRET,
        },
        body: JSON.stringify(body),
      });
      const proxyBody = await proxyResponse.json().catch(() => ({}));
      sendJson(response, proxyResponse.status, proxyBody);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Internal proxy failed",
        sent: false,
      });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/transactional-emails") {
    try {
      if (!hasValidInternalApiSecret(request)) {
        sendJson(response, 403, { error: "Forbidden", sent: false });
        return;
      }

      const body = await readJsonBody(request);
      const result = await sendTransactionalEmail(body);
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : "Unable to send transactional email",
        sent: false,
      });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/internal-telegram-notifications") {
    try {
      const body = await readJsonBody(request);

      if (!process.env.INTERNAL_API_SECRET) {
        sendJson(response, 500, { error: "Server misconfigured", sent: false });
        return;
      }

      const proxyResponse = await fetch(`${getSelfBaseUrl(request)}/api/telegram-notifications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-api-secret": process.env.INTERNAL_API_SECRET,
        },
        body: JSON.stringify(body),
      });
      const proxyBody = await proxyResponse.json().catch(() => ({}));
      sendJson(response, proxyResponse.status, proxyBody);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Internal proxy failed",
        sent: false,
      });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/telegram-notifications") {
    try {
      if (!hasValidInternalApiSecret(request)) {
        sendJson(response, 403, { error: "Forbidden", sent: false });
        return;
      }

      const body = await readJsonBody(request);
      const type = body.type || "notification";

      if (!isAllowedTelegramEventType(type)) {
        console.warn("Telegram notification rejected: unsupported type", { type });
        sendJson(response, 400, { error: "Unsupported Telegram notification type", sent: false });
        return;
      }

      if (isTelegramRateLimited(request)) {
        console.warn("Telegram notification rejected: rate limited", { client: telegramClientKey(request) });
        sendJson(response, 429, { error: "Too many Telegram notification requests", sent: false });
        return;
      }

      const result = await sendAdminTelegramNotification({
        payload: body.payload || {},
        type,
      });
      if (result.sent === false) {
        console.error("Telegram admin notification skipped", { type, reason: result.reason });
        sendJson(response, 400, result);
        return;
      }
      console.info("Telegram admin notification sent", { messageId: result.messageId, type });
      sendJson(response, 200, result);
    } catch (error) {
      console.error("Telegram admin notification failed", error);
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : "Unable to send Telegram notification",
        sent: false,
      });
    }
    return;
  }

  if (["GET", "POST"].includes(request.method) && request.url === "/api/telegram-test") {
    try {
      const result = await sendTelegramTestWithFallback();
      if (result.sent === false) {
        sendJson(response, 400, result);
        return;
      }
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : "Unable to send Telegram test message",
        sent: false,
      });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Email API listening on http://127.0.0.1:${PORT}`);
});

