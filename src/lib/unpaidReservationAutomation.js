const TERMINAL_BOOKING_STATUSES = new Set([
  "cancelled",
  "canceled",
  "completed",
  "expired",
  "no-show",
  "no_show",
  "rejected",
  "refunded",
]);

const EXCLUDED_PAYMENT_STATUSES = new Set([
  "alternative_requested",
  "awaiting_verification",
  "cancelled",
  "canceled",
  "cash_on_arrival",
  "expired",
  "paid",
  "rejected",
  "refunded",
]);

const REMINDER_STAGES = [
  { id: "five_day", thresholdHours: 120, minimumHours: 48, type: "reminder" },
  { id: "forty_eight_hour", thresholdHours: 48, minimumHours: 26, type: "payment_request" },
  { id: "twenty_six_hour", thresholdHours: 26, minimumHours: 24, type: "expiry_warning" },
  { id: "twenty_four_hour_expiry", thresholdHours: 24, minimumHours: -Infinity, type: "expire" },
];

function cleanText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isPersonalEvent(booking = {}) {
  return cleanText(booking.kind) === "personal" || cleanText(booking.serviceId) === "personal-event";
}

function reminderDeliveryMap(booking = {}) {
  const source = booking.unpaidReservationReminders || booking.unpaidReservationReminderState || {};
  return source && typeof source === "object" && !Array.isArray(source) ? source : {};
}

function timeZoneOffsetMs(timeZone, date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const value = parts.find((part) => part.type === "timeZoneName")?.value || "GMT";
  const match = value.match(/^GMT(?:(?<sign>[+-])(?<hours>\d{1,2})(?::(?<minutes>\d{2}))?)?$/);
  if (!match) return 0;

  const sign = match.groups.sign === "-" ? -1 : 1;
  const hours = Number(match.groups.hours || 0);
  const minutes = Number(match.groups.minutes || 0);
  return sign * ((hours * 60) + minutes) * 60 * 1000;
}

export function londonAppointmentInstant(dateValue, startMinutes = 0) {
  const match = String(dateValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const minutes = Number(startMinutes);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 2880) return null;

  const localAsUtc = new Date(Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60));
  const firstGuess = new Date(localAsUtc.getTime() - timeZoneOffsetMs("Europe/London", localAsUtc));
  const corrected = new Date(localAsUtc.getTime() - timeZoneOffsetMs("Europe/London", firstGuess));
  return corrected;
}

export function isGenuineUnpaidReservationCandidate(booking = {}) {
  const status = cleanText(booking.status);
  const paymentStatus = cleanText(booking.paymentStatus || booking.payment_status);

  if (isPersonalEvent(booking)) return false;
  if (TERMINAL_BOOKING_STATUSES.has(status)) return false;
  if (EXCLUDED_PAYMENT_STATUSES.has(paymentStatus)) return false;

  // The current live client flow does not create this state. This predicate is
  // intentionally narrow so future automation cannot confuse "reported transfer"
  // with unpaid.
  return status === "pending" && paymentStatus === "pending";
}

export function getUnpaidReservationAutomationAction(booking = {}, now = new Date()) {
  if (!isGenuineUnpaidReservationCandidate(booking)) return null;

  const dateValue = booking.dateValue || booking.date;
  const startMinutes = Number.isFinite(Number(booking.startMinutes))
    ? Number(booking.startMinutes)
    : Number(booking.start_minutes);
  const appointmentAt = londonAppointmentInstant(dateValue, startMinutes);
  if (!appointmentAt) return null;

  const hoursUntilAppointment = (appointmentAt.getTime() - now.getTime()) / (60 * 60 * 1000);
  if (hoursUntilAppointment < 0) return null;

  const delivered = reminderDeliveryMap(booking);
  const stage = REMINDER_STAGES.find((candidate) => (
    hoursUntilAppointment <= candidate.thresholdHours
    && hoursUntilAppointment > candidate.minimumHours
  ));

  if (!stage || (stage.type !== "expire" && delivered[stage.id])) return null;

  return {
    appointmentAt: appointmentAt.toISOString(),
    hoursUntilAppointment,
    stage: stage.id,
    type: stage.type,
  };
}

export function isInternalMaintenanceRequestAuthorized(headers = {}, expectedSecret = "") {
  if (!expectedSecret) return false;
  const getHeader = (name) => {
    if (headers && typeof headers.get === "function") return headers.get(name);
    return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
  };
  return getHeader("x-internal-api-secret") === expectedSecret;
}

export function shouldRecordReminderDelivery(result = {}) {
  return Boolean(result && result.sent === true);
}
