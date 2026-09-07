import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const h = React.createElement;
const componentUrl = new URL("./SettingsFolderNavigator.jsx", import.meta.url);
const homeUrl = new URL("./SettingsFolderHome.jsx", import.meta.url);
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

async function loadSettingsFolderHome() {
  const source = readFileSync(homeUrl, "utf8");
  const functionSource = readBalancedFunction(source, "SettingsFolderHome")
    .replace("export function SettingsFolderHome", "function SettingsFolderHome");
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
  return globalThis.__SettingsFolderHomeLoaded;
}

function fallbackSettingsFolderNavigator({
  activeCategory,
  categories,
  renderCurrentSettingsContent,
  renderSubsectionContent,
  selectedCategoryId,
  selectedSubsection,
  settingsReturnCategory,
  onBackFromCategory,
  onBackFromCurrentSettings,
  onBackFromSubsection,
  onOpenCategory,
  onOpenCurrentSettings,
  onOpenSessionPreferences,
  onOpenSubsection,
}) {
  void settingsReturnCategory;
  return h(
    "section",
    { className: "admin-screen settings-folder-shell" },
    selectedSubsection
      ? h(React.Fragment, null,
          h("div", { className: "settings-folder-header" },
            h("button", { type: "button", className: "settings-folder-back", onClick: () => onBackFromSubsection() },
              h("span", { "aria-hidden": "true" }, "<"),
              "Back",
            ),
            h("div", null,
              h("p", null, activeCategory?.label ?? "Settings"),
              h("h2", null, selectedSubsection),
            ),
          ),
          renderSubsectionContent(),
        )
      : selectedCategoryId === "current"
        ? h("div", { className: "settings-current-content" },
            h("div", { className: "settings-folder-header" },
              h("button", { type: "button", className: "settings-folder-back", onClick: () => onBackFromCurrentSettings() },
                h("span", { "aria-hidden": "true" }, "<"),
                "Back",
              ),
              h("div", null,
                h("p", null, "Settings"),
                h("h2", null, "Current settings"),
              ),
            ),
            renderCurrentSettingsContent(),
          )
        : activeCategory
          ? h(React.Fragment, null,
              h("div", { className: "settings-folder-header" },
                h("button", { type: "button", className: "settings-folder-back", onClick: () => onBackFromCategory() },
                  h("span", { "aria-hidden": "true" }, "<"),
                  "Back",
                ),
                h("div", null,
                  h("p", null, "Settings"),
                  h("h2", null, activeCategory.label),
                ),
              ),
              h("div", { className: "settings-folder-list" },
                activeCategory.sections.map((section) => h(
                  "button",
                  {
                    type: "button",
                    className: "settings-folder-row",
                    key: section,
                    onClick: () => onOpenSubsection(section),
                  },
                  h("span", null, section),
                  h("span", { "aria-hidden": "true" }, ">"),
                )),
              ),
            )
          : h(SettingsFolderHome, {
              categories,
              onOpenCategory,
              onOpenSessionPreferences,
              onOpenCurrentSettings,
            }),
  );
}

async function loadSettingsFolderNavigator(SettingsFolderHome) {
  if (!existsSync(componentUrl)) {
    return {
      SettingsFolderNavigator: fallbackSettingsFolderNavigator,
      hasComponent: false,
      source: readFileSync(appUrl, "utf8"),
    };
  }

  const source = readFileSync(componentUrl, "utf8");
  const functionSource = readBalancedFunction(source, "SettingsFolderNavigator")
    .replace("export function SettingsFolderNavigator", "function SettingsFolderNavigator");
  const transformed = await transformWithOxc(
    [
      functionSource,
      "globalThis.__SettingsFolderNavigatorLoaded = SettingsFolderNavigator;",
    ].join("\n\n"),
    "SettingsFolderNavigator.jsx",
    { loader: "jsx" },
  );

  const require = createRequire(import.meta.url);
  new Function("require", "React", "SettingsFolderHome", transformed.code)(require, React, SettingsFolderHome);
  return {
    SettingsFolderNavigator: globalThis.__SettingsFolderNavigatorLoaded,
    hasComponent: true,
    source,
  };
}

function categories() {
  return [
    { id: "business", label: "Business", sections: ["Profile", "Policies"] },
    { id: "services", label: "Services", sections: ["Treatments", "Enhancements"] },
    { id: "payments", label: "Payments", sections: ["Payment Methods", "Payment Statuses", "Pay Later"] },
  ];
}

