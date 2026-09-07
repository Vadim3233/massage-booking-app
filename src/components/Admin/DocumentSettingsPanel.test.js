import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const componentUrl = new URL("./DocumentSettingsPanel.jsx", import.meta.url);
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

async function loadDocumentSettingsPanel() {
  let source = "";
  let functionSource = "";

  if (existsSync(componentUrl)) {
    source = readFileSync(componentUrl, "utf8");
    functionSource = source
      .replace(/^import React from "react";\r?\n\r?\n/, "")
      .replace("export function DocumentSettingsPanel", "function DocumentSettingsPanel");
  } else {
    const appSource = readFileSync(appUrl, "utf8");
    source = [
      readBalancedFunction(appSource, "renderDocumentTextField"),
      readBalancedFunction(appSource, "renderDocumentSelectField"),
      readBalancedFunction(appSource, "renderDocumentToggle"),
      readBalancedFunction(appSource, "renderDocumentGroup"),
      readBalancedFunction(appSource, "renderDocumentSettingsPanel"),
    ].join("\n\n");
    functionSource = [
      "function DocumentSettingsPanel({ selectedSection, documentSettings, onUpdateDocumentSetting }) {",
      source
        .replace("function renderDocumentSettingsPanel() {", "function renderDocumentSettingsPanel() {")
        .replace("const section = selectedSettingsSubsection;", "const section = selectedSection;"),
      "return renderDocumentSettingsPanel();",
      "}",
    ].join("\n\n");
  }

  const transformed = await transformWithOxc(
    [
      functionSource,
      "globalThis.__DocumentSettingsPanelLoaded = DocumentSettingsPanel;",
    ].join("\n\n"),
    "DocumentSettingsPanel.jsx",
    { loader: "jsx" },
  );

  const require = createRequire(import.meta.url);
  new Function("require", "React", transformed.code)(require, React);
  return {
    DocumentSettingsPanel: globalThis.__DocumentSettingsPanelLoaded,
    hasComponent: existsSync(componentUrl),
    source,
  };
}

function documentSettings() {
  return {
    addressLine1: "1 Studio Lane",
    addressLine2: "Suite 4",
    bankAccountName: "VadMassage Ltd",
    bankAccountNumber: "12345678",
    bankName: "Test Bank",
    bankSortCode: "12-34-56",
    bookingReferenceLabel: "Booking reference",
    businessName: "VadMassage",
    cancellationFeeText: "Late cancellations may be charged.",
    cancellationNoticeHours: "24",
    cancellationText: "Free cancellation is available more than 24 hours before.",
    city: "London",
    companyNumber: "12345678",
    country: "United Kingdom",
    currency: "GBP",
    email: "hello@example.test",
    emailCc: "accounts@example.test",
    emailIntro: "Thank you for your booking.",
    emailReplyTo: "reply@example.test",
    emailSignature: "VadMassage",
    emailSubject: "Your VadMassage receipt",
    invoiceDueDays: "14",
    invoiceFooter: "Invoice footer text",
    invoicePrefix: "INV",
    latePaymentText: "Please pay on time.",
    legalName: "VadMassage Legal",
    logoUrl: "https://example.test/logo.png",
    nextInvoiceNumber: "2001",
    nextReceiptNumber: "1001",
    noShowText: "No-show wording",
    ownerName: "Vadim",
    paymentInstructions: "Bank transfer preferred.",
    paymentTerms: "Payment is due on receipt.",
    phone: "07000 000000",
    postcode: "W1A 1AA",
    receiptFooter: "Thank you.",
    receiptPrefix: "VDM",
    sendReceiptAutomatically: true,
    showBookingReference: true,
    showBusinessAddress: true,
    showClientAddress: true,
    showPaymentMethod: true,
    showServiceBreakdown: true,
    showTravelCharges: true,
    showVat: true,
    taxLabel: "VAT",
    utrNumber: "UTR123",
    vatNumber: "GB123",
    website: "https://example.test",
  };
}

function renderPanel(DocumentSettingsPanel, selectedSection, overrides = {}) {
  return renderToStaticMarkup(React.createElement(DocumentSettingsPanel, {
    selectedSection,
    documentSettings: documentSettings(),
    onUpdateDocumentSetting: () => {},
    ...overrides,
  }));
}

