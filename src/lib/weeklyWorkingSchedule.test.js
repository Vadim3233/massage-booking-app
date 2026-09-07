import assert from "node:assert/strict";
import { getSchedulingPreview } from "../schedulingEngine.js";
import {
  WEEKLY_WORKING_DAY_KEYS,
  applyHoursToWorkingDays,
  applyWorkingHoursOverridesToDays,
  applyWeeklyScheduleToDays,
  copyWeeklyDaySettings,
  dateWorkingHoursSettingsEqual,
  defaultWeeklyWorkingSchedule,
  normalizeWeeklyWorkingSchedule,
  resetWeeklyWorkingDay,
  resolveWorkingHoursSettingsForDate,
  validateWeeklyWorkingSchedule,
  weeklySettingsForDateValue,
} from "./weeklyWorkingSchedule.js";

const schedule = defaultWeeklyWorkingSchedule();

assert.deepEqual(
  WEEKLY_WORKING_DAY_KEYS,
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  "weekly schedule renders Monday through Sunday in order"
);

const disabledWednesday = normalizeWeeklyWorkingSchedule({
  ...schedule,
  Wed: { ...schedule.Wed, unavailable: true, workingStart: "11:00", workingEnd: "15:00" },
});
assert.equal(disabledWednesday.Wed.unavailable, true, "weekday can be disabled");
assert.equal(disabledWednesday.Wed.workingStart, "11:00", "disabled day preserves its start time");
assert.equal(disabledWednesday.Wed.workingEnd, "15:00", "disabled day preserves its end time");

const disabledPreview = getSchedulingPreview({
  bookings: [],
  requestedDuration: 60,
  requestedTravelBuffer: 0,
  settings: disabledWednesday.Wed,
});
assert.equal(disabledPreview.slots.length, 0, "disabled weekday produces no slots");

const differentHours = normalizeWeeklyWorkingSchedule({
  ...schedule,
  Mon: { ...schedule.Mon, mode: "flexible", workingStart: "09:00", workingEnd: "12:00" },
  Tue: { ...schedule.Tue, mode: "flexible", workingStart: "13:00", workingEnd: "18:00" },
});
const mondayPreview = getSchedulingPreview({
  bookings: [],
  requestedDuration: 60,
  requestedTravelBuffer: 0,
  settings: weeklySettingsForDateValue("2026-08-03", differentHours),
});
const tuesdayPreview = getSchedulingPreview({
  bookings: [],
  requestedDuration: 60,
  requestedTravelBuffer: 0,
  settings: weeklySettingsForDateValue("2026-08-04", differentHours),
});
assert.equal(mondayPreview.slots[0].start, 9 * 60, "Monday uses Monday hours");
assert.equal(tuesdayPreview.slots[0].start, 13 * 60, "Tuesday uses Tuesday hours");

assert.match(
  validateWeeklyWorkingSchedule({
    ...schedule,
    Mon: { ...schedule.Mon, workingStart: "18:00", workingEnd: "09:00" },
  }),
  /end time must be later/,
  "invalid start/end times are rejected"
);

assert.match(
  validateWeeklyWorkingSchedule({
    ...schedule,
    Mon: { ...schedule.Mon, startMode: "fixed", fixedStart: "08:00" },
  }),
  /preferred first appointment/,
  "preferred first appointment must be inside working hours"
);

assert.equal(
  validateWeeklyWorkingSchedule({
    ...schedule,
    Mon: { ...schedule.Mon, unavailable: true, startMode: "fixed", fixedStart: "08:00" },
  }),
  "",
  "hidden preferred-start validation does not block disabled days"
);

const copied = copyWeeklyDaySettings(
  {
    ...schedule,
    Mon: { ...schedule.Mon, workingStart: "10:00", workingEnd: "17:00", mode: "flexible", unavailable: false },
    Wed: { ...schedule.Wed, unavailable: true },
  },
  "Mon",
  ["Wed"]
);
assert.equal(copied.Wed.workingStart, "10:00", "copy-to-days copies settings");
assert.equal(copied.Wed.mode, "flexible", "copy-to-days copies scheduling mode");
assert.equal(copied.Wed.unavailable, true, "copy-to-days preserves destination working status");

const hoursApplied = applyHoursToWorkingDays(
  {
    ...schedule,
    Mon: { ...schedule.Mon, workingStart: "10:00", workingEnd: "17:00", mode: "flexible" },
    Tue: { ...schedule.Tue, mode: "optimized", workingStart: "09:00", workingEnd: "18:00" },
    Wed: { ...schedule.Wed, unavailable: true, workingStart: "09:00", workingEnd: "18:00" },
  },
  "Mon"
);
assert.equal(hoursApplied.Tue.workingStart, "10:00", "apply hours changes enabled weekday start");
assert.equal(hoursApplied.Tue.mode, "optimized", "apply hours does not change scheduling mode");
assert.equal(hoursApplied.Wed.workingStart, "09:00", "apply hours skips disabled weekdays");

