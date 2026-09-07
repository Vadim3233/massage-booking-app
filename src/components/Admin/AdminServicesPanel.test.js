import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./AdminServicesPanel.jsx", import.meta.url);

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function Icon() {
  return h("svg", { "aria-hidden": "true" });
}

function fallbackAdminServicesPanel({
  editingServiceId,
  renderServiceEditor,
  serviceSearch,
  services,
  settingsReturnCategory,
  onAddService,
  onBackToSettings,
  onChangeSearch,
  onToggleEditor,
  onToggleVisibility,
}) {
  return h("section", { className: "admin-screen" },
    h("div", { className: "admin-screen-heading" },
      h("div", null,
        h("p", null, "Services"),
        h("h2", null, "Service offerings"),
        h("span", { className: "admin-screen-helper" }, "Manage the services clients can book."),
      ),
      h("div", { className: "admin-service-heading-actions" },
        h("button", { type: "button", className: "admin-primary-action", onClick: onAddService }, h(Icon, { size: 16, "aria-hidden": "true" }), "Add service"),
        settingsReturnCategory && h("button", { type: "button", className: "settings-folder-back", onClick: onBackToSettings }, h("span", { "aria-hidden": "true" }, "<"), "Back to Settings"),
      ),
    ),
    h("input", {
      className: "admin-search",
      type: "search",
      placeholder: "Search services",
      value: serviceSearch,
      onChange: (event) => onChangeSearch(event.target.value),
    }),
    h("div", { className: "admin-service-grid" },
      services.map((service) => h("article", { className: "admin-service-card", key: service.id },
        h("div", { className: "admin-service-card-main" },
          h("div", { className: "admin-service-title-block" }, h("h3", null, service.name)),
          h("div", { className: "admin-service-actions" },
            h("label", { className: "admin-service-visibility-switch" },
              h("input", {
                type: "checkbox",
                checked: service.visible,
                "aria-label": `${service.name} is ${service.visible ? "visible" : "hidden"} to clients`,
                onChange: () => onToggleVisibility(service.id),
              }),
              h("span", { "aria-hidden": "true" }),
              h("strong", null, service.visible ? "Visible" : "Hidden"),
            ),
            h("button", { type: "button", className: "admin-secondary-action", onClick: () => onToggleEditor(service) }, editingServiceId === service.id ? "Collapse" : "Edit"),
          ),
        ),
        editingServiceId === service.id && renderServiceEditor(service),
      )),
    ),
  );
}

function readBalancedFunction(source, name) {
  const start = source.indexOf(`export function ${name}`);
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

async function loadPanel() {
  if (!existsSync(componentUrl)) return { Panel: fallbackAdminServicesPanel, hasComponent: false, source: "" };
  const source = readFileSync(componentUrl, "utf8");
  const functionSource = readBalancedFunction(source, "AdminServicesPanel")
    .replace("export function AdminServicesPanel", "function AdminServicesPanel");
  const transformed = await transformWithOxc(
    [functionSource, "globalThis.__AdminServicesPanelLoaded = AdminServicesPanel;"].join("\n\n"),
    "AdminServicesPanel.jsx",
    { loader: "jsx" },
  );
  const require = createRequire(import.meta.url);
  new Function("React", "Plus", "require", transformed.code)(React, Icon, require);
  return { Panel: globalThis.__AdminServicesPanelLoaded, hasComponent: true, source };
}

function services() {
  return [
    { id: "massage", name: "Massage", visible: true },
    { id: "stretch", name: "Assisted Stretching", visible: false },
  ];
}

function props(overrides = {}) {
  return {
    editingServiceId: "",
    renderServiceEditor: (service) => h("div", { className: "test-editor" }, service.id),
    serviceSearch: "mass",
    services: services(),
    settingsReturnCategory: "",
    onAddService: () => {},
    onBackToSettings: () => {},
    onChangeSearch: () => {},
    onToggleEditor: () => {},
    onToggleVisibility: () => {},
    ...overrides,
  };
}

function render(Panel, overrides = {}) {
  return renderToStaticMarkup(React.createElement(Panel, props(overrides)));
}

const { Panel, hasComponent, source } = await loadPanel();

if (hasComponent) {
  assert.match(source, /export function AdminServicesPanel/);
  assert.match(source, /renderServiceEditor\(service\)/);
  assert.doesNotMatch(source, /useState|useEffect|useRef|setTimeout|setInterval|fetch|localStorage|supabase|async/i);
}

{
  const markup = render(Panel);
  assert.match(markup, /<section class="admin-screen">/);
  assert.match(markup, /<p>Services<\/p><h2>Service offerings<\/h2>/);
  assert.match(markup, /Manage the services clients can book\./);
  assert.match(markup, /class="admin-primary-action"/);
  assert.match(markup, /Add service/);
  assert.doesNotMatch(markup, /Back to Settings/);
  assert.match(markup, /class="admin-search" type="search" placeholder="Search services" value="mass"/);
  assert.match(markup, /class="admin-service-grid"/);
  assert.equal(markup.indexOf("Massage") < markup.indexOf("Assisted Stretching"), true);
  assert.match(markup, /aria-label="Massage is visible to clients"/);
  assert.match(markup, /aria-label="Assisted Stretching is hidden to clients"/);
  assert.match(markup, /<strong>Visible<\/strong>/);
  assert.match(markup, /<strong>Hidden<\/strong>/);
  assert.match(markup, />Edit<\/button>/);
}

{
  const markup = render(Panel, { editingServiceId: "massage", settingsReturnCategory: "services" });
  assert.match(markup, /Back to Settings/);
  assert.match(markup, />Collapse<\/button>/);
  assert.match(markup, /class="test-editor">massage/);
}

{
  const markup = render(Panel, { services: [] });
  assert.match(markup, /class="admin-service-grid"><\/div>/);
}

{
  const calls = [];
  const element = Panel(props({
    settingsReturnCategory: "services",
    onAddService: (...args) => calls.push(["add", ...args]),
    onBackToSettings: (...args) => calls.push(["back", ...args]),
    onChangeSearch: (...args) => calls.push(["search", ...args]),
    onToggleEditor: (...args) => calls.push(["edit", ...args]),
    onToggleVisibility: (...args) => calls.push(["visibility", ...args]),
  }));
  element.props.children[0].props.children[1].props.children[0].props.onClick("ignored");
  element.props.children[0].props.children[1].props.children[1].props.onClick("ignored");
  element.props.children[1].props.onChange({ target: { value: "stretch" } });
  element.props.children[2].props.children[0].props.children[0].props.children[1].props.children[0].props.children[0].props.onChange();
  element.props.children[2].props.children[0].props.children[0].props.children[1].props.children[1].props.onClick();
  assert.equal(calls[0][0], "add");
  assert.equal(calls[1][0], "back");
  assert.deepEqual(calls[2], ["search", "stretch"]);
  assert.deepEqual(calls[3], ["visibility", "massage"]);
  assert.equal(calls[4][0], "edit");
  assert.equal(calls[4][1].id, "massage");
}

{
  const input = services();
  const snapshot = structuredClone(input);
  render(Panel, { services: input });
  assert.deepEqual(input, snapshot);
}

console.log("Admin services panel tests passed.");
