import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const navigation = readFileSync(new URL("./AdminCalendarDateNavigation.jsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("./LiveAdminWorkspace.jsx", import.meta.url), "utf8");
const cards = readFileSync(new URL("./AdminCalendarCards.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../styles/app.css", import.meta.url), "utf8");

assert.match(workspace, /admin-calendar-sticky-header/, "Calendar controls share one stable header container");
assert.doesNotMatch(workspace, /compactDateNavVisible|setCompactDateNavVisible|adminDateStripRef/, "scroll no longer swaps date navigators");
assert.doesNotMatch(navigation, /admin-compact-date-nav|compactDateNavVisible/, "only one date navigator renders");
assert.match(navigation, /Previous week[\s\S]*admin-week-date-pills[\s\S]*Next week/, "week navigation remains available");
assert.match(navigation, /Today/, "Today remains directly available");
assert.match(styles, /\.admin-calendar-sticky-header\s*\{[\s\S]*position:\s*sticky/, "mobile calendar header is sticky");
assert.match(styles, /\.admin-tab-calendar \.admin-date-pill\s*\{[\s\S]*border-color:\s*transparent/, "mobile days use a quiet strip treatment");
assert.match(cards, /agenda-booking-title-row[\s\S]*<strong>\{card\.clientName\}<\/strong>/, "client name remains the booking-card primary label");
assert.match(styles, /\.agenda-booking-title-row > strong,[\s\S]*font-weight:\s*700/, "client name receives stronger mobile hierarchy");

console.log("Admin Calendar mobile layout tests passed.");
