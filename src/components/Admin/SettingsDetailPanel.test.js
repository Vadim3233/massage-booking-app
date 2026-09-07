import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./SettingsDetailPanel.jsx", import.meta.url);
const appUrl = new URL("../../App.jsx", import.meta.url);

function readBalancedFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
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

async function loadSettingsDetailPanel() {
  const source = existsSync(componentUrl)
    ? readFileSync(componentUrl, "utf8")
    : readBalancedFunction(readFileSync(appUrl, "utf8"), "renderSettingsDetailPanel")
      .replace("function renderSettingsDetailPanel", "function SettingsDetailPanel");

  const functionSource = existsSync(componentUrl)
    ? readBalancedFunction(source, "SettingsDetailPanel").replace("export function SettingsDetailPanel", "function SettingsDetailPanel")
    : source;

  const transformed = await transformWithOxc(
    [
      functionSource,
      "globalThis.__SettingsDetailPanelLoaded = SettingsDetailPanel;",
    ].join("\n\n"),
    "SettingsDetailPanel.jsx",
    { loader: "jsx" },
  );

  const require = createRequire(import.meta.url);
  new Function("require", transformed.code)(require);
  return { SettingsDetailPanel: globalThis.__SettingsDetailPanelLoaded, source };
}

function markupFor(SettingsDetailPanel, props = {}) {
  return renderToStaticMarkup(React.createElement(SettingsDetailPanel, {
    title: "Panel title",
    ...props,
  }));
}

const { SettingsDetailPanel, source } = await loadSettingsDetailPanel();

assert.match(source, /(?:export )?function (?:renderSettingsDetailPanel|SettingsDetailPanel)\(\{\s*title,\s*description,\s*items = \[\],\s*actions = null,\s*note = "",\s*\}\)/);
assert.match(source, /className="settings-placeholder settings-detail-panel"/);
assert.match(source, /<h3>\{title\}<\/h3>/);
assert.match(source, /\{description && <p>\{description\}<\/p>\}/);
assert.match(source, /\{items\.length > 0 && \(/);
assert.match(source, /className="settings-detail-grid"/);
assert.match(source, /items\.map\(\(item\) => \(/);
assert.match(source, /<article className="settings-detail-item" key=\{item\.title\}>/);
assert.match(source, /<strong>\{item\.title\}<\/strong>/);
assert.match(source, /<p>\{item\.body\}<\/p>/);
assert.match(source, /\{note && <p className="admin-muted-note">\{note\}<\/p>\}/);
assert.match(source, /\{actions && <div className="settings-detail-actions">\{actions\}<\/div>\}/);
assert.doesNotMatch(source, /useState|useEffect|useRef|setTimeout|setInterval|fetch|localStorage|supabase|async/i);

{
  const markup = markupFor(SettingsDetailPanel);
  assert.equal(markup, '<div class="settings-placeholder settings-detail-panel"><div><h3>Panel title</h3></div></div>');
}

{
  const markup = markupFor(SettingsDetailPanel, { description: "Panel description" });
  assert.equal(markup, '<div class="settings-placeholder settings-detail-panel"><div><h3>Panel title</h3><p>Panel description</p></div></div>');
}

{
  const items = [{ title: "First", body: "One" }];
  const snapshot = structuredClone(items);
  const markup = markupFor(SettingsDetailPanel, { items });
  assert.equal(markup, '<div class="settings-placeholder settings-detail-panel"><div><h3>Panel title</h3></div><div class="settings-detail-grid"><article class="settings-detail-item"><strong>First</strong><p>One</p></article></div></div>');
  assert.deepEqual(items, snapshot);
}

{
  const items = [
    { title: "First", body: "One" },
    { title: "Second", body: "Two" },
  ];
  const snapshot = structuredClone(items);
  const markup = markupFor(SettingsDetailPanel, { items });
  assert.equal(markup.indexOf("<strong>First</strong>") < markup.indexOf("<strong>Second</strong>"), true);
  assert.deepEqual(items, snapshot);
}

{
  const markup = markupFor(SettingsDetailPanel, { items: [] });
  assert.doesNotMatch(markup, /settings-detail-grid/);
}

{
  const markup = markupFor(SettingsDetailPanel, { note: "Quiet note" });
  assert.equal(markup, '<div class="settings-placeholder settings-detail-panel"><div><h3>Panel title</h3></div><p class="admin-muted-note">Quiet note</p></div>');
}

{
  const actions = React.createElement("button", { type: "button", className: "admin-primary-action" }, "Do thing");
  const markup = markupFor(SettingsDetailPanel, { actions });
  assert.equal(markup, '<div class="settings-placeholder settings-detail-panel"><div><h3>Panel title</h3></div><div class="settings-detail-actions"><button type="button" class="admin-primary-action">Do thing</button></div></div>');
}

{
  const actions = React.createElement("button", { type: "button" }, "Action");
  const markup = markupFor(SettingsDetailPanel, {
    actions,
    note: "Note",
  });
  assert.equal(markup.indexOf('class="admin-muted-note"') < markup.indexOf('class="settings-detail-actions"'), true);
}

console.log("Settings detail panel tests passed.");