function renderers() {
  const calls = { current: 0, subsection: 0 };
  return {
    calls,
    renderCurrentSettingsContent: () => {
      calls.current += 1;
      return h("div", { "data-panel": "current" }, "Current body");
    },
    renderSubsectionContent: () => {
      calls.subsection += 1;
      return h("div", { "data-panel": "subsection" }, "Subsection body");
    },
  };
}

function defaultProps(overrides = {}) {
  const rendererSet = renderers();
  return {
    props: {
      activeCategory: null,
      categories: categories(),
      selectedCategoryId: null,
      selectedSubsection: null,
      settingsReturnCategory: null,
      onBackFromCategory: () => {},
      onBackFromCurrentSettings: () => {},
      onBackFromSubsection: () => {},
      onOpenCategory: () => {},
      onOpenCurrentSettings: () => {},
      onOpenSessionPreferences: () => {},
      onOpenSubsection: () => {},
      ...rendererSet,
      ...overrides,
    },
    calls: rendererSet.calls,
  };
}

function childArray(value) {
  return React.Children.toArray(value);
}

const SettingsFolderHome = await loadSettingsFolderHome();
const { SettingsFolderNavigator, hasComponent, source } = await loadSettingsFolderNavigator(SettingsFolderHome);

assert.match(source, /settings-folder-shell/);
assert.match(source, /settings-folder-header/);
assert.match(source, /settings-folder-back/);
assert.match(source, /settings-current-content/);
assert.match(source, /settings-folder-list/);
assert.match(source, /settings-folder-row/);