function panelElement(DocumentSettingsPanel, selectedSection, overrides = {}) {
  return DocumentSettingsPanel({
    selectedSection,
    documentSettings: documentSettings(),
    onUpdateDocumentSetting: () => {},
    ...overrides,
  });
}

function childArray(value) {
  return React.Children.toArray(value);
}

function flattenElements(value, results = []) {
  for (const child of childArray(value)) {
    if (!React.isValidElement(child)) continue;
    results.push(child);
    flattenElements(child.props.children, results);
  }
  return results;
}

function textContent(value) {
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (React.isValidElement(value)) return textContent(value.props.children);
  return value == null ? "" : String(value);
}

function labels(element) {
  return flattenElements(element.props.children)
    .filter((item) => item.type === "label")
    .map((label) => textContent(childArray(label.props.children)[0]));
}

function controlsByLabel(element) {
  const map = new Map();
  for (const label of flattenElements(element.props.children).filter((item) => item.type === "label")) {
    const children = childArray(label.props.children);
    map.set(textContent(children[0]), children.find((child) => React.isValidElement(child) && ["input", "textarea", "select"].includes(child.type)));
  }
  return map;
}

function sectionSummaries(element) {
  return childArray(element.props.children)
    .filter((child) => child.type === "section")
    .map((section) => {
      const [heading, grid] = childArray(section.props.children);
      return {
        className: section.props.className,
        description: textContent(childArray(heading.props.children)[1]),
        labels: labels(grid),
        title: textContent(childArray(heading.props.children)[0]),
      };
    });
}

function assertCallback(control, calls, field, value, valueKey = "value") {
  control.props.onChange({ target: { [valueKey]: value } });
  assert.deepEqual(calls.at(-1), [field, value]);
}

const { DocumentSettingsPanel, hasComponent, source } = await loadDocumentSettingsPanel();

assert.match(source, /Business Details/);
assert.match(source, /Receipt Layout/);
assert.match(source, /Invoice Settings/);
assert.match(source, /Email Receipt Template/);
assert.match(source, /Cancellation Text/);
assert.match(source, /renderDocumentTextField/);
assert.match(source, /renderDocumentSelectField/);
assert.match(source, /renderDocumentToggle/);
assert.match(source, /renderDocumentGroup/);
assert.match(source, /documentSettings\[key\] \?\? ""/);
assert.match(source, /onUpdateDocumentSetting\(key, event\.target\.value\)/);
assert.match(source, /onUpdateDocumentSetting\(key, event\.target\.checked\)/);
assert.doesNotMatch(source, /useState|useEffect|useRef|setTimeout|setInterval|fetch|localStorage|supabase|async|notify|postTransactionalEmail|postTelegram/i);

if (hasComponent) {
  assert.match(source, /export function DocumentSettingsPanel\(\{\s*selectedSection,\s*documentSettings,\s*onUpdateDocumentSetting,\s*\}\)/);
}

{
  assert.equal(renderPanel(DocumentSettingsPanel, "Unknown"), "");
  assert.equal(renderPanel(DocumentSettingsPanel, ""), "");
  assert.equal(renderPanel(DocumentSettingsPanel), "");
}

{
  const element = panelElement(DocumentSettingsPanel, "Business Details");
  assert.equal(element.props.className, "document-settings-panel");
  const [intro] = childArray(element.props.children);
  assert.equal(textContent(childArray(intro.props.children)[0]), "Business Details");
  assert.equal(textContent(childArray(intro.props.children)[1]), "These details appear on receipts, invoices, payment confirmations, and client emails.");
  assert.deepEqual(sectionSummaries(element), [
    {
      className: "document-settings-group",
      title: "Business identity",
      description: "The name and brand shown at the top of every document.",
      labels: ["Trading name", "Legal name", "Owner / therapist name", "Logo / brand mark URL"],
    },
    {
      className: "document-settings-group",
      title: "Contact and address",
      description: "Shown when clients need to contact you or keep a formal record.",
      labels: ["Business email", "Business phone", "Website", "Address line 1", "Address line 2", "City", "Postcode", "Country", "Show business address on documentsUseful for invoices and formal receipts."],
    },
    {
      className: "document-settings-group",
      title: "Tax and registration",
      description: "Optional business references for invoices, receipts, and your records.",
      labels: ["Company number", "UTR / tax reference", "VAT number", "Currency", "Tax label", "Show VAT on receiptsTurn on only if VAT registered."],
    },
  ]);

  const controls = controlsByLabel(element);
  assert.equal(controls.get("Business email").props.type, "email");
  assert.equal(controls.get("Business phone").props.type, "tel");
  assert.deepEqual(childArray(controls.get("Currency").props.children).map((option) => [option.props.value, option.props.children]), [
    ["GBP", "GBP - Pound sterling"],
    ["EUR", "EUR - Euro"],
    ["USD", "USD - US dollar"],
  ]);
  assert.equal(controls.get("Show VAT on receiptsTurn on only if VAT registered.").props.type, "checkbox");
}

