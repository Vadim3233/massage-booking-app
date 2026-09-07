import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./EnhancementsSettingsPanel.jsx", import.meta.url);
const appUrl = new URL("../../App.jsx", import.meta.url);

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

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function fallbackEnhancementsSettingsPanel({ enhancements, onAddEnhancement, onDeleteEnhancement, onUpdateEnhancement }) {
  return h(
    "div",
    { className: "admin-settings-section", id: "admin-enhancements" },
    h(
      "div",
      { className: "admin-screen-heading compact-settings-heading" },
      h("div", null, h("p", null, "Add-ons"), h("h2", null, "Enhancements")),
      h("button", { type: "button", onClick: onAddEnhancement }, "Add enhancement"),
    ),
    h(
      "div",
      { className: "admin-enhancement-list" },
      enhancements.map((item) => h(
        "article",
        { className: "admin-enhancement-card", key: item.id },
        h("label", null, h("span", null, "Name"), h("input", { value: item.name, onChange: (event) => onUpdateEnhancement(item.id, { name: event.target.value }) })),
        h("label", null, h("span", null, "Price"), h("input", { type: "number", min: "0", value: item.price, onChange: (event) => onUpdateEnhancement(item.id, { price: event.target.value }) })),
        h("label", null, h("span", null, "Extra time"), h("input", { type: "number", min: "0", step: "5", value: item.durationMinutes ?? 0, onChange: (event) => onUpdateEnhancement(item.id, { durationMinutes: event.target.value }) })),
        h("label", { className: "admin-enhancement-description" }, h("span", null, "Description"), h("input", { value: item.description, onChange: (event) => onUpdateEnhancement(item.id, { description: event.target.value }) })),
        h("label", { className: "admin-toggle-row admin-enhancement-active" }, h("input", { type: "checkbox", checked: item.active !== false, onChange: (event) => onUpdateEnhancement(item.id, { active: event.target.checked }) }), h("span", null, item.active !== false ? "Active" : "Hidden")),
        h("button", { type: "button", className: "admin-danger-option", onClick: () => onDeleteEnhancement(item.id) }, "Delete"),
      )),
    ),
  );
}

function readInlineEnhancementsSettingsPanelSource() {
  const source = readFileSync(appUrl, "utf8");
  const start = source.indexOf('<div className="admin-settings-section" id="admin-enhancements">');
  assert.notEqual(start, -1, "inline enhancements settings panel should exist before extraction");

  const endMarker = '            <div className="admin-settings-section service-area-settings-section" id="admin-service-areas">';
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, "inline enhancements settings panel should end before service areas");
  return source.slice(start, end);
}

async function loadEnhancementsSettingsPanel() {
  if (!existsSync(componentUrl)) {
    return {
      EnhancementsSettingsPanel: fallbackEnhancementsSettingsPanel,
      hasComponent: false,
      source: readInlineEnhancementsSettingsPanelSource(),
    };
  }

  const source = readFileSync(componentUrl, "utf8");
  const functionSource = readBalancedFunction(source, "EnhancementsSettingsPanel")
    .replace("export function EnhancementsSettingsPanel", "function EnhancementsSettingsPanel");
  const transformed = await transformWithOxc(
    [
      "const { useState } = React;",
      functionSource,
      "globalThis.__EnhancementsSettingsPanelLoaded = EnhancementsSettingsPanel;",
    ].join("\n\n"),
    "EnhancementsSettingsPanel.jsx",
    { loader: "jsx" },
  );

  const require = createRequire(import.meta.url);
  new Function("require", "React", transformed.code)(require, React);
  return {
    EnhancementsSettingsPanel: globalThis.__EnhancementsSettingsPanelLoaded,
    hasComponent: true,
    source,
  };
}

function childArray(value) {
  return React.Children.toArray(value);
}

function sampleEnhancements() {
  return [
    { active: true, description: "Focused scalp, neck, and shoulder release.", durationMinutes: 10, id: "head-massage", name: "Indian head massage", price: 18 },
    { active: false, description: "Gentle heat.", id: "hot-stones", name: "Hot stones", price: 24 },
  ];
}

function panelElement(EnhancementsSettingsPanel, props = {}) {
  return EnhancementsSettingsPanel({
    enhancements: sampleEnhancements(),
    onAddEnhancement: () => {},
    onDeleteEnhancement: () => {},
    onUpdateEnhancement: () => {},
    ...props,
  });
}

