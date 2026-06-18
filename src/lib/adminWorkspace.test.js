import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");

assert.doesNotMatch(
  appSource,
  /import\s+AdminWorkspace\s+from\s+["']\.\/components\/Admin\/AdminWorkspace\.jsx["']/,
  "App.jsx must not use the incomplete extracted AdminWorkspace.",
);

assert.match(
  appSource,
  /function\s+AdminWorkspace\s*\(\s*\{/,
  "The complete AdminWorkspace implementation must remain available.",
);

for (const tabId of ["calendar", "customers", "waitlist", "analytics", "settings"]) {
  assert.match(
    appSource,
    new RegExp(`id:\\s*["']${tabId}["']`),
    `Admin navigation must include the ${tabId} tab.`,
  );
}

for (const view of ["calendar", "customers", "waitlist", "analytics", "settings", "services"]) {
  assert.match(
    appSource,
    new RegExp(`activeTab\\s*===\\s*["']${view}["']`),
    `AdminWorkspace must render the ${view} view.`,
  );
}

for (const requiredFeature of [
  "Add personal event",
  "Add appointment",
  "WaitlistPanel",
  "BusinessAnalyticsDashboard",
  "Payment method",
  "Payment status",
  "Mark Payment Received",
  "Telegram notifications",
  "Service areas",
]) {
  assert.ok(
    appSource.includes(requiredFeature),
    `AdminWorkspace must retain the "${requiredFeature}" feature.`,
  );
}

console.log("Admin workspace regression tests passed.");
