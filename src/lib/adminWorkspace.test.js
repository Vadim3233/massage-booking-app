import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const liveAdminWorkspaceSource = readFileSync(new URL("../components/Admin/LiveAdminWorkspace.jsx", import.meta.url), "utf8");
const bookingScreensSource = readFileSync(new URL("../components/Booking/ClientBookingFlowScreens.jsx", import.meta.url), "utf8");

assert.doesNotMatch(
  appSource,
  /import\s+AdminWorkspace\s+from\s+["']\.\/components\/Admin\/AdminWorkspace\.jsx["']/,
  "App.jsx must not use the incomplete extracted AdminWorkspace.",
);

assert.match(
  appSource,
  /React\.lazy\(\(\) => import\(["']\.\/components\/Admin\/LiveAdminWorkspace\.jsx["']\)/,
  "App.jsx must dynamically import the live admin workspace.",
);

assert.doesNotMatch(
  appSource,
  /import\s+\{?\s*LiveAdminWorkspace\s*\}?\s+from\s+["']\.\/components\/Admin\/LiveAdminWorkspace\.jsx["']/,
  "App.jsx must not statically import the live admin workspace.",
);

assert.doesNotMatch(
  bookingScreensSource,
  /LiveAdminWorkspace/,
  "Public booking screens must not import the live admin workspace.",
);

assert.doesNotMatch(
  appSource,
  /^\s*function\s+AdminWorkspace\s*\(/m,
  "The complete AdminWorkspace implementation must not remain inline in App.jsx.",
);

assert.match(
  liveAdminWorkspaceSource,
  /export\s+function\s+LiveAdminWorkspace\s*\(\s*\{/,
  "The complete live admin workspace implementation must remain available.",
);

for (const tabId of ["calendar", "customers", "waitlist", "analytics", "settings"]) {
  assert.match(
    liveAdminWorkspaceSource,
    new RegExp(`id:\\s*["']${tabId}["']`),
    `Admin navigation must include the ${tabId} tab.`,
  );
}

for (const view of ["calendar", "customers", "waitlist", "analytics", "settings", "services"]) {
  assert.match(
    liveAdminWorkspaceSource,
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
    liveAdminWorkspaceSource.includes(requiredFeature),
    `AdminWorkspace must retain the "${requiredFeature}" feature.`,
  );
}

console.log("Admin workspace regression tests passed.");
