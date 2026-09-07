import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./ClientBookingFlowScreens.jsx", import.meta.url);
const source = readFileSync(componentUrl, "utf8");

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

function readBalancedFunction(name) {
  const exportStart = source.indexOf(`export function ${name}`);
  assert.notEqual(exportStart, -1, `${name} should exist`);

  const signatureEnd = source.indexOf(") {", exportStart);
  assert.notEqual(signatureEnd, -1, `${name} signature should end before a body brace`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) {
      return source.slice(exportStart, index + 1)
        .replace(`export function ${name}`, `function ${name}`);
    }
  }

  throw new Error(`Could not read ${name}`);
}

async function loadComponents() {
  const iconNames = [
    "Activity",
    "Building2",
    "CalendarDays",
    "Check",
    "ChevronDown",
    "ChevronLeft",
    "ChevronRight",
    "Clock3",
    "DoorOpen",
    "FileText",
    "Mail",
    "MapPin",
    "Minus",
    "Moon",
    "Phone",
    "Plus",
    "ShieldCheck",
    "Sun",
    "UserRound",
  ];
  const transformed = await transformWithOxc(
    [
      ...iconNames.map((name) => `function ${name}(props) { return React.createElement('svg', props); }`),
      "function BookAgainPanel() { return React.createElement('section', { className: 'book-again-panel' }, 'Book again'); }",
      "function ClientAccountPanel() { return React.createElement('section', { className: 'client-account-panel' }, 'Account'); }",
      readBalancedFunction("ClientLocationStep"),
      readBalancedFunction("ClientTreatmentStep"),
      readBalancedFunction("ClientDurationStep"),
      readBalancedFunction("ClientTimeStep"),
      readBalancedFunction("ClientDetailsStep"),
      "globalThis.__ClientBookingFlowScreensLoaded = { ClientLocationStep, ClientTreatmentStep, ClientDurationStep, ClientTimeStep, ClientDetailsStep };",
    ].join("\n\n"),
    "ClientBookingFlowScreens.jsx",
    { loader: "jsx" },
  );

  const require = createRequire(import.meta.url);
  new Function("require", "React", transformed.code)(require, React);
  return globalThis.__ClientBookingFlowScreensLoaded;
}

assert.doesNotMatch(source, /\buse(State|Effect|Ref|Memo|Callback)\b/);
assert.doesNotMatch(source, /\bsupabase\b|\blocalStorage\b|\bfetch\b|\bsetTimeout\b|\bsetInterval\b|\basync\b/);

const {
  ClientDetailsStep,
  ClientDurationStep,
  ClientLocationStep,
  ClientTimeStep,
  ClientTreatmentStep,
} = await loadComponents();

const calls = [];
const locationOutput = ClientLocationStep({
  account: { error: "", loading: false, notice: "", profile: null, session: null, signingIn: false },
  areaPickerRef: null,
  areaSelectionMessage: "Outside coverage",
  bookAgain: { show: true, clientName: "Ada", favoriteSelection: null, lastSelection: null, loading: false, onApply: () => {}, recentSelections: [], usualSelection: null },
  onBackToReview: () => calls.push(["backReview"]),
  onEmailLogin: () => {},
  onGoogleLogin: () => {},
  onMyBookings: () => {},
  onSelectArea: (id) => calls.push(["area", id]),
  onSignOut: () => {},
  onToggleMoreAreas: () => calls.push(["more"]),
  returnToReviewAfterArea: true,
  serviceAreas: [{ congestionFeeLabel: "£15.00", id: "chelsea", name: "Chelsea", selected: true, travelSurchargeLabel: "£10.00" }],
  showMoreAreas: false,
  showMoreButton: true,
});
let html = renderToStaticMarkup(locationOutput);
assert.match(html, /Choose your area/);
assert.match(html, /Back to Review/);
assert.match(html, /Congestion charge £15\.00/);
assert.match(html, /Travel surcharge £10\.00/);
assert.match(html, /Show More Areas/);
assert.match(html, /Outside coverage/);
walk(locationOutput, (node) => node.type === "button" && node.props.className === "client-area-option selected-client-area")[0].props.onClick();
assert.deepEqual(calls.at(-1), ["area", "chelsea"]);

