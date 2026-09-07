import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function readBalancedFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);

  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  throw new Error(`Could not read ${name}`);
}

async function loadCustomerDisplay() {
  const modulePath = resolve("src/lib/customerDisplay.js");
  if (existsSync(modulePath)) {
    return import("./customerDisplay.js");
  }

  const appSource = readFileSync(resolve("src/App.jsx"), "utf8");
  const source = [
    readBalancedFunction(appSource, "serviceAbbreviation").replace("function serviceAbbreviation", "export function serviceAbbreviation"),
    readBalancedFunction(appSource, "customerInitials").replace("function customerInitials", "export function customerInitials"),
    readBalancedFunction(appSource, "customerTotalSpent").replace("function customerTotalSpent", "export function customerTotalSpent"),
    readBalancedFunction(appSource, "customerPreferredService").replace("function customerPreferredService", "export function customerPreferredService"),
    readBalancedFunction(appSource, "customerPreferredServiceShort").replace("function customerPreferredServiceShort", "export function customerPreferredServiceShort"),
  ].join("\n\n");

  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
}

function cloneForMutationCheck(value) {
  return structuredClone(value);
}

function assertUnchanged(value, snapshot) {
  assert.deepEqual(value, snapshot);
}

const {
  customerInitials,
  customerPreferredService,
  customerPreferredServiceShort,
  customerTotalSpent,
  serviceAbbreviation,
} = await loadCustomerDisplay();

assert.equal(serviceAbbreviation("Assisted Stretching"), "AS");
assert.equal(serviceAbbreviation("Body Exam"), "BE");
assert.equal(serviceAbbreviation("Cloud Nine Head Massage"), "CNH");
assert.equal(serviceAbbreviation("Deep Tissue Recovery"), "DTR");
assert.equal(serviceAbbreviation("Massage"), "M");
assert.equal(serviceAbbreviation("Personal event"), "PE");
assert.equal(serviceAbbreviation("Performance Sports Massage"), "PSM");
assert.equal(serviceAbbreviation("Prenatal Wellness"), "PW");
assert.equal(serviceAbbreviation("Soft Tissue Therapy"), "STT");
assert.equal(serviceAbbreviation("The Zero-Gravity Melt"), "ZGM");

assert.equal(serviceAbbreviation("massage"), "M");
assert.equal(serviceAbbreviation("  Massage  "), "M");
assert.equal(serviceAbbreviation("custom lymphatic drainage massage"), "CLD");
assert.equal(serviceAbbreviation("lower back shoulder neck release"), "LBS");
assert.equal(serviceAbbreviation(""), "");
assert.equal(serviceAbbreviation(null), "N");
assert.equal(serviceAbbreviation(undefined), "U");

assert.equal(customerInitials("Ada Lovelace"), "AL");
assert.equal(customerInitials("Vadim"), "V");
assert.equal(customerInitials("Mary Jane Watson Parker"), "MJ");
assert.equal(customerInitials("  mary   jane  "), "MJ");
assert.equal(customerInitials(""), "G");
assert.equal(customerInitials(), "G");
assert.equal(customerInitials(null), "G");
assert.equal(customerInitials(undefined), "G");
assert.equal(customerInitials("alice bob"), "AB");

{
  const customer = {};
  const snapshot = cloneForMutationCheck(customer);
  assert.equal(customerTotalSpent(customer), 0);
  assertUnchanged(customer, snapshot);
}

{
  assert.equal(customerTotalSpent(null), 0);
  assert.equal(customerTotalSpent(undefined), 0);
}

{
  const customer = {
    appointments: [
      { serviceName: "Massage", status: "confirmed", total: 120 },
      { serviceName: "Soft Tissue Therapy", status: "cancelled", total: "95" },
      { serviceName: "Massage", status: "pending", total: 0 },
      { serviceName: "Body Exam", total: null },
      { serviceName: "Assisted Stretching", total: -10 },
      { serviceName: "Unknown", total: "not-a-number" },
      { serviceName: "Missing" },
    ],
  };
  const snapshot = cloneForMutationCheck(customer);

  assert.equal(customerTotalSpent(customer), 205);
  assert.equal(typeof customerTotalSpent(customer), "number");
  assertUnchanged(customer, snapshot);
}

{
  const customer = {};
  const snapshot = cloneForMutationCheck(customer);
  assert.equal(customerPreferredService(customer), "Not enough history");
  assertUnchanged(customer, snapshot);
}

{
  assert.equal(customerPreferredService(null), "Not enough history");
  assert.equal(customerPreferredService(undefined), "Not enough history");
}

{
  const customer = {
    appointments: [
      { date: "2026-08-04", serviceName: "Massage", status: "cancelled" },
    ],
  };
  const snapshot = cloneForMutationCheck(customer);

  assert.equal(customerPreferredService(customer), "Massage");
  assert.equal(typeof customerPreferredService(customer), "string");
  assertUnchanged(customer, snapshot);
}

{
  const customer = {
    appointments: [
      { date: "2026-08-03", serviceName: "Soft Tissue Therapy" },
      { date: "2026-08-01", serviceName: "Massage" },
      { date: "2026-08-02", serviceName: "Soft Tissue Therapy" },
      { date: "not-a-date", serviceName: "Massage" },
      { serviceName: "" },
      {},
    ],
  };
  const snapshot = cloneForMutationCheck(customer);

  assert.equal(customerPreferredService(customer), "Soft Tissue Therapy");
  assertUnchanged(customer, snapshot);
}

{
  const customer = {
    appointments: [
      { date: "2026-08-03", serviceName: "Massage" },
      { date: "2026-08-04", serviceName: "Soft Tissue Therapy" },
    ],
  };
  const snapshot = cloneForMutationCheck(customer);

  assert.equal(customerPreferredService(customer), "Massage");
  assertUnchanged(customer, snapshot);
}

{
  const customer = {
    appointments: [
      { serviceName: "" },
      { serviceName: null },
      {},
    ],
  };
  const snapshot = cloneForMutationCheck(customer);

  assert.equal(customerPreferredService(customer), "Treatment");
  assertUnchanged(customer, snapshot);
}

assert.equal(customerPreferredServiceShort({ appointments: [{ serviceName: "Soft Tissue Therapy" }] }), "STT");
assert.equal(customerPreferredServiceShort({ appointments: [{ serviceName: "Custom Service Name" }] }), "CSN");
assert.equal(customerPreferredServiceShort({ appointments: [] }), "N/A");
assert.equal(customerPreferredServiceShort(null), "N/A");

console.log("Customer display tests passed.");