{
  const calls = [];
  const element = panelElement(DocumentSettingsPanel, "Business Details", { onUpdateDocumentSetting: (...args) => calls.push(args) });
  const controls = controlsByLabel(element);
  for (const [label, field] of [
    ["Trading name", "businessName"],
    ["Legal name", "legalName"],
    ["Owner / therapist name", "ownerName"],
    ["Logo / brand mark URL", "logoUrl"],
    ["Business email", "email"],
    ["Business phone", "phone"],
    ["Website", "website"],
    ["Address line 1", "addressLine1"],
    ["Address line 2", "addressLine2"],
    ["City", "city"],
    ["Postcode", "postcode"],
    ["Country", "country"],
    ["Company number", "companyNumber"],
    ["UTR / tax reference", "utrNumber"],
    ["VAT number", "vatNumber"],
    ["Tax label", "taxLabel"],
  ]) {
    assertCallback(controls.get(label), calls, field, "  preserved text  ");
  }
  assertCallback(controls.get("Currency"), calls, "currency", "EUR");
  assertCallback(controls.get("Show business address on documentsUseful for invoices and formal receipts."), calls, "showBusinessAddress", false, "checked");
  assertCallback(controls.get("Show VAT on receiptsTurn on only if VAT registered."), calls, "showVat", false, "checked");
}

{
  const element = panelElement(DocumentSettingsPanel, "Receipt Layout");
  const markup = renderPanel(DocumentSettingsPanel, "Receipt Layout");
  assert.equal(element.props.className, "document-settings-panel receipt-layout-editor");
  assert.match(markup, /aria-label="Editable receipt preview"/);
  assert.match(markup, /Receipt<\/strong><small>VDM-1001<\/small>/);
  assert.match(markup, /V<\/div><div class="receipt-header-fields"/);
  assert.match(markup, /Mrs Amelia Hart/);
  assert.match(markup, /14 Oak Avenue, London/);
  assert.match(markup, /VDM-2026-1487/);
  assert.match(markup, /Paid by card/);
  assert.match(markup, /Massage, 90m/);
  assert.match(markup, /Indian head massage add-on/);
  assert.match(markup, /Travel \/ congestion charge/);
  assert.match(markup, /Total paid/);
  assert.match(markup, /£153/);
  assert.match(markup, /Included where applicable/);
  assert.deepEqual(labels(element), [
    "Business name",
    "Receipt email",
    "Business phone",
    "Prefix",
    "Next number",
    "Business address shown on receipt",
    "Reference label",
    "Payment note",
    "Receipt footer",
    "Service breakdownShow treatment, duration, add-ons, and totals.",
    "Travel chargesShow travel or congestion charges as their own line.",
    "Payment methodShow how the receipt was paid.",
    "Booking referenceShow the original booking reference on receipts.",
    "Client addressShow the client address on receipts.",
    "Business addressShow your business address in the receipt header.",
  ]);
}

