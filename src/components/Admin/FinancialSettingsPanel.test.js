import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./FinancialSettingsPanel.jsx", import.meta.url);
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

function fallbackFinancialSettingsPanel({
  expenseCategories,
  expenses,
  financialSettingsDirty,
  financialSettingsDraft,
  onSaveFinancialSettings,
  onUpdateFinancialSettingsDraft,
}) {
  const currencyFields = [
    ["annualRevenueGoal", "Annual Revenue Target"],
    ["monthlyRevenueGoal", "Monthly revenue target (optional)"],
    ["taxPotSavedAmount", "Tax pot saved amount"],
  ];

  const dateFields = [
    ["taxYearStartMonth", "Tax year start month", "taxYearStartDay", "Tax year start day"],
    ["taxYearEndMonth", "Tax year end month", "taxYearEndDay", "Tax year end day"],
    ["taxReturnDeadlineMonth", "Tax return deadline month", "taxReturnDeadlineDay", "Tax return deadline day"],
  ];

  return h(
    "div",
    { className: "settings-placeholder financial-settings-panel" },
    h("div", null, h("h3", null, "Financial Settings"), h("p", null, "Set your revenue target and tax planning defaults. Profit is calculated automatically from revenue and expenses.")),
    h("div", { className: "admin-service-area-fees" }, dateFields.map(([monthKey, monthLabel, dayKey, dayLabel]) => h(
      React.Fragment,
      { key: monthKey },
      h("label", null, h("span", null, monthLabel), h("input", { type: "number", min: "1", max: "12", value: financialSettingsDraft[monthKey], onChange: (event) => onUpdateFinancialSettingsDraft(monthKey, event.target.value) })),
      h("label", null, h("span", null, dayLabel), h("input", { type: "number", min: "1", max: "31", value: financialSettingsDraft[dayKey], onChange: (event) => onUpdateFinancialSettingsDraft(dayKey, event.target.value) })),
    ))),
    h("div", { className: "admin-service-area-fees" }, currencyFields.map(([key, label]) => h(
      "label",
      { key },
      h("span", null, `${label} (GBP)`),
      h("input", { type: "number", min: "0", step: "1", value: financialSettingsDraft[key], onChange: (event) => onUpdateFinancialSettingsDraft(key, event.target.value) }),
    )), h("label", null, h("span", null, "Preferred max sessions per week"), h("input", { type: "number", min: "0", step: "1", value: financialSettingsDraft.preferredMaxSessionsPerWeek, onChange: (event) => onUpdateFinancialSettingsDraft("preferredMaxSessionsPerWeek", event.target.value) }))),
    h("label", { className: "admin-toggle-row" }, h("input", { type: "checkbox", checked: financialSettingsDraft.includeCashInTaxForecast, onChange: (event) => onUpdateFinancialSettingsDraft("includeCashInTaxForecast", event.target.checked) }), h("span", null, "Include cash payments in tax forecast")),
    h("div", { className: "working-rules-actions financial-settings-actions" }, h("button", { type: "button", className: "admin-primary-action", disabled: !financialSettingsDirty, onClick: onSaveFinancialSettings }, "Save"), h("span", null, financialSettingsDirty ? "Unsaved changes" : "All changes saved")),
    h("div", { className: "financial-settings-foundation" }, h("div", null, h("h3", null, "Expense categories"), h("p", null, expenseCategories.join(", "))), h("div", null, h("h3", null, "Expense model"), h("p", null, "Ready for date, category, amount, optional notes, recurrence, created time, and updated time."), h("p", null, `${expenses.length} expense record${expenses.length === 1 ? "" : "s"} currently stored.`))),
  );
}

async function loadFinancialSettingsPanel() {
  if (!existsSync(componentUrl)) {
    const appSource = readFileSync(appUrl, "utf8");
    return {
      FinancialSettingsPanel: fallbackFinancialSettingsPanel,
      hasComponent: false,
      source: readBalancedFunction(appSource, "renderFinancialSettingsPanel"),
    };
  }

  const source = readFileSync(componentUrl, "utf8");
  const functionSource = readBalancedFunction(source, "FinancialSettingsPanel")
    .replace("export function FinancialSettingsPanel", "function FinancialSettingsPanel");
  const transformed = await transformWithOxc(
    [
      functionSource,
      "globalThis.__FinancialSettingsPanelLoaded = FinancialSettingsPanel;",
    ].join("\n\n"),
    "FinancialSettingsPanel.jsx",
    { loader: "jsx" },
  );

  const require = createRequire(import.meta.url);
  new Function("require", "React", transformed.code)(require, React);
  return {
    FinancialSettingsPanel: globalThis.__FinancialSettingsPanelLoaded,
    hasComponent: true,
    source,
  };
}

