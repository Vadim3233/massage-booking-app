import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function readBalancedConst(source, name) {
  const start = source.indexOf(`const ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);

  const arrayStart = source.indexOf("[", start);
  let depth = 0;
  for (let index = arrayStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "[") depth += 1;
    if (character === "]") depth -= 1;
    if (depth === 0) {
      const semicolon = source.indexOf(";", index);
      assert.notEqual(semicolon, -1, `${name} should end with a semicolon`);
      return source.slice(start, semicolon + 1);
    }
  }

  throw new Error(`Could not read ${name}`);
}

async function loadAdminSettingsNavigation() {
  const modulePath = resolve("src/config/adminSettingsNavigation.js");
  if (existsSync(modulePath)) {
    return import("./adminSettingsNavigation.js");
  }

  const appSource = readFileSync(resolve("src/App.jsx"), "utf8");
  const source = readBalancedConst(appSource, "SETTINGS_NAVIGATION")
    .replace("const SETTINGS_NAVIGATION", "export const SETTINGS_NAVIGATION");

  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
}

const { SETTINGS_NAVIGATION } = await loadAdminSettingsNavigation();

const expectedNavigation = [
  {
    id: "scheduling",
    label: "Scheduling & Availability",
    sections: ["Working Hours", "Travel Buffer", "Chain Mode / Availability Rules", "Blocked Time"],
  },
  {
    id: "coverage",
    label: "Coverage Areas",
    sections: ["Service Areas", "Travel Charges", "Congestion Zone Fee", "Coverage Rules"],
  },
  {
    id: "services",
    label: "Services & Pricing",
    sections: ["Treatments", "Enhancements", "Session Preferences", "Durations & Buffers", "Pricing"],
  },
  {
    id: "waitlist",
    label: "Waitlist",
    sections: ["Waitlist Rules", "Client Requests", "Offer Settings"],
  },
  {
    id: "payments",
    label: "Payments",
    sections: ["Payment Methods", "Payment Statuses", "Pay Later"],
  },
  {
    id: "financial",
    label: "Financial Settings",
    sections: ["Financial Settings"],
  },
  {
    id: "documents",
    label: "Receipts & Documents",
    sections: ["Business Details", "Receipt Layout", "Invoice Settings", "Email Receipt Template", "Cancellation Text"],
  },
  {
    id: "notifications",
    label: "Notifications",
    sections: ["Telegram", "Email", "Booking Alerts"],
  },
  {
    id: "clients",
    label: "Clients & Rebooking",
    sections: ["Client Details", "Returning Clients", "Rebooking Preferences"],
  },
  {
    id: "security",
    label: "Security",
    sections: ["Admin Access", "Client Privacy", "API Protection"],
  },
  {
    id: "system",
    label: "System",
    sections: ["Stored Data", "Integrations", "Application Information"],
  },
];

assert.deepEqual(SETTINGS_NAVIGATION, expectedNavigation);
assert.equal(SETTINGS_NAVIGATION.length, 11);

assert.deepEqual(
  SETTINGS_NAVIGATION.map((category) => category.id),
  expectedNavigation.map((category) => category.id)
);
assert.deepEqual(
  SETTINGS_NAVIGATION.map((category) => category.label),
  expectedNavigation.map((category) => category.label)
);
assert.deepEqual(
  SETTINGS_NAVIGATION.map((category) => category.sections),
  expectedNavigation.map((category) => category.sections)
);

assert.equal(
  new Set(SETTINGS_NAVIGATION.map((category) => category.id)).size,
  SETTINGS_NAVIGATION.length
);

for (const category of SETTINGS_NAVIGATION) {
  assert.deepEqual(Object.keys(category), ["id", "label", "sections"]);
  assert.equal(typeof category.id, "string");
  assert.equal(typeof category.label, "string");
  assert.equal(Array.isArray(category.sections), true);
  assert.equal(new Set(category.sections).size, category.sections.length);

  for (const section of category.sections) {
    assert.equal(typeof section, "string");
  }
}

const allSectionLabels = SETTINGS_NAVIGATION.flatMap((category) => category.sections);
assert.equal(new Set(allSectionLabels).size, allSectionLabels.length);
assert.equal(SETTINGS_NAVIGATION.find((category) => category.id === "services")?.sections.includes("Session Preferences"), true);
assert.deepEqual(SETTINGS_NAVIGATION.find((category) => category.id === "services"), expectedNavigation[2]);
assert.equal(SETTINGS_NAVIGATION.find((category) => category.id === "missing-category") ?? null, null);

console.log("Admin settings navigation tests passed.");
