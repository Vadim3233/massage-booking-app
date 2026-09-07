import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./AdminCalendarCards.jsx", import.meta.url);
const appUrl = new URL("../../App.jsx", import.meta.url);

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function Icon() {
  return h("svg", { "aria-hidden": "true" });
}

function fallbackCompactBookingCard({ card, compact = false, onOpenOverview, onRequestDelete }) {
  if (card.kind === "personal") {
    return h("button", {
      type: "button",
      className: `admin-personal-event-strip ${card.colorClass}`,
      key: card.id,
      onClick: () => onOpenOverview(card.booking),
    },
      h("strong", null, card.title),
      h("span", null, card.subtitle),
    );
  }

  return h("article", { className: compact ? "admin-booking-box compact-admin-booking-box" : "admin-booking-box", key: card.id },
    h("div", { className: "admin-booking-title-row" },
      h("strong", null, card.clientName),
      h("span", null, card.durationLabel),
    ),
    h("div", { className: "admin-booking-meta" },
      h("span", null, card.timeRange),
      h("span", null, card.bufferLabel),
    ),
    card.displayReference && h("small", { className: "admin-order-note" }, `Ref ${card.displayReference}`),
    !compact && h("div", { className: "admin-booking-services" },
      card.serviceRows.map((item) => h("span", { key: item.key }, item.label)),
    ),
    h("div", { className: "admin-booking-actions" },
      h("button", { type: "button", onClick: () => onOpenOverview(card.booking) }, "Overview"),
      h("a", {
        "aria-disabled": card.mapDisabled,
        className: card.mapDisabled ? "disabled-map-link" : "",
        href: card.mapDisabled ? undefined : card.mapUrl,
        rel: "noreferrer",
        target: "_blank",
      }, "Navigate"),
      h("button", {
        type: "button",
        className: "admin-danger-option",
        onClick: () => onRequestDelete(card.booking),
      }, "Delete"),
    ),
  );
}

function fallbackTimelineBookingCard({ card, onOpenOverview, onRequestDelete }) {
  return h("article", {
    className: card.className,
    key: card.id,
    style: card.style,
  },
    card.serviceBands.map((band) => h("span", {
      "aria-hidden": "true",
      className: band.className,
      key: band.key,
      style: band.style,
    })),
    h("span", { className: "day-timeline-buffer-band", "aria-hidden": "true" }),
    h("div", { className: "day-timeline-booking-main" },
      h("strong", null, card.timeRange),
      h("span", null, card.serviceLabel),
    ),
    h("small", null,
      h("span", { className: "timeline-client-name" }, card.clientName),
      card.metaSuffix,
    ),
    h("div", { className: "admin-booking-actions" },
      h("button", { type: "button", onClick: () => onOpenOverview(card.booking) }, "Overview"),
      !card.personal && h("a", {
        "aria-disabled": card.mapDisabled,
        className: card.mapDisabled ? "disabled-map-link" : "",
        href: card.mapDisabled ? undefined : card.mapUrl,
        rel: "noreferrer",
        target: "_blank",
      }, "Navigate"),
      h("button", {
        type: "button",
        className: "admin-danger-option",
        onClick: () => onRequestDelete(card.booking),
      }, "Delete"),
    ),
  );
}