if (hasComponent) {
  assert.doesNotMatch(source, /useState|useEffect|useRef|setTimeout|setInterval|fetch|localStorage|supabase|async/i);
  assert.match(source, /import \{ SettingsFolderHome \} from "\.\/SettingsFolderHome\.jsx";/);
  assert.match(source, /export function SettingsFolderNavigator\(\{\s*activeCategory,\s*categories,\s*renderCurrentSettingsContent,\s*renderSubsectionContent,\s*selectedCategoryId,\s*selectedSubsection,\s*settingsReturnCategory,\s*onBackFromCategory,\s*onBackFromCurrentSettings,\s*onBackFromSubsection,\s*onOpenCategory,\s*onOpenCurrentSettings,\s*onOpenSessionPreferences,\s*onOpenSubsection,\s*\}\)/);
  assert.match(source, /\{selectedSubsection \? \(/);
  assert.match(source, /\) : selectedCategoryId === "current" \? \(/);
  assert.match(source, /\) : activeCategory \? \(/);
  assert.match(source, /\) : \(\s*<SettingsFolderHome/);
} else {
  assert.match(source, /\{selectedSettingsSubsection \? \(/);
  assert.match(source, /\) : selectedSettingsCategory === "current" \? \(/);
  assert.match(source, /\) : activeSettingsCategory \? \(/);
  assert.match(source, /\) : \(\s*<SettingsFolderHome/);
  assert.match(source, /onClick=\{\(\) => setSelectedSettingsSubsection\(null\)\}/);
  assert.match(source, /if \(settingsReturnCategory\) \{\s*returnToSettingsCategory\(\);\s*return;\s*\}\s*setSelectedSettingsCategory\(null\);/);
  assert.match(source, /onClick=\{\(\) => setSelectedSettingsCategory\(null\)\}/);
  assert.match(source, /onClick=\{\(\) => openSettingsSubsection\(section\)\}/);
}

{
  const { props, calls } = defaultProps({
    activeCategory: { id: "payments", label: "Payments", sections: ["Payment Methods"] },
    selectedCategoryId: "current",
    selectedSubsection: "Payment Methods",
  });
  const markup = renderToStaticMarkup(h(SettingsFolderNavigator, props));
  assert.match(markup, /^<section class="admin-screen settings-folder-shell">/);
  assert.match(markup, /<p>Payments<\/p><h2>Payment Methods<\/h2>/);
  assert.match(markup, /data-panel="subsection"/);
  assert.doesNotMatch(markup, /data-panel="current"/);
  assert.deepEqual(calls, { current: 0, subsection: 1 });
}

{
  const calls = [];
  const { props } = defaultProps({
    activeCategory: { id: "payments", label: "Payments", sections: ["Payment Methods"] },
    selectedSubsection: "Payment Methods",
    onBackFromSubsection: (...args) => calls.push(args),
  });
  const element = SettingsFolderNavigator(props);
  const [content] = childArray(element.props.children);
  const [header] = childArray(content.props.children);
  const [button] = childArray(header.props.children);
  button.props.onClick("ignored");
  assert.deepEqual(calls, [[]]);
}

{
  const { props, calls } = defaultProps({ selectedCategoryId: "current" });
  const markup = renderToStaticMarkup(h(SettingsFolderNavigator, props));
  assert.match(markup, /<div class="settings-current-content">/);
  assert.match(markup, /<p>Settings<\/p><h2>Current settings<\/h2>/);
  assert.match(markup, /data-panel="current"/);
  assert.doesNotMatch(markup, /data-panel="subsection"/);
  assert.deepEqual(calls, { current: 1, subsection: 0 });
}

{
  const calls = [];
  const { props } = defaultProps({
    selectedCategoryId: "current",
    settingsReturnCategory: "scheduling",
    onBackFromCurrentSettings: (...args) => calls.push(args),
  });
  const element = SettingsFolderNavigator(props);
  const [content] = childArray(element.props.children);
  const [header] = childArray(content.props.children);
  const [button] = childArray(header.props.children);
  button.props.onClick("ignored");
  assert.deepEqual(calls, [[]]);
}

{
  const { props, calls } = defaultProps({
    activeCategory: { id: "payments", label: "Payments", sections: ["Payment Methods", "Payment Statuses", "Pay Later"] },
    selectedCategoryId: "payments",
    renderCurrentSettingsContent: () => {
      throw new Error("Current settings should be lazy");
    },
    renderSubsectionContent: () => {
      throw new Error("Subsection should be lazy");
    },
  });
  const sectionCalls = [];
  props.onOpenSubsection = (...args) => sectionCalls.push(args);
  const markup = renderToStaticMarkup(h(SettingsFolderNavigator, props));
  assert.match(markup, /<p>Settings<\/p><h2>Payments<\/h2>/);
  assert.equal(markup.indexOf("<span>Payment Methods</span>") < markup.indexOf("<span>Payment Statuses</span>"), true);
  assert.equal(markup.indexOf("<span>Payment Statuses</span>") < markup.indexOf("<span>Pay Later</span>"), true);
  assert.deepEqual(calls, { current: 0, subsection: 0 });

  const element = SettingsFolderNavigator(props);
  const content = childArray(element.props.children)[0];
  const rows = childArray(childArray(content.props.children)[1].props.children);
  rows[1].props.onClick("ignored");
  assert.deepEqual(sectionCalls, [["Payment Statuses"]]);
}

{
  const categoryCalls = [];
  const sessionCalls = [];
  const currentCalls = [];
  const suppliedCategories = categories();
  const snapshot = structuredClone(suppliedCategories);
  const { props, calls } = defaultProps({
    selectedCategoryId: "missing",
    categories: suppliedCategories,
    renderCurrentSettingsContent: () => {
      throw new Error("Current settings should be lazy");
    },
    renderSubsectionContent: () => {
      throw new Error("Subsection should be lazy");
    },
    onOpenCategory: (...args) => categoryCalls.push(args),
    onOpenSessionPreferences: (...args) => sessionCalls.push(args),
    onOpenCurrentSettings: (...args) => currentCalls.push(args),
  });
  const markup = renderToStaticMarkup(h(SettingsFolderNavigator, props));
  assert.match(markup, /<h2>Settings<\/h2>/);
  assert.equal(markup.indexOf("<span>Services</span>") < markup.indexOf("<span>Session Preferences</span>"), true);
  assert.equal(markup.indexOf("<span>Session Preferences</span>") < markup.indexOf("<span>Payments</span>"), true);
  assert.equal(markup.lastIndexOf("<span>Current settings</span>") > markup.indexOf("<span>Payments</span>"), true);
  assert.deepEqual(calls, { current: 0, subsection: 0 });
  assert.deepEqual(suppliedCategories, snapshot);

  const element = SettingsFolderNavigator(props);
  const homeElement = childArray(element.props.children)[0];
  const home = homeElement.type(homeElement.props);
  const rows = childArray(childArray(home.props.children)[1].props.children).flatMap((child) => {
    if (child.type === React.Fragment) return childArray(child.props.children);
    return [child];
  }).filter(Boolean);
  rows[0].props.onClick("ignored");
  rows[2].props.onClick("ignored");
  rows[4].props.onClick("ignored");
  assert.deepEqual(categoryCalls, [["business"]]);
  assert.deepEqual(sessionCalls, [[]]);
  assert.deepEqual(currentCalls, [[]]);
}

console.log("Settings folder navigator tests passed.");
