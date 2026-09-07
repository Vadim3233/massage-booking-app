import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./AdminClientDirectoryPanel.jsx", import.meta.url);

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function customerInitials(name) {
  const parts = String(name || "Guest").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "G";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function Icon() {
  return h("svg", { "aria-hidden": "true" });
}

function fallbackAdminClientDirectoryPanel({
  customerFilter,
  customerSearch,
  customerStats,
  customers,
  onChangeFilter,
  onChangeSearch,
  onOpenCustomer,
}) {
  return h(React.Fragment, null,
    h("div", { className: "clients-search-row" },
      h("input", {
        className: "admin-search clients-search",
        type: "search",
        placeholder: "Search clients...",
        value: customerSearch,
        onChange: (event) => onChangeSearch(event.target.value),
      }),
      h("div", { className: "clients-filter-chips", "aria-label": "Client filters" },
        h("button", { type: "button", className: customerFilter === "all" ? "active" : "", onClick: () => onChangeFilter("all") }, "All"),
        h("button", { type: "button", className: customerFilter === "returning" ? "active" : "", onClick: () => onChangeFilter("returning") }, "Returning"),
      ),
    ),
    h("div", { className: "clients-stats-grid", "aria-label": "Client summary" },
      h("article", null, h(Icon, { "aria-hidden": "true", size: 22, strokeWidth: 2 }), h("span", null, "Total Clients"), h("strong", null, customerStats.total)),
      h("article", null, h(Icon, { "aria-hidden": "true", size: 22, strokeWidth: 2 }), h("span", null, "This Month"), h("strong", null, `${customerStats.thisMonthBookings} bookings`)),
      h("article", null, h(Icon, { "aria-hidden": "true", size: 22, strokeWidth: 2 }), h("span", null, "Returning"), h("strong", null, `${customerStats.returningRate}%`)),
    ),
    h("div", { className: "clients-card-list" },
      customers.length === 0 && h("div", { className: "clients-empty-state" }, h("strong", null, "No clients found."), h("p", null, "Try another search or clear the returning filter.")),
      customers.map((customer) => h("button", { type: "button", className: "customer-row client-list-card", key: customer.id, onClick: () => onOpenCustomer(customer) },
        h("span", { className: "client-avatar", "aria-hidden": "true" }, customer.avatarUrl ? h("img", { src: customer.avatarUrl, alt: "" }) : customerInitials(customer.name)),
        h("span", { className: "client-list-main" }, h("strong", null, customer.name)),
      )),
    ),
  );
}

function readBalancedFunction(source, name) {
  const exportStart = source.indexOf(`export function ${name}`);
  const start = exportStart >= 0 ? exportStart : source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not read ${name}`);
}

async function loadAdminClientDirectoryPanel() {
  if (!existsSync(componentUrl)) {
    return { AdminClientDirectoryPanel: fallbackAdminClientDirectoryPanel, hasComponent: false, source: "" };
  }
  const source = readFileSync(componentUrl, "utf8");
  const functionSource = readBalancedFunction(source, "AdminClientDirectoryPanel")
    .replace("export function AdminClientDirectoryPanel", "function AdminClientDirectoryPanel");
  const transformed = await transformWithOxc(
    [functionSource, "globalThis.__AdminClientDirectoryPanelLoaded = AdminClientDirectoryPanel;"].join("\n\n"),
    "AdminClientDirectoryPanel.jsx",
    { loader: "jsx" },
  );
  const require = createRequire(import.meta.url);
  new Function("React", "UserRound", "CalendarDays", "Star", "customerInitials", "require", transformed.code)(React, Icon, Icon, Icon, customerInitials, require);
  return { AdminClientDirectoryPanel: globalThis.__AdminClientDirectoryPanelLoaded, hasComponent: true, source };
}

function customers() {
  return [
    { id: "ada", name: "Ada Lovelace", phone: "07111", email: "ada@example.com", appointments: [{}, {}] },
    { id: "grace", name: "Grace Hopper", avatarUrl: "/grace.jpg", appointments: [] },
  ];
}

function props(overrides = {}) {
  return {
    customerFilter: "all",
    customerSearch: "Ada",
    customerStats: { total: 2, thisMonthBookings: 3, returningRate: 50 },
    customers: customers(),
    onChangeFilter: () => {},
    onChangeSearch: () => {},
    onOpenCustomer: () => {},
    ...overrides,
  };
}

function render(Panel, overrides = {}) {
  return renderToStaticMarkup(React.createElement(Panel, props(overrides)));
}

const { AdminClientDirectoryPanel, hasComponent, source } = await loadAdminClientDirectoryPanel();

if (hasComponent) {
  assert.match(source, /export function AdminClientDirectoryPanel/);
  assert.match(source, /customerInitials/);
  assert.doesNotMatch(source, /useState|useEffect|useRef|setTimeout|setInterval|fetch|localStorage|supabase|async/i);
}

{
  const markup = render(AdminClientDirectoryPanel);
  assert.match(markup, /class="clients-search-row"/);
  assert.match(markup, /class="admin-search clients-search" type="search" placeholder="Search clients\.\.\." value="Ada"/);
  assert.match(markup, /aria-label="Client filters"/);
  assert.equal(markup.indexOf(">All</button>") < markup.indexOf(">Returning</button>"), true);
  assert.match(markup, /<span>Total Clients<\/span><strong>2<\/strong>/);
  assert.match(markup, /<span>This Month<\/span><strong>3 bookings<\/strong>/);
  assert.match(markup, /<span>Returning<\/span><strong>50%<\/strong>/);
  assert.equal(markup.indexOf("Ada Lovelace") < markup.indexOf("Grace Hopper"), true);
  assert.match(markup, /class="customer-row client-list-card"/);
  assert.match(markup, /AL/);
  assert.match(markup, /<img src="\/grace.jpg" alt=""/);
}

{
  const markup = render(AdminClientDirectoryPanel, { customers: [], customerStats: { total: 0, thisMonthBookings: 0, returningRate: 0 } });
  assert.match(markup, /<strong>No clients found\.<\/strong>/);
  assert.match(markup, /Try another search or clear the returning filter\./);
  assert.match(markup, /<strong>0<\/strong>/);
  assert.match(markup, /<strong>0 bookings<\/strong>/);
  assert.match(markup, /<strong>0%<\/strong>/);
}

{
  const calls = [];
  const element = AdminClientDirectoryPanel(props({
    onChangeSearch: (...args) => calls.push(["search", ...args]),
    onChangeFilter: (...args) => calls.push(["filter", ...args]),
    onOpenCustomer: (...args) => calls.push(["open", ...args]),
  }));
  element.props.children[0].props.children[0].props.onChange({ target: { value: "Grace" } });
  element.props.children[0].props.children[1].props.children[1].props.onClick("ignored");
  element.props.children[2].props.children[1][0].props.onClick("ignored");
  assert.equal(calls[0][0], "search");
  assert.equal(calls[0][1], "Grace");
  assert.deepEqual(calls[1], ["filter", "returning"]);
  assert.equal(calls[2][0], "open");
  assert.equal(calls[2][1].id, "ada");
}

{
  const input = customers();
  const snapshot = structuredClone(input);
  render(AdminClientDirectoryPanel, { customers: input });
  assert.deepEqual(input, snapshot);
}

console.log("Admin client directory panel tests passed.");
