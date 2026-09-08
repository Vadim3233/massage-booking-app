import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./ServiceAreasSettingsPanel.jsx", import.meta.url);

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

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function fallbackServiceAreasSettingsPanel({
  serviceAreas,
  onAddServiceArea,
  onDeleteServiceArea,
  onUpdateServiceArea,
}) {
  return (
    h("div", { className: "admin-settings-section service-area-settings-section", id: "admin-service-areas" },
      h("div", { className: "admin-screen-heading compact-settings-heading" },
        h("div", null,
          h("p", null, "Client booking"),
          h("h2", null, "Service areas"),
        ),
        h("button", { type: "button", onClick: onAddServiceArea }, "Add area"),
      ),
      h("p", { className: "admin-muted-note" }, "Turn areas on or off and set optional manual fees. Active areas appear on the first booking step."),
      h("div", { className: "admin-service-area-list" },
        serviceAreas.map((area) => (
          h("article", { className: area.active !== false ? "admin-service-area-card active-admin-service-area" : "admin-service-area-card", key: area.id },
            h("span", { className: "admin-service-area-position", "aria-label": `${area.name || "Service area"} position` }, area.active !== false ? "Visible" : "Hidden"),
            h("label", { className: "admin-service-area-toggle" },
              h("input", {
                type: "checkbox",
                checked: area.active !== false,
                onChange: (event) => onUpdateServiceArea(area.id, { active: event.target.checked }),
              }),
              h("span", null, area.active !== false ? "On" : "Off"),
            ),
            h("label", { className: "admin-service-area-name" },
              h("span", null, "Name"),
              h("input", { value: area.name, onChange: (event) => onUpdateServiceArea(area.id, { name: event.target.value }) }),
            ),
            h("div", { className: "admin-service-area-fees" },
              h("label", null,
                h("span", null, "Congestion fee (£)"),
                h("input", {
                  type: "number",
                  min: "0",
                  step: "1",
                  value: area.congestionFee ?? 0,
                  onChange: (event) => onUpdateServiceArea(area.id, { congestionFee: Math.max(0, Number(event.target.value) || 0) }),
                }),
              ),
              h("label", null,
                h("span", null, "Travel surcharge (£)"),
                h("input", {
                  type: "number",
                  min: "0",
                  step: "1",
                  value: area.travelSurcharge ?? 0,
                  onChange: (event) => onUpdateServiceArea(area.id, { travelSurcharge: Math.max(0, Number(event.target.value) || 0) }),
                }),
              ),
            ),
            area.custom && h("button", { type: "button", className: "admin-danger-option service-area-delete-button", onClick: () => onDeleteServiceArea(area.id) }, "Delete"),
          )
        )),
      ),
    )
  );
}

async function loadServiceAreasSettingsPanel() {
  if (!existsSync(componentUrl)) {
    return {
      ServiceAreasSettingsPanel: fallbackServiceAreasSettingsPanel,
      hasComponent: false,
      source: "",
    };
  }

  const source = readFileSync(componentUrl, "utf8");
  const functionSource = readBalancedFunction(source, "ServiceAreasSettingsPanel")
    .replace("export function ServiceAreasSettingsPanel", "function ServiceAreasSettingsPanel");
  const transformed = await transformWithOxc(
    [
      functionSource,
      "globalThis.__ServiceAreasSettingsPanelLoaded = ServiceAreasSettingsPanel;",
    ].join("\n\n"),
    "ServiceAreasSettingsPanel.jsx",
    { loader: "jsx" },
  );

  const require = createRequire(import.meta.url);
  new Function("React", "require", transformed.code)(React, require);
  return {
    ServiceAreasSettingsPanel: globalThis.__ServiceAreasSettingsPanelLoaded,
    hasComponent: true,
    source,
  };
}

function defaultAreas() {
  return [
    { id: "chelsea", name: "Chelsea", active: true, congestionFee: 0, travelSurcharge: 0 },
    { id: "custom_area", name: "New area 1", active: false, congestionFee: 12.5, travelSurcharge: 7, custom: true },
  ];
}

