import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sendTransactionalEmail } from "./emailProvider.js";
import { sendTelegramTestMessage } from "./telegramProvider.js";

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

  if (request.method === "POST" && request.url === "/api/transactional-emails") {
    try {
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

  if (["GET", "POST"].includes(request.method) && request.url === "/api/telegram-test") {
    try {
      const result = await sendTelegramTestWithFallback();
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
