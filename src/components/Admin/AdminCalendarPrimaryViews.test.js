import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./AdminCalendarPrimaryViews.jsx", import.meta.url);
const appUrl = new URL("../../App.jsx", import.meta.url);

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function Icon() {
  return h("svg", { "aria-hidden": "true" });
}

function fallbackAdminAgendaDayHeader({
  header,
  onOpenAppointment,
  onOpenScheduleMode,
  onOpenWorkingHours,
}) {
  return h("div", { className: "admin-agenda-day-topline" },
    h("h3", null,
      h("button", {
        type: "button",
        className: "admin-agenda-day-add",
        onClick: () => onOpenAppointment(header.day),
      }, header.dateLabel),
      header.isToday && h("span", { className: "admin-today-marker" },
        h("span", { "aria-hidden": "true" }),
        "Today",
      ),
    ),
    h("div", { className: "agenda-day-meta-controls", "aria-label": header.controlsAriaLabel },
      h("button", {
        type: "button",
        className: header.hoursButtonClassName,
        onClick: () => onOpenWorkingHours(header.day),
      },
        h("span", null, header.hoursLabel),
        header.customBadgeLabel && h("b", { "aria-label": header.customBadgeAriaLabel }, header.customBadgeLabel),
      ),
      h("button", {
        type: "button",
        className: "agenda-day-mode-button",
        onClick: () => onOpenScheduleMode(header.day),
      },
        h("span", { className: header.modeBadgeClassName }, header.modeLabel),
        header.anchorActive && h("span", { className: "agenda-anchor-badge", "aria-label": header.anchorAriaLabel }, header.anchorText),
        h(Icon, { "aria-hidden": "true", size: 16, strokeWidth: 2.4 }),
      ),
    ),
  );
}

function fallbackAdminAgendaView({
  agenda,
  agendaListRef,
  onBindDayRef,
  onOpenAppointment,
  onOpenScheduleMode,
  onOpenWorkingHours,
  renderBookingCard,
}) {
  return h("div", { className: "admin-agenda-list", ref: agendaListRef },
    agenda.days.map((day) => (
      h("section", {
        className: day.className,
        "data-agenda-date-value": day.dateValue,
        key: day.id,
        ref: (node) => onBindDayRef(day.dateValue, node),
      },
        h(fallbackAdminAgendaDayHeader, {
          header: day.header,
          onOpenAppointment,
          onOpenScheduleMode,
          onOpenWorkingHours,
        }),
        day.summary && h("div", { className: "admin-day-summary-line", "aria-label": "Daily summary" },
          day.summary.items.map((item) => h("span", { key: item.id }, item.label)),
        ),
        day.bookings.map((booking) => renderBookingCard(booking)),
      )
    )),
  );
}

function fallbackAdminCalendarTimeGrid({
  grid,
  gridRef,
  renderCompactCard,
  renderTimelineCard,
}) {
  if (grid.empty) {
    return h("div", { className: "admin-calendar-overview" },
      h("p", { className: "admin-year-month-empty" }, "No bookings recorded for this past period."),
    );
  }

  return h("div", { className: grid.className, ref: gridRef, style: grid.style },
    h("div", { className: "admin-grid-times", style: grid.timeColumnStyle },
      grid.hours.map((hour) => h("span", { key: hour.value }, hour.label)),
    ),
    grid.days.map((day) => (
      h("div", { className: "admin-grid-day", "data-date-value": day.dateValue, key: day.id },
        h("h3", null, day.label),
        h("div", { className: "admin-grid-column", style: day.columnStyle },
          day.hourLines.map((hour) => h("span", { className: "grid-hour-line", key: hour })),
          day.blocks.map((block) => (
            h("div", {
              className: block.className,
              key: block.id,
              style: block.style,
            },
              block.compact
                ? renderCompactCard(block.booking, true)
                : renderTimelineCard(block.booking),
            )
          )),
        ),
      )
    )),
  );
}

function readBalancedFunction(source, name) {
  const index = source.indexOf(`function ${name}`);
  assert.notEqual(index, -1, `${name} should exist`);
  const paramsOpenIndex = source.indexOf("(", index);
  let paramsDepth = 0;
  let paramsCloseIndex = -1;
  for (let cursor = paramsOpenIndex; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === "(") paramsDepth += 1;
    if (character === ")") {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        paramsCloseIndex = cursor;
        break;
      }
    }
  }
  assert.notEqual(paramsCloseIndex, -1, `${name} parameter list should close`);
  const openIndex = source.indexOf("{", paramsCloseIndex);
  let depth = 0;
  for (let cursor = openIndex; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(index, cursor + 1);
    }
  }
  throw new Error(`Could not read ${name}`);
}

