import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");
const liveWorkspaceSource = readFileSync(new URL("./LiveAdminWorkspace.jsx", import.meta.url), "utf8");
const transitionalWorkspaceSource = readFileSync(new URL("./AdminWorkspace.jsx", import.meta.url), "utf8");
const bookingScreensSource = readFileSync(new URL("../Booking/ClientBookingFlowScreens.jsx", import.meta.url), "utf8");

function readBalancedFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
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

const helperSource = [
  "function timeToMinutes(time) { const [hours, minutes] = String(time).split(':').map(Number); return hours * 60 + minutes; }",
  readBalancedFunction(liveWorkspaceSource, "bookingStartMinutes"),
  readBalancedFunction(liveWorkspaceSource, "bookingDurationMinutes"),
  "return { bookingStartMinutes, bookingDurationMinutes };",
].join("\n\n");
const { bookingStartMinutes, bookingDurationMinutes } = new Function(helperSource)();
assert.equal(bookingStartMinutes({ start: "09:30" }), 570, "Pending bookings keep string start times from Supabase-backed booking rows");
assert.equal(bookingStartMinutes({ startMinutes: 615, start: "09:30" }), 615, "Pending bookings prefer normalized startMinutes when available");
assert.equal(bookingStartMinutes({ start_minutes: 645, start: "09:30" }), 645, "Pending bookings support database-style start_minutes");
assert.equal(bookingDurationMinutes({ start: "09:30", sessionEnd: 660 }), 90, "Pending booking ranges can be derived from string start plus session end");

assert.match(appSource, /React\.lazy\(\(\) => import\("\.\/components\/Admin\/LiveAdminWorkspace\.jsx"\)/);
assert.doesNotMatch(appSource, /import \{ LiveAdminWorkspace \} from "\.\/components\/Admin\/LiveAdminWorkspace\.jsx"/);
assert.doesNotMatch(appSource, /from "\.\/components\/Admin\/AdminWorkspace\.jsx"/);
assert.doesNotMatch(appSource, /^\s*function AdminWorkspace\(/m);
assert.match(appSource, /<React\.Suspense fallback=\{null\}>[\s\S]*<LiveAdminWorkspace/);

assert.match(liveWorkspaceSource, /export function LiveAdminWorkspace\(/);
assert.doesNotMatch(liveWorkspaceSource, /from "\.\.\/\.\.\/App\.jsx"/);
assert.doesNotMatch(liveWorkspaceSource, /from "\.\/AdminWorkspace\.jsx"/);
assert.match(liveWorkspaceSource, /import \{ AdminAppointmentWizard \} from "\.\/AdminAppointmentWizard\.jsx"/);
assert.match(liveWorkspaceSource, /import \{ AdminAppointmentOverviewModal \} from "\.\/AdminAppointmentOverviewModal\.jsx"/);
assert.match(liveWorkspaceSource, /import \{ AdminPendingVerificationPanel \} from "\.\/AdminPendingVerificationPanel\.jsx"/);
assert.match(liveWorkspaceSource, /import \{ AdminCalendarOverview \} from "\.\/AdminCalendarOverview\.jsx"/);
assert.match(liveWorkspaceSource, /import \{ AdminTopbar \} from "\.\/AdminTopbar\.jsx"/);
assert.match(liveWorkspaceSource, /activeTab === "pending" && renderPendingVerificationView\(\)/);
assert.match(liveWorkspaceSource, /activeTab === "calendar"/);
assert.match(liveWorkspaceSource, /renderCalendarContent\(\)/);
assert.match(liveWorkspaceSource, /activeTab === "customers"/);
assert.match(liveWorkspaceSource, /activeTab === "settings"/);
assert.match(liveWorkspaceSource, /import\("\.\.\/\.\.\/dev\/fakeClients\.js"\)/);
assert.doesNotMatch(liveWorkspaceSource, /import\("\.\/dev\/fakeClients\.js"\)/);
assert.match(liveWorkspaceSource, /className="weekly-working-toggle-control"[\s\S]*event\.stopPropagation\(\)[\s\S]*type="checkbox"[\s\S]*updateWorkingDayDraft\(dayKey, \{ unavailable: !event\.target\.checked \}\)/);
assert.match(liveWorkspaceSource, /hasDateOverride: Boolean\(existingDay\?\.hasDateOverride\)/, "Agenda date rebuild preserves CUSTOM metadata");
assert.match(liveWorkspaceSource, /settings: existingDay\?\.settings[\s\S]*cloneValue\(existingDay\.settings\)/, "Agenda date rebuild preserves resolved override hours");
assert.match(liveWorkspaceSource, /<div[\s\S]*className="weekly-working-summary"[\s\S]*role="button"[\s\S]*tabIndex=\{0\}/);
assert.doesNotMatch(liveWorkspaceSource, /<button\s+type="button"\s+className="weekly-working-summary"/);
assert.match(liveWorkspaceSource, /const \[weeklyWorkingSaving, setWeeklyWorkingSaving\] = useState\(false\)/);
assert.match(liveWorkspaceSource, /async function saveWorkingRules\(\)/);
assert.match(liveWorkspaceSource, /await onUpdateWeeklyWorkingSchedule\?\.\(weeklyWorkingDraft\)/);
assert.match(liveWorkspaceSource, /className="weekly-working-heading-actions"[\s\S]*disabled=\{!workingRulesDirty \|\| weeklyWorkingSaving\}[\s\S]*\{workingScheduleSaveLabel\(\)\}/);
assert.match(liveWorkspaceSource, /function workingScheduleStatusMessage\(\)[\s\S]*if \(workingRulesDirty\) return "Unsaved changes";[\s\S]*return weeklyWorkingSavedMessage \|\| "All changes saved"/);

assert.match(transitionalWorkspaceSource, /function AdminWorkspace/);
assert.match(transitionalWorkspaceSource, /export default AdminWorkspace/);
assert.doesNotMatch(bookingScreensSource, /LiveAdminWorkspace/);

console.log("Live admin workspace lazy-boundary tests passed.");
