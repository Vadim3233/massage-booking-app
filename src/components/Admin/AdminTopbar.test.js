import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./AdminTopbar.jsx", import.meta.url);
const appUrl = new URL("../../App.jsx", import.meta.url);

function appSource() {
  return readFileSync(appUrl, "utf8");
}

function componentSource() {
  return readFileSync(componentUrl, "utf8");
}

function readTopbarSourceFromApp() {
  const source = appSource();
  const start = source.indexOf('<header className="admin-topbar">');
  assert.notEqual(start, -1, "inline admin topbar should exist before extraction");

  const endMarker = "</header>";
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, "inline admin topbar should end with </header>");

  return source.slice(start, end + endMarker.length);
}

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

function assertSourceShape(source) {
  assert.match(source, /className="admin-topbar"/);
  assert.match(source, /className="admin-menu-button"/);
  assert.match(source, /aria-label="Open menu"/);
  assert.match(source, /<span \/>\s*<span \/>\s*<span \/>/s);
  assert.match(source, /<p>VAD MASSAGE<\/p>/);
  assert.match(source, /<h1>\{(?:ADMIN_TABS|tabs)\.find\(\(tab\) => tab\.id === activeTab\)\?\.label\}<\/h1>/);
  assert.match(source, /activeTab === "calendar"/);
  assert.match(source, /agenda: "Agenda view"/);
  assert.match(source, /day: "Day view"/);
  assert.match(source, /"three-day": "3-day view"/);
  assert.match(source, /week: "Week view"/);
  assert.match(source, /month: "Month view"/);
  assert.match(source, /year: "Year view"/);
  assert.match(source, /\}\[calendarMode\] \|\| "Agenda view"/);
  assert.match(source, /className="top-action-cluster"/);
  assert.match(source, /className="admin-client-link square-green-action"/);
  assert.match(source, />Client<\/button>/);
}

async function loadAdminTopbar() {
  const source = componentSource();
  const functionSource = readBalancedFunction(source, "AdminTopbar")
    .replace("export function AdminTopbar", "function AdminTopbar");
  const transformed = await transformWithOxc(
    [
      functionSource,
      "globalThis.__AdminTopbarLoaded = AdminTopbar;",
    ].join("\n\n"),
    "AdminTopbar.jsx",
    { loader: "jsx" },
  );

  const require = createRequire(import.meta.url);
  new Function("require", transformed.code)(require);
  return { AdminTopbar: globalThis.__AdminTopbarLoaded };
}

function createTabs() {
  return [
    { id: "calendar", label: "Calendar" },
    { id: "customers", label: "Clients" },
    { id: "pending", label: "Pending" },
  ];
}

function markupFor(props = {}) {
  return renderToStaticMarkup(React.createElement(props.AdminTopbar, {
    activeTab: "calendar",
    calendarMode: "agenda",
    onOpenMenu: () => {},
    onSwitchClient: () => {},
    tabs: createTabs(),
    ...props,
  }));
}

function childArray(value) {
  return React.Children.toArray(value);
}

if (!existsSync(componentUrl)) {
  const topbarSource = readTopbarSourceFromApp();

  assertSourceShape(topbarSource);
  assert.match(topbarSource, /onClick=\{\(\) => setSideMenuOpen\(true\)\}/);
  assert.match(topbarSource, /onClick=\{\(\) => onSetActiveView\("client"\)\}/);
  assert.equal(topbarSource.indexOf('className="admin-menu-button"') < topbarSource.indexOf("<p>VAD MASSAGE</p>"), true);
  assert.equal(topbarSource.indexOf("<p>VAD MASSAGE</p>") < topbarSource.indexOf(">Client</button>"), true);
} else {
  const source = componentSource();
  assertSourceShape(source);
  assert.match(source, /export function AdminTopbar\(\{\s*activeTab,\s*calendarMode,\s*tabs,\s*onOpenMenu,\s*onSwitchClient,\s*\}\)/);
  assert.doesNotMatch(source, /useState|useEffect|useRef|setTimeout|setInterval|fetch|localStorage|supabase/i);
  assert.doesNotMatch(source, /ADMIN_TABS/);

  const { AdminTopbar } = await loadAdminTopbar();

  for (const [mode, subtitle] of [
    ["agenda", "Agenda view"],
    ["day", "Day view"],
    ["three-day", "3-day view"],
    ["week", "Week view"],
    ["month", "Month view"],
    ["year", "Year view"],
    ["missing", "Agenda view"],
    [undefined, "Agenda view"],
  ]) {
    const markup = markupFor({ AdminTopbar, calendarMode: mode });
    assert.match(markup, /<header class="admin-topbar">/);
    assert.match(markup, /<button type="button" class="admin-menu-button" aria-label="Open menu"><span><\/span><span><\/span><span><\/span><\/button>/);
    assert.match(markup, /<p>VAD MASSAGE<\/p>/);
    assert.match(markup, /<h1>Calendar<\/h1>/);
    assert.match(markup, new RegExp(`<span class="admin-view-subtitle">${subtitle}</span>`));
    assert.match(markup, /<div class="top-action-cluster"><button type="button" class="admin-client-link square-green-action">Client<\/button><\/div>/);
  }

  const clientsMarkup = markupFor({ AdminTopbar, activeTab: "customers", calendarMode: "week" });
  assert.match(clientsMarkup, /<h1>Clients<\/h1>/);
  assert.doesNotMatch(clientsMarkup, /admin-view-subtitle/);

  const missingMarkup = markupFor({ AdminTopbar, activeTab: "missing" });
  assert.match(missingMarkup, /<h1><\/h1>/);

  const menuCalls = [];
  const clientCalls = [];
  const element = AdminTopbar({
    activeTab: "calendar",
    calendarMode: "agenda",
    onOpenMenu: (...args) => menuCalls.push(args),
    onSwitchClient: (...args) => clientCalls.push(args),
    tabs: createTabs(),
  });
  const [menuButton, , actionCluster] = childArray(element.props.children);
  const [clientButton] = childArray(actionCluster.props.children);

  menuButton.props.onClick("ignored");
  clientButton.props.onClick("ignored");

  assert.deepEqual(menuCalls, [[]]);
  assert.deepEqual(clientCalls, [[]]);
}

console.log("Admin topbar tests passed.");