{
  const hiddenMarkup = renderPanel(DocumentSettingsPanel, "Receipt Layout", {
    documentSettings: {
      ...documentSettings(),
      businessName: "",
      nextReceiptNumber: "",
      receiptPrefix: "",
      showBookingReference: false,
      showBusinessAddress: false,
      showClientAddress: false,
      showPaymentMethod: false,
      showServiceBreakdown: false,
      showTravelCharges: false,
      showVat: false,
    },
  });
  assert.match(hiddenMarkup, /Receipt<\/strong><small>VDM-1001<\/small>/);
  assert.doesNotMatch(hiddenMarkup, /Business address shown on receipt/);
  assert.doesNotMatch(hiddenMarkup, /Reference label/);
  assert.doesNotMatch(hiddenMarkup, /14 Oak Avenue/);
  assert.doesNotMatch(hiddenMarkup, /Paid by card/);
  assert.doesNotMatch(hiddenMarkup, /receipt-line-items/);
  assert.doesNotMatch(hiddenMarkup, /Included where applicable/);
}

{
  const calls = [];
  const element = panelElement(DocumentSettingsPanel, "Receipt Layout", { onUpdateDocumentSetting: (...args) => calls.push(args) });
  const controls = controlsByLabel(element);
  for (const [label, field] of [
    ["Business name", "businessName"],
    ["Receipt email", "email"],
    ["Business phone", "phone"],
    ["Prefix", "receiptPrefix"],
    ["Next number", "nextReceiptNumber"],
    ["Business address shown on receipt", "addressLine1"],
    ["Reference label", "bookingReferenceLabel"],
    ["Payment note", "paymentInstructions"],
    ["Receipt footer", "receiptFooter"],
  ]) {
    assertCallback(controls.get(label), calls, field, "");
  }
  for (const [label, field] of [
    ["Service breakdownShow treatment, duration, add-ons, and totals.", "showServiceBreakdown"],
    ["Travel chargesShow travel or congestion charges as their own line.", "showTravelCharges"],
    ["Payment methodShow how the receipt was paid.", "showPaymentMethod"],
    ["Booking referenceShow the original booking reference on receipts.", "showBookingReference"],
    ["Client addressShow the client address on receipts.", "showClientAddress"],
    ["Business addressShow your business address in the receipt header.", "showBusinessAddress"],
  ]) {
    assertCallback(controls.get(label), calls, field, true, "checked");
  }
  assert.equal(controls.get("Next number").props.type, "number");
  assert.equal(controls.get("Next number").props.min, "1");
}

{
  const element = panelElement(DocumentSettingsPanel, "Invoice Settings");
  const [intro] = childArray(element.props.children);
  assert.equal(textContent(childArray(intro.props.children)[0]), "Invoice Settings");
  assert.equal(textContent(childArray(intro.props.children)[1]), "Set invoice numbering, payment terms, and document-only bank details for pay-later clients.");
  assert.deepEqual(sectionSummaries(element), [
    {
      className: "document-settings-group",
      title: "Invoice numbering",
      description: "Separate invoice references from receipts.",
      labels: ["Invoice prefix", "Next invoice number", "Payment due after"],
    },
    {
      className: "document-settings-group",
      title: "Document-only bank details",
      description: "Stored locally for invoice and receipt document settings. Live payment screens and booking emails use environment configuration.",
      labels: ["Bank name", "Account name", "Sort code", "Account number"],
    },
    {
      className: "document-settings-group",
      title: "Invoice wording",
      description: "Payment terms and footer text for invoice PDFs or emails.",
      labels: ["Payment terms", "Late payment note", "Invoice footer"],
    },
  ]);
  const controls = controlsByLabel(element);
  assert.deepEqual(childArray(controls.get("Payment due after").props.children).map((option) => [option.props.value, option.props.children]), [
    ["0", "Same day"],
    ["7", "7 days"],
    ["14", "14 days"],
    ["30", "30 days"],
  ]);
  assert.equal(controls.get("Next invoice number").props.type, "number");
}

{
  const calls = [];
  const element = panelElement(DocumentSettingsPanel, "Invoice Settings", { onUpdateDocumentSetting: (...args) => calls.push(args) });
  const controls = controlsByLabel(element);
  for (const [label, field] of [
    ["Invoice prefix", "invoicePrefix"],
    ["Next invoice number", "nextInvoiceNumber"],
    ["Payment due after", "invoiceDueDays"],
    ["Bank name", "bankName"],
    ["Account name", "bankAccountName"],
    ["Sort code", "bankSortCode"],
    ["Account number", "bankAccountNumber"],
    ["Payment terms", "paymentTerms"],
    ["Late payment note", "latePaymentText"],
    ["Invoice footer", "invoiceFooter"],
  ]) {
    assertCallback(controls.get(label), calls, field, "line 1\nline 2");
  }
}

