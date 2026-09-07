import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./SettingsRoutingDetailPanels.jsx", import.meta.url);
const appUrl = new URL("../../App.jsx", import.meta.url);

function readBalancedFunction(source, name) {
  const exportStart = source.indexOf(`export function ${name}`);
  const start = exportStart >= 0 ? exportStart : source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `${name} signature should end before a body brace`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not read ${name}`);
}

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function SettingsDetailPanel({ title, description, items = [], note = "", actions = null }) {
  return h(
    "div",
    { className: "settings-placeholder settings-detail-panel" },
    h("div", null, h("h3", null, title), description && h("p", null, description)),
    items.length > 0 && h(
      "div",
      { className: "settings-detail-grid" },
      items.map((item) => h("article", { className: "settings-detail-item", key: item.title }, h("strong", null, item.title), h("p", null, item.body))),
    ),
    note && h("p", { className: "admin-muted-note" }, note),
    actions && h("div", { className: "settings-detail-actions" }, actions),
  );
}

function fallbackSettingsRoutingDetailPanels(props) {
  const {
    activeCategoryId,
    selectedSection,
    allCustomers,
    bankDetailCount,
    days,
    getWaitlistStatus,
    isDevelopmentMode,
    onOpenAdminTab,
    onOpenBlockedTime,
    onOpenSettingsSection,
    onOpenSettingsSubsection,
    serviceAreas,
    waitlistEntries,
  } = props;

  if (activeCategoryId === "scheduling" && selectedSection === "Blocked Time") {
    const personalEventCount = days.reduce((count, day) => (
      count + day.bookings.filter((booking) => booking.kind === "personal" || booking.serviceId === "personal-event").length
    ), 0);
    return h(SettingsDetailPanel, {
      title: "Blocked Time",
      description: "Use personal events to block time for breaks, travel, holidays, errands, and any appointment you do not want clients to book over.",
      items: [
        { title: "How it works", body: "Blocked time appears in your calendar and is respected by availability checks when clients choose a slot." },
        { title: "Current blocks", body: `${personalEventCount} personal block${personalEventCount === 1 ? "" : "s"} currently loaded in the calendar.` },
        { title: "Best place to add it", body: "Add blocked time from the calendar so it lands on the exact date and time you need." },
      ],
      actions: h("button", { type: "button", className: "admin-primary-action", onClick: () => onOpenBlockedTime() }, "Add blocked time from calendar"),
    });
  }

  if (activeCategoryId === "coverage") {
    if (selectedSection === "Coverage Rules") {
      const activeAreas = serviceAreas.filter((area) => area.active !== false);
      return h("div", { className: "settings-placeholder" },
        h("h3", null, "Coverage Rules"),
        h("p", null, "Only active named service areas are shown to clients during booking."),
        h("p", null, activeAreas.length > 0 ? `Currently available: ${activeAreas.map((area) => area.name).join(", ")}.` : "No service areas are currently available to clients."),
        h("button", { type: "button", className: "admin-secondary-action", onClick: () => onOpenSettingsSection("admin-service-areas", "coverage") }, "Manage service areas"));
    }
    if (selectedSection === "Travel Charges") {
      return h("div", { className: "settings-placeholder" }, h("h3", null, "Travel Charges"), h("p", null, "Travel surcharges are configured manually for each named service area."), h("button", { type: "button", className: "admin-secondary-action", onClick: () => onOpenSettingsSection("admin-service-areas", "coverage") }, "Manage area fees"));
    }
    if (selectedSection === "Congestion Zone Fee") {
      return h("div", { className: "settings-placeholder" }, h("h3", null, "Congestion Zone Fee"), h("p", null, "Congestion fees are configured manually per service area."), h("button", { type: "button", className: "admin-secondary-action", onClick: () => onOpenSettingsSection("admin-service-areas", "coverage") }, "Manage area fees"));
    }
  }

  if (activeCategoryId === "waitlist" && selectedSection === "Waitlist Rules") {
    return h("div", { className: "settings-placeholder" },
      h("h3", null, "Waitlist Rules"),
      h("p", null, "Existing requests match by date, treatment duration, preferred time or window, and the client's flexibility."),
      h("p", null, "Past requests close automatically. Offers remain a manual admin action in the Waitlist view."),
      h("p", null, "Offer expiry is handled manually during launch."),
      h("button", { type: "button", className: "admin-secondary-action", onClick: () => onOpenAdminTab("waitlist", "waitlist") }, "Open waitlist requests"));
  }
  if (activeCategoryId === "waitlist" && selectedSection === "Client Requests") {
    const openRequests = waitlistEntries.filter((entry) => getWaitlistStatus(entry) === "joined").length;
    const offeredRequests = waitlistEntries.filter((entry) => getWaitlistStatus(entry) === "offered").length;
    return h(SettingsDetailPanel, { title: "Client Requests", description: "All active waitlist requests are managed from the Waitlist screen, where you can send offers and close requests.", items: [
      { title: "Waiting", body: `${openRequests} request${openRequests === 1 ? "" : "s"} waiting for a matching slot.` },
      { title: "Offered", body: `${offeredRequests} offer${offeredRequests === 1 ? "" : "s"} currently sent to clients.` },
      { title: "Matching", body: "Requests use date, duration, preferred time or window, and flexibility to suggest suitable openings." },
    ], actions: h("button", { type: "button", className: "admin-primary-action", onClick: () => onOpenAdminTab("waitlist", "waitlist") }, "Open waitlist requests") });
  }
  if (activeCategoryId === "waitlist" && selectedSection === "Offer Settings") {
    return h(SettingsDetailPanel, { title: "Offer Settings", description: "Waitlist offers are currently sent manually so you stay in control of the diary while the system is still being tuned.", items: [
      { title: "Manual approval", body: "You choose which available slot to offer before a client receives it." },
      { title: "Client response", body: "Clients can accept an offer from their waitlist view while the slot is still available." },
      { title: "Safety", body: "If the slot is no longer available, the offer cannot create a conflicting booking." },
    ], actions: h("button", { type: "button", className: "admin-secondary-action", onClick: () => onOpenAdminTab("waitlist", "waitlist") }, "Review offer queue") });
  }

  const awaitingVerification = days.reduce((count, day) => count + day.bookings.filter((booking) => booking.paymentStatus === "awaiting_verification").length, 0);
  const cashRequests = days.reduce((count, day) => count + day.bookings.filter((booking) => booking.paymentStatus === "cash_on_arrival").length, 0);
  if (activeCategoryId === "payments" && selectedSection === "Payment Methods") {
    return h(SettingsDetailPanel, { title: "Payment Methods", description: "Bank transfer is the primary payment method. Cash is available only after the client reads and acknowledges the cash payment note.", items: [
      { title: "Bank transfer", body: `Clients see ${bankDetailCount} bank detail rows with copy buttons and a payment reference.` },
      { title: "Cash on arrival", body: "Cash requests stay awaiting approval until you review them from the booking record." },
      { title: "Card payments", body: "Card processing is not shown because no card provider is connected in this app." },
    ], actions: h("button", { type: "button", className: "admin-secondary-action", onClick: () => onOpenSettingsSubsection("payments", "Payment Statuses") }, "Review payment statuses") });
  }
  if (activeCategoryId === "payments" && selectedSection === "Payment Statuses") {
    return h(SettingsDetailPanel, { title: "Payment Statuses", description: "Payment status is controlled from bookings. A client saying they made a transfer does not mark the booking as paid.", items: [
      { title: "Awaiting verification", body: `${awaitingVerification} booking${awaitingVerification === 1 ? "" : "s"} waiting for bank-transfer verification.` },
      { title: "Cash requests", body: `${cashRequests} booking${cashRequests === 1 ? "" : "s"} waiting for cash-arrival approval or confirmation.` },
      { title: "Admin control", body: "Use booking details in Calendar to approve cash requests, mark transfer received, or cancel/reject." },
    ], actions: h("button", { type: "button", className: "admin-primary-action", onClick: () => onOpenAdminTab("pending", null) }, "Open pending bookings") });
  }
  if (activeCategoryId === "payments" && selectedSection === "Pay Later") {
    return h(SettingsDetailPanel, { title: "Pay Later", description: "Pay-later wording is kept conservative. Bookings should still remain clear about whether payment is awaiting verification or due on arrival.", items: [
      { title: "Bank transfer first", body: "Clients are guided to complete bank transfer before final confirmation." },
      { title: "Cash exception", body: "Cash is treated as a request, not an automatic confirmation." },
      { title: "Receipts", body: "Receipt and invoice wording is managed under Receipts & Documents." },
    ], actions: h("button", { type: "button", className: "admin-secondary-action", onClick: () => onOpenSettingsSubsection("documents", "Invoice Settings") }, "Open invoice settings") });
  }

  if (activeCategoryId === "notifications" && selectedSection === "Email") {
    return h(SettingsDetailPanel, { title: "Email", description: "Email delivery uses the existing server templates and booking events. Keep content calm and client-friendly.", items: [
      { title: "Booking emails", body: "Booking confirmation and payment-related copy comes from the current email template layer." },
      { title: "Receipts", body: "Receipt email wording is edited under Receipts & Documents." },
      { title: "Sender details", body: "Business email and document identity are managed in Business Details." },
    ], actions: h("button", { type: "button", className: "admin-secondary-action", onClick: () => onOpenSettingsSubsection("documents", "Email Receipt Template") }, "Open receipt email template") });
  }
  if (activeCategoryId === "notifications" && selectedSection === "Booking Alerts") {
    return h(SettingsDetailPanel, { title: "Booking Alerts", description: "Booking alerts should help you review new bookings without changing payment or approval rules.", items: [
      { title: "New bank-transfer booking", body: "Client bookings remain awaiting verification until you check payment." },
      { title: "Cash request", body: "Cash requests are shown as awaiting approval so they can be reviewed deliberately." },
      { title: "Waitlist offer", body: "Waitlist offers remain controlled from the Waitlist screen." },
    ], actions: h("button", { type: "button", className: "admin-primary-action", onClick: () => onOpenAdminTab("calendar", null) }, "Open bookings") });
  }

  const returningClients = allCustomers.filter((customer) => customer.appointments.length > 1).length;
  if (activeCategoryId === "clients" && selectedSection === "Client Details") {
    return h(SettingsDetailPanel, { title: "Client Details", description: "Client records are built from bookings, notes, and saved profile edits.", items: [
      { title: "Clients loaded", body: `${allCustomers.length} client profile${allCustomers.length === 1 ? "" : "s"} currently available.` },
      { title: "Notes", body: "Admin notes are private and can be added from each client profile." },
      { title: "Privacy", body: "Client data should only be used for booking, contact, and appointment care." },
    ], actions: h("button", { type: "button", className: "admin-primary-action", onClick: () => onOpenAdminTab("customers", null) }, "Open client list") });
  }
  if (activeCategoryId === "clients" && selectedSection === "Returning Clients") {
    return h(SettingsDetailPanel, { title: "Returning Clients", description: "Returning client behaviour is based on booking history and saved client profiles.", items: [
      { title: "Returning clients", body: `${returningClients} client${returningClients === 1 ? "" : "s"} have more than one appointment.` },
      { title: "Book again", body: "Client portal actions can reuse previous booking details where available." },
      { title: "Saved details", body: "Client-facing wording avoids making saved details feel intrusive." },
    ], actions: h("button", { type: "button", className: "admin-secondary-action", onClick: () => onOpenAdminTab("customers", null) }, "View returning clients") });
  }
  if (activeCategoryId === "clients" && selectedSection === "Rebooking Preferences") {
    return h(SettingsDetailPanel, { title: "Rebooking Preferences", description: "Rebooking is designed to be quick without bypassing normal availability, payment, and approval checks.", items: [
      { title: "Availability first", body: "Rebooking still checks live availability and travel-buffer rules." },
      { title: "Payment rules", body: "Bank transfer and cash request rules remain unchanged for returning clients." },
      { title: "Client control", body: "Clients can review details before submitting a new booking." },
    ], actions: h("button", { type: "button", className: "admin-secondary-action", onClick: () => onOpenAdminTab("customers", null) }, "Open client records") });
  }

  if (activeCategoryId === "security" && selectedSection === "Client Privacy") {
    return h(SettingsDetailPanel, { title: "Client Privacy", description: "Client details should stay minimal, practical, and used only for appointment care.", items: [
      { title: "Stored booking details", body: "Name, contact details, address, notes, booking reference, and payment state support the appointment." },
      { title: "Private admin notes", body: "Client notes are admin-facing and should not appear in the public booking journey." },
      { title: "Client wording", body: "The client UI avoids heavy wording like details being saved unless it is needed." },
    ] });
  }
  if (activeCategoryId === "security" && selectedSection === "API Protection") {
    return h(SettingsDetailPanel, { title: "API Protection", description: "Sensitive server actions should remain behind environment-backed secrets and Supabase security.", items: [
      { title: "No frontend secrets", body: "Service role keys and private API secrets must never be placed in frontend code." },
      { title: "Server routes", body: "Email, Telegram, and admin-only actions should continue using protected server paths." },
      { title: "Tests", body: "Existing API secret protection tests cover the current safety assumptions." },
    ] });
  }

  if (activeCategoryId === "system" && selectedSection === "Integrations") {
    return h(SettingsDetailPanel, { title: "Integrations", description: "External services are connected through the existing app/server configuration.", items: [
      { title: "Supabase", body: "Authentication, booking persistence, and protected database functions remain the core backend." },
      { title: "Telegram", body: "Telegram tests are available from Notifications." },
      { title: "Documents", body: "Receipt and invoice details are configured under Receipts & Documents." },
    ], actions: h("button", { type: "button", className: "admin-secondary-action", onClick: () => onOpenSettingsSubsection("notifications", "Telegram") }, "Open Telegram settings") });
  }
  if (activeCategoryId === "system" && selectedSection === "Application Information") {
    return h(SettingsDetailPanel, { title: "Application Information", description: "This app contains the public client booking flow and the protected admin workspace.", items: [
      { title: "Client flow", body: "Area, Treatment, Duration, Date & Time, Review, Your Details, Payment, Confirmation." },
      { title: "Admin modules", body: "Calendar, Clients, Waitlist, Analytics, Settings, and service management." },
      { title: "Environment", body: isDevelopmentMode ? "Development mode is active." : "Production build mode." },
    ] });
  }

  return null;
}

async function loadSettingsRoutingDetailPanels() {
  if (!existsSync(componentUrl)) {
    return {
      SettingsRoutingDetailPanels: fallbackSettingsRoutingDetailPanels,
      hasComponent: false,
      source: readFileSync(appUrl, "utf8"),
    };
  }

  const source = readFileSync(componentUrl, "utf8");
  const functionSource = source
    .replace(/^import React from "react";\r?\n/, "")
    .replace(/^import \{ SettingsDetailPanel \} from "\.\/SettingsDetailPanel\.jsx";\r?\n/, "")
    .replace("export function SettingsRoutingDetailPanels", "function SettingsRoutingDetailPanels");
  const transformed = await transformWithOxc(
    [functionSource, "globalThis.__SettingsRoutingDetailPanelsLoaded = SettingsRoutingDetailPanels;"].join("\n\n"),
    "SettingsRoutingDetailPanels.jsx",
    { loader: "jsx" },
  );
  const require = createRequire(import.meta.url);
  new Function("require", "React", "SettingsDetailPanel", transformed.code)(require, React, SettingsDetailPanel);
  return {
    SettingsRoutingDetailPanels: globalThis.__SettingsRoutingDetailPanelsLoaded,
    hasComponent: true,
    source,
  };
}

function defaultProps(overrides = {}) {
  return {
    activeCategoryId: "payments",
    allCustomers: [
      { appointments: [{}, {}], id: "a" },
      { appointments: [{}], id: "b" },
    ],
    bankDetailCount: 3,
    days: [
      { bookings: [{ paymentStatus: "awaiting_verification" }, { paymentStatus: "cash_on_arrival" }, { kind: "personal" }] },
      { bookings: [{ paymentStatus: "awaiting_verification" }] },
    ],
    getWaitlistStatus: (entry) => entry.status,
    isDevelopmentMode: true,
    onOpenAdminTab: () => {},
    onOpenBlockedTime: () => {},
    onOpenSettingsSection: () => {},
    onOpenSettingsSubsection: () => {},
    selectedSection: "Payment Methods",
    serviceAreas: [{ active: true, name: "Chelsea" }, { active: false, name: "Hidden" }],
    waitlistEntries: [{ status: "joined" }, { status: "offered" }, { status: "closed" }],
    ...overrides,
  };
}

function renderPanel(SettingsRoutingDetailPanels, overrides = {}) {
  return renderToStaticMarkup(React.createElement(SettingsRoutingDetailPanels, defaultProps(overrides)));
}

function panelElement(SettingsRoutingDetailPanels, overrides = {}) {
  const element = SettingsRoutingDetailPanels(defaultProps(overrides));
  if (React.isValidElement(element) && typeof element.type === "function") {
    return element.type(element.props);
  }
  return element;
}

function childArray(value) {
  return React.Children.toArray(value);
}

function textContent(value) {
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (React.isValidElement(value)) return textContent(value.props.children);
  return value == null ? "" : String(value);
}

function detailItems(element) {
  const grid = childArray(element.props.children).find((child) => child?.props?.className === "settings-detail-grid");
  if (!grid) return [];
  return childArray(grid.props.children).map((article) => {
    const [title, body] = childArray(article.props.children);
    return [textContent(title), textContent(body)];
  });
}

function actionButton(element) {
  const actions = childArray(element.props.children).find((child) => child?.props?.className === "settings-detail-actions");
  if (!actions) {
    return childArray(element.props.children).find((child) => child?.type === "button") || null;
  }
  return childArray(actions.props.children)[0];
}

const { SettingsRoutingDetailPanels, hasComponent, source } = await loadSettingsRoutingDetailPanels();

for (const text of [
  "Blocked Time",
  "Coverage Rules",
  "Waitlist Rules",
  "Payment Methods",
  "Email",
  "Client Details",
  "Client Privacy",
  "Integrations",
  "Application Information",
]) {
  assert.match(source, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
if (hasComponent) {
  assert.match(source, /export function SettingsRoutingDetailPanels\(\{/);
  assert.doesNotMatch(source, /useState|useEffect|useRef|setTimeout|setInterval|fetch|localStorage|postTelegram|postTransactional|notifyAdmin|async/i);
}

assert.equal(renderPanel(SettingsRoutingDetailPanels, { activeCategoryId: "documents", selectedSection: "Business Details" }), "");
assert.equal(renderPanel(SettingsRoutingDetailPanels, { activeCategoryId: "notifications", selectedSection: "Telegram" }), "");
assert.equal(renderPanel(SettingsRoutingDetailPanels, { activeCategoryId: "security", selectedSection: "Admin Access" }), "");
assert.equal(renderPanel(SettingsRoutingDetailPanels, { activeCategoryId: "system", selectedSection: "Stored Data" }), "");
assert.equal(renderPanel(SettingsRoutingDetailPanels, { activeCategoryId: "anything", selectedSection: "Unknown" }), "");
assert.equal(renderPanel(SettingsRoutingDetailPanels, { activeCategoryId: "", selectedSection: "" }), "");

{
  const element = panelElement(SettingsRoutingDetailPanels, { activeCategoryId: "scheduling", selectedSection: "Blocked Time" });
  assert.deepEqual(detailItems(element), [
    ["How it works", "Blocked time appears in your calendar and is respected by availability checks when clients choose a slot."],
    ["Current blocks", "1 personal block currently loaded in the calendar."],
    ["Best place to add it", "Add blocked time from the calendar so it lands on the exact date and time you need."],
  ]);
  const calls = [];
  actionButton(panelElement(SettingsRoutingDetailPanels, { activeCategoryId: "scheduling", selectedSection: "Blocked Time", onOpenBlockedTime: (...args) => calls.push(args) })).props.onClick("ignored");
  assert.deepEqual(calls, [[]]);
}

{
  const markup = renderPanel(SettingsRoutingDetailPanels, { activeCategoryId: "coverage", selectedSection: "Coverage Rules" });
  assert.match(markup, /<h3>Coverage Rules<\/h3>/);
  assert.match(markup, /Currently available: Chelsea\./);
  assert.doesNotMatch(markup, /Hidden/);
  const emptyMarkup = renderPanel(SettingsRoutingDetailPanels, { activeCategoryId: "coverage", selectedSection: "Coverage Rules", serviceAreas: [] });
  assert.match(emptyMarkup, /No service areas are currently available to clients\./);
  for (const section of ["Coverage Rules", "Travel Charges", "Congestion Zone Fee"]) {
    const calls = [];
    const element = panelElement(SettingsRoutingDetailPanels, { activeCategoryId: "coverage", selectedSection: section, onOpenSettingsSection: (...args) => calls.push(args) });
    childArray(element.props.children).at(-1).props.onClick("ignored");
    assert.deepEqual(calls, [["admin-service-areas", "coverage"]]);
  }
}

{
  const waitlistRules = renderPanel(SettingsRoutingDetailPanels, { activeCategoryId: "waitlist", selectedSection: "Waitlist Rules" });
  assert.match(waitlistRules, /Existing requests match by date, treatment duration, preferred time or window, and the client&#x27;s flexibility\./);
  assert.match(waitlistRules, /Offer expiry is handled manually during launch\./);
  assert.deepEqual(detailItems(panelElement(SettingsRoutingDetailPanels, { activeCategoryId: "waitlist", selectedSection: "Client Requests" })), [
    ["Waiting", "1 request waiting for a matching slot."],
    ["Offered", "1 offer currently sent to clients."],
    ["Matching", "Requests use date, duration, preferred time or window, and flexibility to suggest suitable openings."],
  ]);
  const zeroItems = detailItems(panelElement(SettingsRoutingDetailPanels, { activeCategoryId: "waitlist", selectedSection: "Client Requests", waitlistEntries: [] }));
  assert.equal(zeroItems[0][1], "0 requests waiting for a matching slot.");
  assert.equal(zeroItems[1][1], "0 offers currently sent to clients.");
}

{
  assert.deepEqual(detailItems(panelElement(SettingsRoutingDetailPanels, { activeCategoryId: "payments", selectedSection: "Payment Methods", bankDetailCount: 2 })), [
    ["Bank transfer", "Clients see 2 bank detail rows with copy buttons and a payment reference."],
    ["Cash on arrival", "Cash requests stay awaiting approval until you review them from the booking record."],
    ["Card payments", "Card processing is not shown because no card provider is connected in this app."],
  ]);
  const paymentStatuses = detailItems(panelElement(SettingsRoutingDetailPanels, { activeCategoryId: "payments", selectedSection: "Payment Statuses" }));
  assert.equal(paymentStatuses[0][1], "2 bookings waiting for bank-transfer verification.");
  assert.equal(paymentStatuses[1][1], "1 booking waiting for cash-arrival approval or confirmation.");
  const payLater = renderPanel(SettingsRoutingDetailPanels, { activeCategoryId: "payments", selectedSection: "Pay Later" });
  assert.match(payLater, /Cash is treated as a request, not an automatic confirmation\./);
}

{
  assert.match(renderPanel(SettingsRoutingDetailPanels, { activeCategoryId: "notifications", selectedSection: "Email" }), /Open receipt email template/);
  assert.match(renderPanel(SettingsRoutingDetailPanels, { activeCategoryId: "notifications", selectedSection: "Booking Alerts" }), /Open bookings/);
  assert.deepEqual(detailItems(panelElement(SettingsRoutingDetailPanels, { activeCategoryId: "clients", selectedSection: "Returning Clients" }))[0], ["Returning clients", "1 client have more than one appointment."]);
  assert.deepEqual(detailItems(panelElement(SettingsRoutingDetailPanels, { activeCategoryId: "clients", selectedSection: "Client Details", allCustomers: [] }))[0], ["Clients loaded", "0 client profiles currently available."]);
}

{
  assert.match(renderPanel(SettingsRoutingDetailPanels, { activeCategoryId: "security", selectedSection: "Client Privacy" }), /Client details should stay minimal, practical, and used only for appointment care\./);
  assert.match(renderPanel(SettingsRoutingDetailPanels, { activeCategoryId: "security", selectedSection: "API Protection" }), /Service role keys and private API secrets must never be placed in frontend code\./);
  assert.match(renderPanel(SettingsRoutingDetailPanels, { activeCategoryId: "system", selectedSection: "Integrations" }), /Open Telegram settings/);
  assert.match(renderPanel(SettingsRoutingDetailPanels, { activeCategoryId: "system", selectedSection: "Application Information", isDevelopmentMode: true }), /Development mode is active\./);
  assert.match(renderPanel(SettingsRoutingDetailPanels, { activeCategoryId: "system", selectedSection: "Application Information", isDevelopmentMode: false }), /Production build mode\./);
}

{
  const actionExpectations = [
    [{ activeCategoryId: "waitlist", selectedSection: "Waitlist Rules" }, "onOpenAdminTab", ["waitlist", "waitlist"]],
    [{ activeCategoryId: "payments", selectedSection: "Payment Methods" }, "onOpenSettingsSubsection", ["payments", "Payment Statuses"]],
    [{ activeCategoryId: "payments", selectedSection: "Payment Statuses" }, "onOpenAdminTab", ["pending", null]],
    [{ activeCategoryId: "payments", selectedSection: "Pay Later" }, "onOpenSettingsSubsection", ["documents", "Invoice Settings"]],
    [{ activeCategoryId: "notifications", selectedSection: "Email" }, "onOpenSettingsSubsection", ["documents", "Email Receipt Template"]],
    [{ activeCategoryId: "notifications", selectedSection: "Booking Alerts" }, "onOpenAdminTab", ["calendar", null]],
    [{ activeCategoryId: "clients", selectedSection: "Client Details" }, "onOpenAdminTab", ["customers", null]],
    [{ activeCategoryId: "clients", selectedSection: "Returning Clients" }, "onOpenAdminTab", ["customers", null]],
    [{ activeCategoryId: "clients", selectedSection: "Rebooking Preferences" }, "onOpenAdminTab", ["customers", null]],
    [{ activeCategoryId: "system", selectedSection: "Integrations" }, "onOpenSettingsSubsection", ["notifications", "Telegram"]],
  ];

  for (const [branch, callbackName, expectedArgs] of actionExpectations) {
    const calls = [];
    const element = panelElement(SettingsRoutingDetailPanels, { ...branch, [callbackName]: (...args) => calls.push(args) });
    assert.deepEqual(calls, []);
    actionButton(element).props.onClick("ignored");
    assert.deepEqual(calls, [expectedArgs]);
  }
}

{
  const props = defaultProps();
  const snapshot = structuredClone({
    allCustomers: props.allCustomers,
    days: props.days,
    serviceAreas: props.serviceAreas,
    waitlistEntries: props.waitlistEntries,
  });
  renderPanel(SettingsRoutingDetailPanels, props);
  assert.deepEqual({
    allCustomers: props.allCustomers,
    days: props.days,
    serviceAreas: props.serviceAreas,
    waitlistEntries: props.waitlistEntries,
  }, snapshot);
}

console.log("Settings routing detail panel tests passed.");