function defaultProps(overrides = {}) {
  return {
    serviceAreas: defaultAreas(),
    saveStatus: { ready: true, dirty: false },
    onSave: () => {},
    onRetry: () => {},
    onAddServiceArea: () => {},
    onDeleteServiceArea: () => {},
    onUpdateServiceArea: () => {},
    ...overrides,
  };
}

function renderPanel(ServiceAreasSettingsPanel, overrides = {}) {
  return renderToStaticMarkup(React.createElement(ServiceAreasSettingsPanel, defaultProps(overrides)));
}

function panelElement(ServiceAreasSettingsPanel, overrides = {}) {
  return ServiceAreasSettingsPanel(defaultProps(overrides));
}

function articles(element) {
  return React.Children.toArray(element.props.children[0].props.children[2].props.children);
}

function addButton(element) {
  return element.props.children[0].props.children[0].props.children[1];
}

function positionLabel(article) {
  return article.props.children[0];
}

function toggleInput(article) {
  return article.props.children[1].props.children[0];
}

function nameInput(article) {
  return article.props.children[2].props.children[1];
}

function feeInputs(article) {
  const feeLabels = React.Children.toArray(article.props.children[3].props.children);
  return feeLabels.map((label) => label.props.children[1]);
}

function deleteButton(article) {
  return article.props.children[4];
}

const { ServiceAreasSettingsPanel, hasComponent, source } = await loadServiceAreasSettingsPanel();

if (hasComponent) {
  assert.match(source, /export function ServiceAreasSettingsPanel\(\{\s*serviceAreas,\s*saveStatus,\s*onSave,\s*onRetry,\s*onAddServiceArea,\s*onDeleteServiceArea,\s*onUpdateServiceArea,\s*\}\)/);
  assert.match(source, /key=\{area\.id\}/);
  assert.doesNotMatch(source, /useState|useEffect|useRef|setTimeout|setInterval|fetch|localStorage|supabase|async/i);
}

{
  const markup = renderPanel(ServiceAreasSettingsPanel, { serviceAreas: [] });
  assert.equal(markup, '<div class="admin-settings-section service-area-settings-section" id="admin-service-areas"><fieldset style="border:0;margin:0;padding:0;min-width:0"><div class="admin-screen-heading compact-settings-heading"><div><p>Client booking</p><h2>Service areas</h2></div><button type="button">Add area</button></div><p class="admin-muted-note">Turn areas on or off and set optional manual fees. Active areas appear on the first booking step.</p><div class="admin-service-area-list"></div></fieldset><div class="weekly-working-footer"><button type="button" class="admin-primary-action" disabled="">Save area settings</button></div></div>');
}

{
  const markup = renderPanel(ServiceAreasSettingsPanel, { serviceAreas: [defaultAreas()[0]] });
  assert.match(markup, /<p>Client booking<\/p><h2>Service areas<\/h2>/);
  assert.match(markup, /<button type="button">Add area<\/button>/);
  assert.match(markup, /class="admin-service-area-list"/);
  assert.match(markup, /class="admin-service-area-card active-admin-service-area"/);
  assert.match(markup, /aria-label="Chelsea position">Visible<\/span>/);
  assert.match(markup, /<span>On<\/span>/);
  assert.match(markup, /<span>Name<\/span><input value="Chelsea"\/>/);
  assert.match(markup, /<span>Congestion fee\(£\)<\/span>|<span>Congestion fee \(£\)<\/span>/);
  assert.match(markup, /<span>Travel surcharge\(£\)<\/span>|<span>Travel surcharge \(£\)<\/span>/);
  assert.doesNotMatch(markup, /Delete/);
}

{
  const markup = renderPanel(ServiceAreasSettingsPanel);
  assert.equal(markup.indexOf("Chelsea position") < markup.indexOf("New area 1 position"), true);
  assert.match(markup, /aria-label="New area 1 position">Hidden<\/span>/);
  assert.match(markup, /<span>Off<\/span>/);
  assert.match(markup, /class="admin-danger-option service-area-delete-button">Delete<\/button>/);
}

{
  const areas = defaultAreas();
  const snapshot = structuredClone(areas);
  renderPanel(ServiceAreasSettingsPanel, { serviceAreas: areas });
  assert.deepEqual(areas, snapshot);
}

