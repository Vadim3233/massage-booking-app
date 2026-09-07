import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./SettingsFolderHome.jsx", import.meta.url);
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

function readInlineSettingsFolderHomeSource() {
  const source = readFileSync(appUrl, "utf8");
  const start = source.indexOf('<div className="admin-screen-heading settings-home-heading">');
  assert.notEqual(start, -1, "inline settings folder home should exist before extraction");

  const fragmentStart = source.lastIndexOf("<>", start);
  assert.notEqual(fragmentStart, -1, "inline settings folder home should be wrapped in a fragment");
  const fragmentEndMarker = "              </>";
  const fragmentEnd = source.indexOf(fragmentEndMarker, start);
  assert.notEqual(fragmentEnd, -1, "inline settings folder home fragment should end");
  return source.slice(fragmentStart, fragmentEnd + fragmentEndMarker.length);
}

async function loadSettingsFolderHome() {
  const source = existsSync(componentUrl)
    ? readFileSync(componentUrl, "utf8")
    : readInlineSettingsFolderHomeSource();

  const functionSource = existsSync(componentUrl)
    ? readBalancedFunction(source, "SettingsFolderHome")
        .replace("export function SettingsFolderHome", "function SettingsFolderHome")
    : [
        "function SettingsFolderHome({ categories, onOpenCategory, onOpenSessionPreferences, onOpenCurrentSettings }) {",
        "  const SETTINGS_NAVIGATION = categories;",
        "  const setSettingsReturnCategory = (value) => { globalThis.__SettingsFolderHomeSetterCalls.push([\"setSettingsReturnCategory\", value]); };",
        "  const setSelectedSettingsCategory = (value) => { globalThis.__SettingsFolderHomeSetterCalls.push([\"setSelectedSettingsCategory\", value]); };",
        "  const setSelectedSettingsSubsection = (value) => { globalThis.__SettingsFolderHomeSetterCalls.push([\"setSelectedSettingsSubsection\", value]); };",
        `  return (${source});`,
        "}",
      ].join("\n");

  const transformed = await transformWithOxc(
    [
      functionSource,
      "globalThis.__SettingsFolderHomeLoaded = SettingsFolderHome;",
    ].join("\n\n"),
    "SettingsFolderHome.jsx",
    { loader: "jsx" },
  );

  const require = createRequire(import.meta.url);
  new Function("require", "React", transformed.code)(require, React);
  return {
    SettingsFolderHome: globalThis.__SettingsFolderHomeLoaded,
    hasComponent: existsSync(componentUrl),
    source,
  };
}

function categories() {
  return [
    { id: "business", label: "Business" },
    { id: "services", label: "Services" },
    { id: "payments", label: "Payments" },
  ];
}

function markupFor(SettingsFolderHome, props = {}) {
  return renderToStaticMarkup(React.createElement(SettingsFolderHome, {
    categories: categories(),
    onOpenCategory: () => {},
    onOpenSessionPreferences: () => {},
    onOpenCurrentSettings: () => {},
    ...props,
  }));
}

function childArray(value) {
  return React.Children.toArray(value);
}

function listRows(element) {
  const [heading, list] = childArray(element.props.children);
  assert.equal(heading.props.className, "admin-screen-heading settings-home-heading");
  assert.equal(list.props.className, "settings-folder-list");
  return childArray(list.props.children).flatMap((child) => {
    if (child.type === React.Fragment) return childArray(child.props.children);
    return [child];
  }).filter(Boolean);
}

const { SettingsFolderHome, hasComponent, source } = await loadSettingsFolderHome();

assert.match(source, /className="admin-screen-heading settings-home-heading"/);
assert.match(source, /<p>Settings<\/p>/);
assert.match(source, /<h2>Settings<\/h2>/);
assert.match(source, /className="settings-folder-list"/);
assert.match(source, /className="settings-folder-row"/);
assert.match(source, /\{category\.label\}/);
assert.match(source, /key=\{category\.id\}/);
assert.match(source, /category\.id === "services"/);
assert.match(source, /className="settings-folder-row settings-direct-row"/);
assert.match(source, /<span>Session Preferences<\/span>/);
assert.match(source, /className="settings-folder-row settings-current-row"/);
assert.match(source, /<span>Current settings<\/span>/);
assert.match(source, /<span aria-hidden="true">&gt;<\/span>/);
assert.doesNotMatch(source, /useState|useEffect|useRef|setTimeout|setInterval|fetch|localStorage|supabase|async/i);

if (hasComponent) {
  assert.match(source, /export function SettingsFolderHome\(\{\s*categories,\s*onOpenCategory,\s*onOpenSessionPreferences,\s*onOpenCurrentSettings,\s*\}\)/);
} else {
  assert.match(source, /setSettingsReturnCategory\(null\);\s*setSelectedSettingsCategory\(category\.id\);\s*setSelectedSettingsSubsection\(null\);/);
  assert.match(source, /setSettingsReturnCategory\(null\);\s*setSelectedSettingsCategory\("services"\);\s*setSelectedSettingsSubsection\("Session Preferences"\);/);
  assert.match(source, /setSettingsReturnCategory\(null\);\s*setSelectedSettingsCategory\("current"\);\s*setSelectedSettingsSubsection\(null\);/);
}