function renderPanel(EnhancementsSettingsPanel, props = {}) {
  return renderToStaticMarkup(React.createElement(EnhancementsSettingsPanel, {
    enhancements: sampleEnhancements(),
    onAddEnhancement: () => {},
    onDeleteEnhancement: () => {},
    onUpdateEnhancement: () => {},
    ...props,
  }));
}

const { EnhancementsSettingsPanel, hasComponent, source } = await loadEnhancementsSettingsPanel();

assert.match(source, /admin-enhancements/);
assert.match(source, /Add-ons/);
assert.match(source, /Enhancements/);
assert.match(source, /Add enhancement/);
assert.match(source, /admin-enhancement-list/);
assert.match(source, /admin-enhancement-card/);
assert.match(source, /item\.durationMinutes \?\? 0/);
assert.match(source, /item\.active !== false \? "Active" : "Hidden"/);
assert.match(source, /onUpdateEnhancement\(item\.id, \{ name: event\.target\.value \}\)/);
assert.match(source, /onUpdateEnhancement\(item\.id, \{ price: event\.target\.value \}\)/);
assert.match(source, /onUpdateEnhancement\(item\.id, \{ durationMinutes: event\.target\.value \}\)/);
assert.match(source, /onUpdateEnhancement\(item\.id, \{ description: event\.target\.value \}\)/);
assert.match(source, /onUpdateEnhancement\(item\.id, \{ active: event\.target\.checked \}\)/);
assert.match(source, /onDeleteEnhancement\(item\.id\)/);
assert.match(source, /useState/);
assert.doesNotMatch(source, /useEffect|useRef|setTimeout|setInterval|fetch|localStorage|supabase|async/i);

if (hasComponent) {
  assert.match(source, /export function EnhancementsSettingsPanel\(\{\s*enhancements,\s*saveStatus = \{ message: "", saving: false, type: "" \},\s*onAddEnhancement,\s*onDeleteEnhancement,\s*onUpdateEnhancement,\s*\}\)/);
}

{
  const markup = renderPanel(EnhancementsSettingsPanel);
  assert.match(markup, /^<div class="admin-settings-section" id="admin-enhancements">/);
  assert.match(markup, /<p>Add-ons<\/p><h2>Enhancements<\/h2>/);
  assert.match(markup, /<button type="button">Add enhancement<\/button>/);
  assert.equal((markup.match(/class="admin-enhancement-card"/g) || []).length, 2);
  assert.equal(markup.includes("Indian head massage"), true);
  assert.equal(markup.includes("Hot stones"), true);
  assert.equal(markup.includes("18"), true);
  assert.equal(markup.includes("10 min"), true);
  assert.equal(markup.includes("Focused scalp"), false);
  assert.equal(markup.includes("Delete"), false);
}

{
  const emptyMarkup = renderPanel(EnhancementsSettingsPanel, { enhancements: [] });
  assert.equal(emptyMarkup, '<div class="admin-settings-section" id="admin-enhancements"><div class="admin-screen-heading compact-settings-heading"><div><p>Add-ons</p><h2>Enhancements</h2></div><button type="button">Add enhancement</button></div><div class="admin-enhancement-list"></div></div>');
}

{
  const markup = renderPanel(EnhancementsSettingsPanel, {
    saveStatus: { message: "Enhancements saved.", saving: false, type: "success" },
  });
  assert.match(markup, /class="admin-settings-save-status success"/);
  assert.match(markup, /Enhancements saved\./);
}

{
  const markup = renderPanel(EnhancementsSettingsPanel);
  assert.equal((markup.match(/class="admin-enhancement-summary"/g) || []).length, 2);
  assert.equal((markup.match(/class="admin-enhancement-details"/g) || []).length, 0);
  assert.match(source, /aria-expanded={expandedId === item\.id}/);
  assert.match(source, /onDeleteEnhancement\(item\.id\)/);
}

{
  const enhancements = sampleEnhancements();
  const snapshot = structuredClone(enhancements);
  renderPanel(EnhancementsSettingsPanel, { enhancements });
  assert.deepEqual(enhancements, snapshot);
}

console.log("EnhancementsSettingsPanel characterization passed");