const reset = resetWeeklyWorkingDay(
  {
    ...schedule,
    Mon: { ...schedule.Mon, workingStart: "12:00" },
    Tue: { ...schedule.Tue, workingStart: "11:00" },
  },
  "Mon"
);
assert.equal(reset.Mon.workingStart, schedule.Mon.workingStart, "reset one day restores that weekday");
assert.equal(reset.Tue.workingStart, "11:00", "reset one day does not affect other weekdays");

const days = applyWeeklyScheduleToDays(
  [
    { dateValue: "2026-08-03", label: "Mon", bookings: [] },
    { dateValue: "2026-08-04", label: "Tue", bookings: [] },
  ],
  differentHours
);
assert.equal(days[0].settings.workingStart, "09:00", "weekly save can remap Monday date settings");
assert.equal(days[1].settings.workingStart, "13:00", "weekly save can remap Tuesday date settings");

const overrideDate = "2026-08-06";
const overrideSettings = {
  fixedStart: "12:00",
  mode: "flexible",
  startMode: "flexible",
  unavailable: false,
  workingEnd: "16:00",
  workingStart: "12:00",
};
const inheritedResolution = resolveWorkingHoursSettingsForDate(overrideDate, differentHours);
assert.equal(inheritedResolution.hasDateOverride, false, "no override reports inherited weekly settings");
assert.equal(inheritedResolution.settings.workingStart, differentHours.Thu.workingStart, "no override uses weekly weekday start");

const overrideResolution = resolveWorkingHoursSettingsForDate(overrideDate, differentHours, overrideSettings);
assert.equal(overrideResolution.hasDateOverride, true, "override reports custom date settings");
assert.equal(overrideResolution.settings.workingStart, "12:00", "override start wins over weekly");
assert.equal(overrideResolution.settings.mode, "flexible", "override mode wins over weekly");

const resolvedDays = applyWorkingHoursOverridesToDays(
  [{ dateValue: overrideDate, label: "Thu", bookings: [], settings: { workingStart: "07:00", workingEnd: "08:00" } }],
  differentHours,
  { [overrideDate]: overrideSettings }
);
assert.equal(resolvedDays[0].settings.workingStart, "12:00", "stale day state cannot overwrite override");
assert.equal(resolvedDays[0].hasDateOverride, true, "resolved day carries durable override metadata");

const weeklyChanged = normalizeWeeklyWorkingSchedule({
  ...differentHours,
  Thu: { ...differentHours.Thu, workingStart: "10:00", workingEnd: "17:00" },
});
const resolvedAfterWeeklyChange = applyWorkingHoursOverridesToDays(
  [
    { dateValue: overrideDate, label: "Thu", bookings: [] },
    { dateValue: "2026-08-13", label: "Thu", bookings: [] },
  ],
  weeklyChanged,
  { [overrideDate]: overrideSettings }
);
assert.equal(resolvedAfterWeeklyChange[0].settings.workingStart, "12:00", "weekly change does not replace overridden date");
assert.equal(resolvedAfterWeeklyChange[1].settings.workingStart, "10:00", "weekly change updates non-overridden date");

const deletedOverride = applyWorkingHoursOverridesToDays(
  [{ dateValue: overrideDate, label: "Thu", bookings: [] }],
  weeklyChanged,
  {}
);
assert.equal(deletedOverride[0].hasDateOverride, false, "deleted override removes custom metadata");
assert.equal(deletedOverride[0].settings.workingStart, "10:00", "deleted override falls back to current weekly schedule");

const customOff = applyWorkingHoursOverridesToDays(
  [{ dateValue: "2026-08-03", label: "Mon", bookings: [] }],
  schedule,
  { "2026-08-03": { ...schedule.Mon, unavailable: true } }
);
assert.equal(customOff[0].settings.unavailable, true, "working weekday can be closed for one date");
assert.equal(customOff[0].hasDateOverride, true, "closed date remains a custom override");

const sundayOpen = applyWorkingHoursOverridesToDays(
  [{ dateValue: "2026-08-09", label: "Sun", bookings: [] }],
  { ...schedule, Sun: { ...schedule.Sun, unavailable: true } },
  { "2026-08-09": { unavailable: false, workingStart: "11:00", workingEnd: "15:00", mode: "flexible", startMode: "flexible", fixedStart: "11:00" } }
);
assert.equal(sundayOpen[0].settings.unavailable, false, "normally closed weekday can open for one date");
assert.equal(sundayOpen[0].settings.workingStart, "11:00", "opened date uses override hours");

assert.equal(
  dateWorkingHoursSettingsEqual(overrideDate, weeklyChanged.Thu, weeklyChanged.Thu, weeklyChanged),
  true,
  "identical supported fields are detected as redundant"
);
assert.equal(
  dateWorkingHoursSettingsEqual(overrideDate, overrideSettings, weeklyChanged.Thu, weeklyChanged),
  false,
  "different supported fields are not redundant"
);

const dateOverridePreview = getSchedulingPreview({
  bookings: [],
  requestedDuration: 60,
  requestedTravelBuffer: 60,
  settings: overrideResolution.settings,
});
assert.deepEqual(
  dateOverridePreview.slots.map((slot) => slot.start),
  [12 * 60, 12 * 60 + 30, 13 * 60, 13 * 60 + 30, 14 * 60],
  "client slot generation can use resolved date override settings"
);

console.log("Weekly working schedule tests passed.");