function ServiceIcon(props) {
  return h("svg", props);
}
html = renderToStaticMarkup(h(ClientTreatmentStep, {
  onBack: () => {},
  onSelectTreatment: () => {},
  progress: h("nav", null, "Progress"),
  treatments: [{ description: "Calm treatment", icon: ServiceIcon, id: "massage", title: "Massage" }],
}));
assert.match(html, /What would help you most today\?/);
assert.match(html, /Massage/);
assert.match(html, /Calm treatment/);

html = renderToStaticMarkup(h(ClientDurationStep, {
  continueReason: "Choose a duration",
  durationOptions: [{ addDisabled: false, badge: "Popular", label: "90 minutes", minutes: 90, priceLabel: "£140", quantity: 1 }],
  onAddDuration: () => {},
  onBack: () => {},
  onNext: () => {},
  onRemoveDuration: () => {},
  progress: null,
  valid: false,
}));
assert.match(html, /How much time would you like\?/);
assert.match(html, /90 minutes/);
assert.match(html, /£140/);
assert.match(html, /Choose a duration/);
assert.match(html, /disabled=""/);

const slot = { start: 600, bufferEnd: 720 };
const timeOutput = ClientTimeStep({
  bookingDetailsOpen: true,
  bookingDetailsPanel: h("section", { id: "premium-booking-details" }, "Details"),
  checkoutError: "Checkout issue",
  dateStripRef: null,
  dates: [{ dateValue: "2026-09-01", dayName: "Tue", month: "Sep", number: "1", selected: true }],
  holdIsCreating: false,
  message: "",
  noSlotMessage: "No slots",
  onBack: () => {},
  onNext: () => {},
  onOpenWaitlist: () => calls.push(["waitlist"]),
  onScrollDates: (direction) => calls.push(["scroll", direction]),
  onSelectDate: (day) => calls.push(["date", day.dateValue]),
  onSelectSlot: (value) => calls.push(["slot", value]),
  onToggleDetails: () => {},
  progress: null,
  canContinue: true,
  showFixedStartHint: true,
  showPrimaryWaitlistCta: true,
  slots: [{ evening: false, key: "600-720", label: "10:00", selected: true, slot }],
  timeContinueReason: "",
});
html = renderToStaticMarkup(timeOutput);
assert.match(html, /Date &amp; Time/);
assert.match(html, /This day starts at a fixed first appointment time\./);
assert.match(html, /10:00/);
assert.match(html, /Checkout issue/);
walk(timeOutput, (node) => node.type === "button" && node.props["data-client-date-value"] === "2026-09-01")[0].props.onClick();
walk(timeOutput, (node) => node.type === "button" && node.props.className === "premium-time-slot selected-premium-time-slot")[0].props.onClick();
assert.deepEqual(calls.slice(-2), [["date", "2026-09-01"], ["slot", slot]]);

html = renderToStaticMarkup(h(ClientDetailsStep, {
  appointment: { areaLabel: "Chelsea", durationMinutes: 90, timeLabel: "Tuesday at 10:00", treatmentTitle: "Massage" },
  bookingDetailsOpen: false,
  bookingDetailsPanel: null,
  canContinue: false,
  contact: { additionalNotes: "", apartment: "", city: "London", email: "ada@example.com", entryInstructions: "", nameInput: "Ada", phone: "07123", postcode: "SW3", streetAddress: "1 Street" },
  contactContinueReason: "Add a phone number",
  dev: true,
  onBack: () => {},
  onChangeAddress: () => {},
  onChangeContact: () => {},
  onChangeFullName: () => {},
  onFillTestClient: () => {},
  onNext: () => {},
  onToggleDetails: () => {},
  progress: null,
  showCheckoutWarning: true,
}));
assert.match(html, /Your Details/);
assert.match(html, /Fill test client/);
assert.match(html, /Massage .* 90 mins/);
assert.match(html, /Add a phone number/);
assert.match(html, /Review your appointment before checkout\./);

console.log("Client booking flow screen characterization tests passed.");