{
  const element = panelElement(ServiceAreasSettingsPanel);
  const rows = articles(element);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].key, ".$chelsea");
  assert.equal(rows[1].key, ".$custom_area");
  assert.equal(rows[0].props.className, "admin-service-area-card active-admin-service-area");
  assert.equal(rows[1].props.className, "admin-service-area-card");
  assert.equal(positionLabel(rows[0]).props["aria-label"], "Chelsea position");
  assert.equal(positionLabel(rows[0]).props.children, "Visible");
  assert.equal(positionLabel(rows[1]).props.children, "Hidden");
}

{
  const area = { id: "sparse", name: "", active: undefined, congestionFee: undefined, travelSurcharge: undefined, custom: true };
  const article = articles(panelElement(ServiceAreasSettingsPanel, { serviceAreas: [area] }))[0];
  assert.equal(positionLabel(article).props["aria-label"], "Service area position");
  assert.equal(positionLabel(article).props.children, "Visible");
  assert.equal(toggleInput(article).props.checked, true);
  assert.equal(nameInput(article).props.value, "");
  assert.equal(feeInputs(article)[0].props.value, 0);
  assert.equal(feeInputs(article)[1].props.value, 0);
}

{
  const article = articles(panelElement(ServiceAreasSettingsPanel))[0];
  const [congestionInput, travelInput] = feeInputs(article);
  assert.equal(toggleInput(article).props.type, "checkbox");
  assert.equal(toggleInput(article).props.checked, true);
  assert.equal(congestionInput.props.type, "number");
  assert.equal(congestionInput.props.min, "0");
  assert.equal(congestionInput.props.step, "0.01");
  assert.equal(congestionInput.props.value, 0);
  assert.equal(travelInput.props.type, "number");
  assert.equal(travelInput.props.min, "0");
  assert.equal(travelInput.props.step, "0.01");
  assert.equal(travelInput.props.value, 0);
}

{
  const calls = [];
  const element = panelElement(ServiceAreasSettingsPanel, { onAddServiceArea: (...args) => calls.push(args) });
  addButton(element).props.onClick("ignored");
  assert.deepEqual(calls, [["ignored"]]);
}

{
  const calls = [];
  const row = articles(panelElement(ServiceAreasSettingsPanel, { onDeleteServiceArea: (...args) => calls.push(args) }))[1];
  deleteButton(row).props.onClick("ignored");
  assert.deepEqual(calls, [["custom_area"]]);
}

{
  const calls = [];
  const row = articles(panelElement(ServiceAreasSettingsPanel, { onUpdateServiceArea: (...args) => calls.push(args) }))[0];
  toggleInput(row).props.onChange({ target: { checked: false } });
  nameInput(row).props.onChange({ target: { value: "Belgravia West" } });
  feeInputs(row)[0].props.onChange({ target: { value: "" } });
  feeInputs(row)[1].props.onChange({ target: { value: "0" } });
  feeInputs(row)[0].props.onChange({ target: { value: "12.5" } });
  feeInputs(row)[1].props.onChange({ target: { value: "-4" } });
  feeInputs(row)[0].props.onChange({ target: { value: "abc" } });
  assert.deepEqual(calls, [
    ["chelsea", { active: false }],
    ["chelsea", { name: "Belgravia West" }],
    ["chelsea", { congestionFee: 0 }],
    ["chelsea", { travelSurcharge: 0 }],
    ["chelsea", { congestionFee: 12.5 }],
    ["chelsea", { travelSurcharge: 0 }],
    ["chelsea", { congestionFee: 0 }],
  ]);
}

{
  const custom = { id: "decimal", name: "Decimal", active: true, congestionFee: 3.75, travelSurcharge: "4.5", custom: true };
  const row = articles(panelElement(ServiceAreasSettingsPanel, { serviceAreas: [custom] }))[0];
  assert.equal(feeInputs(row)[0].props.value, 3.75);
  assert.equal(feeInputs(row)[1].props.value, "4.5");
}

console.log("Service areas settings panel tests passed.");