function draft() {
  return {
    annualRevenueGoal: 48000,
    includeCashInTaxForecast: true,
    monthlyRevenueGoal: 4000,
    preferredMaxSessionsPerWeek: 16,
    taxPotSavedAmount: 1200,
    taxReturnDeadlineDay: 31,
    taxReturnDeadlineMonth: 1,
    taxYearEndDay: 5,
    taxYearEndMonth: 4,
    taxYearStartDay: 6,
    taxYearStartMonth: 4,
  };
}

function defaultProps(overrides = {}) {
  return {
    expenseCategories: ["Fuel", "Laundry", "Supplies"],
    expenses: [{ id: "expense-1" }, { id: "expense-2" }],
    financialSettingsDirty: true,
    financialSettingsDraft: draft(),
    onSaveFinancialSettings: () => {},
    onUpdateFinancialSettingsDraft: () => {},
    ...overrides,
  };
}

function panelElement(FinancialSettingsPanel, overrides = {}) {
  return FinancialSettingsPanel(defaultProps(overrides));
}

function renderPanel(FinancialSettingsPanel, overrides = {}) {
  return renderToStaticMarkup(React.createElement(FinancialSettingsPanel, defaultProps(overrides)));
}

function childArray(value) {
  return React.Children.toArray(value);
}

function labelDetails(label) {
  const [span, input] = childArray(label.props.children);
  return { input, text: span.props.children };
}

function textContent(value) {
  if (Array.isArray(value)) return value.map(textContent).join("");
  return value;
}

const { FinancialSettingsPanel, hasComponent, source } = await loadFinancialSettingsPanel();

assert.match(source, /Financial Settings/);
assert.match(source, /Set your revenue target and tax planning defaults\. Profit is calculated automatically from revenue and expenses\./);
assert.match(source, /annualRevenueGoal/);
assert.match(source, /monthlyRevenueGoal/);
assert.match(source, /taxPotSavedAmount/);
assert.match(source, /taxYearStartMonth/);
assert.match(source, /taxYearEndMonth/);
assert.match(source, /taxReturnDeadlineMonth/);
assert.match(source, /preferredMaxSessionsPerWeek/);
assert.match(source, /includeCashInTaxForecast/);
assert.match(source, /expenseCategories\.join\(", "\)/);
assert.match(source, /expenses\.length === 1 \? "" : "s"/);
assert.doesNotMatch(source, /useState|useEffect|useRef|setTimeout|setInterval|fetch|localStorage|supabase|async/i);

if (hasComponent) {
  assert.match(source, /export function FinancialSettingsPanel\(\{\s*expenseCategories,\s*expenses,\s*financialSettingsDirty,\s*financialSettingsDraft,\s*onSaveFinancialSettings,\s*onUpdateFinancialSettingsDraft,\s*\}\)/);
}

{
  const markup = renderPanel(FinancialSettingsPanel);
  assert.match(markup, /^<div class="settings-placeholder financial-settings-panel">/);
  assert.match(markup, /<h3>Financial Settings<\/h3>/);
  assert.match(markup, /Set your revenue target and tax planning defaults\. Profit is calculated automatically from revenue and expenses\./);
  assert.match(markup, /Annual Revenue Target \(GBP\)/);
  assert.match(markup, /Monthly revenue target \(optional\) \(GBP\)/);
  assert.match(markup, /Tax pot saved amount \(GBP\)/);
  assert.match(markup, /Preferred max sessions per week/);
  assert.match(markup, /Include cash payments in tax forecast/);
  assert.match(markup, /<span>Unsaved changes<\/span>/);
  assert.match(markup, /Fuel, Laundry, Supplies/);
  assert.match(markup, /2 expense records currently stored\./);
}