function fallbackAgendaBookingCard({
  card,
  onCancelBooking,
  onDeleteCancelled,
  onOpenEdit,
  onRestoreCancelled,
  onToggleExpanded,
}) {
  if (card.kind === "cancelled") {
    return h("article", { className: "agenda-cancelled-booking-row", key: card.id },
      h("span", null,
        card.timeLabel && h("strong", null, card.timeLabel),
        `Booking cancelled - ${card.clientName}`,
        card.durationMinutes > 0 && h("small", null, `${card.durationMinutes}m`),
        h("small", { className: "agenda-cancellation-source" }, card.cancelledByLabel),
      ),
      h("div", { className: "agenda-cancelled-booking-actions" },
        h("button", {
          type: "button",
          className: "agenda-restore-cancelled-button",
          "aria-label": `Restore cancelled booking for ${card.clientName}`,
          title: "Restore booking",
          onClick: () => onRestoreCancelled(card.booking),
        }, h(Icon, { "aria-hidden": "true", size: 14 })),
        h("button", {
          type: "button",
          className: "agenda-delete-cancelled-button",
          "aria-label": `Delete cancelled booking for ${card.clientName}`,
          title: "Delete cancelled booking",
          onClick: () => onDeleteCancelled(card.booking),
        }, h(Icon, { "aria-hidden": "true", size: 15 })),
      ),
    );
  }

  return h("article", {
    className: card.className,
    key: card.id,
    style: card.style,
  },
    h("button", {
      type: "button",
      className: "agenda-booking-card-main",
      onClick: () => onToggleExpanded(card.booking),
      "aria-expanded": card.expanded,
    },
      h("span", { className: "agenda-booking-time-block" },
        h("strong", null, card.timeLabel),
        h("small", null, card.durationLabel),
      ),
      h("span", { className: "agenda-booking-content" },
        h("span", { className: "agenda-booking-title-row" },
          h("strong", null, card.clientName),
          card.isNewClient && h("em", { className: "agenda-new-client-badge" }, "New client"),
          card.verificationInfo && h("em", { className: "agenda-verification-badge" }, card.verificationInfo.badge),
        ),
        h("span", null, card.primaryService),
        card.verificationInfo && h("small", { className: "agenda-verification-note" }, card.verificationInfo.reason),
        h("small", null, h(Icon, { "aria-hidden": "true", size: 14 }), card.bufferLabel),
      ),
    ),
    h("div", { className: "agenda-booking-side-actions" },
      h("a", {
        "aria-disabled": card.mapDisabled,
        "aria-label": `Navigate to ${card.clientName}`,
        className: `agenda-map-button${card.mapDisabled ? " disabled-map-link" : ""}`,
        href: card.mapDisabled ? undefined : card.mapUrl,
        rel: "noreferrer",
        target: "_blank",
        onClick: (event) => event.stopPropagation(),
      }, h(Icon, { "aria-hidden": "true", size: 21, strokeWidth: 2.25 })),
      h("button", {
        type: "button",
        "aria-label": card.expanded ? "Collapse booking details" : "Expand booking details",
        className: "agenda-expand-button",
        onClick: () => onToggleExpanded(card.booking),
      }, card.expanded ? h(Icon, { "aria-hidden": "true", size: 22 }) : h(Icon, { "aria-hidden": "true", size: 22 })),
    ),
    card.expanded && h("div", { className: "agenda-booking-expanded" },
      h("div", { className: "agenda-booking-expanded-info" },
        card.verificationInfo && h("span", { className: "agenda-expanded-verification" }, h(Icon, { "aria-hidden": "true", size: 18 }), h("strong", null, "Needs action"), h("em", null, card.verificationInfo.reason)),
        h("span", null, h(Icon, { "aria-hidden": "true", size: 18 }), h("strong", null, "Booking reference"), h("em", null, card.displayReference)),
        card.preferenceLabels.length > 0 && h("span", null, h(Icon, { "aria-hidden": "true", size: 18 }), h("strong", null, "Session preferences"), h("em", null, card.preferenceLabels.join(", "))),
        h("span", null, h(Icon, { "aria-hidden": "true", size: 18 }), h("strong", null, "Client note"), h("em", null, card.notesLabel)),
        card.addressLabel && h("span", null, h(Icon, { "aria-hidden": "true", size: 18 }), h("strong", null, "Address"), h("em", null, card.addressLabel)),
      ),
      h("div", { className: "agenda-booking-expanded-actions" },
        h("button", { type: "button", onClick: () => onOpenEdit(card.booking) }, h(Icon, { "aria-hidden": "true", size: 17 }), "Edit Booking"),
        h("button", {
          type: "button",
          className: "admin-danger-option",
          onClick: () => onCancelBooking(card.booking),
        }, h(Icon, { "aria-hidden": "true", size: 18 }), "Cancel Booking"),
      ),
    ),
  );
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
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not read ${name}`);
}

function assertOriginalInlineShape() {
  const source = readFileSync(appUrl, "utf8");
  assert.match(source, /function renderBookingBox\(booking, compact = false\)/);
  assert.match(source, /const personal = isPersonalEvent\(booking\);/);
  assert.match(source, /className=\{`admin-personal-event-strip \$\{colorClass\}`\}/);
  assert.match(source, /onClick=\{\(\) => \{ setOverviewBooking\(booking\); setOverviewEditing\(false\); setOverviewMoreOpen\(false\); setOverviewTab\("details"\); \}\}/);
  assert.match(source, /className=\{compact \? "admin-booking-box compact-admin-booking-box" : "admin-booking-box"\}/);
  assert.match(source, /<small className="admin-order-note">Ref \{displayReference\}<\/small>/);
  assert.match(source, /href=\{mapDisabled \? undefined : mapUrlForBooking\(booking\)\}/);
  assert.match(source, /onClick=\{\(\) => setPendingDeleteBooking\(booking\)\}/);
  assert.match(source, /function renderTimelineBookingBox\(booking\)/);
  assert.match(source, /style=\{\{ "--buffer-percent": `\$\{bufferPercent\}%` \}\}/);
  assert.match(source, /className=\{personal \? "day-timeline-booking-box personal-timeline-booking-box" : "day-timeline-booking-box"\}/);
  assert.match(source, /serviceBands\.map\(\(band, index\) =>/);
  assert.match(source, /function renderAgendaBookingCard\(booking\)/);
  assert.match(source, /if \(isPersonalEvent\(booking\)\) return renderBookingBox\(booking\);/);
  assert.match(source, /className="agenda-cancelled-booking-row"/);
  assert.match(source, /onClick=\{\(\) => restoreCancelledBooking\(booking\)\}/);
  assert.match(source, /onClick=\{\(\) => onDeleteBooking\(booking\.id, \{ forceDelete: true \}\)\}/);
  assert.match(source, /className=\{`agenda-booking-card\$\{isExpanded \? " expanded" : ""\}\$\{verificationInfo \? " needs-admin-verification" : ""\}`\}/);
  assert.match(source, /onClick=\{\(\) => setExpandedAgendaBookingId\(\(current\) => current === booking\.id \? null : booking\.id\)\}/);
  assert.match(source, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(source, /onClick=\{\(\) => \{ setOverviewBooking\(booking\); setOverviewEditing\(true\); setOverviewMoreOpen\(false\); setOverviewTab\("details"\); \}\}/);
  assert.match(source, /await onDeleteBooking\(booking\.id\);/);
}

async function loadCards() {
  if (!existsSync(componentUrl)) {
    assertOriginalInlineShape();
    return {
      AdminAgendaBookingCard: fallbackAgendaBookingCard,
      AdminCompactBookingCard: fallbackCompactBookingCard,
      AdminTimelineBookingCard: fallbackTimelineBookingCard,
      hasComponent: false,
      source: "",
    };
  }

  const source = readFileSync(componentUrl, "utf8");
  const functionSource = [
    readBalancedFunction(source, "AdminCompactBookingCard").replace("export function AdminCompactBookingCard", "function AdminCompactBookingCard"),
    readBalancedFunction(source, "AdminTimelineBookingCard").replace("export function AdminTimelineBookingCard", "function AdminTimelineBookingCard"),
    readBalancedFunction(source, "AdminAgendaBookingCard").replace("export function AdminAgendaBookingCard", "function AdminAgendaBookingCard"),
  ].join("\n\n");
  const transformed = await transformWithOxc(
    [functionSource, "globalThis.__AdminCalendarCardsLoaded = { AdminCompactBookingCard, AdminTimelineBookingCard, AdminAgendaBookingCard };"].join("\n\n"),
    "AdminCalendarCards.jsx",
    { loader: "jsx" },
  );
  const require = createRequire(import.meta.url);
  new Function("React", "CalendarDays", "ChevronDown", "ChevronRight", "Clock3", "FileText", "MapPin", "ReceiptText", "RotateCcw", "Send", "Sparkles", "X", "require", transformed.code)(
    React,
    Icon,
    Icon,
    Icon,
    Icon,
    Icon,
    Icon,
    Icon,
    Icon,
    Icon,
    Icon,
    Icon,
    require,
  );
  return { ...globalThis.__AdminCalendarCardsLoaded, hasComponent: true, source };
}

const baseBooking = {
  address: "1 Test Street",
  bookingReference: "REF-1",
  clientName: "Ada Lovelace",
  duration: 60,
  eventColor: "blue",
  id: "booking-1",
  isNewClient: true,
  serviceName: "Massage",
  sessionEnd: 660,
  start: 600,
  travelBuffer: 30,
};

function compactCard(overrides = {}) {
  return {
    booking: baseBooking,
    bufferLabel: "Buffer 30 min",
    clientName: "Ada Lovelace",
    displayReference: "REF-1",
    durationLabel: "60 min",
    id: "booking-1",
    kind: "booking",
    mapDisabled: false,
    mapUrl: "https://maps.example/one",
    serviceRows: [
      { key: "booking-1-Massage-0", label: "Massage / 60 min" },
      { key: "booking-1-Stretch-1", label: "Stretch" },
    ],
    timeRange: "10:00 - 11:00",
    ...overrides,
  };
}

function personalCard(overrides = {}) {
  return {
    booking: { ...baseBooking, id: "personal-1" },
    colorClass: "personal-event-blue",
    id: "personal-1",
    kind: "personal",
    subtitle: "Personal - all day",
    title: "Blocked day",
    ...overrides,
  };
}

function timelineCard(overrides = {}) {
  return {
    booking: baseBooking,
    className: "day-timeline-booking-box",
    clientName: "Ada Lovelace",
    id: "booking-1",
    mapDisabled: false,
    mapUrl: "https://maps.example/one",
    metaSuffix: " / buffer 30 min",
    personal: false,
    serviceBands: [
      { className: "day-timeline-service-band service-band-0", key: "booking-1-service-band-0", style: { height: "66.66666666666666%", top: "0%" } },
      { className: "day-timeline-service-band service-band-1", key: "booking-1-service-band-1", style: { height: "33.33333333333333%", top: "66.66666666666666%" } },
    ],
    serviceLabel: "60 MAS + 30 STR",
    style: { "--buffer-percent": "33.33333333333333%" },
    timeRange: "10:00 - 11:30",
    ...overrides,
  };
}

function agendaCard(overrides = {}) {
  return {
    addressLabel: "1 Test Street",
    booking: baseBooking,
    bufferLabel: "Buffer 30m",
    className: "agenda-booking-card expanded needs-admin-verification",
    clientName: "Ada Lovelace",
    displayReference: "REF-1",
    durationLabel: "60m",
    expanded: true,
    id: "booking-1",
    isNewClient: true,
    kind: "booking",
    mapDisabled: false,
    mapUrl: "https://maps.example/one",
    notesLabel: "Needs quiet room",
    preferenceLabels: ["Quiet room", "Firm pressure"],
    primaryService: "Massage",
    style: { "--agenda-booking-accent": "#7b4cf4" },
    timeLabel: "10:00",
    verificationInfo: {
      badge: "Payment verification",
      reason: "Waiting for bank transfer verification",
    },
    ...overrides,
  };
}

function cancelledCard(overrides = {}) {
  return {
    booking: { ...baseBooking, id: "cancelled-1" },
    cancelledByLabel: "by client",
    clientName: "Ada Lovelace",
    durationMinutes: 60,
    id: "cancelled-1",
    kind: "cancelled",
    timeLabel: "10:00",
    ...overrides,
  };
}

const {
  AdminAgendaBookingCard,
  AdminCompactBookingCard,
  AdminTimelineBookingCard,
  hasComponent,
  source,
} = await loadCards();

if (hasComponent) {
  assert.match(source, /export function AdminCompactBookingCard/);
  assert.match(source, /export function AdminTimelineBookingCard/);
  assert.match(source, /export function AdminAgendaBookingCard/);
  assert.doesNotMatch(source, /useState|useEffect|useRef|setTimeout|setInterval|fetch|localStorage|supabase|async/i);
}

{
  const markup = renderToStaticMarkup(h(AdminCompactBookingCard, {
    card: compactCard(),
    compact: false,
    onOpenOverview: () => {},
    onRequestDelete: () => {},
  }));
  assert.match(markup, /^<article class="admin-booking-box">/);
  assert.match(markup, /<strong>Ada Lovelace<\/strong><span>60 min<\/span>/);
  assert.match(markup, /<span>10:00 - 11:00<\/span><span>Buffer 30 min<\/span>/);
  assert.match(markup, /<small class="admin-order-note">Ref REF-1<\/small>/);
  assert.match(markup, /<div class="admin-booking-services"><span>Massage \/ 60 min<\/span><span>Stretch<\/span><\/div>/);
  assert.match(markup, /href="https:\/\/maps\.example\/one"/);
  assert.match(markup, /rel="noreferrer"/);
  assert.match(markup, /target="_blank"/);
  assert.match(markup, />Overview<\/button>/);
  assert.match(markup, />Navigate<\/a>/);
  assert.match(markup, /class="admin-danger-option">Delete<\/button>/);
}

{
  const markup = renderToStaticMarkup(h(AdminCompactBookingCard, {
    card: compactCard({ displayReference: "", mapDisabled: true, mapUrl: undefined }),
    compact: true,
    onOpenOverview: () => {},
    onRequestDelete: () => {},
  }));
  assert.match(markup, /^<article class="admin-booking-box compact-admin-booking-box">/);
  assert.doesNotMatch(markup, /admin-booking-services/);
  assert.doesNotMatch(markup, /admin-order-note/);
  assert.match(markup, /aria-disabled="true"/);
  assert.match(markup, /class="disabled-map-link"/);
  assert.doesNotMatch(markup, /href=/);
}

{
  const markup = renderToStaticMarkup(h(AdminCompactBookingCard, {
    card: personalCard(),
    onOpenOverview: () => {},
    onRequestDelete: () => {},
  }));
  assert.equal(markup, '<button type="button" class="admin-personal-event-strip personal-event-blue"><strong>Blocked day</strong><span>Personal - all day</span></button>');
}

{
  const markup = renderToStaticMarkup(h(AdminTimelineBookingCard, {
    card: timelineCard(),
    onOpenOverview: () => {},
    onRequestDelete: () => {},
  }));
  assert.match(markup, /^<article class="day-timeline-booking-box" style="--buffer-percent:33\.33333333333333%">/);
  assert.match(markup, /class="day-timeline-service-band service-band-0" style="height:66\.66666666666666%;top:0%"/);
  assert.match(markup, /class="day-timeline-buffer-band"/);
  assert.match(markup, /<strong>10:00 - 11:30<\/strong><span>60 MAS \+ 30 STR<\/span>/);
  assert.match(markup, /<span class="timeline-client-name">Ada Lovelace<\/span> \/ buffer 30 min/);
  assert.match(markup, /href="https:\/\/maps\.example\/one"/);
}

{
  const markup = renderToStaticMarkup(h(AdminTimelineBookingCard, {
    card: timelineCard({
      className: "day-timeline-booking-box personal-timeline-booking-box",
      mapDisabled: true,
      mapUrl: undefined,
      metaSuffix: " / unavailable",
      personal: true,
      serviceLabel: "Personal event",
    }),
    onOpenOverview: () => {},
    onRequestDelete: () => {},
  }));
  assert.match(markup, /^<article class="day-timeline-booking-box personal-timeline-booking-box"/);
  assert.match(markup, /<span>Personal event<\/span>/);
  assert.match(markup, /\/ unavailable/);
  assert.doesNotMatch(markup, />Navigate<\/a>/);
}

{
  const markup = renderToStaticMarkup(h(AdminAgendaBookingCard, {
    card: agendaCard(),
    onCancelBooking: () => {},
    onDeleteCancelled: () => {},
    onOpenEdit: () => {},
    onRestoreCancelled: () => {},
    onToggleExpanded: () => {},
  }));
  assert.match(markup, /^<article class="agenda-booking-card expanded needs-admin-verification" style="--agenda-booking-accent:#7b4cf4">/);
  assert.match(markup, /class="agenda-booking-card-main" aria-expanded="true"/);
  assert.match(markup, /<strong>10:00<\/strong><small>60m<\/small>/);
  assert.match(markup, /<strong>Ada Lovelace<\/strong><em class="agenda-new-client-badge">New client<\/em><em class="agenda-verification-badge">Payment verification<\/em>/);
  assert.match(markup, /Waiting for bank transfer verification/);
  assert.match(markup, /Buffer 30m/);
  assert.match(markup, /class="agenda-map-button" href="https:\/\/maps\.example\/one"/);
  assert.match(markup, /aria-label="Collapse booking details"/);
  assert.match(markup, /class="agenda-expanded-verification"/);
  assert.match(markup, /<strong>Booking reference<\/strong><em>REF-1<\/em>/);
  assert.match(markup, /<strong>Session preferences<\/strong><em>Quiet room, Firm pressure<\/em>/);
  assert.match(markup, /<strong>Client note<\/strong><em>Needs quiet room<\/em>/);
  assert.match(markup, /<strong>Address<\/strong><em>1 Test Street<\/em>/);
  assert.equal(markup.indexOf("Edit Booking") < markup.indexOf("Cancel Booking"), true);
}

{
  const markup = renderToStaticMarkup(h(AdminAgendaBookingCard, {
    card: agendaCard({
      addressLabel: "",
      className: "agenda-booking-card",
      expanded: false,
      isNewClient: false,
      mapDisabled: true,
      mapUrl: undefined,
      preferenceLabels: [],
      verificationInfo: null,
    }),
    onCancelBooking: () => {},
    onDeleteCancelled: () => {},
    onOpenEdit: () => {},
    onRestoreCancelled: () => {},
    onToggleExpanded: () => {},
  }));
  assert.match(markup, /^<article class="agenda-booking-card" style="--agenda-booking-accent:#7b4cf4">/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /class="agenda-map-button disabled-map-link"/);
  assert.doesNotMatch(markup, /href=/);
  assert.doesNotMatch(markup, /agenda-booking-expanded/);
  assert.doesNotMatch(markup, /New client/);
}

{
  const markup = renderToStaticMarkup(h(AdminAgendaBookingCard, {
    card: cancelledCard(),
    onCancelBooking: () => {},
    onDeleteCancelled: () => {},
    onOpenEdit: () => {},
    onRestoreCancelled: () => {},
    onToggleExpanded: () => {},
  }));
  assert.match(markup, /^<article class="agenda-cancelled-booking-row">/);
  assert.match(markup, /<strong>10:00<\/strong>Booking cancelled - Ada Lovelace<small>60m<\/small><small class="agenda-cancellation-source">by client<\/small>/);
  assert.equal(markup.indexOf("agenda-restore-cancelled-button") < markup.indexOf("agenda-delete-cancelled-button"), true);
  assert.match(markup, /aria-label="Restore cancelled booking for Ada Lovelace"/);
  assert.match(markup, /title="Delete cancelled booking"/);
}

{
  const calls = [];
  const card = compactCard();
  const element = AdminCompactBookingCard({
    card,
    compact: false,
    onOpenOverview: (...args) => calls.push(["open", ...args]),
    onRequestDelete: (...args) => calls.push(["delete", ...args]),
  });
  const [, , , , actions] = React.Children.toArray(element.props.children);
  const [overviewButton,, deleteButton] = React.Children.toArray(actions.props.children);
  overviewButton.props.onClick("ignored");
  deleteButton.props.onClick("ignored");
  assert.deepEqual(calls, [["open", baseBooking], ["delete", baseBooking]]);
}

{
  const calls = [];
  const event = { stopped: false, stopPropagation() { this.stopped = true; } };
  const card = agendaCard();
  const element = AdminAgendaBookingCard({
    card,
    onCancelBooking: (...args) => calls.push(["cancel", ...args]),
    onDeleteCancelled: (...args) => calls.push(["delete-cancelled", ...args]),
    onOpenEdit: (...args) => calls.push(["edit", ...args]),
    onRestoreCancelled: (...args) => calls.push(["restore", ...args]),
    onToggleExpanded: (...args) => calls.push(["toggle", ...args]),
  });
  const [mainButton, sideActions, expanded] = React.Children.toArray(element.props.children);
  mainButton.props.onClick("ignored");
  const [mapLink, expandButton] = React.Children.toArray(sideActions.props.children);
  mapLink.props.onClick(event);
  expandButton.props.onClick("ignored");
  const [, expandedActions] = React.Children.toArray(expanded.props.children);
  const [editButton, cancelButton] = React.Children.toArray(expandedActions.props.children);
  editButton.props.onClick("ignored");
  cancelButton.props.onClick("ignored");
  assert.equal(event.stopped, true);
  assert.deepEqual(calls, [
    ["toggle", baseBooking],
    ["toggle", baseBooking],
    ["edit", baseBooking],
    ["cancel", baseBooking],
  ]);
}

{
  const calls = [];
  const card = cancelledCard();
  const element = AdminAgendaBookingCard({
    card,
    onCancelBooking: () => {},
    onDeleteCancelled: (...args) => calls.push(["delete", ...args]),
    onOpenEdit: () => {},
    onRestoreCancelled: (...args) => calls.push(["restore", ...args]),
    onToggleExpanded: () => {},
  });
  const [, actions] = React.Children.toArray(element.props.children);
  const [restoreButton, deleteButton] = React.Children.toArray(actions.props.children);
  restoreButton.props.onClick("ignored");
  deleteButton.props.onClick("ignored");
  assert.deepEqual(calls, [["restore", card.booking], ["delete", card.booking]]);
}

{
  const card = agendaCard();
  const snapshot = structuredClone(card);
  renderToStaticMarkup(h(AdminAgendaBookingCard, {
    card,
    onCancelBooking: () => {},
    onDeleteCancelled: () => {},
    onOpenEdit: () => {},
    onRestoreCancelled: () => {},
    onToggleExpanded: () => {},
  }));
  assert.deepEqual(card, snapshot);
}
