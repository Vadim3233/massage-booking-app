import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyWorkingHoursOverridesToDays, defaultWeeklyWorkingSchedule } from "./weeklyWorkingSchedule.js";

const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const functionStart = appSource.indexOf("function applyDateOverrideResult");
const functionEnd = appSource.indexOf("\n  async function updateDaySettingsByDate", functionStart);
assert.notEqual(functionStart, -1, "date override result handler should exist");
assert.notEqual(functionEnd, -1, "date override result handler should have a bounded body");
const handler = appSource.slice(functionStart, functionEnd);

assert.match(handler, /const next = \{ \.\.\.workingHoursOverridesByDateRef\.current \}/);
assert.match(handler, /setWorkingHoursOverridesByDate\(next\)/);
assert.match(handler, /setDays\(\(currentDays\) => applyWorkingHoursOverridesToDays\(currentDays, weeklyWorkingSchedule, next\)\)/);
assert.doesNotMatch(
  handler,
  /setWorkingHoursOverridesByDate\(\(current\)[\s\S]*setDays\(/,
  "visible days must not be updated from inside the override-map state updater"
);

const weeklySchedule = defaultWeeklyWorkingSchedule();
const staleDays = [
  {
    dateValue: "2026-09-06",
    label: "Sun",
    settings: { ...weeklySchedule.Sun, workingStart: "10:00", workingEnd: "16:00" },
    bookings: [],
  },
  {
    dateValue: "2026-09-07",
    label: "Mon",
    settings: { ...weeklySchedule.Mon },
    bookings: [],
  },
];
const returnedSupabaseOverride = {
  unavailable: false,
  workingStart: "12:00",
  workingEnd: "20:00",
  mode: "flexible",
  startMode: "flexible",
  fixedStart: "12:00",
};
const nextOverrides = { "2026-09-06": returnedSupabaseOverride };
const visibleDaysAfterSave = applyWorkingHoursOverridesToDays(staleDays, weeklySchedule, nextOverrides);

assert.equal(visibleDaysAfterSave[0].settings.workingStart, "12:00", "saved start renders immediately in the visible Agenda row");
assert.equal(visibleDaysAfterSave[0].settings.workingEnd, "20:00", "saved end renders immediately in the visible Agenda row");
assert.equal(visibleDaysAfterSave[0].hasDateOverride, true, "saved Agenda row immediately carries CUSTOM state");
assert.equal(visibleDaysAfterSave[1].settings.workingStart, weeklySchedule.Mon.workingStart, "other days remain unchanged");

console.log("Working Hours state regression tests passed.");