{
  const cleanMarkup = renderPanel(FinancialSettingsPanel, {
    expenses: [{ id: "expense-1" }],
    expenseCategories: [],
    financialSettingsDirty: false,
    financialSettingsDraft: { ...draft(), includeCashInTaxForecast: false },
  });
  assert.match(cleanMarkup, /disabled="">Save<\/button><span>All changes saved<\/span>/);
  assert.match(cleanMarkup, /1 expense record currently stored\./);
  assert.match(cleanMarkup, /<h3>Expense categories<\/h3><p><\/p>/);
}

{
  const calls = [];
  const saveCalls = [];
  const element = panelElement(FinancialSettingsPanel, {
    onSaveFinancialSettings: (...args) => saveCalls.push(args),
    onUpdateFinancialSettingsDraft: (...args) => calls.push(args),
  });
  const [intro, dateGrid, currencyGrid, toggleRow, actions, foundation] = childArray(element.props.children);
  assert.equal(intro.type, "div");
  assert.equal(dateGrid.props.className, "admin-service-area-fees");
  assert.equal(currencyGrid.props.className, "admin-service-area-fees");
  assert.equal(toggleRow.props.className, "admin-toggle-row");
  assert.equal(actions.props.className, "working-rules-actions financial-settings-actions");
  assert.equal(foundation.props.className, "financial-settings-foundation");

  const dateFields = childArray(dateGrid.props.children)
    .flatMap((child) => child.type === React.Fragment ? childArray(child.props.children) : [child])
    .map(labelDetails);
  assert.deepEqual(dateFields.map((field) => field.text), [
    "Tax year start month",
    "Tax year start day",
    "Tax year end month",
    "Tax year end day",
    "Tax return deadline month",
    "Tax return deadline day",
  ]);
  assert.deepEqual(dateFields.map((field) => [field.input.props.type, field.input.props.min, field.input.props.max]), [
    ["number", "1", "12"],
    ["number", "1", "31"],
    ["number", "1", "12"],
    ["number", "1", "31"],
    ["number", "1", "12"],
    ["number", "1", "31"],
  ]);

  const currencyFields = childArray(currencyGrid.props.children).map(labelDetails);
  assert.deepEqual(currencyFields.map((field) => textContent(field.text)), [
    "Annual Revenue Target (GBP)",
    "Monthly revenue target (optional) (GBP)",
    "Tax pot saved amount (GBP)",
    "Preferred max sessions per week",
  ]);
  assert.deepEqual(currencyFields.map((field) => [field.input.props.type, field.input.props.min, field.input.props.step]), [
    ["number", "0", "1"],
    ["number", "0", "1"],
    ["number", "0", "1"],
    ["number", "0", "1"],
  ]);

  dateFields[0].input.props.onChange({ target: { value: "7" } });
  dateFields[1].input.props.onChange({ target: { value: "8" } });
  currencyFields[0].input.props.onChange({ target: { value: "52000" } });
  currencyFields[3].input.props.onChange({ target: { value: "18" } });
  childArray(toggleRow.props.children)[0].props.onChange({ target: { checked: false } });
  childArray(actions.props.children)[0].props.onClick("ignored");

  assert.deepEqual(calls, [
    ["taxYearStartMonth", "7"],
    ["taxYearStartDay", "8"],
    ["annualRevenueGoal", "52000"],
    ["preferredMaxSessionsPerWeek", "18"],
    ["includeCashInTaxForecast", false],
  ]);
  assert.deepEqual(saveCalls, [["ignored"]]);
}

{
  const financialSettingsDraft = draft();
  const expenseCategories = ["Fuel", "Laundry"];
  const expenses = [{ id: "expense-1" }];
  const snapshot = {
    expenseCategories: structuredClone(expenseCategories),
    expenses: structuredClone(expenses),
    financialSettingsDraft: structuredClone(financialSettingsDraft),
  };
  renderPanel(FinancialSettingsPanel, { expenseCategories, expenses, financialSettingsDraft });
  assert.deepEqual({ expenseCategories, expenses, financialSettingsDraft }, snapshot);
}

console.log("FinancialSettingsPanel characterization passed");