function assertOriginalInlineShape() {
  const source = readFileSync(appUrl, "utf8");
  assert.match(source, /function renderDaySummaryLine\(blocks\)/);
  assert.match(source, /function renderAgendaDayHeader\(day, isToday\)/);
  assert.match(source, /function renderAgendaView\(\)/);
  assert.match(source, /function renderTimeGrid\(dayList, \{ scrollable = false \} = \{\}\)/);
  assert.match(source, /ref=\{\(node\) => \{\s*if \(node\) \{\s*agendaDayRefs\.current\[day\.dateValue\] = node;/);
  assert.match(source, /renderBookingBox\(\{ \.\.\.booking, dayId: day\.id, dayIndex: days\.findIndex/);
  assert.match(source, /renderTimelineBookingBox\(\{ \.\.\.booking, dayId: day\.id, dayIndex: days\.findIndex/);
}

async function loadComponents() {
  if (!existsSync(componentUrl)) {
    assertOriginalInlineShape();
    return {
      AdminAgendaDayHeader: fallbackAdminAgendaDayHeader,
      AdminAgendaView: fallbackAdminAgendaView,
      AdminCalendarTimeGrid: fallbackAdminCalendarTimeGrid,
    };
  }

  const source = readFileSync(componentUrl, "utf8");
  assert.doesNotMatch(source, /\buse(State|Effect|Ref|Memo|Callback)\b/);
  assert.doesNotMatch(source, /\bsupabase\b|\blocalStorage\b|\bfetch\b|\bsetTimeout\b|\bsetInterval\b|\basync\b/);
  assert.match(source, /from "lucide-react"/);

  const functionSource = [
    readBalancedFunction(source, "AdminAgendaDayHeader").replace("export function AdminAgendaDayHeader", "function AdminAgendaDayHeader"),
    readBalancedFunction(source, "AdminAgendaView").replace("export function AdminAgendaView", "function AdminAgendaView"),
    readBalancedFunction(source, "AdminCalendarTimeGrid").replace("export function AdminCalendarTimeGrid", "function AdminCalendarTimeGrid"),
  ].join("\n\n");
  const transformed = await transformWithOxc(functionSource, "AdminCalendarPrimaryViews.test.jsx", {
    loader: "jsx",
  });

  const factory = new Function(
    "React",
    "ChevronDown",
    "require",
    `${transformed.code}
return { AdminAgendaDayHeader, AdminAgendaView, AdminCalendarTimeGrid };`,
  );
  const require = createRequire(import.meta.url);
  return factory(React, Icon, require);
}

function getChildren(element) {
  return React.Children.toArray(element.props.children);
}

function makeAgendaModel() {
  const today = {
    id: "day-1",
    dateValue: "2026-08-29",
    label: "today-day",
  };
  const later = {
    id: "day-2",
    dateValue: "2026-08-30",
    label: "later-day",
  };
  return {
    days: [
      {
        id: today.id,
        dateValue: today.dateValue,
        className: "admin-agenda-day admin-agenda-today selected-admin-agenda-day",
        header: {
          anchorActive: true,
          anchorAriaLabel: "Anchor start 09:30",
          anchorText: "⚓ 09:30",
          controlsAriaLabel: "Settings for Saturday 29 August",
          customBadgeAriaLabel: "Date-specific working hours override",
          customBadgeLabel: "CUSTOM",
          dateLabel: "Saturday 29 August",
          day: today,
          hoursButtonClassName: "agenda-day-hours-button modified",
          hoursLabel: "09:00 – 17:00",
          isToday: true,
          modeBadgeClassName: "agenda-mode-badge chain",
          modeLabel: "CHAIN",
        },
        summary: {
          items: [
            { id: "leave", label: "🏠 Leave 08:45" },
            { id: "work", label: "2 hours work" },
            { id: "travel", label: "30 mins travel" },
            { id: "revenue", label: "£140" },
            { id: "home", label: "🏠 12:30" },
          ],
        },
        bookings: [
          { id: "normal", dayId: today.id, dateValue: today.dateValue, kind: "booking" },
          { id: "personal", dayId: today.id, dateValue: today.dateValue, kind: "personal" },
          { id: "cancelled", dayId: today.id, dateValue: today.dateValue, kind: "cancelled" },
        ],
      },
      {
        id: later.id,
        dateValue: later.dateValue,
        className: "admin-agenda-day empty-admin-agenda-day",
        header: {
          anchorActive: false,
          anchorAriaLabel: "Anchor start 09:00",
          anchorText: "⚓ 09:00",
          controlsAriaLabel: "Settings for Sunday 30 August",
          customBadgeAriaLabel: "Date-specific closed-day override",
          customBadgeLabel: "",
          dateLabel: "Sunday 30 August",
          day: later,
          hoursButtonClassName: "agenda-day-hours-button",
          hoursLabel: "Unavailable",
          isToday: false,
          modeBadgeClassName: "agenda-mode-badge flex",
          modeLabel: "FLEX",
        },
        summary: null,
        bookings: [],
      },
    ],
  };
}

function makeGridModel({ compact = false, scrollable = false } = {}) {
  const booking = { id: compact ? "compact-booking" : "timeline-booking", marker: compact ? "compact" : "timeline" };
  return {
    empty: false,
    className: `${compact ? "admin-three-day-grid" : "admin-day-grid"}${scrollable ? " scrollable-three-day-grid" : ""}`,
    style: compact ? { gridTemplateColumns: "72px repeat(3, minmax(220px, 1fr))" } : undefined,
    timeColumnStyle: { gridTemplateRows: "repeat(3, 72px)" },
    hours: [
      { value: 9, label: "09:00" },
      { value: 10, label: "10:00" },
      { value: 11, label: "11:00" },
    ],
    days: [
      {
        id: "day-1",
        dateValue: "2026-08-29",
        label: "Saturday 29 August",
        columnStyle: { minHeight: "216px" },
        hourLines: [9, 10, 11],
        blocks: [
          {
            id: booking.id,
            booking,
            className: compact ? "admin-grid-event" : "admin-grid-event full-admin-grid-event",
            compact,
            style: { height: "20%", top: "10%" },
          },
        ],
      },
    ],
  };
}

const {
  AdminAgendaDayHeader,
  AdminAgendaView,
  AdminCalendarTimeGrid,
} = await loadComponents();

{
  const agenda = makeAgendaModel();
  const calls = [];
  const header = h(AdminAgendaDayHeader, {
    header: agenda.days[0].header,
    onOpenAppointment: (day) => calls.push(["appointment", day]),
    onOpenScheduleMode: (day) => calls.push(["schedule", day]),
    onOpenWorkingHours: (day) => calls.push(["hours", day]),
  });
  const html = renderToStaticMarkup(header);
  assert.match(html, /admin-agenda-day-topline/);
  assert.match(html, /Saturday 29 August/);
  assert.match(html, /Today/);
  assert.match(html, /09:00 – 17:00/);
  assert.match(html, /Date-specific working hours override/);
  assert.match(html, /CUSTOM/);
  assert.match(html, /CHAIN/);
  assert.match(html, /Anchor start 09:30/);

  const headerOutput = AdminAgendaDayHeader(header.props);
  const topChildren = getChildren(headerOutput);
  const heading = topChildren[0];
  const controls = topChildren[1];
  const headingChildren = getChildren(heading);
  const controlButtons = getChildren(controls);
  headingChildren[0].props.onClick();
  controlButtons[0].props.onClick();
  controlButtons[1].props.onClick();
  assert.deepEqual(calls, [
    ["appointment", agenda.days[0].header.day],
    ["hours", agenda.days[0].header.day],
    ["schedule", agenda.days[0].header.day],
  ]);
}

{
  const agenda = makeAgendaModel();
  const snapshot = structuredClone(agenda);
  const ref = { current: null };
  const bindCalls = [];
  const renderedBookings = [];
  const element = h(AdminAgendaView, {
    agenda,
    agendaListRef: ref,
    onBindDayRef: (dateValue, node) => bindCalls.push([dateValue, node]),
    onOpenAppointment: () => {},
    onOpenScheduleMode: () => {},
    onOpenWorkingHours: () => {},
    renderBookingCard: (booking) => {
      renderedBookings.push(booking);
      return h("article", { key: booking.id, "data-booking-id": booking.id }, booking.id);
    },
  });

  assert.equal(element.type, AdminAgendaView);
  const output = AdminAgendaView(element.props);
  assert.equal(output.props.className, "admin-agenda-list");
  assert.equal(output.props.ref, ref);
  const sections = getChildren(output);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].props.className, "admin-agenda-day admin-agenda-today selected-admin-agenda-day");
  assert.equal(sections[0].props["data-agenda-date-value"], "2026-08-29");
  sections[0].props.ref("node-1");
  sections[0].props.ref(null);
  assert.deepEqual(bindCalls, [["2026-08-29", "node-1"], ["2026-08-29", null]]);

  renderedBookings.length = 0;
  const html = renderToStaticMarkup(element);
  assert.match(html, /Daily summary/);
  assert.match(html, /🏠 Leave 08:45/);
  assert.match(html, /2 hours work/);
  assert.match(html, /30 mins travel/);
  assert.match(html, /£140/);
  assert.match(html, /🏠 12:30/);
  assert.match(html, /empty-admin-agenda-day/);
  assert.deepEqual(renderedBookings.map((booking) => booking.id), ["normal", "personal", "cancelled"]);
  assert.deepEqual(agenda, snapshot);
}

{
  const agenda = { days: [] };
  const element = h(AdminAgendaView, {
    agenda,
    agendaListRef: { current: null },
    onBindDayRef: () => {},
    onOpenAppointment: () => {},
    onOpenScheduleMode: () => {},
    onOpenWorkingHours: () => {},
    renderBookingCard: (booking) => h("article", { key: booking.id }),
  });
  assert.equal(renderToStaticMarkup(element), '<div class="admin-agenda-list"></div>');
}

{
  const grid = makeGridModel();
  const snapshot = structuredClone(grid);
  const calls = [];
  const element = h(AdminCalendarTimeGrid, {
    grid,
    gridRef: undefined,
    renderCompactCard: (booking, compact) => {
      calls.push(["compact", booking, compact]);
      return h("em", null, booking.id);
    },
    renderTimelineCard: (booking) => {
      calls.push(["timeline", booking]);
      return h("strong", null, booking.id);
    },
  });
  const output = AdminCalendarTimeGrid(element.props);
  assert.equal(output.props.className, "admin-day-grid");
  assert.equal(output.props.ref, undefined);
  assert.equal(output.props.style, undefined);
  calls.length = 0;
  const html = renderToStaticMarkup(element);
  assert.match(html, /admin-grid-times/);
  assert.match(html, /09:00/);
  assert.match(html, /10:00/);
  assert.match(html, /11:00/);
  assert.match(html, /Saturday 29 August/);
  assert.match(html, /admin-grid-event full-admin-grid-event/);
  assert.match(html, /height:20%;top:10%/);
  assert.deepEqual(calls, [["timeline", grid.days[0].blocks[0].booking]]);
  assert.deepEqual(grid, snapshot);
}

{
  const grid = makeGridModel({ compact: true, scrollable: true });
  const ref = { current: null };
  const calls = [];
  const element = h(AdminCalendarTimeGrid, {
    grid,
    gridRef: ref,
    renderCompactCard: (booking, compact) => {
      calls.push([booking, compact]);
      return h("em", null, booking.id);
    },
    renderTimelineCard: (booking) => h("strong", null, booking.id),
  });
  const output = AdminCalendarTimeGrid(element.props);
  assert.equal(output.props.className, "admin-three-day-grid scrollable-three-day-grid");
  assert.equal(output.props.ref, ref);
  assert.deepEqual(output.props.style, { gridTemplateColumns: "72px repeat(3, minmax(220px, 1fr))" });
  calls.length = 0;
  const html = renderToStaticMarkup(element);
  assert.match(html, /admin-grid-event/);
  assert.deepEqual(calls, [[grid.days[0].blocks[0].booking, true]]);
}

{
  const element = h(AdminCalendarTimeGrid, {
    grid: { empty: true },
    gridRef: { current: null },
    renderCompactCard: () => null,
    renderTimelineCard: () => null,
  });
  assert.equal(
    renderToStaticMarkup(element),
    '<div class="admin-calendar-overview"><p class="admin-year-month-empty">No bookings recorded for this past period.</p></div>',
  );
}

console.log("Admin calendar primary views characterization tests passed.");