{
  const element = panelElement(DocumentSettingsPanel, "Email Receipt Template");
  const [intro] = childArray(element.props.children);
  assert.equal(textContent(childArray(intro.props.children)[0]), "Email Receipt Template");
  assert.equal(textContent(childArray(intro.props.children)[1]), "Default wording for receipt emails. Booking details and totals can be inserted automatically later.");
  assert.deepEqual(sectionSummaries(element), [
    {
      className: "document-settings-group",
      title: "Sending rules",
      description: "Controls when receipts are sent after a booking is paid or completed.",
      labels: ["Send receipt automaticallySend after a booking is marked paid.", "Reply-to email", "CC email"],
    },
    {
      className: "document-settings-group",
      title: "Email wording",
      description: "The client-facing receipt email text.",
      labels: ["Email subject", "Email opening text", "Signature"],
    },
  ]);
  const controls = controlsByLabel(element);
  assert.equal(controls.get("Reply-to email").props.type, "email");
  assert.equal(controls.get("CC email").props.type, "email");
}

{
  const calls = [];
  const element = panelElement(DocumentSettingsPanel, "Email Receipt Template", { onUpdateDocumentSetting: (...args) => calls.push(args) });
  const controls = controlsByLabel(element);
  assertCallback(controls.get("Send receipt automaticallySend after a booking is marked paid."), calls, "sendReceiptAutomatically", false, "checked");
  assertCallback(controls.get("Reply-to email"), calls, "emailReplyTo", "reply+new@example.test");
  assertCallback(controls.get("CC email"), calls, "emailCc", "");
  assertCallback(controls.get("Email subject"), calls, "emailSubject", "  Subject  ");
  assertCallback(controls.get("Email opening text"), calls, "emailIntro", "hello\nthere");
  assertCallback(controls.get("Signature"), calls, "emailSignature", "bye\nnow");
}

{
  const element = panelElement(DocumentSettingsPanel, "Cancellation Text");
  const [intro] = childArray(element.props.children);
  assert.equal(textContent(childArray(intro.props.children)[0]), "Cancellation Text");
  assert.equal(textContent(childArray(intro.props.children)[1]), "This wording can appear on receipts, confirmation emails, and client booking screens.");
  assert.deepEqual(sectionSummaries(element), [
    {
      className: "document-settings-group",
      title: "Cancellation rules",
      description: "The policy clients see before and after booking.",
      labels: ["Free cancellation window", "Cancellation policy", "Late cancellation fee wording", "No-show wording"],
    },
  ]);
  const controls = controlsByLabel(element);
  assert.deepEqual(childArray(controls.get("Free cancellation window").props.children).map((option) => [option.props.value, option.props.children]), [
    ["12", "12 hours before"],
    ["24", "24 hours before"],
    ["48", "48 hours before"],
    ["72", "72 hours before"],
  ]);
}

{
  const calls = [];
  const element = panelElement(DocumentSettingsPanel, "Cancellation Text", { onUpdateDocumentSetting: (...args) => calls.push(args) });
  const controls = controlsByLabel(element);
  assertCallback(controls.get("Free cancellation window"), calls, "cancellationNoticeHours", "48");
  assertCallback(controls.get("Cancellation policy"), calls, "cancellationText", "keep whitespace  ");
  assertCallback(controls.get("Late cancellation fee wording"), calls, "cancellationFeeText", "");
  assertCallback(controls.get("No-show wording"), calls, "noShowText", "No show\ntext");
}

{
  const settings = documentSettings();
  const snapshot = structuredClone(settings);
  renderPanel(DocumentSettingsPanel, "Business Details", { documentSettings: settings });
  renderPanel(DocumentSettingsPanel, "Receipt Layout", { documentSettings: settings });
  renderPanel(DocumentSettingsPanel, "Invoice Settings", { documentSettings: settings });
  renderPanel(DocumentSettingsPanel, "Email Receipt Template", { documentSettings: settings });
  renderPanel(DocumentSettingsPanel, "Cancellation Text", { documentSettings: settings });
  assert.deepEqual(settings, snapshot);
}

console.log("Document settings panel tests passed.");
