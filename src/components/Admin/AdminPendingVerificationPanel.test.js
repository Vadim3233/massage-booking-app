import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./AdminPendingVerificationPanel.jsx", import.meta.url);

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function walk(node, predicate, matches = []) {
  if (!node || typeof node === "string" || typeof node === "number") return matches;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, predicate, matches));
    return matches;
  }
  if (predicate(node)) matches.push(node);
  walk(node.props?.children, predicate, matches);
  return matches;
}

function renderComponent(props) {
  return AdminPendingVerificationPanel(props);
}

function readBalancedFunction(source, name) {
  const exportStart = source.indexOf(`export function ${name}`);
  const start = exportStart >= 0 ? exportStart : source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);

  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `${name} signature should end before a body brace`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  throw new Error(`Could not read ${name}`);
}

async function loadAdminPendingVerificationPanel() {
  const functionSource = readBalancedFunction(source, "AdminPendingVerificationPanel")
    .replace("export function AdminPendingVerificationPanel", "function AdminPendingVerificationPanel");
  const transformed = await transformWithOxc(
    [
      "function CheckCircle2(props) { return React.createElement('svg', props); }",
      functionSource,
      "globalThis.__AdminPendingVerificationPanelLoaded = AdminPendingVerificationPanel;",
    ].join("\n\n"),
    "AdminPendingVerificationPanel.jsx",
    { loader: "jsx" },
  );

  const require = createRequire(import.meta.url);
  new Function("require", "React", transformed.code)(require, React);
  return { AdminPendingVerificationPanel: globalThis.__AdminPendingVerificationPanelLoaded };
}

function buildBookings() {
  const bankBooking = { id: "booking-bank", clientName: "Ada Lovelace" };
  const cashBooking = { id: "booking-cash", clientName: "Grace Hopper" };
  return [
    {
      id: "booking-bank",
      actionLabel: "Mark transfer received",
      booking: bankBooking,
      clientName: "Ada Lovelace",
      dateLabel: "Monday 31 August",
      reason: "Waiting for bank transfer verification",
      referenceLabel: "VM-100",
      serviceLabel: "Massage",
      timeLabel: "10:00 - 11:30",
      tone: "bank",
      totalLabel: "£140.00",
    },
    {
      id: "booking-cash",
      actionLabel: "Approve cash request",
      booking: cashBooking,
      clientName: "Grace Hopper",
      dateLabel: "Tuesday 1 September",
      reason: "Waiting for cash payment approval",
      referenceLabel: "No reference assigned",
      serviceLabel: "Soft tissue therapy",
      timeLabel: "Time not set",
      tone: "cash",
      totalLabel: "",
    },
  ];
}

const source = readFileSync(componentUrl, "utf8");
assert.doesNotMatch(source, /\buse(State|Effect|Ref|Memo|Callback)\b/);
assert.doesNotMatch(source, /\bsupabase\b|\blocalStorage\b|\bfetch\b|\bsetTimeout\b|\bsetInterval\b|\basync\b/);

const { AdminPendingVerificationPanel } = await loadAdminPendingVerificationPanel();

const emptyHtml = renderToStaticMarkup(
  h(AdminPendingVerificationPanel, {
    bookings: [],
    onCompleteVerification: () => {},
    onOpenAgenda: () => {},
    onOpenDetails: () => {},
  })
);
assert.match(emptyHtml, /Pending verification/);
assert.match(emptyHtml, /Bookings to review/);
assert.match(emptyHtml, /Bank transfers and cash requests that still need your approval\./);
assert.match(emptyHtml, /0 pending/);
assert.match(emptyHtml, /Nothing waiting for approval/);
assert.match(emptyHtml, /New bank-transfer and cash requests will appear here automatically\./);

const bookings = buildBookings();
const html = renderToStaticMarkup(
  h(AdminPendingVerificationPanel, {
    actionDisabled: true,
    bookings,
    onCompleteVerification: () => {},
    onOpenAgenda: () => {},
    onOpenDetails: () => {},
  })
);
assert.match(html, /2 pending/);
assert.match(html, /admin-pending-card admin-pending-bank/);
assert.match(html, /admin-pending-card admin-pending-cash/);
assert.match(html, /Waiting for bank transfer verification/);
assert.match(html, /Waiting for cash payment approval/);
assert.match(html, /Ada Lovelace/);
assert.match(html, /Grace Hopper/);
assert.match(html, /Monday 31 August/);
assert.match(html, /10:00 - 11:30/);
assert.match(html, /£140\.00/);
assert.match(html, /No reference assigned/);
assert.match(html, /Mark transfer received/);
assert.match(html, /Approve cash request/);
assert.match(html, /disabled=""/);
assert.doesNotMatch(html, />\s*<\/span>/);

const calls = [];
const output = renderComponent({
  bookings,
  onCompleteVerification: (booking) => calls.push(["complete", booking]),
  onOpenAgenda: (booking) => calls.push(["agenda", booking]),
  onOpenDetails: (booking) => calls.push(["details", booking]),
});

const buttons = walk(output, (node) => node.type === "button");
assert.equal(buttons.map((button) => button.props.children)[0], "Agenda");
assert.equal(buttons.map((button) => button.props.children)[1], "Details");
assert.equal(buttons.map((button) => button.props.children)[2], "Mark transfer received");
buttons[0].props.onClick();
buttons[1].props.onClick();
buttons[2].props.onClick();
assert.deepEqual(calls, [
  ["agenda", bookings[0].booking],
  ["details", bookings[0].booking],
  ["complete", bookings[0].booking],
]);

console.log("Admin pending verification panel characterization tests passed.");
