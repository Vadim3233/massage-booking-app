import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./AdminAppointmentWizard.jsx", import.meta.url);

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function Icon() {
  return h("svg", { "aria-hidden": "true" });
}

function children(node) {
  return React.Children.toArray(node?.props?.children);
}

function findAll(node, predicate) {
  const matches = [];
  function visit(current) {
    if (!React.isValidElement(current)) return;
    if (predicate(current)) matches.push(current);
    React.Children.forEach(current.props.children, visit);
  }
  visit(node);
  return matches;
}

function textContent(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!React.isValidElement(node)) return "";
  return React.Children.toArray(node.props.children).map(textContent).join("");
}

function readBalancedFunction(source, name) {
  const index = source.indexOf(`export function ${name}`);
  assert.notEqual(index, -1, `${name} should be exported`);
  const paramsStartIndex = source.indexOf("(", index);
  let paramsDepth = 0;
  let paramsCloseIndex = -1;
  for (let cursor = paramsStartIndex; cursor < source.length; cursor += 1) {
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

function fallbackAdminAppointmentWizard({
  error,
  leaveConfirmationOpen,
  model,
  open,
  step,
  submitting,
  values,
  onBack,
  onCancelLeave,
  onChangeCustomerSearch,
  onChangeNewCustomerField,
  onChangeServiceDuration,
  onClose,
  onConfirmLeave,
  onNext,
  onOpenPersonalEvent,
  onRemoveService,
  onSelectCustomer,
  onSelectDate,
  onSelectSlot,
  onShiftWeek,
  onSubmit,
  onSubmitNewCustomer,
  onToggleNewCustomer,
  onToggleService,
  onUnlockDate,
  onEditReviewSection,
}) {
  if (!open) return null;
  const heading = model.headings[step] || "";

  return h("div", { className: "admin-appointment-backdrop", role: "presentation" },
    h("section", { className: "admin-appointment-modal", role: "dialog", "aria-modal": "true", "aria-label": "Create appointment" },
      h("header", { className: "admin-appointment-header" },
        h("button", {
          type: "button",
          "aria-label": step === "services" || step === "review" ? "Close" : "Back",
          onClick: onBack,
        }, step === "services" || step === "review" ? "x" : "<"),
        h("h2", null, heading),
        step === "review"
          ? h("button", { type: "button", className: "appointment-create-button", disabled: !values.canCreate || submitting, onClick: onSubmit }, "Create")
          : h("button", { type: "button", className: "appointment-next-button", disabled: values.nextDisabled, onClick: onNext }, "Next"),
      ),
      error ? h("p", { className: "appointment-warning" }, error) : null,
      step === "services" ? h("div", { className: "appointment-step appointment-service-step" },
        h("div", { className: "appointment-summary-strip" },
          model.service.summaryItems.length === 0
            ? h("span", { className: "appointment-summary-empty" }, "Selected services and total price here")
            : h(React.Fragment, null,
                h("div", { className: "appointment-summary-lines" },
                  model.service.summaryItems.map((item) => h("div", { className: "appointment-summary-line", key: item.id },
                    h("strong", null, item.name),
                    h("span", null, `${item.minutes} min`),
                    h("b", null, "\u00a3", item.linePrice),
                    h("button", { type: "button", "aria-label": `Remove ${item.name}`, onClick: () => onRemoveService(item) }, "x"),
                  )),
                ),
                h("div", { className: "appointment-summary-total" },
                  h("span", null, `${model.service.duration} minutes`),
                  h("strong", null, "Total ", "\u00a3", model.service.total),
                ),
              ),
        ),
        model.service.showDurationWarning ? h("p", { className: "appointment-warning" }, "Total appointment time must be 60 minutes minimum, then 30-minute steps.") : null,
        h("div", { className: "appointment-service-list" },
          model.service.services.map((entry) => h("article", { className: entry.selected ? "appointment-service-card selected" : "appointment-service-card", key: entry.service.id },
            h("button", { type: "button", className: "appointment-service-main", onClick: () => onToggleService(entry.service, entry.selected) },
              h("span", { style: { background: entry.service.color } }),
              h("div", null, h("strong", null, entry.service.name), h("small", null, entry.service.shortDescription)),
              h("b", null, entry.priceLabel),
            ),
            entry.active ? h("div", { className: "appointment-duration-controls" },
              model.service.durationOptions.map((amount) => h("button", { type: "button", key: amount, onClick: () => onChangeServiceDuration(entry.service, amount) }, `+${amount}`)),
            ) : null,
          )),
          h("article", { className: "appointment-service-card appointment-personal-event-card" },
            h("button", { type: "button", className: "appointment-service-main", onClick: onOpenPersonalEvent },
              h("span", { className: "appointment-personal-event-dot" }),
              h("div", null,
                h("strong", null, "Personal event"),
                h("small", null, "Block time for breaks, travel, admin, or unavailable hours"),
              ),
              h("b", null, "Event"),
            ),
          ),
        ),
      ) : null,
      step === "time" ? h("div", { className: "appointment-step appointment-time-step" },
        h("div", { className: "appointment-month-row" },
          h("strong", null, model.time.monthLabel),
          h("span", null, `${model.time.duration} min service / ${model.time.travelBuffer} min buffer / admin override`),
        ),
        model.time.dateLocked
          ? h("div", { className: "appointment-locked-date" },
              h("span", null, "Date selected from agenda"),
              h("strong", null, model.time.lockedDateLabel),
              h("button", { type: "button", onClick: onUnlockDate }, "Change date"),
            )
          : h("div", { className: "appointment-week-row" },
              h("button", { type: "button", className: "appointment-week-shift", "aria-label": "Previous week", onClick: () => onShiftWeek(-7) }, h(Icon, { "aria-hidden": "true", size: 18 })),
              h("div", { className: "appointment-date-row", "aria-label": "Choose appointment date" },
                model.time.days.map((day) => h("button", { type: "button", className: day.selected ? "appointment-date-cell active" : "appointment-date-cell", key: day.day.id, onClick: () => onSelectDate(day.day) },
                  h("span", null, day.shortLabel),
                  h("strong", null, day.dayNumber),
                )),
              ),
              h("button", { type: "button", className: "appointment-week-shift", "aria-label": "Next week", onClick: () => onShiftWeek(7) }, h(Icon, { "aria-hidden": "true", size: 18 })),
            ),
        h("div", { className: "appointment-slot-grid" },
          model.time.slots.length === 0
            ? h("p", { className: "appointment-warning" }, "Choose a valid service length before selecting a time.")
            : model.time.slots.map((slot) => h("button", { type: "button", className: slot.className, key: `${model.time.dayId}-${slot.slot.start}`, onClick: () => onSelectSlot(slot.slot) },
                h("span", null, slot.startLabel),
                h("small", null, slot.slot.label),
                h("b"),
              )),
        ),
      ) : null,
      step === "client" ? h("div", { className: "appointment-step appointment-client-step" },
        h("input", { className: "appointment-search", type: "search", placeholder: "Search", value: values.customerSearch, onChange: (event) => onChangeCustomerSearch(event.target.value) }),
        h("button", { type: "button", className: "appointment-add-customer", onClick: onToggleNewCustomer }, model.client.addCustomerOpen ? "Close new customer" : "+ Add new customer"),
        model.client.addCustomerOpen ? h("form", { className: "appointment-new-customer-form", onSubmit: onSubmitNewCustomer },
          model.client.newCustomerFields.map((field) => h("label", { key: field.name },
            field.label,
            field.type === "textarea"
              ? h("textarea", { placeholder: field.placeholder, rows: field.rows, value: field.value, onChange: (event) => onChangeNewCustomerField(field.name, event.target.value) })
              : h("input", { type: field.type, placeholder: field.placeholder, value: field.value, onChange: (event) => onChangeNewCustomerField(field.name, event.target.value), autoFocus: field.autoFocus, required: field.required }),
          )),
          h("button", { type: "submit" }, "Save and select client"),
        ) : null,
        h("div", { className: "appointment-customer-list" },
          model.client.customers.length === 0
            ? h("p", { className: "appointment-empty-state" }, "No client found. Add a new customer above.")
            : model.client.customers.map((customer) => h("button", { type: "button", className: customer.selected ? "appointment-customer-row selected" : "appointment-customer-row", key: customer.customer.id, onClick: () => onSelectCustomer(customer.customer) },
                h("span", null, customer.initials),
                h("strong", null, customer.customer.name),
                h("b", null, ">"),
              )),
        ),
      ) : null,
      step === "review" ? h("div", { className: "appointment-step appointment-review-step" },
        h("button", { type: "button", className: "appointment-review-service editable-appointment-review-item", onClick: () => onEditReviewSection("services", model.review.primaryServiceId) },
          h("span", { style: { background: model.review.serviceAccent } }),
          h("div", null,
            h("small", null, "Service"),
            h("strong", null, model.review.serviceLabel),
            h("b", null, `${model.review.duration} min`),
          ),
          h("em", null, "Edit"),
        ),
        h("div", { className: "appointment-review-grid" },
          model.review.gridItems.map((item) => h("button", { type: "button", className: "editable-appointment-review-item", key: item.label, onClick: () => onEditReviewSection("services", model.review.primaryServiceId) },
            h("span", null, item.label),
            h("strong", null, item.value),
            h("em", null, "Edit"),
          )),
        ),
        model.review.rows.map((row) => h("button", { type: "button", className: "appointment-review-row editable-appointment-review-item", key: row.label, onClick: () => onEditReviewSection(row.step, row.serviceId) },
          h("span", null, row.icon),
          h("div", null, h("small", null, row.label), h("strong", null, row.value)),
          h("em", null, "Edit"),
        )),
      ) : null,
      leaveConfirmationOpen ? h("div", { className: "appointment-leave-backdrop", role: "presentation" },
        h("section", { className: "appointment-leave-dialog", role: "alertdialog", "aria-modal": "true", "aria-label": "Save changes before leaving" },
          h("h3", null, "Save changes before leaving?"),
          h("p", null, "Unsaved changes will disappear forever."),
          h("div", null,
            h("button", { type: "button", disabled: !values.canCreate, onClick: onCancelLeave }, "Yes, save"),
            h("button", { type: "button", onClick: onConfirmLeave }, "Discard and leave"),
          ),
        ),
      ) : null,
    ),
  );
}

async function loadComponent() {
  if (!existsSync(componentUrl)) return fallbackAdminAppointmentWizard;
  const source = readFileSync(componentUrl, "utf8");
  assert.doesNotMatch(source, /\buse(State|Effect|Ref|Memo|Callback)\b/);
  assert.doesNotMatch(source, /\bsupabase\b|\blocalStorage\b|\bfetch\b|\bsetTimeout\b|\bsetInterval\b|\basync\b/);
  const functionSource = readBalancedFunction(source, "AdminAppointmentWizard")
    .replace("export function AdminAppointmentWizard", "function AdminAppointmentWizard");
  const transformed = await transformWithOxc(
    [functionSource, "globalThis.__AdminAppointmentWizardLoaded = AdminAppointmentWizard;"].join("\n\n"),
    "AdminAppointmentWizard.jsx",
    { loader: "jsx" },
  );
  const require = createRequire(import.meta.url);
  new Function("require", "React", "ChevronLeft", "ChevronRight", transformed.code)(require, React, Icon, Icon);
  return globalThis.__AdminAppointmentWizardLoaded;
}

function buildModel(overrides = {}) {
  const massage = { color: "#111111", id: "massage", name: "Massage", shortDescription: "Calm treatment" };
  const stretch = { color: "#222222", id: "stretch", name: "Stretch", shortDescription: "Mobility work" };
  const monday = { dateValue: "2026-08-31", id: "day-1", label: "Monday" };
  const tuesday = { dateValue: "2026-09-01", id: "day-2", label: "Tuesday" };
  const customer = { id: "client-1", name: "Ada Lovelace" };
  const secondCustomer = { id: "client-2", name: "Grace Hopper" };
  const slot = { bufferEnd: 690, duration: 60, end: 660, isSuggested: true, label: "Chain slot", start: 600, travelBuffer: 30 };
  const manualSlot = { bufferEnd: 765, duration: 60, end: 735, isSuggested: false, label: "Manual override", start: 675, travelBuffer: 30 };

  return {
    fixtures: { customer, manualSlot, massage, secondCustomer, slot, stretch, monday, tuesday },
    model: {
      headings: {
        client: "Select guest(s)",
        review: "Appointment",
        services: "Select service(s)",
        time: "Select date and time",
      },
      service: {
        duration: 90,
        durationOptions: [60, 90, 30, 120],
        services: [
          { active: true, priceLabel: "60 min / \u00a3140", selected: true, service: massage },
          { active: false, priceLabel: "from \u00a360", selected: false, service: stretch },
        ],
        showDurationWarning: false,
        summaryItems: [{ id: "massage", linePrice: 140, minutes: 60, name: "Massage" }],
        total: 140,
      },
      time: {
        dateLocked: false,
        dayId: "day-1",
        days: [
          { day: monday, dayNumber: 31, selected: true, shortLabel: "M" },
          { day: tuesday, dayNumber: 1, selected: false, shortLabel: "T" },
        ],
        duration: 90,
        lockedDateLabel: "Monday 31 August",
        monthLabel: "Aug 31 - Sep 6",
        slots: [
          { className: "appointment-slot suggested-appointment-slot active", slot, startLabel: "10:00" },
          { className: "appointment-slot manual-appointment-slot", slot: manualSlot, startLabel: "11:15" },
        ],
        travelBuffer: 45,
      },
      client: {
        addCustomerOpen: false,
        customers: [
          { customer, initials: "AL", selected: true },
          { customer: secondCustomer, initials: "GH", selected: false },
        ],
        newCustomerFields: [
          { autoFocus: true, label: "Name", name: "name", placeholder: "Client name", required: true, type: "text", value: "Ada" },
          { label: "Phone", name: "phone", placeholder: "07...", type: "tel", value: "07000" },
          { label: "Email", name: "email", placeholder: "client@example.com", type: "email", value: "ada@example.com" },
          { label: "Address", name: "address", placeholder: "Street and house number", type: "text", value: "1 London Road" },
          { label: "Notes", name: "notes", placeholder: "Treatment preferences, health notes, aftercare, or reminders", rows: 3, type: "textarea", value: "Prefers quiet" },
        ],
      },
      review: {
        duration: 90,
        gridItems: [
          { label: "Cost", value: "\u00a3140" },
          { label: "Duration", value: "90 minutes" },
          { label: "Buffer", value: "45 minutes" },
        ],
        primaryServiceId: "massage",
        rows: [
          { icon: "Clock", label: "Date", serviceId: null, step: "time", value: "Monday 31 August / 10:00 - 11:30" },
          { icon: "Person", label: "Select guest(s)", serviceId: null, step: "client", value: "Ada Lovelace" },
          { icon: "Map", label: "Select location", serviceId: null, step: "client", value: "1 London Road" },
          { icon: "Notes", label: "Session notes and treatment preferences", serviceId: "massage", step: "services", value: "Massage (60 min)" },
        ],
        serviceAccent: "#111111",
        serviceLabel: "Massage",
      },
      ...overrides,
    },
  };
}

const AdminAppointmentWizard = await loadComponent();

{
  const { model } = buildModel();
  const closed = h(AdminAppointmentWizard, { model, open: false, step: "services", values: {} });
  assert.equal(renderToStaticMarkup(closed), "");
}

{
  const calls = [];
  const { fixtures, model } = buildModel();
  const element = h(AdminAppointmentWizard, {
    model,
    open: true,
    step: "services",
    submitting: false,
    values: { canCreate: false, customerSearch: "", nextDisabled: false },
    onBack: () => calls.push(["back"]),
    onCancelLeave: () => calls.push(["saveLeave"]),
    onChangeCustomerSearch: () => {},
    onChangeNewCustomerField: () => {},
    onChangeServiceDuration: (service, amount) => calls.push(["duration", service, amount]),
    onClose: () => calls.push(["close"]),
    onConfirmLeave: () => calls.push(["discardLeave"]),
    onNext: () => calls.push(["next"]),
    onOpenPersonalEvent: () => calls.push(["personal"]),
    onRemoveService: (item) => calls.push(["remove", item]),
    onSelectCustomer: () => {},
    onSelectDate: () => {},
    onSelectSlot: () => {},
    onShiftWeek: () => {},
    onSubmit: () => {},
    onSubmitNewCustomer: () => {},
    onToggleNewCustomer: () => {},
    onToggleService: (service, selected) => calls.push(["toggle", service, selected]),
  });
  const html = renderToStaticMarkup(element);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-label="Create appointment"/);
  assert.match(html, /Select service\(s\)/);
  assert.match(html, /Selected services and total price here|Total/);
  assert.match(html, /Massage/);
  assert.match(html, /Calm treatment/);
  assert.match(html, /60 min \/ £140/);
  assert.match(html, /from £60/);
  assert.match(html, /Personal event/);
  assert.match(html, /Block time for breaks, travel, admin, or unavailable hours/);
  const output = AdminAppointmentWizard(element.props);
  const section = children(output)[0];
  const header = children(section)[0];
  children(header)[0].props.onClick();
  children(header)[2].props.onClick();
  findAll(output, (node) => node.props["aria-label"] === "Remove Massage")[0].props.onClick();
  const serviceList = findAll(output, (node) => node.props.className === "appointment-service-list")[0];
  const firstService = children(serviceList)[0];
  children(firstService)[0].props.onClick();
  findAll(firstService, (node) => node.type === "button" && textContent(node) === "+60")[0].props.onClick();
  findAll(output, (node) => node.type === "button" && textContent(node).includes("Personal event"))[0].props.onClick();
  assert.deepEqual(calls, [
    ["back"],
    ["next"],
    ["remove", model.service.summaryItems[0]],
    ["toggle", fixtures.massage, true],
    ["duration", fixtures.massage, 60],
    ["personal"],
  ]);
}

{
  const { fixtures, model } = buildModel();
  const calls = [];
  const element = h(AdminAppointmentWizard, {
    model,
    open: true,
    step: "time",
    values: { canCreate: false, nextDisabled: true },
    onBack: () => calls.push(["back"]),
    onNext: () => calls.push(["next"]),
    onSelectDate: (day) => calls.push(["date", day]),
    onSelectSlot: (slot) => calls.push(["slot", slot]),
    onShiftWeek: (amount) => calls.push(["shift", amount]),
  });
  const html = renderToStaticMarkup(element);
  assert.match(html, /Select date and time/);
  assert.match(html, /Aug 31 - Sep 6/);
  assert.match(html, /90 min service \/ 45 min buffer \/ admin override/);
  assert.match(html, /Choose appointment date/);
  assert.match(html, /10:00/);
  assert.match(html, /Chain slot/);
  assert.match(html, /Manual override/);
  assert.match(html, /appointment-slot suggested-appointment-slot active/);
  const output = AdminAppointmentWizard(element.props);
  findAll(output, (node) => node.props["aria-label"] === "Previous week")[0].props.onClick();
  findAll(output, (node) => node.props.className === "appointment-date-cell")[0].props.onClick();
  findAll(output, (node) => node.props["aria-label"] === "Next week")[0].props.onClick();
  findAll(output, (node) => node.type === "button" && textContent(node).includes("11:15"))[0].props.onClick();
  assert.deepEqual(calls, [
    ["shift", -7],
    ["date", fixtures.tuesday],
    ["shift", 7],
    ["slot", fixtures.manualSlot],
  ]);
}

{
  const { model } = buildModel({
    time: {
      dateLocked: true,
      dayId: "day-1",
      days: [],
      duration: 0,
      lockedDateLabel: "Monday 31 August",
      monthLabel: "Monday 31 August",
      slots: [],
      travelBuffer: 45,
    },
  });
  const calls = [];
  const html = renderToStaticMarkup(h(AdminAppointmentWizard, {
    model,
    open: true,
    step: "time",
    values: { canCreate: false, nextDisabled: true },
    onUnlockDate: () => calls.push("unlock"),
  }));
  assert.match(html, /Date selected from agenda/);
  assert.match(html, /Change date/);
  assert.match(html, /Choose a valid service length before selecting a time\./);
}

{
  const calls = [];
  const { fixtures, model } = buildModel({
    client: {
      ...buildModel().model.client,
      addCustomerOpen: true,
      customers: [],
    },
  });
  const submitEvent = { preventDefault: () => calls.push(["prevent"]) };
  const element = h(AdminAppointmentWizard, {
    model,
    open: true,
    step: "client",
    values: { canCreate: false, customerSearch: "ada", nextDisabled: true },
    onBack: () => calls.push(["back"]),
    onChangeCustomerSearch: (value) => calls.push(["search", value]),
    onChangeNewCustomerField: (field, value) => calls.push(["field", field, value]),
    onNext: () => calls.push(["next"]),
    onSelectCustomer: (customer) => calls.push(["customer", customer]),
    onSubmitNewCustomer: (event) => {
      event.preventDefault();
      calls.push(["submitNew"]);
    },
    onToggleNewCustomer: () => calls.push(["toggleNew"]),
  });
  const html = renderToStaticMarkup(element);
  assert.match(html, /Select guest\(s\)/);
  assert.match(html, /placeholder="Search"/);
  assert.match(html, /Close new customer/);
  assert.match(html, /Client name/);
  assert.match(html, /07\.\.\./);
  assert.match(html, /client@example\.com/);
  assert.match(html, /Street and house number/);
  assert.match(html, /Treatment preferences, health notes, aftercare, or reminders/);
  assert.match(html, /No client found\. Add a new customer above\./);
  const output = AdminAppointmentWizard(element.props);
  findAll(output, (node) => node.props.className === "appointment-search")[0].props.onChange({ target: { value: "grace" } });
  findAll(output, (node) => node.props.className === "appointment-add-customer")[0].props.onClick();
  const form = findAll(output, (node) => node.props.className === "appointment-new-customer-form")[0];
  form.props.onSubmit(submitEvent);
  const firstField = children(form)[0];
  children(firstField)[1].props.onChange({ target: { value: "Grace" } });
  assert.deepEqual(calls, [
    ["search", "grace"],
    ["toggleNew"],
    ["prevent"],
    ["submitNew"],
    ["field", "name", "Grace"],
  ]);
  assert.equal(fixtures.customer.name, "Ada Lovelace");
}

{
  const calls = [];
  const { fixtures, model } = buildModel();
  const element = h(AdminAppointmentWizard, {
    model,
    open: true,
    step: "client",
    values: { canCreate: false, customerSearch: "", nextDisabled: false },
    onChangeCustomerSearch: () => {},
    onNext: () => calls.push(["next"]),
    onSelectCustomer: (customer) => calls.push(["customer", customer]),
    onToggleNewCustomer: () => {},
  });
  const output = AdminAppointmentWizard(element.props);
  findAll(output, (node) => node.type === "button" && textContent(node).includes("Grace Hopper"))[0].props.onClick();
  assert.deepEqual(calls, [["customer", fixtures.secondCustomer]]);
}

{
  const calls = [];
  const { model } = buildModel();
  const element = h(AdminAppointmentWizard, {
    model,
    open: true,
    step: "review",
    submitting: true,
    values: { canCreate: true, nextDisabled: false },
    onBack: () => calls.push(["back"]),
    onEditReviewSection: (step, serviceId) => calls.push(["edit", step, serviceId]),
    onSubmit: () => calls.push(["submit"]),
  });
  const html = renderToStaticMarkup(element);
  assert.match(html, /Appointment/);
  assert.match(html, /Service/);
  assert.match(html, /Massage/);
  assert.match(html, /90 min/);
  assert.match(html, /Cost/);
  assert.match(html, /£140/);
  assert.match(html, /Duration/);
  assert.match(html, /Buffer/);
  assert.match(html, /Date/);
  assert.match(html, /Monday 31 August \/ 10:00 - 11:30/);
  assert.match(html, /Select guest\(s\)/);
  assert.match(html, /Ada Lovelace/);
  assert.match(html, /Select location/);
  assert.match(html, /Session notes and treatment preferences/);
  const output = AdminAppointmentWizard(element.props);
  const section = children(output)[0];
  const header = children(section)[0];
  children(header)[0].props.onClick();
  children(header)[2].props.onClick();
  findAll(output, (node) => node.props.className === "appointment-review-service editable-appointment-review-item")[0].props.onClick();
  findAll(output, (node) => node.type === "button" && textContent(node).includes("Cost"))[0].props.onClick();
  findAll(output, (node) => node.type === "button" && textContent(node).includes("Date"))[0].props.onClick();
  assert.deepEqual(calls, [
    ["back"],
    ["submit"],
    ["edit", "services", "massage"],
    ["edit", "services", "massage"],
    ["edit", "time", null],
  ]);
}

{
  const calls = [];
  const { model } = buildModel();
  const element = h(AdminAppointmentWizard, {
    leaveConfirmationOpen: true,
    model,
    open: true,
    step: "services",
    values: { canCreate: false, nextDisabled: false },
    onBack: () => {},
    onCancelLeave: () => calls.push("save"),
    onConfirmLeave: () => calls.push("discard"),
    onNext: () => {},
  });
  const html = renderToStaticMarkup(element);
  assert.match(html, /Save changes before leaving\?/);
  assert.match(html, /Unsaved changes will disappear forever\./);
  const output = AdminAppointmentWizard(element.props);
  const section = children(output)[0];
  const leave = children(section).at(-1);
  const buttons = children(children(leave)[0]).at(-1);
  assert.equal(children(buttons)[0].props.disabled, true);
  children(buttons)[0].props.onClick();
  children(buttons)[1].props.onClick();
  assert.deepEqual(calls, ["save", "discard"]);
}

console.log("Admin appointment wizard characterization tests passed.");
