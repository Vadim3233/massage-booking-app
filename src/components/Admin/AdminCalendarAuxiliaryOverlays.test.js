import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./AdminCalendarAuxiliaryOverlays.jsx", import.meta.url);
const appUrl = new URL("../../App.jsx", import.meta.url);

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function Icon() {
  return h("svg", { "aria-hidden": "true" });
}

function fallbackAdminPersonalEventModal({
  model,
  open,
  onCancel,
  onChangeColor,
  onChangeEndDate,
  onChangeEndTime,
  onChangeStartDate,
  onChangeStartTime,
  onChangeTitle,
  onSubmit,
}) {
  if (!open || !model) return null;

  return h("div", { className: "admin-appointment-backdrop", role: "presentation" },
    h("section", { className: "admin-appointment-modal personal-event-modal", role: "dialog", "aria-modal": "true", "aria-label": "Add personal event" },
      h("header", { className: "admin-appointment-header" },
        h("button", { type: "button", "aria-label": "Close", onClick: onCancel }, "x"),
        h("h2", null, "Add personal event"),
        h("button", { type: "submit", form: "personal-event-form", className: "appointment-create-button" }, "Create"),
      ),
      h("form", { id: "personal-event-form", className: "personal-event-form", onSubmit },
        h("label", null,
          h("span", null, "Title"),
          h("input", { value: model.title, onChange: (event) => onChangeTitle(event.target.value), placeholder: "Personal event" }),
        ),
        h("label", null,
          h("span", null, "Colour"),
          h("div", { className: "personal-event-color-options" },
            model.colorOptions.map((color) => h("button", {
              type: "button",
              "aria-pressed": color.selected,
              className: color.className,
              key: color.id,
              onClick: () => onChangeColor(color.id),
            }, color.label)),
          ),
        ),
        h("div", { className: "personal-event-grid" },
          h("label", null,
            h("span", null, "From date"),
            h("input", { type: "date", value: model.startDate, onChange: (event) => onChangeStartDate(event.target.value) }),
          ),
          h("label", null,
            h("span", null, "From time"),
            h("input", { type: "time", value: model.startTime, onChange: (event) => onChangeStartTime(event.target.value) }),
          ),
          h("label", null,
            h("span", null, "Until date"),
            h("input", { type: "date", value: model.endDate, min: model.startDate, onChange: (event) => onChangeEndDate(event.target.value) }),
          ),
          h("label", null,
            h("span", null, "Until time"),
            h("input", { type: "time", value: model.endTime, onChange: (event) => onChangeEndTime(event.target.value) }),
          ),
        ),
        h("p", { className: "personal-event-help" }, "Personal events block availability in the calendar, but they do not appear as client bookings."),
        model.error && h("p", { className: "appointment-warning" }, model.error),
      ),
    ),
  );
}

function fallbackAdminDeleteConfirmationDialog({
  model,
  target,
  onCancel,
  onConfirm,
}) {
  if (!target || !model) return null;

  return h("div", { className: "appointment-leave-backdrop", role: "presentation" },
    h("section", { className: "appointment-leave-dialog", role: "alertdialog", "aria-modal": "true", "aria-label": "Confirm appointment deletion" },
      h("h3", null, model.title),
      h("p", null, model.message),
      h("div", null,
        h("button", { type: "button", className: "admin-danger-option", onClick: onConfirm }, model.confirmLabel),
        h("button", { type: "button", onClick: onCancel }, "Cancel"),
      ),
    ),
  );
}

