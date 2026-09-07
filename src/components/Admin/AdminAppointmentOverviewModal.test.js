import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./AdminAppointmentOverviewModal.jsx", import.meta.url);
const appUrl = new URL("../../App.jsx", import.meta.url);

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function fallbackAdminAppointmentOverviewModal(props) {
  const {
    activeTab,
    booking,
    defaultPersonalEventColor,
    editing,
    model,
    moreOpen,
    personalEventColors,
    updatePending,
    visibleMessage,
    onApproveCashRequest,
    onChangeClientName,
    onChangeEventColor,
    onChangeLocation,
    onChangePaymentMethod,
    onChangePaymentStatus,
    onChangePersonalEndTime,
    onChangeStartTime,
    onChangeTravelBuffer,
    onClose,
    onDuplicate,
    onMarkPaymentReceived,
    onRejectCashRequest,
    onRequestDelete,
    onSetTab,
    onShare,
    onToggleEditing,
    onToggleMoreOpen,
  } = props;

  if (!booking || !model) return null;

  return h("div", { className: "admin-overview-backdrop", role: "presentation" },
    h("section", { className: "admin-overview-modal", role: "dialog", "aria-modal": "true" },
      h("div", { className: "admin-overview-heading" },
        h("div", null,
          h("p", null, "Booking overview"),
          h("h2", null, model.headingTitle),
        ),
        h("div", { className: "admin-overview-heading-actions" },
          h("button", { type: "button", onClick: onToggleEditing }, editing ? "Done" : "Edit"),
          h("div", { className: "admin-more-menu-shell" },
            h("button", { type: "button", onClick: onToggleMoreOpen }, "More"),
            moreOpen && h("div", { className: "admin-more-menu" },
              h("button", { type: "button", onClick: onShare }, "Share appointment details"),
              !model.isPersonalEvent && h("button", { type: "button", onClick: onDuplicate }, "Duplicate"),
              h("button", {
                type: "button",
                className: "admin-danger-option",
                onClick: () => onRequestDelete("single", true),
              }, model.isPersonalEvent ? "Delete this day" : "Delete"),
              model.showSeriesDelete && h("button", {
                type: "button",
                className: "admin-danger-option",
                onClick: () => onRequestDelete("series", true),
              }, "Delete all days"),
            ),
          ),
          h("button", { type: "button", onClick: onClose }, "Close"),
        ),
      ),
      h("div", { className: "admin-overview-tabs" },
        h("button", { type: "button", className: activeTab === "details" ? "active-overview-tab" : "", onClick: () => onSetTab("details") }, "Details"),
        h("button", { type: "button", className: activeTab === "history" ? "active-overview-tab" : "", onClick: () => onSetTab("history") }, "History"),
      ),
      activeTab === "details"
        ? model.isPersonalEvent
          ? h("div", { className: "admin-overview-content personal-event-overview-content" },
              h("div", null,
                h("span", null, "Title"),
                editing
                  ? h("input", { value: model.personal.titleInputValue, onChange: (event) => onChangeClientName(event.target.value) })
                  : h("strong", null, model.personal.titleLabel),
              ),
              h("div", null, h("span", null, "Date"), h("strong", null, model.personal.dateLabel)),
              h("div", null,
                h("span", null, "Start time"),
                editing
                  ? h("input", { type: "time", value: model.personal.startTimeInputValue, onChange: (event) => onChangeStartTime(event.target.value) })
                  : h("strong", null, model.personal.startTimeLabel),
              ),
              h("div", null,
                h("span", null, "End time"),
                editing
                  ? h("input", { type: "time", value: model.personal.endTimeInputValue, onChange: (event) => onChangePersonalEndTime(event.target.value) })
                  : h("strong", null, model.personal.endTimeLabel),
              ),
              h("div", null,
                h("span", null, "Colour"),
                editing
                  ? h("select", { value: model.personal.eventColorInputValue || defaultPersonalEventColor, onChange: (event) => onChangeEventColor(event.target.value) },
                      personalEventColors.map((color) => h("option", { value: color.id, key: color.id }, color.label)),
                    )
                  : h("strong", null, model.personal.colorLabel),
              ),
              h("div", null, h("span", null, "Event range"), h("strong", null, model.personal.seriesLabel)),
              h("div", { className: "overview-wide personal-event-actions" },
                h("span", null, "Actions"),
                h("div", null,
                  h("button", { type: "button", className: "admin-danger-option", onClick: () => onRequestDelete("single", false) }, "Delete this day"),
                  model.showSeriesDelete && h("button", { type: "button", className: "admin-danger-option", onClick: () => onRequestDelete("series", false) }, "Delete all days"),
                ),
              ),
              visibleMessage && h("p", { className: "overview-wide admin-action-message", role: "status" }, visibleMessage),
            )
          : h("div", { className: "admin-overview-content" },
              h("div", null,
                h("span", null, "Client"),
                editing
                  ? h("input", { value: model.normal.clientInputValue, onChange: (event) => onChangeClientName(event.target.value) })
                  : h("strong", null, model.normal.clientLabel),
              ),
              h("div", null,
                h("span", null, "Start time"),
                editing
                  ? h("input", { type: "time", value: model.normal.startTimeInputValue, onChange: (event) => onChangeStartTime(event.target.value) })
                  : h("strong", null, model.normal.timeRangeLabel),
              ),
              h("div", null,
                h("span", null, "Buffer"),
                editing
                  ? h("select", { value: model.normal.travelBufferInputValue, onChange: (event) => onChangeTravelBuffer(event.target.value) },
                      [15, 30, 45, 60, 90].map((minutes) => h("option", { value: minutes, key: minutes }, `${minutes} minutes`)),
                    )
                  : h("strong", null, model.normal.travelBufferLabel),
              ),
              h("div", null,
                h("span", null, "Location"),
                editing
                  ? h("input", { value: model.normal.locationInputValue, onChange: (event) => onChangeLocation(event.target.value) })
                  : h("strong", null, model.normal.locationLabel),
              ),
              h("div", null, h("span", null, "Contact"), h("strong", null, model.normal.contactLabel)),
              h("div", null,
                h("span", null, model.normal.paymentMethodFieldLabel),
                editing
                  ? h("input", { value: model.normal.paymentMethodInputValue, onChange: (event) => onChangePaymentMethod(event.target.value) })
                  : h("strong", null, model.normal.paymentMethodLabel),
              ),
              h("div", null,
                h("span", null, model.normal.paymentStatusFieldLabel),
                editing
                  ? h("select", { value: model.normal.paymentStatusInputValue, onChange: (event) => onChangePaymentStatus(event.target.value) },
                      h("option", { value: "awaiting_verification" }, "Awaiting verification"),
                      h("option", { value: "alternative_requested" }, "Alternative requested"),
                      h("option", { value: "cash_on_arrival" }, "Payment on arrival"),
                      h("option", { value: "paid" }, "Paid"),
                      h("option", { value: "cancelled" }, "Cancelled"),
                    )
                  : h("strong", null, model.normal.paymentStatusLabel),
              ),
              model.normal.detailRows.map((row) => h("div", { key: row.id }, h("span", null, row.label), h("strong", null, row.value))),
              model.normal.showCashApprovalActions && h("div", { className: "overview-wide payment-approval-actions" },
                h("span", null, "Payment on arrival request"),
                h("div", null,
                  h("button", { type: "button", onClick: onApproveCashRequest }, "Approve payment on arrival"),
                  h("button", { type: "button", className: "admin-danger-option", onClick: onRejectCashRequest }, "Reject payment on arrival"),
                ),
              ),
              h("div", null,
                h("button", {
                  type: "button",
                  onClick: onMarkPaymentReceived,
                  disabled: model.normal.markPaymentReceivedDisabled,
                }, model.normal.markPaymentReceivedLabel),
              ),
              visibleMessage && h("p", { className: "overview-wide admin-action-message", role: "status" }, visibleMessage),
              h("div", { className: "overview-wide" },
                h("span", null, "Services"),
                model.normal.serviceRows.map((item) => h("strong", { key: item.id }, item.label)),
              ),
            )
        : h("div", { className: "admin-overview-content" },
            h("div", { className: "overview-wide" },
              h("span", null, "History"),
              model.historyRows.map((row) => h("strong", { key: row.id }, row.label)),
            ),
          ),
    ),
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
  assert.match(source, /\{overviewBooking && \(\s*<div className="admin-overview-backdrop" role="presentation">/);
  assert.match(source, /<section className="admin-overview-modal" role="dialog" aria-modal="true">/);
  assert.match(source, /<p>Booking overview<\/p>/);
  assert.match(source, /setOverviewEditing\(\(current\) => !current\)/);
  assert.match(source, /setOverviewMoreOpen\(\(current\) => !current\)/);
  assert.match(source, /Share appointment details/);
  assert.match(source, /await onDuplicateBooking\(overviewBooking\.id\);/);
  assert.match(source, /setPendingDeleteBooking\(overviewBooking\);\s*setPendingDeleteScope\("single"\);\s*setOverviewMoreOpen\(false\);/);
  assert.match(source, /setPendingDeleteBooking\(overviewBooking\);\s*setPendingDeleteScope\("series"\);\s*setOverviewMoreOpen\(false\);/);
  assert.match(source, /updateOverviewBooking\(\{ paymentStatus: "cash_on_arrival", status: "confirmed" \}\)/);
  assert.match(source, /updateOverviewBooking\(\{ paymentStatus: "cancelled", status: "cancelled" \}\)/);
  assert.match(source, /updateOverviewBooking\(\{ paymentStatus: "paid", status: "confirmed" \}\)/);
  assert.match(source, /Booking created for \{formatRange\(overviewBooking\.start, overviewBooking\.sessionEnd\)\}\./);
}

async function loadComponent() {
  if (!existsSync(componentUrl)) {
    assertOriginalInlineShape();
    return fallbackAdminAppointmentOverviewModal;
  }

  const source = readFileSync(componentUrl, "utf8");
  assert.doesNotMatch(source, /\buse(State|Effect|Ref|Memo|Callback)\b/);
  assert.doesNotMatch(source, /\bsupabase\b|\blocalStorage\b|\bfetch\b|\bsetTimeout\b|\bsetInterval\b|\basync\b/);
  const functionSource = readBalancedFunction(source, "AdminAppointmentOverviewModal")
    .replace("export function AdminAppointmentOverviewModal", "function AdminAppointmentOverviewModal");
  const transformed = await transformWithOxc(
    [functionSource, "globalThis.__AdminAppointmentOverviewModalLoaded = AdminAppointmentOverviewModal;"].join("\n\n"),
    "AdminAppointmentOverviewModal.jsx",
    { loader: "jsx" },
  );
  const require = createRequire(import.meta.url);
  new Function("require", "React", transformed.code)(require, React);
  return globalThis.__AdminAppointmentOverviewModalLoaded;
}

function baseModel(overrides = {}) {
  return {
    headingTitle: "Alex Morgan",
    historyRows: [
      { id: "created", label: "Booking created for 10:00 - 11:30." },
      { id: "buffer", label: "Travel buffer reserved for 30 minutes." },
      { id: "services", label: "2 service line(s) included in this appointment." },
    ],
    isPersonalEvent: false,
    normal: {
      clientInputValue: "Alex Morgan",
      clientLabel: "Alex Morgan",
      contactLabel: "07123 000000",
      detailRows: [
        { id: "reference", label: "Reference", value: "BK-123" },
        { id: "reservation-expiry", label: "Reservation expiry", value: "31/08/2026, 12:00:00" },
        { id: "payment-received", label: "Payment received", value: "-" },
        { id: "base-price", label: "Base price", value: "£100.00" },
        { id: "congestion-fee", label: "Congestion fee", value: "£5.00" },
        { id: "travel-surcharge", label: "Travel surcharge", value: "£10.00" },
        { id: "total-due", label: "Total due", value: "£115.00" },
      ],
      locationInputValue: "10 Street",
      locationLabel: "10 Street",
      markPaymentReceivedDisabled: false,
      markPaymentReceivedLabel: "Mark Payment Received",
      paymentMethodInputValue: "bank_transfer",
      paymentMethodFieldLabel: "Payment method",
      paymentMethodLabel: "Bank transfer",
      paymentStatusInputValue: "awaiting_verification",
      paymentStatusFieldLabel: "Payment status",
      paymentStatusLabel: "Awaiting verification",
      serviceRows: [
        { id: "Massage-0", label: "Massage / 60 minutes" },
        { id: "Stretch-1", label: "Stretch / 30 minutes" },
      ],
      showCashApprovalActions: false,
      startTimeInputValue: "10:00",
      timeRangeLabel: "10:00 - 11:30",
      travelBufferInputValue: 30,
      travelBufferLabel: "30 minutes",
    },
    personal: {
      colorLabel: "Blue",
      dateLabel: "Monday 31 August",
      endTimeInputValue: "12:00",
      endTimeLabel: "12:00",
      eventColorInputValue: "blue",
      seriesLabel: "This day only",
      startTimeInputValue: "10:00",
      startTimeLabel: "10:00",
      titleInputValue: "Personal event",
      titleLabel: "Personal event",
    },
    showSeriesDelete: false,
    ...overrides,
  };
}

function baseProps(Component, overrides = {}) {
  return {
    Component,
    activeTab: "details",
    booking: { id: "booking-1" },
    defaultPersonalEventColor: "orange",
    editing: false,
    model: baseModel(),
    moreOpen: false,
    personalEventColors: [{ id: "orange", label: "Orange" }, { id: "blue", label: "Blue" }],
    updatePending: false,
    visibleMessage: "",
    onApproveCashRequest: () => {},
    onChangeClientName: () => {},
    onChangeEventColor: () => {},
    onChangeLocation: () => {},
    onChangePaymentMethod: () => {},
    onChangePaymentStatus: () => {},
    onChangePersonalEndTime: () => {},
    onChangeStartTime: () => {},
    onChangeTravelBuffer: () => {},
    onClose: () => {},
    onDuplicate: () => {},
    onMarkPaymentReceived: () => {},
    onRejectCashRequest: () => {},
    onRequestDelete: () => {},
    onSetTab: () => {},
    onShare: () => {},
    onToggleEditing: () => {},
    onToggleMoreOpen: () => {},
    ...overrides,
  };
}

function markupFor(Component, overrides = {}) {
  const { Component: _, ...props } = baseProps(Component, overrides);
  return renderToStaticMarkup(h(Component, props));
}

function elementFor(Component, overrides = {}) {
  const { Component: _, ...props } = baseProps(Component, overrides);
  return Component(props);
}

function children(element) {
  return React.Children.toArray(element.props.children);
}

const AdminAppointmentOverviewModal = await loadComponent();

assert.equal(markupFor(AdminAppointmentOverviewModal, { booking: null, model: null }), "");

{
  const html = markupFor(AdminAppointmentOverviewModal);
  assert.match(html, /admin-overview-backdrop/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /Booking overview/);
  assert.match(html, /Alex Morgan/);
  assert.match(html, />Edit</);
  assert.match(html, />More</);
  assert.match(html, />Close</);
  assert.match(html, /active-overview-tab/);
  assert.match(html, /Reference/);
  assert.match(html, /BK-123/);
  assert.match(html, /Contact/);
  assert.match(html, /07123 000000/);
  assert.match(html, /Massage \/ 60 minutes/);
  assert.match(html, /Stretch \/ 30 minutes/);
  assert.doesNotMatch(html, /class="admin-more-menu"/);
  assert.doesNotMatch(html, /admin-action-message/);
}

{
  const html = markupFor(AdminAppointmentOverviewModal, { editing: true });
  assert.match(html, />Done</);
  assert.match(html, /value="Alex Morgan"/);
  assert.match(html, /value="10:00"/);
  assert.match(html, /value="30"/);
  assert.match(html, /value="10 Street"/);
  assert.match(html, /value="bank_transfer"/);
  assert.match(html, /value="awaiting_verification"/);
  assert.match(html, /Awaiting verification/);
  assert.match(html, /Payment on arrival/);
}

{
  const calls = [];
  const element = elementFor(AdminAppointmentOverviewModal, {
    moreOpen: true,
    onDuplicate: () => calls.push(["duplicate"]),
    onRequestDelete: (...args) => calls.push(["delete", ...args]),
    onShare: () => calls.push(["share"]),
  });
  const section = children(element)[0];
  const heading = children(section)[0];
  const headingActions = children(heading)[1];
  const moreShell = children(headingActions)[1];
  const menu = children(moreShell)[1];
  const menuButtons = children(menu);
  assert.equal(menuButtons.map((button) => button.props.children).join("|"), "Share appointment details|Duplicate|Delete");
  menuButtons[0].props.onClick();
  menuButtons[1].props.onClick();
  menuButtons[2].props.onClick();
  assert.deepEqual(calls, [["share"], ["duplicate"], ["delete", "single", true]]);
}

{
  const calls = [];
  const personalModel = baseModel({
    headingTitle: "Personal event",
    isPersonalEvent: true,
    personal: {
      colorLabel: "Orange",
      dateLabel: "Monday 31 August",
      endTimeInputValue: "12:00",
      endTimeLabel: "All day",
      eventColorInputValue: "",
      seriesLabel: "3 days in this event",
      startTimeInputValue: "00:00",
      startTimeLabel: "00:00",
      titleInputValue: "Personal event",
      titleLabel: "Personal event",
    },
    showSeriesDelete: true,
  });
  const html = markupFor(AdminAppointmentOverviewModal, {
    editing: true,
    model: personalModel,
    moreOpen: true,
  });
  assert.match(html, /personal-event-overview-content/);
  assert.match(html, /Title/);
  assert.match(html, /End time/);
  assert.match(html, /value="12:00"/);
  assert.match(html, /Colour/);
  assert.match(html, /3 days in this event/);
  assert.match(html, /Delete this day/);
  assert.match(html, /Delete all days/);
  assert.doesNotMatch(html, />Duplicate</);

  const element = elementFor(AdminAppointmentOverviewModal, {
    model: personalModel,
    moreOpen: true,
    onRequestDelete: (...args) => calls.push(args),
  });
  const section = children(element)[0];
  const heading = children(section)[0];
  const menu = children(children(children(heading)[1])[1])[1];
  const menuButtons = children(menu);
  menuButtons[1].props.onClick();
  menuButtons[2].props.onClick();
  assert.deepEqual(calls, [["single", true], ["series", true]]);
}

{
  const calls = [];
  const element = elementFor(AdminAppointmentOverviewModal, {
    onSetTab: (tab) => calls.push(tab),
  });
  const section = children(element)[0];
  const tabs = children(section)[1];
  const tabButtons = children(tabs);
  assert.equal(tabButtons[0].props.className, "active-overview-tab");
  assert.equal(tabButtons[1].props.className, "");
  tabButtons[0].props.onClick();
  tabButtons[1].props.onClick();
  assert.deepEqual(calls, ["details", "history"]);
  const historyHtml = markupFor(AdminAppointmentOverviewModal, { activeTab: "history" });
  assert.match(historyHtml, /History/);
  assert.match(historyHtml, /Booking created for 10:00 - 11:30\./);
  assert.match(historyHtml, /Travel buffer reserved for 30 minutes\./);
  assert.match(historyHtml, /2 service line\(s\) included in this appointment\./);
}

{
  const calls = [];
  const model = baseModel({
    normal: {
      ...baseModel().normal,
      markPaymentReceivedLabel: "Saving...",
      showCashApprovalActions: true,
      markPaymentReceivedDisabled: false,
    },
  });
  const element = elementFor(AdminAppointmentOverviewModal, {
    model,
    updatePending: true,
    visibleMessage: "Payment marked received.",
    onApproveCashRequest: () => calls.push(["approve"]),
    onMarkPaymentReceived: () => calls.push(["paid"]),
    onRejectCashRequest: () => calls.push(["reject"]),
  });
  const html = renderToStaticMarkup(element);
  assert.match(html, /Payment on arrival request/);
  assert.match(html, /Approve payment on arrival/);
  assert.match(html, /Reject payment on arrival/);
  assert.match(html, /Saving\.\.\./);
  assert.match(html, /Payment marked received\./);
  assert.match(html, /role="status"/);
}

{
  const calls = [];
  const element = elementFor(AdminAppointmentOverviewModal, {
    editing: true,
    onChangeClientName: (value) => calls.push(["clientName", value]),
    onChangeStartTime: (value) => calls.push(["start", value]),
    onChangeTravelBuffer: (value) => calls.push(["buffer", value]),
    onChangeLocation: (value) => calls.push(["address", value]),
    onChangePaymentMethod: (value) => calls.push(["paymentMethod", value]),
    onChangePaymentStatus: (value) => calls.push(["paymentStatus", value]),
  });
  const section = children(element)[0];
  const details = children(section)[2];
  const fields = children(details);
  children(fields[0])[1].props.onChange({ target: { value: "New client" } });
  children(fields[1])[1].props.onChange({ target: { value: "11:15" } });
  children(fields[2])[1].props.onChange({ target: { value: "45" } });
  children(fields[3])[1].props.onChange({ target: { value: "New address" } });
  children(fields[5])[1].props.onChange({ target: { value: "cash" } });
  children(fields[6])[1].props.onChange({ target: { value: "paid" } });
  assert.deepEqual(calls, [
    ["clientName", "New client"],
    ["start", "11:15"],
    ["buffer", "45"],
    ["address", "New address"],
    ["paymentMethod", "cash"],
    ["paymentStatus", "paid"],
  ]);
}

{
  const model = baseModel();
  const booking = { id: "booking-identity" };
  const snapshot = structuredClone(model);
  renderToStaticMarkup(h(AdminAppointmentOverviewModal, {
    ...baseProps(AdminAppointmentOverviewModal),
    booking,
    model,
  }));
  assert.deepEqual(model, snapshot);
}

console.log("Admin appointment overview modal characterization tests passed.");
