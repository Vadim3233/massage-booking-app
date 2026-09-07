import {
  dateWorkingHoursOverridePayload,
  dateWorkingHoursSettingsEqual,
  normalizeDateWorkingHoursOverrideSettings,
  normalizeWeeklyWorkingSchedule,
  defaultWeeklyWorkingSchedule,
  validateWeeklyWorkingDaySettings,
  validateWeeklyWorkingSchedule,
  weeklySettingsForDateValue,
} from "./weeklyWorkingSchedule.js";
import {
  getPublicSupabaseClient,
  getSupabaseClient,
} from "./bookingSupabase.js";
import { normalizePlainDateValue } from "../schedulingEngine.js";
import { WEEKLY_WORKING_SCHEDULE_STORAGE_KEY } from "../config/storageKeys.js";
import {
  readStoredJson,
  writeStoredJson,
} from "./localStorage.js";

export const BUSINESS_WORKING_HOURS_TABLE = "business_working_hours";
export const BUSINESS_WORKING_HOURS_OVERRIDES_TABLE = "business_working_hours_overrides";

export function readCachedWeeklyWorkingSchedule() {
  return normalizeWeeklyWorkingSchedule(
    readStoredJson(WEEKLY_WORKING_SCHEDULE_STORAGE_KEY, defaultWeeklyWorkingSchedule())
  );
}

export function cacheWeeklyWorkingSchedule(schedule) {
  const normalizedSchedule = normalizeWeeklyWorkingSchedule(schedule);
  writeStoredJson(WEEKLY_WORKING_SCHEDULE_STORAGE_KEY, normalizedSchedule);
  return normalizedSchedule;
}

function isMissingWorkingHoursTable(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    (message.includes(BUSINESS_WORKING_HOURS_TABLE) &&
      (message.includes("does not exist") || message.includes("schema cache")))
  );
}

function workingHoursPersistenceError(error, action) {
  if (isMissingWorkingHoursTable(error)) {
    return new Error("Working Hours storage is unavailable. Please apply the latest Supabase migration.");
  }
  return new Error(`Working Hours could not be ${action}: ${error?.message || "Supabase request failed"}`);
}

function normalizeRequiredPlainDateValue(value, message) {
  const normalizedDateValue = normalizePlainDateValue(value);
  if (!normalizedDateValue) throw new Error(message);
  return normalizedDateValue;
}

function normalizeOverrideRow(row, weeklySchedule) {
  if (!row?.override_date || !row?.settings) return null;
  const dateValue = normalizePlainDateValue(row.override_date);
  if (!dateValue) return null;

  return [
    dateValue,
    dateWorkingHoursOverridePayload(dateValue, row.settings, weeklySchedule),
  ];
}

function workingHoursOverridePersistenceError(error, action) {
  if (isMissingWorkingHoursTable(error)) {
    return new Error("Date override storage is unavailable. Please apply the latest Supabase migration.");
  }
  return new Error(`Date override could not be ${action}: ${error?.message || "Supabase request failed"}`);
}

export async function loadWeeklyWorkingScheduleFromSupabase() {
  const supabase = await getPublicSupabaseClient();
  const { data, error } = await supabase
    .from(BUSINESS_WORKING_HOURS_TABLE)
    .select("schedule,updated_at")
    .eq("id", true)
    .maybeSingle();

  if (error) throw workingHoursPersistenceError(error, "loaded");
  if (!data?.schedule) return { status: "missing", schedule: null, updatedAt: "" };

  return {
    status: "found",
    schedule: normalizeWeeklyWorkingSchedule(data.schedule),
    updatedAt: data.updated_at || "",
  };
}

export async function loadAndCacheWeeklyWorkingScheduleFromSupabase() {
  const result = await loadWeeklyWorkingScheduleFromSupabase();
  if (result.status !== "found") return result;

  return {
    ...result,
    schedule: cacheWeeklyWorkingSchedule(result.schedule),
  };
}

export async function saveWeeklyWorkingScheduleToSupabase(schedule) {
  const normalizedSchedule = normalizeWeeklyWorkingSchedule(schedule);
  const validationMessage = validateWeeklyWorkingSchedule(normalizedSchedule);
  if (validationMessage) throw new Error(validationMessage);

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from(BUSINESS_WORKING_HOURS_TABLE)
    .upsert(
      {
        id: true,
        schedule: normalizedSchedule,
      },
      { onConflict: "id" }
    )
    .select("schedule,updated_at")
    .single();

  if (error) throw workingHoursPersistenceError(error, "saved");

  return {
    schedule: cacheWeeklyWorkingSchedule(data?.schedule || normalizedSchedule),
    updatedAt: data?.updated_at || "",
  };
}