function fallbackAdminDaySettingsSheet({
  model,
  open,
  scheduleModeDraft,
  workingHoursDraft,
  onChangeScheduleMode,
  onChangeWorkingHours,
  onClose,
  onSaveScheduleMode,
  onSaveWorkingHours,
  onToggleUnavailable,
  onUseWeeklySchedule,
}) {
  if (!open || !model) return null;

  return h("div", { className: "day-settings-sheet-backdrop", role: "presentation", onClick: onClose },
    h("section", {
      className: "day-settings-sheet",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": model.ariaLabel,
      onClick: (event) => event.stopPropagation(),
    },
      h("span", { className: "day-settings-sheet-handle", "aria-hidden": "true" }),
      h("header", { className: "day-settings-sheet-header" },
        h("span", { className: "day-settings-sheet-icon", "aria-hidden": "true" },
          model.type === "working-hours" ? h(Icon, { size: 28, strokeWidth: 2.1 }) : h(Icon, { size: 28, strokeWidth: 2.1 }),
        ),
        h("div", null,
          h("h2", null, model.title),
          h("p", null, model.dateLabel),
        ),
        h("button", { type: "button", className: "day-settings-sheet-close", "aria-label": "Close", onClick: onClose },
          h(Icon, { "aria-hidden": "true", size: 22, strokeWidth: 2.2 }),
        ),
      ),
      model.type === "working-hours"
        ? h("div", { className: "day-settings-sheet-body" },
            h("label", { className: "day-settings-toggle-card" },
              h("span", null, h("strong", null, "Use default working hours"), h("small", null, "Use your usual working hours")),
              h("input", {
                type: "checkbox",
                checked: workingHoursDraft.mode === "default" && !workingHoursDraft.markUnavailable,
                onChange: (event) => onChangeWorkingHours({ markUnavailable: false, mode: event.target.checked ? "default" : "custom" }),
              }),
            ),
            h("label", { className: "day-settings-toggle-card" },
              h("span", null, h("strong", null, "Custom working hours"), h("small", null, "Set custom hours for this day")),
              h("input", {
                type: "checkbox",
                checked: workingHoursDraft.mode === "custom" && !workingHoursDraft.markUnavailable,
                onChange: (event) => onChangeWorkingHours({ markUnavailable: false, mode: event.target.checked ? "custom" : "default" }),
              }),
            ),
            h("div", { className: workingHoursDraft.mode === "custom" || workingHoursDraft.markUnavailable ? "day-settings-time-grid" : "day-settings-time-grid disabled-day-settings-grid" },
              h("label", null,
                h("span", null, "Start time"),
                h("select", {
                  value: workingHoursDraft.startTime,
                  disabled: workingHoursDraft.mode !== "custom" && !workingHoursDraft.markUnavailable,
                  onChange: (event) => onChangeWorkingHours({ startTime: event.target.value }),
                }, model.timeOptions.map((time) => h("option", { value: time, key: `working-start-${time}` }, time))),
              ),
              h("label", null,
                h("span", null, "End time"),
                h("select", {
                  value: workingHoursDraft.endTime,
                  disabled: workingHoursDraft.mode !== "custom" && !workingHoursDraft.markUnavailable,
                  onChange: (event) => onChangeWorkingHours({ endTime: event.target.value }),
                }, model.timeOptions.map((time) => h("option", { value: time, key: `working-end-${time}` }, time))),
              ),
            ),
            h("label", { className: "day-settings-toggle-card" },
              h("span", null, h("strong", null, "Mark unavailable for this day"), h("small", null, "No appointments can be booked")),
              h("input", {
                type: "checkbox",
                checked: workingHoursDraft.markUnavailable,
                onChange: (event) => onToggleUnavailable(event.target.checked),
              }),
            ),
            model.error && h("p", { className: "day-settings-error", role: "alert" }, model.error),
            h("div", { className: "day-settings-sheet-actions" },
              h("button", { type: "button", onClick: onClose, disabled: model.saving }, "Cancel"),
              h("button", { type: "button", className: "admin-secondary-action", onClick: onUseWeeklySchedule, disabled: model.saving }, "Use weekly schedule"),
              h("button", { type: "button", className: "admin-primary-action", onClick: onSaveWorkingHours, disabled: model.saving }, model.saving ? "Saving..." : "Save for this date"),
            ),
          )
        : h("div", { className: "day-settings-sheet-body" },
            h("p", { className: "day-settings-helper" }, "Choose scheduling behaviour for this day"),
            h("label", { className: scheduleModeDraft.mode === "optimized" ? "day-settings-choice active-day-settings-choice" : "day-settings-choice" },
              h("input", {
                type: "radio",
                name: "day-schedule-mode",
                checked: scheduleModeDraft.mode === "optimized",
                onChange: () => onChangeScheduleMode({ mode: "optimized" }),
              }),
              h("span", null, h("strong", null, "Optimized chain mode ", h(Icon, { "aria-hidden": "true", size: 16, strokeWidth: 2.1 })), h("small", null, "Show only times that connect well with the rest of the day")),
            ),
            h("label", { className: scheduleModeDraft.mode === "flexible" ? "day-settings-choice active-day-settings-choice" : "day-settings-choice" },
              h("input", {
                type: "radio",
                name: "day-schedule-mode",
                checked: scheduleModeDraft.mode === "flexible",
                onChange: () => onChangeScheduleMode({ mode: "flexible" }),
              }),
              h("span", null, h("strong", null, "Flexible mode ", h(Icon, { "aria-hidden": "true", size: 16, strokeWidth: 2.1 })), h("small", null, "Allow any valid available time within working hours")),
            ),
            h("label", { className: "day-settings-toggle-card" },
              h("span", null, h("strong", null, "Anchor start time (optional)"), h("small", null, "Set the first preferred start time if the day is empty")),
              h("input", {
                type: "checkbox",
                checked: scheduleModeDraft.anchorEnabled,
                onChange: (event) => onChangeScheduleMode({ anchorEnabled: event.target.checked }),
              }),
            ),
            h("label", { className: "day-settings-inline-time" },
              h("span", null, "Anchor start"),
              h("select", {
                value: scheduleModeDraft.anchorStart,
                disabled: !scheduleModeDraft.anchorEnabled,
                onChange: (event) => onChangeScheduleMode({ anchorStart: event.target.value }),
              }, model.timeOptions.map((time) => h("option", { value: time, key: `anchor-start-${time}` }, time))),
            ),
            model.error && h("p", { className: "day-settings-error", role: "alert" }, model.error),
            h("div", { className: "day-settings-sheet-actions" },
              h("button", { type: "button", onClick: onClose, disabled: model.saving }, "Cancel"),
              h("button", { type: "button", className: "admin-secondary-action", onClick: onUseWeeklySchedule, disabled: model.saving }, "Use weekly schedule"),
              h("button", { type: "button", className: "admin-primary-action", onClick: onSaveScheduleMode, disabled: model.saving }, model.saving ? "Saving..." : "Save for this date"),
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
  assert.match(source, /\{personalEventOpen && \(\s*<div className="admin-appointment-backdrop" role="presentation">/);
  assert.match(source, /className="admin-appointment-modal personal-event-modal" role="dialog" aria-modal="true" aria-label="Add personal event"/);
  assert.match(source, /<form id="personal-event-form" className="personal-event-form" onSubmit=\{createPersonalEventFromModal\}>/);
  assert.match(source, /setPersonalEventStartDate\(nextDate\);\s*if \(personalEventEndDate < nextDate\) setPersonalEventEndDate\(nextDate\);/);
  assert.match(source, /\{pendingDeleteBooking && \(\s*<div className="appointment-leave-backdrop" role="presentation">/);
  assert.match(source, /aria-label="Confirm appointment deletion"/);
  assert.match(source, /setPendingDeleteBooking\(null\); setPendingDeleteScope\("single"\);/);
  assert.match(source, /\{daySettingsSheet && \(\s*<div className="day-settings-sheet-backdrop" role="presentation" onClick=\{closeDaySettingsSheet\}>/);
  assert.match(source, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(source, /Use default working hours/);
  assert.match(source, /Optimized chain mode/);
  assert.match(source, /Save for this date/);
}

async function loadComponents() {
  if (!existsSync(componentUrl)) {
    assertOriginalInlineShape();
    return {
      AdminDaySettingsSheet: fallbackAdminDaySettingsSheet,
      AdminDeleteConfirmationDialog: fallbackAdminDeleteConfirmationDialog,
      AdminPersonalEventModal: fallbackAdminPersonalEventModal,
    };
  }

  const source = readFileSync(componentUrl, "utf8");
  assert.doesNotMatch(source, /\buse(State|Effect|Ref|Memo|Callback)\b/);
  assert.doesNotMatch(source, /\bsupabase\b|\blocalStorage\b|\bfetch\b|\bsetTimeout\b|\bsetInterval\b|\basync\b/);
  const functionSource = [
    readBalancedFunction(source, "AdminPersonalEventModal").replace("export function AdminPersonalEventModal", "function AdminPersonalEventModal"),
    readBalancedFunction(source, "AdminDeleteConfirmationDialog").replace("export function AdminDeleteConfirmationDialog", "function AdminDeleteConfirmationDialog"),
    readBalancedFunction(source, "AdminDaySettingsSheet").replace("export function AdminDaySettingsSheet", "function AdminDaySettingsSheet"),
  ].join("\n\n");
  const transformed = await transformWithOxc(
    [functionSource, "globalThis.__AdminCalendarAuxiliaryOverlaysLoaded = { AdminDaySettingsSheet, AdminDeleteConfirmationDialog, AdminPersonalEventModal };"].join("\n\n"),
    "AdminCalendarAuxiliaryOverlays.jsx",
    { loader: "jsx" },
  );
  const require = createRequire(import.meta.url);
  new Function("require", "React", "Activity", "Clock3", "Link2", "X", transformed.code)(require, React, Icon, Icon, Icon, Icon);
  return globalThis.__AdminCalendarAuxiliaryOverlaysLoaded;
}

function children(element) {
  return React.Children.toArray(element.props.children);
}

function personalModel(overrides = {}) {
  return {
    colorOptions: [
      { id: "orange", label: "Orange", className: "personal-event-color-option personal-event-color-orange selected-personal-event-color", selected: true },
      { id: "blue", label: "Blue", className: "personal-event-color-option personal-event-color-blue", selected: false },
    ],
    endDate: "2026-09-02",
    endTime: "20:00",
    error: "",
    startDate: "2026-08-31",
    startTime: "15:00",
    title: "Personal event",
    ...overrides,
  };
}

function daySettingsModel(overrides = {}) {
  return {
    ariaLabel: "Working hours",
    dateLabel: "Monday 31 August",
    timeOptions: ["09:00", "10:00", "17:00"],
    title: "Working hours",
    type: "working-hours",
    ...overrides,
  };
}

const {
  AdminDaySettingsSheet,
  AdminDeleteConfirmationDialog,
  AdminPersonalEventModal,
} = await loadComponents();

assert.equal(renderToStaticMarkup(h(AdminPersonalEventModal, { open: false, model: personalModel() })), "");
assert.equal(renderToStaticMarkup(h(AdminDaySettingsSheet, { open: false, model: daySettingsModel() })), "");
assert.equal(renderToStaticMarkup(h(AdminDeleteConfirmationDialog, { target: null, model: null })), "");

{
  const calls = [];
  const model = personalModel({ error: "Choose valid start and end dates." });
  const snapshot = structuredClone(model);
  const element = h(AdminPersonalEventModal, {
    model,
    open: true,
    onCancel: () => calls.push(["cancel"]),
    onChangeColor: (id) => calls.push(["color", id]),
    onChangeEndDate: (value) => calls.push(["endDate", value]),
    onChangeEndTime: (value) => calls.push(["endTime", value]),
    onChangeStartDate: (value) => calls.push(["startDate", value]),
    onChangeStartTime: (value) => calls.push(["startTime", value]),
    onChangeTitle: (value) => calls.push(["title", value]),
    onSubmit: (event) => calls.push(["submit", event.type]),
  });
  const html = renderToStaticMarkup(element);
  assert.match(html, /admin-appointment-backdrop/);
  assert.match(html, /admin-appointment-modal personal-event-modal/);
  assert.match(html, /aria-label="Add personal event"/);
  assert.match(html, /form="personal-event-form"/);
  assert.match(html, />Add personal event</);
  assert.match(html, />Create</);
  assert.match(html, /placeholder="Personal event"/);
  assert.match(html, /Colour/);
  assert.match(html, /selected-personal-event-color/);
  assert.match(html, /From date/);
  assert.match(html, /Until date/);
  assert.match(html, /min="2026-08-31"/);
  assert.match(html, /Personal events block availability in the calendar/);
  assert.match(html, /Choose valid start and end dates\./);

  const output = AdminPersonalEventModal(element.props);
  const section = children(output)[0];
  const header = children(section)[0];
  const form = children(section)[1];
  children(header)[0].props.onClick();
  children(form)[0].props.children[1].props.onChange({ target: { value: "Admin time" } });
  children(children(form)[1].props.children[1])[1].props.onClick();
  const gridLabels = children(children(form)[2]);
  gridLabels[0].props.children[1].props.onChange({ target: { value: "2026-09-01" } });
  gridLabels[1].props.children[1].props.onChange({ target: { value: "14:00" } });
  gridLabels[2].props.children[1].props.onChange({ target: { value: "2026-09-03" } });
  gridLabels[3].props.children[1].props.onChange({ target: { value: "18:00" } });
  form.props.onSubmit({ type: "submit" });
  assert.deepEqual(calls, [
    ["cancel"],
    ["title", "Admin time"],
    ["color", "blue"],
    ["startDate", "2026-09-01"],
    ["startTime", "14:00"],
    ["endDate", "2026-09-03"],
    ["endTime", "18:00"],
    ["submit", "submit"],
  ]);
  assert.deepEqual(model, snapshot);
}

{
  const target = { id: "booking-1" };
  const model = {
    confirmLabel: "Delete",
    message: "Alex at 10:00 - 11:00 will be removed from the calendar.",
    title: "Delete this appointment?",
  };
  const calls = [];
  const element = h(AdminDeleteConfirmationDialog, {
    model,
    scope: "single",
    target,
    onCancel: () => calls.push(["cancel", target]),
    onChangeScope: (scope) => calls.push(["scope", scope]),
    onConfirm: () => calls.push(["confirm", target]),
  });
  const html = renderToStaticMarkup(element);
  assert.match(html, /appointment-leave-backdrop/);
  assert.match(html, /role="alertdialog"/);
  assert.match(html, /aria-label="Confirm appointment deletion"/);
  assert.match(html, /Delete this appointment\?/);
  assert.match(html, /Alex at 10:00 - 11:00 will be removed from the calendar\./);
  assert.match(html, /admin-danger-option/);
  const output = AdminDeleteConfirmationDialog(element.props);
  const section = children(output)[0];
  const buttons = children(children(section)[2]);
  assert.equal(buttons.map((button) => button.props.children).join("|"), "Delete|Cancel");
  buttons[0].props.onClick();
  buttons[1].props.onClick();
  assert.deepEqual(calls, [["confirm", target], ["cancel", target]]);
}

{
  const html = renderToStaticMarkup(h(AdminDeleteConfirmationDialog, {
    model: {
      confirmLabel: "Delete all days",
      message: "3 day(s) of Personal event will be removed from the calendar.",
      title: "Delete all days of this event?",
    },
    scope: "series",
    target: { id: "personal-1" },
    onCancel: () => {},
    onConfirm: () => {},
  }));
  assert.match(html, /Delete all days of this event\?/);
  assert.match(html, /3 day\(s\) of Personal event will be removed from the calendar\./);
  assert.match(html, />Delete all days</);
}

{
  const calls = [];
  const draft = { endTime: "17:00", markUnavailable: false, mode: "default", startTime: "09:00" };
  const model = daySettingsModel();
  const snapshot = structuredClone({ draft, model });
  const element = h(AdminDaySettingsSheet, {
    model,
    open: true,
    scheduleModeDraft: { anchorEnabled: false, anchorStart: "09:00", mode: "flexible" },
    workingHoursDraft: draft,
    onChangeScheduleMode: (patch) => calls.push(["schedule", patch]),
    onChangeWorkingHours: (patch) => calls.push(["working", patch]),
    onClose: () => calls.push(["close"]),
    onSaveScheduleMode: () => calls.push(["saveSchedule"]),
    onSaveWorkingHours: () => calls.push(["saveWorking"]),
    onToggleUnavailable: (checked) => calls.push(["unavailable", checked]),
    onUseWeeklySchedule: () => calls.push(["weekly"]),
  });
  const html = renderToStaticMarkup(element);
  assert.match(html, /day-settings-sheet-backdrop/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-label="Working hours"/);
  assert.match(html, /Monday 31 August/);
  assert.match(html, /Use default working hours/);
  assert.match(html, /Custom working hours/);
  assert.match(html, /disabled-day-settings-grid/);
  assert.match(html, /Mark unavailable for this day/);
  assert.match(html, />Cancel</);
  assert.match(html, />Use weekly schedule</);
  assert.match(html, />Save for this date</);
  const output = AdminDaySettingsSheet(element.props);
  output.props.onClick();
  const section = children(output)[0];
  section.props.onClick({ stopPropagation: () => calls.push(["stop"]) });
  const body = children(section)[2];
  const bodyChildren = children(body);
  bodyChildren[0].props.children[1].props.onChange({ target: { checked: false } });
  bodyChildren[1].props.children[1].props.onChange({ target: { checked: true } });
  const timeGridLabels = children(bodyChildren[2]);
  timeGridLabels[0].props.children[1].props.onChange({ target: { value: "10:00" } });
  timeGridLabels[1].props.children[1].props.onChange({ target: { value: "17:00" } });
  bodyChildren[3].props.children[1].props.onChange({ target: { checked: true } });
  const buttons = children(bodyChildren[4]);
  buttons[0].props.onClick();
  buttons[1].props.onClick();
  buttons[2].props.onClick();
  assert.deepEqual(calls, [
    ["close"],
    ["stop"],
    ["working", { markUnavailable: false, mode: "custom" }],
    ["working", { markUnavailable: false, mode: "custom" }],
    ["working", { startTime: "10:00" }],
    ["working", { endTime: "17:00" }],
    ["unavailable", true],
    ["close"],
    ["weekly"],
    ["saveWorking"],
  ]);
  assert.deepEqual({ draft, model }, snapshot);
}

{
  const calls = [];
  const draft = { anchorEnabled: true, anchorStart: "10:00", mode: "optimized" };
  const element = h(AdminDaySettingsSheet, {
    model: daySettingsModel({ ariaLabel: "Schedule mode", title: "Schedule mode", type: "schedule-mode" }),
    open: true,
    scheduleModeDraft: draft,
    workingHoursDraft: { endTime: "17:00", markUnavailable: false, mode: "default", startTime: "09:00" },
    onChangeScheduleMode: (patch) => calls.push(patch),
    onChangeWorkingHours: () => {},
    onClose: () => calls.push("close"),
    onSaveScheduleMode: () => calls.push("save"),
    onSaveWorkingHours: () => {},
    onToggleUnavailable: () => {},
    onUseWeeklySchedule: () => calls.push("weekly"),
  });
  const html = renderToStaticMarkup(element);
  assert.match(html, /aria-label="Schedule mode"/);
  assert.match(html, /Choose scheduling behaviour for this day/);
  assert.match(html, /Optimized chain mode/);
  assert.match(html, /Flexible mode/);
  assert.match(html, /active-day-settings-choice/);
  assert.match(html, /Anchor start time \(optional\)/);
  assert.match(html, /Anchor start/);
  const output = AdminDaySettingsSheet(element.props);
  const section = children(output)[0];
  const body = children(section)[2];
  const bodyChildren = children(body);
  bodyChildren[2].props.children[0].props.onChange();
  bodyChildren[3].props.children[1].props.onChange({ target: { checked: false } });
  bodyChildren[4].props.children[1].props.onChange({ target: { value: "09:00" } });
  const buttons = children(bodyChildren[5]);
  buttons[0].props.onClick();
  buttons[1].props.onClick();
  buttons[2].props.onClick();
  assert.deepEqual(calls, [
    { mode: "flexible" },
    { anchorEnabled: false },
    { anchorStart: "09:00" },
    "close",
    "weekly",
    "save",
  ]);
}

console.log("Admin calendar auxiliary overlays characterization tests passed.");
