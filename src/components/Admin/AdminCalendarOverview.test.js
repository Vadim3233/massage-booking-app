import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./AdminCalendarOverview.jsx", import.meta.url);
const appUrl = new URL("../../App.jsx", import.meta.url);

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function Icon() {
  return h("svg", { "aria-hidden": "true" });
}

function fallbackAdminCalendarOverview({
  mode,
  monthOverview,
  onOpenBookingDetails,
  onSelectDate,
  onSelectMonth,
  renderMonthBookingCard,
  weekOverview,
  yearOverview,
}) {
  const renderOverviewDay = (day) => (
    h("article", {
      className: [
        "admin-calendar-overview-day",
        day.compact ? "compact-calendar-overview-day" : "",
        day.expandable ? "expandable-calendar-overview-day" : "",
        day.expanded ? "expanded-calendar-overview-day" : "",
        day.isToday ? "today-calendar-overview-day" : "",
        day.isSelected ? "selected-calendar-overview-day" : "",
      ].filter(Boolean).join(" "),
      key: day.dateValue,
    },
      h("button", {
        type: "button",
        className: "admin-calendar-overview-day-button",
        onClick: () => onSelectDate(day.dateValue),
        "aria-expanded": day.expandable ? day.expanded : undefined,
      },
        h("span", null, day.label),
        h("strong", null, day.dayNumberLabel),
        !day.compact && h("small", null, `${day.bookingCount} booking${day.bookingCount === 1 ? "" : "s"}`),
        day.previewBookings.map((booking) => (
          h("em", { key: booking.id }, `${booking.timeLabel} ${booking.clientName}${booking.cancelled ? " cancelled" : ""}`)
        )),
      ),
      day.expanded && h("div", { className: "admin-week-day-expanded" },
        day.expandedBookings.length > 0
          ? day.expandedBookings.map((booking) => (
              h("article", { className: "admin-week-booking-row", key: booking.id },
                h("div", null,
                  h("strong", null, `${booking.timeLabel} ${booking.clientName}`),
                  h("span", null, booking.primaryService),
                  h("small", null, `${booking.durationMinutes}m treatment | Buffer ${booking.travelMinutes}m`),
                  booking.addressLabel && h("em", null, booking.addressLabel),
                ),
                h("div", null,
                  h("button", { type: "button", onClick: () => onOpenBookingDetails(booking.booking) }, "Details"),
                  h("a", {
                    "aria-disabled": booking.mapDisabled,
                    "aria-label": `Navigate to ${booking.clientName}`,
                    className: booking.mapDisabled ? "disabled-map-link" : "",
                    href: booking.mapDisabled ? undefined : booking.mapUrl,
                    rel: "noreferrer",
                    target: "_blank",
                    title: booking.mapDisabled ? "No address saved" : "Open navigation",
                  }, h(Icon, { "aria-hidden": "true", size: 18, strokeWidth: 2.25 })),
                ),
              )
            ))
          : h("p", null, "No bookings on this day."),
      ),
    )
  );

  if (mode === "week") {
    return h("div", { className: "admin-calendar-overview" },
      h("header", { className: "admin-calendar-overview-heading admin-week-overview-heading" },
        h("div", null,
          h("h3", null, weekOverview.heading),
          h("div", { className: "admin-week-overview-summary", "aria-label": "Weekly summary" },
            weekOverview.summaryItems.map((item) => h("span", { key: item.id }, item.label)),
          ),
        ),
      ),
      h("div", { className: "admin-week-overview-grid" },
        weekOverview.days.length > 0
          ? weekOverview.days.map((day) => renderOverviewDay(day))
          : h("p", { className: "admin-year-month-empty" }, "No bookings recorded for this past week."),
      ),
    );
  }

  if (mode === "month") {
    return h("div", { className: "admin-calendar-overview" },
      h("header", { className: "admin-calendar-overview-heading" },
        h("h3", null, monthOverview.heading),
        h("span", null, monthOverview.bookingCountLabel),
      ),
      h("div", { className: "admin-month-overview-grid", "aria-label": monthOverview.ariaLabel },
        monthOverview.weekdays.map((weekday) => h("b", { key: weekday }, weekday)),
        monthOverview.days.length > 0
          ? monthOverview.days.map((day) => renderOverviewDay(day))
          : h("p", { className: "admin-year-month-empty" }, "No bookings recorded for this past month."),
      ),
    );
  }

  if (mode === "year") {
    return h("div", { className: "admin-calendar-overview" },
      h("header", { className: "admin-calendar-overview-heading" },
        h("h3", null, yearOverview.heading),
        h("span", null, yearOverview.loadedBookingCountLabel),
      ),
      h("div", { className: "admin-year-overview-grid" },
        yearOverview.months.map((month) => (
          h("button", {
            type: "button",
            className: month.selected ? "admin-year-month-card selected-admin-year-month-card" : "admin-year-month-card",
            key: month.firstDay,
            onClick: () => onSelectMonth(month.firstDay),
          },
            h("strong", null, month.monthName),
            h("span", null, month.monthCount),
            h("small", null, "bookings"),
          )
        )),
      ),
      h("section", { className: "admin-year-month-bookings", "aria-label": yearOverview.selectedMonth.ariaLabel },
        h("header", null,
          h("div", null,
            h("p", null, "Selected month"),
            h("h4", null, yearOverview.selectedMonth.label),
          ),
          h("span", null, yearOverview.selectedMonth.bookingCountLabel),
        ),
        yearOverview.selectedMonth.bookingCount > 0
          ? h("div", { className: "admin-year-month-booking-list" },
              yearOverview.selectedMonth.bookingDays.map((day) => (
                h("section", { className: "admin-year-month-booking-day", key: day.dateValue },
                  h("h5", null, day.label),
                  h("div", null, day.bookings.map((booking) => renderMonthBookingCard(booking))),
                )
              )),
            )
          : h("p", { className: "admin-year-month-empty" }, "No bookings loaded for this month."),
      ),
    );
  }

  return null;
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
  assert.match(source, /function renderCalendarOverviewDay\(day, \{ compact = false, expandable = false \} = \{\}\)/);
  assert.match(source, /const blocks = getCalendarEntryBlocks\(day\.bookings\);/);
  assert.match(source, /const isToday = day\.dateValue === todayValue\(\);/);
  assert.match(source, /const isSelected = day\.dateValue === selectedDay\.dateValue;/);
  assert.match(source, /const isExpanded = expandable && isSelected;/);
  assert.match(source, /const dayIndex = days\.findIndex\(\(item\) => item\.dateValue === day\.dateValue\);/);
  assert.match(source, /<small>\{blocks\.length\} booking\{blocks\.length === 1 \? "" : "s"\}<\/small>/);
  assert.match(source, /blocks\.slice\(0, compact \? 2 : 3\)\.map/);
  assert.match(source, /\{minutesToTime\(booking\.start\)\} \{clientNameForBooking\(booking\)\}\{isCancelledBooking\(booking\) \? " cancelled" : ""\}/);
  assert.match(source, /const primaryService = itemsForBooking\(booking\)\[0\]\?\.name \|\| booking\.serviceName \|\| "Massage treatment";/);
  assert.match(source, /const mapDisabled = !booking\.address && !booking\.location;/);
  assert.match(source, /onClick=\{\(\) => \{ setOverviewBooking\(booking\); setOverviewEditing\(false\); setOverviewMoreOpen\(false\); setOverviewTab\("details"\); \}\}/);
  assert.match(source, /href=\{mapDisabled \? undefined : mapUrlForBooking\(booking\)\}/);
  assert.match(source, /function renderWeekView\(\)/);
  assert.match(source, /<h3>Week of \{fullDateLabel\(weekStart\)\}<\/h3>/);
  assert.match(source, /<span>\{formatAdminMoney\(weekSummary\.revenue\)\} earnings<\/span>/);
  assert.match(source, /<span>\{weekSummary\.bookings\} booking\{weekSummary\.bookings === 1 \? "" : "s"\}<\/span>/);
  assert.match(source, /No bookings recorded for this past week\./);
  assert.match(source, /function renderMonthView\(\)/);
  assert.match(source, /WEEK_DAYS\.map\(\(weekday\) => <b key=\{weekday\}>\{weekday\}<\/b>\)/);
  assert.match(source, /No bookings recorded for this past month\./);
  assert.match(source, /function renderYearView\(\)/);
  assert.match(source, /Array\.from\(\{ length: 12 \}, \(_, index\) => \{/);
  assert.match(source, /className=\{month\.firstDay\.startsWith\(selectedMonthValue\) \? "admin-year-month-card selected-admin-year-month-card" : "admin-year-month-card"\}/);
  assert.match(source, /No bookings loaded for this month\./);
}

async function loadAdminCalendarOverview() {
  if (!existsSync(componentUrl)) {
    assertOriginalInlineShape();
    return { AdminCalendarOverview: fallbackAdminCalendarOverview, hasComponent: false, source: "" };
  }

  const source = readFileSync(componentUrl, "utf8");
  const helperSource = readBalancedFunction(source, "renderOverviewDay");
  const functionSource = readBalancedFunction(source, "AdminCalendarOverview")
    .replace("export function AdminCalendarOverview", "function AdminCalendarOverview");
  const transformed = await transformWithOxc(
    [helperSource, functionSource, "globalThis.__AdminCalendarOverviewLoaded = AdminCalendarOverview;"].join("\n\n"),
    "AdminCalendarOverview.jsx",
    { loader: "jsx" },
  );
  const require = createRequire(import.meta.url);
  new Function("React", "Send", "require", transformed.code)(React, Icon, require);
  return { AdminCalendarOverview: globalThis.__AdminCalendarOverviewLoaded, hasComponent: true, source };
}

const bookingWithAddress = {
  address: "1 Test Street",
  dateValue: "2026-08-24",
  dayId: "day-1",
  dayIndex: 0,
  duration: 60,
  id: "booking-1",
  start: "10:00",
};
const bookingWithoutAddress = {
  dateValue: "2026-08-24",
  dayId: "day-1",
  dayIndex: 0,
  duration: 45,
  id: "booking-2",
  start: "12:00",
};

function expandedDay() {
  return {
    bookingCount: 2,
    compact: false,
    dateValue: "2026-08-24",
    dayNumberLabel: "24",
    expandable: true,
    expanded: true,
    expandedBookings: [
      {
        addressLabel: "1 Test Street",
        booking: bookingWithAddress,
        clientName: "Ada Lovelace",
        durationMinutes: 60,
        id: "booking-1",
        mapDisabled: false,
        mapUrl: "https://maps.example/one",
        primaryService: "Massage",
        timeLabel: "10:00",
        travelMinutes: 30,
      },
      {
        addressLabel: "",
        booking: bookingWithoutAddress,
        clientName: "Client",
        durationMinutes: 45,
        id: "booking-2",
        mapDisabled: true,
        mapUrl: undefined,
        primaryService: "Massage treatment",
        timeLabel: "12:00",
        travelMinutes: 0,
      },
    ],
    isSelected: true,
    isToday: true,
    label: "Mon",
    previewBookings: [
      { cancelled: false, clientName: "Ada Lovelace", id: "booking-1", timeLabel: "10:00" },
      { cancelled: true, clientName: "Client", id: "booking-2", timeLabel: "12:00" },
    ],
  };
}

function emptyExpandedDay() {
  return {
    bookingCount: 0,
    compact: false,
    dateValue: "2026-08-25",
    dayNumberLabel: "25",
    expandable: true,
    expanded: true,
    expandedBookings: [],
    isSelected: true,
    isToday: false,
    label: "Tue",
    previewBookings: [],
  };
}

function compactDay() {
  return {
    ...expandedDay(),
    bookingCount: 3,
    compact: true,
    dateValue: "2026-08-26",
    dayNumberLabel: "26",
    expandable: false,
    expanded: false,
    isSelected: false,
    isToday: false,
    label: "Wed",
    previewBookings: [
      { cancelled: false, clientName: "Ada Lovelace", id: "booking-1", timeLabel: "10:00" },
      { cancelled: false, clientName: "Grace Hopper", id: "booking-2", timeLabel: "11:00" },
    ],
  };
}

function weekOverview(overrides = {}) {
  return {
    days: [expandedDay(), emptyExpandedDay()],
    heading: "Week of 24 August 2026",
    summaryItems: [
      { id: "earnings", label: "£90 earnings" },
      { id: "bookings", label: "1 booking" },
      { id: "work", label: "1h work" },
      { id: "travel", label: "30m travel" },
    ],
    ...overrides,
  };
}

function monthOverview(overrides = {}) {
  return {
    ariaLabel: "August 2026 month view",
    bookingCountLabel: "2 bookings",
    days: [compactDay()],
    heading: "August 2026",
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    ...overrides,
  };
}

function yearOverview(overrides = {}) {
  return {
    heading: "2026",
    loadedBookingCountLabel: "3 loaded bookings",
    months: [
      { firstDay: "2026-01-01", monthCount: 0, monthName: "Jan", selected: false },
      { firstDay: "2026-02-01", monthCount: 2, monthName: "Feb", selected: true },
      { firstDay: "2026-03-01", monthCount: 1, monthName: "Mar", selected: false },
    ],
    selectedMonth: {
      ariaLabel: "February 2026 bookings",
      bookingCount: 2,
      bookingCountLabel: "2 bookings",
      bookingDays: [
        {
          bookings: [bookingWithAddress, bookingWithoutAddress],
          dateValue: "2026-02-12",
          label: "12 February 2026",
        },
      ],
      label: "February 2026",
    },
    ...overrides,
  };
}

function props(overrides = {}) {
  return {
    mode: "week",
    monthOverview: monthOverview(),
    onOpenBookingDetails: () => {},
    onSelectDate: () => {},
    onSelectMonth: () => {},
    renderMonthBookingCard: (booking) => h("article", { className: "agenda-card", key: booking.id }, booking.id),
    weekOverview: weekOverview(),
    yearOverview: yearOverview(),
    ...overrides,
  };
}

function markupFor(Component, overrides = {}) {
  return renderToStaticMarkup(React.createElement(Component, props(overrides)));
}

function childArray(value) {
  return React.Children.toArray(value);
}

const { AdminCalendarOverview, hasComponent, source } = await loadAdminCalendarOverview();

if (hasComponent) {
  assert.match(source, /export function AdminCalendarOverview/);
  assert.match(source, /mode,\s*monthOverview,\s*onOpenBookingDetails,\s*onSelectDate,\s*onSelectMonth,\s*renderMonthBookingCard,\s*weekOverview,\s*yearOverview,/);
  assert.doesNotMatch(source, /useState|useEffect|useRef|setTimeout|setInterval|fetch|localStorage|supabase|async/i);
}

{
  const markup = markupFor(AdminCalendarOverview, { mode: "week" });
  assert.match(markup, /^<div class="admin-calendar-overview"><header class="admin-calendar-overview-heading admin-week-overview-heading">/);
  assert.match(markup, /<h3>Week of 24 August 2026<\/h3>/);
  assert.equal(markup.indexOf("£90 earnings") < markup.indexOf("1 booking"), true);
  assert.equal(markup.indexOf("1 booking") < markup.indexOf("1h work"), true);
  assert.equal(markup.indexOf("1h work") < markup.indexOf("30m travel"), true);
  assert.match(markup, /class="admin-calendar-overview-day expandable-calendar-overview-day expanded-calendar-overview-day today-calendar-overview-day selected-calendar-overview-day"/);
  assert.match(markup, /aria-expanded="true"/);
  assert.match(markup, /<small>2 bookings<\/small>/);
  assert.match(markup, /10:00 Ada Lovelace/);
  assert.match(markup, /12:00 Client cancelled/);
  assert.equal(markup.indexOf("<span>Mon</span>") < markup.indexOf("<span>Tue</span>"), true);
  assert.match(markup, /class="admin-week-day-expanded"/);
  assert.match(markup, /<small>60m treatment \| Buffer 30m<\/small>/);
  assert.match(markup, /<em>1 Test Street<\/em>/);
  assert.match(markup, /href="https:\/\/maps\.example\/one"/);
  assert.match(markup, /title="Open navigation"/);
  assert.match(markup, /aria-disabled="true"/);
  assert.match(markup, /class="disabled-map-link"/);
  assert.match(markup, /title="No address saved"/);
  assert.match(markup, />Details<\/button>/);
  assert.match(markup, /No bookings on this day\./);
}

{
  const markup = markupFor(AdminCalendarOverview, { mode: "week", weekOverview: weekOverview({ days: [], summaryItems: [
    { id: "earnings", label: "£0 earnings" },
    { id: "bookings", label: "0 bookings" },
    { id: "work", label: "0m work" },
    { id: "travel", label: "0m travel" },
  ] }) });
  assert.match(markup, /No bookings recorded for this past week\./);
  assert.match(markup, /0 bookings/);
}

{
  const markup = markupFor(AdminCalendarOverview, { mode: "month" });
  assert.match(markup, /^<div class="admin-calendar-overview"><header class="admin-calendar-overview-heading"><h3>August 2026<\/h3><span>2 bookings<\/span><\/header>/);
  assert.match(markup, /aria-label="August 2026 month view"/);
  assert.equal(markup.indexOf("<b>Mon</b>") < markup.indexOf("<b>Tue</b>"), true);
  assert.equal(markup.indexOf("<b>Sun</b>") < markup.indexOf("<article"), true);
  assert.match(markup, /class="admin-calendar-overview-day compact-calendar-overview-day"/);
  assert.doesNotMatch(markup, /<small>3 bookings<\/small>/);
  assert.match(markup, /10:00 Ada Lovelace/);
  assert.match(markup, /11:00 Grace Hopper/);
}

{
  const markup = markupFor(AdminCalendarOverview, { mode: "month", monthOverview: monthOverview({ days: [], bookingCountLabel: "0 bookings" }) });
  assert.match(markup, /No bookings recorded for this past month\./);
}

{
  const markup = markupFor(AdminCalendarOverview, { mode: "year" });
  assert.match(markup, /^<div class="admin-calendar-overview"><header class="admin-calendar-overview-heading"><h3>2026<\/h3><span>3 loaded bookings<\/span><\/header>/);
  assert.equal(markup.indexOf("<strong>Jan</strong>") < markup.indexOf("<strong>Feb</strong>"), true);
  assert.match(markup, /class="admin-year-month-card selected-admin-year-month-card"/);
  assert.match(markup, /<small>bookings<\/small>/);
  assert.match(markup, /aria-label="February 2026 bookings"/);
  assert.match(markup, /<p>Selected month<\/p><h4>February 2026<\/h4>/);
  assert.match(markup, /<span>2 bookings<\/span>/);
  assert.match(markup, /<h5>12 February 2026<\/h5>/);
  assert.equal(markup.indexOf("booking-1") < markup.indexOf("booking-2"), true);
}

{
  const markup = markupFor(AdminCalendarOverview, {
    mode: "year",
    yearOverview: yearOverview({
      selectedMonth: {
        ariaLabel: "March 2026 bookings",
        bookingCount: 0,
        bookingCountLabel: "0 bookings",
        bookingDays: [],
        label: "March 2026",
      },
    }),
  });
  assert.match(markup, /No bookings loaded for this month\./);
  assert.match(markup, /0 bookings/);
}

{
  const selectedDates = [];
  const selectedMonths = [];
  const opened = [];
  const element = AdminCalendarOverview({
    ...props({
      mode: "week",
      onOpenBookingDetails: (booking) => opened.push(booking),
      onSelectDate: (...args) => selectedDates.push(args),
      onSelectMonth: (...args) => selectedMonths.push(args),
    }),
  });
  const [, grid] = childArray(element.props.children);
  const [firstDay] = childArray(grid.props.children);
  const [dayButton, expanded] = childArray(firstDay.props.children);
  dayButton.props.onClick("ignored");
  const [firstBookingRow] = childArray(expanded.props.children);
  const [, actions] = childArray(firstBookingRow.props.children);
  const [detailsButton] = childArray(actions.props.children);
  detailsButton.props.onClick("ignored");
  assert.deepEqual(selectedDates, [["2026-08-24"]]);
  assert.deepEqual(selectedMonths, []);
  assert.equal(opened[0], bookingWithAddress);
}

{
  const selectedMonths = [];
  const element = AdminCalendarOverview({
    ...props({
      mode: "year",
      onSelectMonth: (...args) => selectedMonths.push(args),
    }),
  });
  const [, monthGrid] = childArray(element.props.children);
  const [, febButton] = childArray(monthGrid.props.children);
  febButton.props.onClick("ignored");
  assert.deepEqual(selectedMonths, [["2026-02-01"]]);
}

{
  const model = weekOverview();
  const snapshot = structuredClone(model);
  markupFor(AdminCalendarOverview, { mode: "week", weekOverview: model });
  assert.deepEqual(model, snapshot);
}

{
  assert.equal(markupFor(AdminCalendarOverview, { mode: "agenda" }), "");
}
