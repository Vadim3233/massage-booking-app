import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./AdminCalendarDateNavigation.jsx", import.meta.url);
const appUrl = new URL("../../App.jsx", import.meta.url);

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function Icon() {
  return h("svg", { "aria-hidden": "true" });
}

function fallbackAdminCalendarDateNavigation({
  compactDateNavVisible,
  datePillItems,
  dateStripRef,
  formatAdminMoney,
  formatAgendaDuration,
  isTodaySelected,
  monthLabel,
  onDatePillClick,
  onGoToToday,
  onShiftWeek,
  weekSummary,
}) {
  const renderAdminWeekDateControls = ({ compact = false } = {}) => (
    h("div", { className: `admin-week-date-row${compact ? " compact-admin-week-date-row" : ""}` },
      h("button", {
        type: "button",
        className: "admin-week-nav-button",
        "aria-label": "Previous week",
        onClick: () => onShiftWeek(-7),
      }, h(Icon, { "aria-hidden": "true", size: compact ? 15 : 17 })),
      h("div", { className: "admin-week-date-pills" },
        datePillItems.map((day) => (
          h("button", {
            type: "button",
            className: [
              "admin-date-pill",
              day.isSelected ? "active-admin-date" : "",
              day.isToday ? "today-admin-date" : "",
            ].filter(Boolean).join(" "),
            key: day.id,
            onClick: () => onDatePillClick(day.resolvedIndex, day.dateValue),
            "aria-pressed": day.isSelected,
          },
            h("span", { className: "admin-date-weekday-full" }, day.label),
            h("span", { className: "admin-date-weekday-short", "aria-hidden": "true" }, day.shortWeekdayLabel),
            h("strong", null,
              h("span", { className: "admin-date-day-number" }, day.dayNumberLabel),
              h("span", { className: "admin-date-month-short" }, ` ${day.monthShortLabel}`),
            ),
            h("span", { className: "admin-date-year" }, day.yearShortLabel),
          )
        )),
      ),
      h("button", {
        type: "button",
        className: "admin-week-nav-button",
        "aria-label": "Next week",
        onClick: () => onShiftWeek(7),
      }, h(Icon, { "aria-hidden": "true", size: compact ? 15 : 17 })),
    )
  );

  return h(React.Fragment, null,
    h("div", { className: "admin-date-strip", "aria-label": "Choose date", ref: dateStripRef },
      h("p", { className: "admin-date-strip-month" }, monthLabel),
      renderAdminWeekDateControls(),
      h("button", {
        type: "button",
        className: isTodaySelected ? "admin-today-jump-button active-admin-today-jump" : "admin-today-jump-button",
        onClick: onGoToToday,
      }, h(Icon, { "aria-hidden": "true", size: 15, strokeWidth: 2 }), "Today"),
      h("div", { className: "admin-week-summary-line", "aria-label": "Weekly summary" },
        h("span", null, `${formatAdminMoney(weekSummary.revenue)} week`),
        h("span", null, `${formatAgendaDuration(weekSummary.workMinutes)} work`),
        h("span", null, `${formatAgendaDuration(weekSummary.travelMinutes)} travel`),
        h("span", null, `${weekSummary.bookings} booking${weekSummary.bookings === 1 ? "" : "s"}`),
      ),
    ),
    compactDateNavVisible && h("div", { className: "admin-compact-date-nav visible" },
      h("div", { className: "admin-compact-date-nav-inner" },
        h("div", { className: "admin-compact-date-label" },
          h("span", null, "Week"),
          h("strong", null, monthLabel),
        ),
        renderAdminWeekDateControls({ compact: true }),
        h("button", {
          type: "button",
          className: isTodaySelected ? "admin-today-jump-button active-admin-today-jump" : "admin-today-jump-button",
          onClick: onGoToToday,
        }, h(Icon, { "aria-hidden": "true", size: 14, strokeWidth: 2 }), "Today"),
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
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  throw new Error(`Could not read ${name}`);
}

function appSource() {
  return readFileSync(appUrl, "utf8");
}

function componentSource() {
  return readFileSync(componentUrl, "utf8");
}

function assertOriginalInlineShape() {
  const source = appSource();
  assert.match(source, /function renderAdminWeekDateControls\(\{ compact = false \} = \{\}\)/);
  assert.match(source, /className=\{`admin-week-date-row\$\{activeTab === "calendar" \? "" : " without-week-nav"\}\$\{compact \? " compact-admin-week-date-row" : ""\}`\}/);
  assert.match(source, /aria-label="Previous week"/);
  assert.match(source, /onClick=\{\(\) => shiftAdminDateStripWeek\(-7\)\}/);
  assert.match(source, /aria-label="Next week"/);
  assert.match(source, /onClick=\{\(\) => shiftAdminDateStripWeek\(7\)\}/);
  assert.match(source, /adminDateStripDays\.map\(\(day\) => \{/);
  assert.match(source, /const sourceIndex = days\.findIndex\(\(item\) => item\.dateValue === day\.dateValue\)/);
  assert.match(source, /onClick=\{\(\) => handleDatePillClick\(sourceIndex >= 0 \? sourceIndex : selectedDayIndex, day\.dateValue\)\}/);
  assert.match(source, /aria-pressed=\{isSelected\}/);
  assert.match(source, /<span className="admin-date-weekday-full">\{day\.label\}<\/span>/);
  assert.match(source, /<span className="admin-date-weekday-short" aria-hidden="true">\{day\.label\.slice\(0, 1\)\}<\/span>/);
  assert.match(source, /<span className="admin-date-day-number">\{dayNumberLabel\(day\.dateValue\)\}<\/span>/);
  assert.match(source, /<span className="admin-date-month-short"> \{monthShortLabel\(day\.dateValue\)\}<\/span>/);
  assert.match(source, /<span className="admin-date-year">\{yearShortLabel\(day\.dateValue\)\}<\/span>/);
  assert.match(source, /<div className="admin-date-strip" aria-label="Choose date" ref=\{adminDateStripRef\}>/);
  assert.match(source, /<p className="admin-date-strip-month">\{monthRangeLabel\(adminDateStripDays, adminDateStripSelectedIndex\)\}<\/p>/);
  assert.match(source, /className=\{selectedDay\.dateValue === currentDateValue \? "admin-today-jump-button active-admin-today-jump" : "admin-today-jump-button"\}/);
  assert.match(source, /<div className="admin-week-summary-line" aria-label="Weekly summary">/);
  assert.match(source, /\{formatAdminMoney\(adminWeekSummary\.revenue\)\} week/);
  assert.match(source, /\{formatAgendaDuration\(adminWeekSummary\.workMinutes\)\} work/);
  assert.match(source, /\{formatAgendaDuration\(adminWeekSummary\.travelMinutes\)\} travel/);
  assert.match(source, /\{adminWeekSummary\.bookings\} booking\{adminWeekSummary\.bookings === 1 \? "" : "s"\}/);
  assert.match(source, /activeTab === "calendar" && compactDateNavVisible/);
}

async function loadAdminCalendarDateNavigation() {
  if (!existsSync(componentUrl)) {
    assertOriginalInlineShape();
    return { AdminCalendarDateNavigation: fallbackAdminCalendarDateNavigation };
  }

  const source = componentSource();
  const functionSource = readBalancedFunction(source, "AdminCalendarDateNavigation")
    .replace("export function AdminCalendarDateNavigation", "function AdminCalendarDateNavigation");
  const transformed = await transformWithOxc(
    [
      functionSource,
      "globalThis.__AdminCalendarDateNavigationLoaded = AdminCalendarDateNavigation;",
    ].join("\n\n"),
    "AdminCalendarDateNavigation.jsx",
    { loader: "jsx" },
  );

  const require = createRequire(import.meta.url);
  new Function("require", "CalendarDays", "ChevronLeft", "ChevronRight", transformed.code)(
    require,
    Icon,
    Icon,
    Icon,
  );
  return { AdminCalendarDateNavigation: globalThis.__AdminCalendarDateNavigationLoaded };
}

function baseDatePillItems() {
  return [
    {
      dateValue: "2026-08-24",
      dayNumberLabel: "24",
      id: "mon",
      isSelected: false,
      isToday: false,
      label: "Mon",
      monthShortLabel: "Aug",
      resolvedIndex: 0,
      shortWeekdayLabel: "M",
      yearShortLabel: "26",
    },
    {
      dateValue: "2026-08-25",
      dayNumberLabel: "25",
      id: "tue",
      isSelected: true,
      isToday: true,
      label: "Tue",
      monthShortLabel: "Aug",
      resolvedIndex: 3,
      shortWeekdayLabel: "T",
      yearShortLabel: "26",
    },
    {
      dateValue: "2026-08-26",
      dayNumberLabel: "26",
      id: "wed",
      isSelected: false,
      isToday: false,
      label: "Wed",
      monthShortLabel: "Aug",
      resolvedIndex: 2,
      shortWeekdayLabel: "W",
      yearShortLabel: "26",
    },
  ];
}

function baseProps(AdminCalendarDateNavigation, overrides = {}) {
  return {
    AdminCalendarDateNavigation,
    compactDateNavVisible: false,
    datePillItems: baseDatePillItems(),
    dateStripRef: { current: null },
    formatAdminMoney: (value) => `£${value}`,
    formatAgendaDuration: (value) => `${value}m`,
    isTodaySelected: true,
    monthLabel: "24-30 Aug",
    onDatePillClick: () => {},
    onGoToToday: () => {},
    onShiftWeek: () => {},
    weekSummary: {
      bookings: 2,
      revenue: 150,
      travelMinutes: 45,
      workMinutes: 180,
    },
    ...overrides,
  };
}

function markupFor(AdminCalendarDateNavigation, overrides = {}) {
  const props = baseProps(AdminCalendarDateNavigation, overrides);
  return renderToStaticMarkup(React.createElement(AdminCalendarDateNavigation, props));
}

function elementFor(AdminCalendarDateNavigation, overrides = {}) {
  return AdminCalendarDateNavigation(baseProps(AdminCalendarDateNavigation, overrides));
}

function childrenOf(element) {
  return React.Children.toArray(element.props.children).filter(Boolean);
}

function findAllByType(element, type, results = []) {
  if (!React.isValidElement(element)) return results;
  if (element.type === type) results.push(element);
  React.Children.forEach(element.props.children, (child) => findAllByType(child, type, results));
  return results;
}

const { AdminCalendarDateNavigation } = await loadAdminCalendarDateNavigation();

{
  const markup = markupFor(AdminCalendarDateNavigation);
  assert.match(markup, /class="admin-date-strip"/);
  assert.match(markup, /aria-label="Choose date"/);
  assert.match(markup, /class="admin-date-strip-month">24-30 Aug/);
  assert.doesNotMatch(markup, /admin-compact-date-nav visible/);
  assert.match(markup, /class="admin-week-summary-line" aria-label="Weekly summary"/);
  assert.match(markup, /£150 week/);
  assert.match(markup, /180m work/);
  assert.match(markup, /45m travel/);
  assert.match(markup, /2 bookings/);
}

{
  const markup = markupFor(AdminCalendarDateNavigation, {
    compactDateNavVisible: true,
    isTodaySelected: false,
    weekSummary: { bookings: 1, revenue: 80, travelMinutes: 0, workMinutes: 60 },
  });
  assert.match(markup, /class="admin-compact-date-nav visible"/);
  assert.match(markup, /class="admin-compact-date-label"><span>Week<\/span><strong>24-30 Aug<\/strong>/);
  assert.match(markup, /1 booking/);
  assert.doesNotMatch(markup, /active-admin-today-jump/);
}

{
  const markup = markupFor(AdminCalendarDateNavigation);
  assert.equal(markup.indexOf("Previous week") < markup.indexOf("admin-week-date-pills"), true);
  assert.equal(markup.indexOf("admin-week-date-pills") < markup.indexOf("Next week"), true);
  assert.equal(markup.indexOf("Next week") < markup.indexOf("Today"), true);
  assert.equal(markup.indexOf("Mon") < markup.indexOf("Tue"), true);
  assert.equal(markup.indexOf("Tue") < markup.indexOf("Wed"), true);
  assert.match(markup, /class="admin-date-pill"/);
  assert.match(markup, /class="admin-date-pill active-admin-date today-admin-date" aria-pressed="true"/);
  assert.match(markup, /class="admin-date-weekday-full">Tue/);
  assert.match(markup, /class="admin-date-weekday-short" aria-hidden="true">T/);
  assert.match(markup, /class="admin-date-day-number">25/);
  assert.match(markup, /class="admin-date-month-short"> Aug/);
  assert.match(markup, /class="admin-date-year">26/);
}

{
  const calls = [];
  const element = elementFor(AdminCalendarDateNavigation, {
    compactDateNavVisible: true,
    onDatePillClick: (...args) => calls.push(["date", ...args]),
    onGoToToday: () => calls.push(["today"]),
    onShiftWeek: (...args) => calls.push(["shift", ...args]),
  });
  const roots = childrenOf(element);
  assert.equal(roots[0].props.className, "admin-date-strip");
  assert.deepEqual(Object.keys(roots[0].props).includes("ref"), true);
  assert.equal(roots[1].props.className, "admin-compact-date-nav visible");

  const buttons = findAllByType(element, "button");
  buttons.find((button) => button.props["aria-label"] === "Previous week").props.onClick();
  buttons.find((button) => button.props["aria-label"] === "Next week").props.onClick();
  buttons.find((button) => button.props.children?.includes?.("Today")).props.onClick();
  buttons.find((button) => button.props.className === "admin-date-pill active-admin-date today-admin-date").props.onClick();

  assert.deepEqual(calls, [
    ["shift", -7],
    ["shift", 7],
    ["today"],
    ["date", 3, "2026-08-25"],
  ]);
}

{
  const hasExtractedComponent = existsSync(componentUrl);
  const source = hasExtractedComponent ? componentSource() : appSource();
  assert.match(source, /admin-date-strip/);
  assert.match(source, /admin-compact-date-nav/);
  if (hasExtractedComponent) {
    assert.doesNotMatch(source, /useState\(/);
    assert.doesNotMatch(source, /useEffect\(/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /supabase/i);
  }
}

{
  const items = baseDatePillItems();
  const summary = { bookings: 0, revenue: 0, travelMinutes: 0, workMinutes: 0 };
  const beforeItems = JSON.stringify(items);
  const beforeSummary = JSON.stringify(summary);
  const markup = markupFor(AdminCalendarDateNavigation, {
    compactDateNavVisible: true,
    datePillItems: items,
    isTodaySelected: false,
    weekSummary: summary,
  });
  assert.match(markup, /0 bookings/);
  assert.equal(JSON.stringify(items), beforeItems);
  assert.equal(JSON.stringify(summary), beforeSummary);
}

{
  const markup = markupFor(AdminCalendarDateNavigation, {
    datePillItems: [],
    isTodaySelected: false,
  });
  assert.match(markup, /class="admin-week-date-pills"><\/div>/);
  assert.match(markup, /Today/);
}

console.log("Admin calendar date navigation tests passed.");
