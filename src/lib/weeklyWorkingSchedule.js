import {
  DEFAULT_DAY_SETTINGS,
  normalizePlainDateValue,
  timeToMinutes,
} from "../schedulingEngine.js";

export const WEEKLY_WORKING_DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const WEEKLY_WORKING_DAY_LABELS = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

export const WEEKLY_WORKING_RULE_FIELDS = [
  "workingStart",
  "workingEnd",
  "mode",
  "startMode",
  "fixedStart",
  "releaseTime",
  "anchorReleaseEnabled",
  "customWorkingHours",
  "unavailable",
];

export const DATE_WORKING_HOURS_OVERRIDE_FIELDS = [
  "unavailable",
  "workingStart",
  "workingEnd",
  "mode",
  "startMode",
  "fixedStart",
];

const VALID_MODES = new Set(["optimized", "flexible"]);
const VALID_START_MODES = new Set(["fixed", "flexible"]);

function cloneValue(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function isTimeValue(value) {
  return /^\d{2}:\d{2}$/.test(String(value || ""));
}

function weekdayKeyFromDateValue(dateValue) {
  const safeValue = normalizePlainDateValue(dateValue);
  if (!safeValue) return "Mon";
  const [year, month, day] = safeValue.split("-").map(Number);
  return WEEKLY_WORKING_DAY_KEYS[(new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7];
}

export function defaultWeeklyWorkingDaySettings(dayKey) {
  const settings = {
    ...cloneValue(DEFAULT_DAY_SETTINGS),
    dateLabel: dayKey,
    anchorReleaseEnabled: false,
    customWorkingHours: true,
    unavailable: false,
  };

  if (dayKey === "Sun") {
    settings.workingStart = "10:00";
    settings.workingEnd = "16:00";
  } else if (dayKey === "Sat") {
    settings.workingEnd = "16:00";
  }

  return settings;
}

export function defaultWeeklyWorkingSchedule() {
  return Object.fromEntries(
    WEEKLY_WORKING_DAY_KEYS.map((dayKey) => [dayKey, defaultWeeklyWorkingDaySettings(dayKey)])
  );
}

export function normalizeWeeklyWorkingDaySettings(value, dayKey) {
  const fallback = defaultWeeklyWorkingDaySettings(dayKey);
  const source = value && typeof value === "object" ? value : {};
  const normalized = { ...fallback };

  for (const field of WEEKLY_WORKING_RULE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      normalized[field] = source[field];
    }
  }

  normalized.dateLabel = dayKey;
  normalized.workingStart = isTimeValue(normalized.workingStart) ? normalized.workingStart : fallback.workingStart;
  normalized.workingEnd = isTimeValue(normalized.workingEnd) ? normalized.workingEnd : fallback.workingEnd;
  normalized.fixedStart = isTimeValue(normalized.fixedStart) ? normalized.fixedStart : fallback.fixedStart;
  normalized.releaseTime = isTimeValue(normalized.releaseTime) ? normalized.releaseTime : fallback.releaseTime;
  normalized.mode = VALID_MODES.has(normalized.mode) ? normalized.mode : fallback.mode;
  normalized.startMode = VALID_START_MODES.has(normalized.startMode) ? normalized.startMode : fallback.startMode;
  normalized.anchorReleaseEnabled = Boolean(normalized.anchorReleaseEnabled);
  normalized.customWorkingHours = true;
  normalized.unavailable = Boolean(normalized.unavailable);

  return normalized;
}

export function normalizeWeeklyWorkingSchedule(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    WEEKLY_WORKING_DAY_KEYS.map((dayKey) => [
      dayKey,
      normalizeWeeklyWorkingDaySettings(source[dayKey], dayKey),
    ])
  );
}

export function weeklySettingsForDateValue(dateValue, weeklySchedule) {
  const dayKey = weekdayKeyFromDateValue(dateValue);
  const schedule = normalizeWeeklyWorkingSchedule(weeklySchedule);
  return normalizeWeeklyWorkingDaySettings(schedule[dayKey], dayKey);
}

function pickDateOverrideFields(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  return Object.fromEntries(
    DATE_WORKING_HOURS_OVERRIDE_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(source, field))
      .map((field) => [field, source[field]])
  );
}

export function normalizeDateWorkingHoursOverrideSettings(dateValue, settings, weeklySchedule) {
  const dayKey = weekdayKeyFromDateValue(dateValue);
  const weeklySettings = weeklySettingsForDateValue(dateValue, weeklySchedule);
  const pickedSettings = pickDateOverrideFields(settings);
  return normalizeWeeklyWorkingDaySettings({
    ...weeklySettings,
    ...pickedSettings,
    dateLabel: dayKey,
    customWorkingHours: true,
  }, dayKey);
}

