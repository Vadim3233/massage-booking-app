import {
  SLOT_INCREMENT,
  addDaysToPlainDateValue,
  dateValueInTimeZone,
  daysBetweenPlainDateValues,
  minutesToTime,
  normalizePlainDateValue,
} from "../schedulingEngine.js";

export const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function dateValueFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function weekdayLabelFromDate(date) {
  return WEEK_DAYS[(date.getDay() + 6) % 7];
}

export function weekdayLabelFromDateValue(dateValue) {
  const safeValue = normalizePlainDateValue(dateValue);
  if (!safeValue) return weekdayLabelFromDate(new Date());
  const [year, month, day] = safeValue.split("-").map(Number);
  return WEEK_DAYS[(new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7];
}

export function todayValue() {
  return dateValueInTimeZone();
}

export function dateValueForOffset(offset) {
  return addDaysToPlainDateValue(todayValue(), offset) || todayValue();
}

export function addDaysToDateValue(dateValue, days) {
  return addDaysToPlainDateValue(dateValue, days) || dateValueForOffset(days);
}

export function weekStartDateValue(dateValue) {
  const safeValue = normalizePlainDateValue(dateValue);
  if (!safeValue) return todayValue();
  const [year, month, day] = safeValue.split("-").map(Number);
  const weekdayIndex = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  return addDaysToPlainDateValue(safeValue, -weekdayIndex) || todayValue();
}

export function monthValueForDate(dateValue) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue.slice(0, 7) : todayValue().slice(0, 7);
}

export function isPastDate(dateValue) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateValue) && dateValue < todayValue();
}

export function isValidDateValue(value) {
  return Boolean(normalizePlainDateValue(value));
}

export function daysBetweenDateValues(startDateValue, endDateValue) {
  return daysBetweenPlainDateValues(startDateValue, endDateValue);
}

export function formatRange(start, end) {
  return `${minutesToTime(start)} - ${minutesToTime(end)}`;
}

export function formatClock(totalMinutes) {
  const safeMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

export const DAY_SETTINGS_TIME_OPTIONS = Array.from(
  { length: Math.floor((24 * 60) / SLOT_INCREMENT) },
  (_, index) => minutesToTime(index * SLOT_INCREMENT)
);

export function compactDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function dayNumberLabel(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-GB", { day: "2-digit" });
}

export function monthShortLabel(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { month: "short" });
}

export function yearShortLabel(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { year: "2-digit" });
}

export function fullDateLabel(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", weekday: "short", year: "numeric" });
}

export function monthRangeLabel(days, selectedDayIndex) {
  const selectedDate = new Date(`${days[selectedDayIndex]?.dateValue ?? todayValue()}T00:00:00`);
  if (Number.isNaN(selectedDate.getTime())) return "Select date";

  const firstDate = new Date(selectedDate);
  firstDate.setDate(selectedDate.getDate() - selectedDate.getDay() + 1);
  const lastDate = new Date(firstDate);
  lastDate.setDate(firstDate.getDate() + 6);
  const firstMonth = firstDate.toLocaleDateString("en-GB", { month: "short" });
  const lastMonth = lastDate.toLocaleDateString("en-GB", { month: "short" });
  const year = selectedDate.getFullYear();
  return `${firstMonth}${firstMonth === lastMonth ? "" : ` - ${lastMonth}`} ${year}`;
}