{
  const markup = markupFor(SettingsFolderHome);
  assert.match(markup, /^<div class="admin-screen-heading settings-home-heading"><div><p>Settings<\/p><h2>Settings<\/h2><\/div><\/div><div class="settings-folder-list">/);
  assert.equal((markup.match(/class="settings-folder-row"/g) || []).length, 3);
  assert.equal((markup.match(/class="settings-folder-row settings-direct-row"/g) || []).length, 1);
  assert.equal((markup.match(/class="settings-folder-row settings-current-row"/g) || []).length, 1);
  assert.equal(markup.indexOf("<span>Business</span>") < markup.indexOf("<span>Services</span>"), true);
  assert.equal(markup.indexOf("<span>Services</span>") < markup.indexOf("<span>Session Preferences</span>"), true);
  assert.equal(markup.indexOf("<span>Session Preferences</span>") < markup.indexOf("<span>Payments</span>"), true);
  assert.equal(markup.lastIndexOf("<span>Current settings</span>") > markup.indexOf("<span>Payments</span>"), true);
  assert.equal(markup.endsWith('<button type="button" class="settings-folder-row settings-current-row"><span>Current settings</span><span aria-hidden="true">&gt;</span></button></div>'), true);
}

{
  const emptyMarkup = markupFor(SettingsFolderHome, { categories: [] });
  assert.equal(emptyMarkup, '<div class="admin-screen-heading settings-home-heading"><div><p>Settings</p><h2>Settings</h2></div></div><div class="settings-folder-list"><button type="button" class="settings-folder-row settings-current-row"><span>Current settings</span><span aria-hidden="true">&gt;</span></button></div>');
}

{
  const noServicesMarkup = markupFor(SettingsFolderHome, { categories: [{ id: "business", label: "Business" }] });
  assert.doesNotMatch(noServicesMarkup, /Session Preferences/);
  assert.equal(noServicesMarkup.indexOf("<span>Business</span>") < noServicesMarkup.indexOf("<span>Current settings</span>"), true);
}

{
  const movedServicesMarkup = markupFor(SettingsFolderHome, {
    categories: [
      { id: "payments", label: "Payments" },
      { id: "services", label: "Services" },
      { id: "system", label: "System" },
    ],
  });
  assert.equal(movedServicesMarkup.indexOf("<span>Payments</span>") < movedServicesMarkup.indexOf("<span>Services</span>"), true);
  assert.equal(movedServicesMarkup.indexOf("<span>Services</span>") < movedServicesMarkup.indexOf("<span>Session Preferences</span>"), true);
  assert.equal(movedServicesMarkup.indexOf("<span>Session Preferences</span>") < movedServicesMarkup.indexOf("<span>System</span>"), true);
}

{
  const suppliedCategories = categories();
  const snapshot = structuredClone(suppliedCategories);
  markupFor(SettingsFolderHome, { categories: suppliedCategories });
  assert.deepEqual(suppliedCategories, snapshot);
}

{
  const categoryCalls = [];
  const sessionCalls = [];
  const currentCalls = [];
  globalThis.__SettingsFolderHomeSetterCalls = [];
  const element = SettingsFolderHome({
    categories: categories(),
    onOpenCategory: (...args) => categoryCalls.push(args),
    onOpenSessionPreferences: (...args) => sessionCalls.push(args),
    onOpenCurrentSettings: (...args) => currentCalls.push(args),
  });
  const rows = listRows(element);
  const labels = rows.map((row) => childArray(row.props.children)[0].props.children);
  assert.deepEqual(labels, ["Business", "Services", "Session Preferences", "Payments", "Current settings"]);
  rows.forEach((row) => {
    assert.equal(row.type, "button");
    assert.equal(row.props.type, "button");
    assert.equal(childArray(row.props.children).at(-1).props["aria-hidden"], "true");
    assert.equal(childArray(row.props.children).at(-1).props.children, ">");
  });

  rows[0].props.onClick("ignored");
  rows[2].props.onClick("ignored");
  rows[4].props.onClick("ignored");

  if (hasComponent) {
    assert.deepEqual(categoryCalls, [["business"]]);
    assert.deepEqual(sessionCalls, [[]]);
    assert.deepEqual(currentCalls, [[]]);
  } else {
    assert.deepEqual(globalThis.__SettingsFolderHomeSetterCalls, [
      ["setSettingsReturnCategory", null],
      ["setSelectedSettingsCategory", "business"],
      ["setSelectedSettingsSubsection", null],
      ["setSettingsReturnCategory", null],
      ["setSelectedSettingsCategory", "services"],
      ["setSelectedSettingsSubsection", "Session Preferences"],
      ["setSettingsReturnCategory", null],
      ["setSelectedSettingsCategory", "current"],
      ["setSelectedSettingsSubsection", null],
    ]);
  }
}

console.log("Settings folder home tests passed.");