export function dateWorkingHoursOverridePayload(dateValue, settings, weeklySchedule) {
  const normalized = normalizeDateWorkingHoursOverrideSettings(dateValue, settings, weeklySchedule);
  return Object.fromEntries(
    DATE_WORKING_HOURS_OVERRIDE_FIELDS.map((field) => [field, normalized[field]])
  );
}

export function dateWorkingHoursSettingsEqual(dateValue, firstSettings, secondSettings, weeklySchedule) {
  const first = dateWorkingHoursOverridePayload(dateValue, firstSettings, weeklySchedule);
  const second = dateWorkingHoursOverridePayload(dateValue, secondSettings, weeklySchedule);
  return DATE_WORKING_HOURS_OVERRIDE_FIELDS.every((field) => first[field] === second[field]);
}

export function resolveWorkingHoursSettingsForDate(dateValue, weeklySchedule, overrideSettings = null) {
  const weeklySettings = weeklySettingsForDateValue(dateValue, weeklySchedule);
  if (!overrideSettings) {
    return {
      hasDateOverride: false,
      settings: weeklySettings,
    };
  }

  return {
    hasDateOverride: true,
    settings: normalizeDateWorkingHoursOverrideSettings(dateValue, overrideSettings, weeklySchedule),
  };
}

export function applyWorkingHoursOverridesToDays(days, weeklySchedule, overridesByDate = {}) {
  return (Array.isArray(days) ? days : []).map((day) => {
    const dateValue = normalizePlainDateValue(day?.dateValue);
    const resolved = resolveWorkingHoursSettingsForDate(
      dateValue,
      weeklySchedule,
      dateValue ? overridesByDate[dateValue] : null
    );
    return {
      ...day,
      hasDateOverride: resolved.hasDateOverride,
      settings: {
        ...resolved.settings,
        dateLabel: day?.label || resolved.settings.dateLabel,
      },
    };
  });
}

export function applyWeeklyScheduleToDays(days, weeklySchedule) {
  return applyWorkingHoursOverridesToDays(days, weeklySchedule, {});
}

export function validateWeeklyWorkingDaySettings(settings, dayLabel = "This day") {
  const safeSettings = normalizeWeeklyWorkingDaySettings(settings, settings?.dateLabel || "Mon");
  if (safeSettings.unavailable) return "";

  const start = timeToMinutes(safeSettings.workingStart);
  const end = timeToMinutes(safeSettings.workingEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return `${dayLabel}: end time must be later than start time.`;
  }

  if (safeSettings.startMode === "fixed") {
    const fixedStart = timeToMinutes(safeSettings.fixedStart);
    if (!Number.isFinite(fixedStart) || fixedStart < start || fixedStart >= end) {
      return `${dayLabel}: preferred first appointment must be inside working hours.`;
    }
  }

  if (safeSettings.anchorReleaseEnabled && !isTimeValue(safeSettings.releaseTime)) {
    return `${dayLabel}: choose a valid time for opening more times.`;
  }

  return "";
}

export function validateWeeklyWorkingSchedule(schedule) {
  const normalized = normalizeWeeklyWorkingSchedule(schedule);
  for (const dayKey of WEEKLY_WORKING_DAY_KEYS) {
    const error = validateWeeklyWorkingDaySettings(normalized[dayKey], WEEKLY_WORKING_DAY_LABELS[dayKey]);
    if (error) return error;
  }
  return "";
}

export function copyWeeklyDaySettings(schedule, sourceDayKey, destinationDayKeys) {
  const normalized = normalizeWeeklyWorkingSchedule(schedule);
  const source = normalized[sourceDayKey];
  if (!source) return normalized;
  const destinations = new Set(Array.isArray(destinationDayKeys) ? destinationDayKeys : []);

  return Object.fromEntries(
    WEEKLY_WORKING_DAY_KEYS.map((dayKey) => {
      const current = normalized[dayKey];
      if (!destinations.has(dayKey) || dayKey === sourceDayKey) return [dayKey, current];
      return [
        dayKey,
        {
          ...source,
          dateLabel: dayKey,
          unavailable: current.unavailable,
        },
      ];
    })
  );
}

export function applyHoursToWorkingDays(schedule, sourceDayKey) {
  const normalized = normalizeWeeklyWorkingSchedule(schedule);
  const source = normalized[sourceDayKey];
  if (!source) return normalized;

  return Object.fromEntries(
    WEEKLY_WORKING_DAY_KEYS.map((dayKey) => {
      const current = normalized[dayKey];
      if (current.unavailable) return [dayKey, current];
      return [
        dayKey,
        {
          ...current,
          workingStart: source.workingStart,
          workingEnd: source.workingEnd,
        },
      ];
    })
  );
}

export function resetWeeklyWorkingDay(schedule, dayKey) {
  const normalized = normalizeWeeklyWorkingSchedule(schedule);
  return {
    ...normalized,
    [dayKey]: defaultWeeklyWorkingDaySettings(dayKey),
  };
}
