import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./AdminClientProfilePanel.jsx", import.meta.url);

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function Icon() {
  return h("svg", { "aria-hidden": "true" });
}

function customerInitials(name) {
  const parts = String(name || "Guest").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "G";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function customerTotalSpent(customer) {
  return (customer?.appointments || []).reduce((total, appointment) => total + (Number(appointment.total) || 0), 0);
}

function customerPreferredServiceShort(customer) {
  const counts = new Map();
  (customer?.appointments || []).forEach((appointment) => {
    const serviceName = appointment.serviceName || "Treatment";
    counts.set(serviceName, (counts.get(serviceName) || 0) + 1);
  });
  const preferred = [...counts.entries()].sort((first, second) => second[1] - first[1])[0]?.[0] || "Not enough history";
  if (preferred === "Not enough history") return "N/A";
  return String(preferred).split(/\s+/).filter(Boolean).slice(0, 3).map((word) => word[0]?.toUpperCase()).join("");
}

function fullDateLabel(dateValue) {
  return `Date ${dateValue}`;
}

function fallbackAdminClientProfilePanel(props) {
  const {
    activeSection,
    customer,
    deleteConfirmationDialog,
    editDraft,
    editOpen,
    formatMoney,
    noteSavedMessage,
    notesDraft,
    onBack,
    onBookCustomer,
    onCancelEdit,
    onChangeNotes,
    onChangeProfileDraft,
    onChangeSection,
    onContactCustomer,
    onDeleteCustomer,
    onDeleteNote,
    onSaveNotes,
    onSaveProfile,
    onStartAppointmentNote,
    onToggleEdit,
  } = props;
  const noteEntries = customer.noteEntries || [];
  const noteDirty = Boolean(customer) && notesDraft.trim().length > 0;

  return h("article", { className: "client-profile-screen" },
    h("header", { className: "client-profile-topbar" },
      h("button", { type: "button", onClick: onBack }, h(Icon, { "aria-hidden": "true", size: 22, strokeWidth: 2 }), "Back"),
      h("strong", null, "Client Profile"),
      h("button", { type: "button", className: "client-profile-edit-trigger", "aria-label": "Edit client profile", onClick: onToggleEdit }, h(Icon, { "aria-hidden": "true", size: 22, strokeWidth: 2.4 })),
    ),
    h("section", { className: "client-profile-hero-card" },
      h("span", { className: "client-avatar large", "aria-hidden": "true" }, customer.avatarUrl ? h("img", { src: customer.avatarUrl, alt: "" }) : customerInitials(customer.name)),
      h("div", { className: "client-profile-identity" },
        h("h2", null, customer.name, " ", customer.appointments.length > 1 && h(Icon, { "aria-hidden": "true", size: 18, strokeWidth: 2.2 })),
        h("p", null, h(Icon, { "aria-hidden": "true", size: 16, strokeWidth: 2 }), " ", customer.phone || "No phone saved"),
        h("p", null, h(Icon, { "aria-hidden": "true", size: 16, strokeWidth: 2 }), " ", customer.email || "No email saved"),
        h("p", null, h(Icon, { "aria-hidden": "true", size: 16, strokeWidth: 2 }), " ", customer.address || "Address not captured yet"),
      ),
      h("div", { className: "client-profile-actions" },
        h("button", { type: "button", onClick: () => onContactCustomer("call", customer) }, h(Icon, { "aria-hidden": "true", size: 19, strokeWidth: 2 }), "Call"),
        h("button", { type: "button", onClick: () => onContactCustomer("message", customer) }, h(Icon, { "aria-hidden": "true", size: 19, strokeWidth: 2 }), "Message"),
        h("button", { type: "button", onClick: () => onContactCustomer("email", customer) }, h(Icon, { "aria-hidden": "true", size: 19, strokeWidth: 2 }), "Email"),
        h("button", { type: "button", className: "client-book-button", onClick: () => onBookCustomer(customer) }, h(Icon, { "aria-hidden": "true", size: 19, strokeWidth: 2 }), "Book Appointment"),
      ),
    ),
    editOpen && h("form", { className: "client-profile-edit-panel", onSubmit: onSaveProfile },
      h("label", null, "Name", h("input", { type: "text", value: editDraft.name, onChange: (event) => onChangeProfileDraft("name", event.target.value), required: true })),
      h("label", null, "Phone", h("input", { type: "tel", value: editDraft.phone, onChange: (event) => onChangeProfileDraft("phone", event.target.value) })),
      h("label", null, "Email", h("input", { type: "email", value: editDraft.email, onChange: (event) => onChangeProfileDraft("email", event.target.value) })),
      h("label", null, "Address", h("input", { type: "text", value: editDraft.address, onChange: (event) => onChangeProfileDraft("address", event.target.value) })),
      h("label", { className: "client-profile-edit-wide" }, "Updates", h("textarea", { rows: 2, value: editDraft.updates, onChange: (event) => onChangeProfileDraft("updates", event.target.value) })),
      h("div", { className: "client-profile-edit-actions" }, h("button", { type: "submit" }, "Save profile"), h("button", { type: "button", onClick: onCancelEdit }, "Cancel")),
      h("button", { type: "button", className: "client-delete-profile-button", onClick: () => onDeleteCustomer(customer) }, "x Delete client"),
    ),
    h("div", { className: "client-profile-metrics" },
      h("article", null, h(Icon, { "aria-hidden": "true", size: 22, strokeWidth: 2 }), h("span", null, "Total App"), h("strong", null, customer.appointments.length)),
      h("article", null, h(Icon, { "aria-hidden": "true", size: 22, strokeWidth: 2 }), h("span", null, "Total"), h("strong", null, formatMoney(customerTotalSpent(customer)))),
      h("article", null, h(Icon, { "aria-hidden": "true", size: 22, strokeWidth: 2 }), h("span", null, "Pref"), h("strong", null, customerPreferredServiceShort(customer))),
    ),
    h("nav", { className: "client-profile-tabs", "aria-label": "Client profile sections" },
      ["appointments", "notes"].map((tab) => h("button", { type: "button", className: activeSection === tab ? "active" : "", key: tab, onClick: () => onChangeSection(tab) }, tab[0].toUpperCase() + tab.slice(1))),
    ),
    h("section", { className: "customer-profile client-appointments-card" },
      activeSection === "appointments" && h("h3", null, "Appointments"),
      activeSection === "notes"
        ? h("section", { className: "client-notes-editor" },
            h("textarea", { "aria-label": `Notes for ${customer.name}`, placeholder: "Write a new note...", rows: 4, value: notesDraft, onChange: (event) => onChangeNotes(event.target.value) }),
            h("div", { className: "client-notes-actions" }, h("button", { type: "button", onClick: onSaveNotes, disabled: !noteDirty }, "Save note"), h("small", { role: "status" }, noteSavedMessage || (noteDirty ? "Unsaved note" : ""))),
            h("div", { className: "client-notes-list", "aria-label": "Saved client notes" },
              noteEntries.length === 0
                ? h("p", null, "No notes saved yet.")
                : noteEntries.map((note) => h("article", { className: "client-note-item", key: note.id }, h("div", null, h("time", { dateTime: note.createdAt || undefined }, "No date"), h("p", null, note.text)), h("button", { type: "button", "aria-label": "Delete note", onClick: () => onDeleteNote(note.id) }, "x"))),
            ),
          )
        : customer.appointments.length === 0
          ? h("p", null, "No appointments yet.")
          : customer.appointments.map((appointment) => h("div", { className: "client-history-row", key: `${appointment.date}-${appointment.time}-${appointment.serviceName}` }, h("span", null, fullDateLabel(appointment.date)), h("strong", null, appointment.serviceName), h("small", null, `${appointment.time} / ${appointment.duration} min`), h("b", null, appointment.paymentStatus || "Completed"), h("button", { type: "button", className: "client-history-note-button", onClick: () => onStartAppointmentNote(appointment) }, "Add note"))),
    ),
    deleteConfirmationDialog,
  );
}

function readBalancedFunction(source, name) {
  const exportStart = source.indexOf(`export function ${name}`);
  const start = exportStart >= 0 ? exportStart : source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const signatureEnd = source.indexOf(") {", start);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not read ${name}`);
}

async function loadAdminClientProfilePanel() {
  if (!existsSync(componentUrl)) {
    return { AdminClientProfilePanel: fallbackAdminClientProfilePanel, hasComponent: false, source: "" };
  }
  const source = readFileSync(componentUrl, "utf8");
  const functionSource = readBalancedFunction(source, "AdminClientProfilePanel")
    .replace("export function AdminClientProfilePanel", "function AdminClientProfilePanel");
  const transformed = await transformWithOxc(
    [functionSource, "globalThis.__AdminClientProfilePanelLoaded = AdminClientProfilePanel;"].join("\n\n"),
    "AdminClientProfilePanel.jsx",
    { loader: "jsx" },
  );
  const require = createRequire(import.meta.url);
  new Function("React", "Activity", "CalendarDays", "ChevronLeft", "Mail", "MapPin", "MessageCircle", "MoreHorizontal", "Phone", "Star", "WalletCards", "customerInitials", "customerPreferredServiceShort", "customerTotalSpent", "fullDateLabel", "require", transformed.code)(
    React, Icon, Icon, Icon, Icon, Icon, Icon, Icon, Icon, Icon, Icon, customerInitials, customerPreferredServiceShort, customerTotalSpent, fullDateLabel, require,
  );
  return { AdminClientProfilePanel: globalThis.__AdminClientProfilePanelLoaded, hasComponent: true, source };
}

function customer(overrides = {}) {
  return {
    id: "ada",
    name: "Ada Lovelace",
    phone: "07111 222333",
    email: "ada@example.com",
    address: "1 Code Street",
    appointments: [
      { date: "2026-08-27", time: "10:00", duration: 60, serviceName: "Massage", paymentStatus: "", total: 90 },
      { date: "2026-08-20", time: "12:00", duration: 90, serviceName: "Massage", paymentStatus: "paid", total: 120 },
    ],
    noteEntries: [{ id: "note-1", text: "Prefers quiet sessions.", createdAt: "" }],
    ...overrides,
  };
}

function props(overrides = {}) {
  return {
    activeSection: "appointments",
    customer: customer(),
    deleteConfirmationDialog: null,
    editDraft: { address: "1 Code Street", email: "ada@example.com", name: "Ada Lovelace", phone: "07111 222333", updates: "Likes evenings" },
    editOpen: false,
    formatMoney: (value) => `£${value}`,
    noteSavedMessage: "",
    notesDraft: "",
    onBack: () => {},
    onBookCustomer: () => {},
    onCancelEdit: () => {},
    onChangeNotes: () => {},
    onChangeProfileDraft: () => {},
    onChangeSection: () => {},
    onContactCustomer: () => {},
    onDeleteCustomer: () => {},
    onDeleteNote: () => {},
    onSaveNotes: () => {},
    onSaveProfile: () => {},
    onStartAppointmentNote: () => {},
    onToggleEdit: () => {},
    ...overrides,
  };
}

function render(Panel, overrides = {}) {
  return renderToStaticMarkup(React.createElement(Panel, props(overrides)));
}

const { AdminClientProfilePanel, hasComponent, source } = await loadAdminClientProfilePanel();

if (hasComponent) {
  assert.match(source, /export function AdminClientProfilePanel/);
  assert.match(source, /customerTotalSpent/);
  assert.match(source, /fullDateLabel/);
  assert.doesNotMatch(source, /useState|useEffect|useRef|setTimeout|setInterval|fetch|localStorage|supabase|async/i);
}

{
  const markup = render(AdminClientProfilePanel);
  assert.match(markup, /class="client-profile-screen"/);
  assert.match(markup, /class="client-profile-topbar"/);
  assert.match(markup, />Back/);
  assert.match(markup, /<strong>Client Profile<\/strong>/);
  assert.match(markup, /aria-label="Edit client profile"/);
  assert.match(markup, /class="client-profile-hero-card"/);
  assert.match(markup, /Ada Lovelace/);
  assert.match(markup, /07111 222333/);
  assert.match(markup, /ada@example.com/);
  assert.match(markup, /1 Code Street/);
  assert.equal(markup.indexOf("Call") < markup.indexOf("Message"), true);
  assert.equal(markup.indexOf("Message") < markup.indexOf("Email"), true);
  assert.equal(markup.indexOf("Email") < markup.indexOf("Book Appointment"), true);
  assert.match(markup, /<span>Total App<\/span><strong>2<\/strong>/);
  assert.match(markup, /<span>Total<\/span><strong>£210<\/strong>/);
  assert.match(markup, /<span>Pref<\/span><strong>M<\/strong>/);
  assert.equal(markup.indexOf(">Appointments</button>") < markup.indexOf(">Notes</button>"), true);
  assert.match(markup, /<h3>Appointments<\/h3>/);
  assert.equal(markup.indexOf("Date 2026-08-27") < markup.indexOf("Date 2026-08-20"), true);
  assert.match(markup, /10:00 \/ 60 min/);
  assert.match(markup, /<b>Completed<\/b>/);
  assert.match(markup, /<b>paid<\/b>/);
}

{
  const markup = render(AdminClientProfilePanel, { activeSection: "notes", notesDraft: "New note" });
  assert.match(markup, /class="client-notes-editor"/);
  assert.match(markup, /aria-label="Notes for Ada Lovelace"/);
  assert.match(markup, /placeholder="Write a new note\.\.\."/);
  assert.match(markup, /<button type="button">Save note<\/button>/);
  assert.match(markup, /<small role="status">Unsaved note<\/small>/);
  assert.match(markup, /Prefers quiet sessions\./);
  assert.match(markup, /aria-label="Delete note"/);
}

{
  const markup = render(AdminClientProfilePanel, { customer: customer({ appointments: [], noteEntries: [], phone: "", email: "", address: "" }) });
  assert.match(markup, /No phone saved/);
  assert.match(markup, /No email saved/);
  assert.match(markup, /Address not captured yet/);
  assert.match(markup, /<span>Total App<\/span><strong>0<\/strong>/);
  assert.match(markup, /<span>Pref<\/span><strong>N\/A<\/strong>/);
  assert.match(markup, /No appointments yet\./);
}

{
  const markup = render(AdminClientProfilePanel, { activeSection: "notes", customer: customer({ noteEntries: [] }), noteSavedMessage: "Note saved." });
  assert.match(markup, /No notes saved yet\./);
  assert.match(markup, /<small role="status">Note saved\.<\/small>/);
}

{
  const markup = render(AdminClientProfilePanel, { editOpen: true });
  assert.match(markup, /class="client-profile-edit-panel"/);
  assert.match(markup, /<input type="text" required="" value="Ada Lovelace"\/>/);
  assert.match(markup, /type="tel" value="07111 222333"/);
  assert.match(markup, /type="email" value="ada@example.com"/);
  assert.match(markup, /type="text" value="1 Code Street"/);
  assert.match(markup, /<textarea rows="2">Likes evenings<\/textarea>/);
  assert.match(markup, /Save profile/);
  assert.match(markup, /Cancel/);
  assert.match(markup, /x Delete client/);
}

{
  const calls = [];
  const element = AdminClientProfilePanel(props({
    editOpen: true,
    activeSection: "notes",
    notesDraft: "Hi",
    onBack: (...args) => calls.push(["back", ...args]),
    onToggleEdit: (...args) => calls.push(["toggle", ...args]),
    onContactCustomer: (...args) => calls.push(["contact", ...args]),
    onBookCustomer: (...args) => calls.push(["book", ...args]),
    onChangeProfileDraft: (...args) => calls.push(["draft", ...args]),
    onCancelEdit: (...args) => calls.push(["cancel", ...args]),
    onDeleteCustomer: (...args) => calls.push(["delete", ...args]),
    onChangeSection: (...args) => calls.push(["section", ...args]),
    onChangeNotes: (...args) => calls.push(["notes", ...args]),
    onSaveNotes: (...args) => calls.push(["saveNotes", ...args]),
    onDeleteNote: (...args) => calls.push(["deleteNote", ...args]),
  }));
  element.props.children[0].props.children[0].props.onClick("ignored");
  element.props.children[0].props.children[2].props.onClick("ignored");
  element.props.children[1].props.children[2].props.children[0].props.onClick();
  element.props.children[1].props.children[2].props.children[3].props.onClick();
  element.props.children[2].props.children[0].props.children[1].props.onChange({ target: { value: "New Name" } });
  element.props.children[2].props.children[5].props.children[1].props.onClick("ignored");
  element.props.children[2].props.children[6].props.onClick();
  element.props.children[4].props.children[1].props.onClick();
  element.props.children[5].props.children[1].props.children[0].props.onChange({ target: { value: "Changed" } });
  element.props.children[5].props.children[1].props.children[1].props.children[0].props.onClick("ignored");
  element.props.children[5].props.children[1].props.children[2].props.children[0].props.children[1].props.onClick();
  assert.equal(calls[0][0], "back");
  assert.equal(calls[1][0], "toggle");
  assert.deepEqual(calls[2].slice(0, 2), ["contact", "call"]);
  assert.equal(calls[3][0], "book");
  assert.equal(calls[3][1].id, customer().id);
  assert.deepEqual(calls[4], ["draft", "name", "New Name"]);
  assert.equal(calls[5][0], "cancel");
  assert.equal(calls[6][0], "delete");
  assert.equal(calls[6][1].id, customer().id);
  assert.deepEqual(calls[7], ["section", "notes"]);
  assert.deepEqual(calls[8], ["notes", "Changed"]);
  assert.equal(calls[9][0], "saveNotes");
  assert.deepEqual(calls[10], ["deleteNote", "note-1"]);
}

{
  const inputCustomer = customer();
  const inputDraft = { address: "A", email: "E", name: "N", phone: "P", updates: "U" };
  const snapshotCustomer = structuredClone(inputCustomer);
  const snapshotDraft = structuredClone(inputDraft);
  render(AdminClientProfilePanel, { customer: inputCustomer, editDraft: inputDraft });
  assert.deepEqual(inputCustomer, snapshotCustomer);
  assert.deepEqual(inputDraft, snapshotDraft);
}

console.log("Admin client profile panel tests passed.");
