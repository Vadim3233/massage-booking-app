import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const source = readFileSync(new URL("./MyBookingsPanel.jsx", import.meta.url), "utf8");

function readBalancedFunction(sourceText, name) {
  const start = sourceText.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);

  const signatureEnd = sourceText.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `${name} signature should end before a body brace`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) return sourceText.slice(start, index + 1);
  }

  throw new Error(`Could not read ${name}`);
}

const functionSource = [
  "function CalendarDays(props) { return React.createElement('svg', props); }",
  "function Clock3(props) { return React.createElement('svg', props); }",
  "function MapPin(props) { return React.createElement('svg', props); }",
  "function ReceiptText(props) { return React.createElement('svg', props); }",
  "function Repeat2(props) { return React.createElement('svg', props); }",
  readBalancedFunction(source, "formatDate"),
  readBalancedFunction(source, "prettyStatus"),
  readBalancedFunction(source, "isCancelledClientBooking"),
  readBalancedFunction(source, "cancellationActorCardLabel"),
  readBalancedFunction(source, "bookingStatusBadges"),
  readBalancedFunction(source, "BookingCard"),
  "globalThis.__BookingCard = BookingCard;",
].join("\n\n");

const transformed = await transformWithOxc(functionSource, "MyBookingsPanel.test.jsx", {
  loader: "jsx",
});

const require = createRequire(import.meta.url);
new Function("require", "React", transformed.code)(require, React);
const BookingCard = globalThis.__BookingCard;

const cancelledByClientHtml = renderToStaticMarkup(
  React.createElement(BookingCard, {
    booking: {
      bookingReference: "VDM-CANCELLED",
      cancellationLabel: "Cancelled",
      cancelledBy: "client",
      dateValue: "2026-09-04",
      duration: 60,
      id: "cancelled-client",
      paymentStatus: "cancelled",
      serviceName: "Massage",
      status: "cancelled",
      time: "16:45 - 17:45",
    },
    compact: true,
    onViewDetails: () => {},
  })
);

assert.match(cancelledByClientHtml, /Cancelled by you/);
assert.equal((cancelledByClientHtml.match(/Cancelled/g) || []).length, 1);
assert.doesNotMatch(cancelledByClientHtml, /<span>Cancelled<\/span><span>Cancelled<\/span>/);

const cancelledByTherapistHtml = renderToStaticMarkup(
  React.createElement(BookingCard, {
    booking: {
      cancellationLabel: "Cancelled",
      cancelledBy: "admin",
      dateValue: "2026-09-04",
      duration: 60,
      id: "cancelled-admin",
      paymentStatus: "cancelled",
      serviceName: "Massage",
      status: "cancelled",
      time: "14:45 - 15:45",
    },
    compact: true,
    onViewDetails: () => {},
  })
);

assert.match(cancelledByTherapistHtml, /Cancelled by therapist/);
assert.equal((cancelledByTherapistHtml.match(/Cancelled/g) || []).length, 1);

const pendingHtml = renderToStaticMarkup(
  React.createElement(BookingCard, {
    booking: {
      dateValue: "2026-09-05",
      duration: 60,
      id: "pending",
      paymentStatus: "awaiting_verification",
      serviceName: "Massage",
      status: "pending_payment_verification",
      time: "10:00 - 11:00",
    },
    onViewDetails: () => {},
  })
);

assert.match(pendingHtml, /Pending Payment Verification/);
assert.match(pendingHtml, /Awaiting Verification/);

console.log("My bookings panel status badge tests passed.");