export async function loadWorkingHoursOverridesFromSupabase(startDateValue, endDateValue, weeklySchedule) {
  const normalizedStartDate = normalizeRequiredPlainDateValue(
    startDateValue,
    "A valid date range is required to load date overrides."
  );
  const normalizedEndDate = normalizeRequiredPlainDateValue(
    endDateValue,
    "A valid date range is required to load date overrides."
  );
  if (normalizedEndDate < normalizedStartDate) {
    throw new Error("A valid date range is required to load date overrides.");
  }

  const supabase = await getPublicSupabaseClient();
  const { data, error } = await supabase
    .from(BUSINESS_WORKING_HOURS_OVERRIDES_TABLE)
    .select("override_date,settings,updated_at")
    .gte("override_date", normalizedStartDate)
    .lte("override_date", normalizedEndDate);

  if (error) throw workingHoursOverridePersistenceError(error, "loaded");

  return Object.fromEntries(
    (Array.isArray(data) ? data : [])
      .map((row) => normalizeOverrideRow(row, weeklySchedule))
      .filter(Boolean)
  );
}

export async function loadWorkingHoursOverrideFromSupabase(dateValue, weeklySchedule) {
  const normalizedDateValue = normalizeRequiredPlainDateValue(
    dateValue,
    "A valid date is required to load this date override."
  );

  const supabase = await getPublicSupabaseClient();
  const { data, error } = await supabase
    .from(BUSINESS_WORKING_HOURS_OVERRIDES_TABLE)
    .select("override_date,settings,updated_at")
    .eq("override_date", normalizedDateValue)
    .maybeSingle();

  if (error) throw workingHoursOverridePersistenceError(error, "loaded");
  const normalizedRow = normalizeOverrideRow(data, weeklySchedule);
  return normalizedRow
    ? { dateValue: normalizedDateValue, settings: normalizedRow[1], status: "found" }
    : { dateValue: normalizedDateValue, settings: null, status: "missing" };
}

export async function deleteWorkingHoursOverrideFromSupabase(dateValue) {
  const normalizedDateValue = normalizeRequiredPlainDateValue(
    dateValue,
    "A valid date is required to delete this date override."
  );

  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from(BUSINESS_WORKING_HOURS_OVERRIDES_TABLE)
    .delete()
    .eq("override_date", normalizedDateValue);

  if (error) throw workingHoursOverridePersistenceError(error, "deleted");
  return { dateValue: normalizedDateValue, hasDateOverride: false, status: "deleted" };
}

export async function saveWorkingHoursOverrideToSupabase(dateValue, settings, weeklySchedule) {
  const normalizedDateValue = normalizeRequiredPlainDateValue(
    dateValue,
    "A valid date is required to save this date override."
  );

  const normalizedSettings = normalizeDateWorkingHoursOverrideSettings(normalizedDateValue, settings, weeklySchedule);
  const validationMessage = validateWeeklyWorkingDaySettings(normalizedSettings, normalizedDateValue);
  if (validationMessage) throw new Error(validationMessage);

  const weeklySettings = weeklySettingsForDateValue(normalizedDateValue, weeklySchedule);
  if (dateWorkingHoursSettingsEqual(normalizedDateValue, normalizedSettings, weeklySettings, weeklySchedule)) {
    await deleteWorkingHoursOverrideFromSupabase(normalizedDateValue);
    return {
      dateValue: normalizedDateValue,
      hasDateOverride: false,
      settings: weeklySettings,
      status: "inherited",
    };
  }

  const payload = dateWorkingHoursOverridePayload(normalizedDateValue, normalizedSettings, weeklySchedule);
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from(BUSINESS_WORKING_HOURS_OVERRIDES_TABLE)
    .upsert(
      {
        override_date: normalizedDateValue,
        settings: payload,
      },
      { onConflict: "override_date" }
    )
    .select("override_date,settings,updated_at")
    .single();

  if (error) throw workingHoursOverridePersistenceError(error, "saved");
  const normalizedRow = normalizeOverrideRow(data || { override_date: normalizedDateValue, settings: payload }, weeklySchedule);

  return {
    dateValue: normalizedDateValue,
    hasDateOverride: true,
    settings: normalizedRow?.[1] || payload,
    status: "saved",
  };
}
