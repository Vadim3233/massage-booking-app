import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const source = readFileSync(new URL("./AdminClientTelegramPanel.jsx", import.meta.url), "utf8")
  .replace(/^import .*;$/gm, "")
  .replace("const BOT_URL = normalizeTelegramBotUrl(import.meta.env?.VITE_TELEGRAM_BOT_URL);", 'const BOT_URL = "";')
  .replace("export function AdminClientTelegramView", "function AdminClientTelegramView")
  .replace("export function AdminClientTelegramPanel", "function AdminClientTelegramPanel");
const transformed = await transformWithOxc(source + "\nglobalThis.__TelegramView = AdminClientTelegramView;", "telegram-panel.jsx", { jsx: { runtime: "classic" } });
new Function("React", "useEffect", "useRef", "useState", "getSupabaseClient", "buildTelegramActivationUrl", transformed.code)(
  React, () => {}, () => ({ current: 0 }), () => {}, () => {}, () => {},
);
const AdminClientTelegramView = globalThis.__TelegramView;

const render = (status, extras = {}) => renderToStaticMarkup(React.createElement(AdminClientTelegramView, { status, ...extras }));
assert.match(render(null), /Checking/);
assert.match(render({ state: "NO_ACCOUNT" }), /authenticated account/);
assert.match(render({ state: "NOT_CONNECTED" }), /Not connected[\s\S]*Create Telegram activation link/);
assert.match(render({ state: "NOT_CONNECTED" }, { botConfigured: false }), /disabled=""[\s\S]*public bot URL is configured/);
assert.match(render({ state: "PENDING" }, { expiry: "12 September", activationLink: "https:\/\/t.me\/bot?start=secret" }), /Invitation pending[\s\S]*Expires 12 September[\s\S]*Copy activation link[\s\S]*Revoke invitation/);
assert.match(render({ state: "PENDING" }, { expiry: "12 September" }), /link is only available when it is created/);
assert.match(render({ state: "CONNECTED", username: "safe_name", linked_at: "2026-09-08T10:00:00Z" }), /Connected[\s\S]*@safe_name[\s\S]*Disconnect Telegram/);
assert.match(render({ state: "CONNECTED" }, { confirmation: "disconnect", busy: true }), /role="alertdialog"[\s\S]*client account and bookings stay intact[\s\S]*disabled=""/);
assert.match(render({ state: "ERROR" }, { message: "Load failed" }), /Create Telegram activation link[\s\S]*Retry[\s\S]*role="status">Load failed/);
console.log("Admin client Telegram states passed.");
