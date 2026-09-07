export const VALID_DURATIONS = [60, 90, 120, 150, 180, 210, 240];
export const DEFAULT_TRAVEL_BUFFER = 60;
export const SLOT_INCREMENT = 30;
export const CLIENT_BOOKING_TIME_ZONE = "Europe/London";
export const CLIENT_MINIMUM_BOOKING_NOTICE_MINUTES = 120;

export function roundUpToSlotIncrement(minutes, increment = SLOT_INCREMENT) {
  const numericMinutes = Number(minutes);
  const numericIncrement = Math.max(1, Number(increment) || SLOT_INCREMENT);
  if (!Number.isFinite(numericMinutes)) return 0;
  return Math.ceil(numericMinutes / numericIncrement) * numericIncrement;
}

// Strict duration validation - only allow durations in VALID_DURATIONS
export function isValidDuration(duration) {
  const minutes = Number(duration);
  return Number.isFinite(minutes) && VALID_DURATIONS.includes(minutes);
}

export const DEFAULT_SERVICES = [
  { id: "massage", name: "Massage", visible: true },
  { id: "assisted-stretching", name: "Assisted Stretching", visible: true },
  { id: "soft-tissue-therapy", name: "Soft Tissue Therapy", visible: true },
  { id: "body-exam", name: "Body Exam", visible: true },
];

export const DEFAULT_DAY_SETTINGS = {
  dateLabel: "Today",
  workingStart: "09:00",
  workingEnd: "18:00",
  mode: "optimized",
  startMode: "flexible",
  fixedStart: "10:00",
  releaseTime: "11:00",
  customWorkingHours: false,
  unavailable: false,
};

export function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes) {
  const safeMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function datePartsInTimeZone(date, timeZone = CLIENT_BOOKING_TIME_ZONE) {
  const sourceDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(sourceDate);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function dateValueInTimeZone(date = new Date(), timeZone = CLIENT_BOOKING_TIME_ZONE) {
  const parts = datePartsInTimeZone(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function minutesInTimeZone(date = new Date(), timeZone = CLIENT_BOOKING_TIME_ZONE) {
  const parts = datePartsInTimeZone(date, timeZone);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

export function normalizePlainDateValue(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const [, year, month, day] = match;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return "";

  const utcDate = new Date(Date.UTC(Number(year), monthNumber - 1, dayNumber));
  if (
    utcDate.getUTCFullYear() !== Number(year) ||
    utcDate.getUTCMonth() !== monthNumber - 1 ||
    utcDate.getUTCDate() !== dayNumber
  ) {
    return "";
  }

  return `${year}-${month}-${day}`;
}

export function addDaysToPlainDateValue(dateValue, days) {
  const safeValue = normalizePlainDateValue(dateValue);
  if (!safeValue) return "";
  const [year, month, day] = safeValue.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  return [
    utcDate.getUTCFullYear(),
    String(utcDate.getUTCMonth() + 1).padStart(2, "0"),
    String(utcDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function daysBetweenPlainDateValues(startDateValue, endDateValue) {
  const safeStart = normalizePlainDateValue(startDateValue);
  const safeEnd = normalizePlainDateValue(endDateValue);
  if (!safeStart || !safeEnd) return 0;
  const [startYear, startMonth, startDay] = safeStart.split("-").map(Number);
  const [endYear, endMonth, endDay] = safeEnd.split("-").map(Number);
  const startTime = Date.UTC(startYear, startMonth - 1, startDay);
  const endTime = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.round((endTime - startTime) / 86400000);
}

export function isClientSlotStillBookable({
  dateValue,
  minimumNoticeMinutes = 0,
  now = new Date(),
  startMinutes,
  timeZone = CLIENT_BOOKING_TIME_ZONE,
}) {
  const safeDateValue = normalizePlainDateValue(dateValue);
  const numericStart = Number(startMinutes);
  if (!safeDateValue || !Number.isFinite(numericStart)) return false;

  const currentDateValue = dateValueInTimeZone(now, timeZone);
  if (safeDateValue < currentDateValue) return false;
  if (safeDateValue > currentDateValue) return true;

  return numericStart >= minutesInTimeZone(now, timeZone) + Math.max(0, Number(minimumNoticeMinutes) || 0);
}

export function filterClientBookableSlots(slots, dateValue, options = {}) {
  return (Array.isArray(slots) ? slots : []).filter((slot) =>
    isClientSlotStillBookable({
      ...options,
      dateValue,
      startMinutes: slot?.start,
    })
  );
}

export function normalizeBooking(booking) {
  const start = typeof booking.start === "number" ? booking.start : timeToMinutes(booking.start);
  const duration = Number(booking.duration);
  const travelBuffer = Math.max(0, Number(booking.travelBuffer ?? DEFAULT_TRAVEL_BUFFER));

  return {
    ...booking,
    start,
    duration,
    travelBuffer,
    sessionEnd: start + duration,
    bufferEnd: start + duration + travelBuffer,
  };
}

export function getBookingBlocks(bookings) {
  return bookings
    .map(normalizeBooking)
    .sort((a, b) => a.start - b.start);
}

export function getFlow(bookings) {
  const blocks = getBookingBlocks(bookings);

  if (blocks.length === 0) {
    return {
      hasBookings: false,
      bookings: [],
      flowStart: null,
      flowEnd: null,
    };
  }

  return {
    hasBookings: true,
    bookings: blocks,
    flowStart: Math.min(...blocks.map((booking) => booking.start)),
    flowEnd: Math.max(...blocks.map((booking) => booking.bufferEnd)),
  };
}

export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function isSlotInsideWorkingHours(slotStart, duration, travelBuffer, settings) {
  const workingStart = timeToMinutes(settings.workingStart);
  const workingEnd = timeToMinutes(settings.workingEnd);
  const slotEndWithBuffer = slotStart + duration + travelBuffer;

  return slotStart >= workingStart && slotEndWithBuffer <= workingEnd;
}

export function isSlotFree(slotStart, duration, travelBuffer, bookings) {
  const slotEndWithBuffer = slotStart + duration + travelBuffer;
  return getBookingBlocks(bookings).every((booking) => {
    return !rangesOverlap(slotStart, slotEndWithBuffer, booking.start, booking.bufferEnd);
  });
}

export function makeSlot(label, start, duration, travelBuffer, bookings, settings, reason = "") {
  const end = start + duration;
  const bufferEnd = end + travelBuffer;
  const valid =
    isValidDuration(duration) &&
    isSlotInsideWorkingHours(start, duration, travelBuffer, settings) &&
    isSlotFree(start, duration, travelBuffer, bookings);

  return {
    label,
    start,
    end,
    bufferEnd,
    duration,
    travelBuffer,
    valid,
    reason,
  };
}

export function getFlexibleSlots({ settings, bookings, requestedDuration, requestedTravelBuffer }) {
  const workingStart = timeToMinutes(settings.workingStart);
  const workingEnd = timeToMinutes(settings.workingEnd);
  const slots = [];

  for (let start = workingStart; start + requestedDuration + requestedTravelBuffer <= workingEnd; start += SLOT_INCREMENT) {
    const slot = makeSlot(
      "available slot",
      start,
      requestedDuration,
      requestedTravelBuffer,
      bookings,
      settings,
      "Flexible Mode scans valid starts inside working hours."
    );

    if (slot.valid) {
      slots.push(slot);
    }
  }

  return slots;
}

export function getOptimizedSlots({ settings, bookings, minimumStartMinutes = 0, requestedDuration, requestedTravelBuffer }) {
  const flow = getFlow(bookings);

  if (!flow.hasBookings) {
    if (settings.startMode === "fixed") {
      const fixedStart = timeToMinutes(settings.fixedStart);
      const fixedSlot = makeSlot(
        "fixed first booking",
        fixedStart,
        requestedDuration,
        requestedTravelBuffer,
        bookings,
        settings,
        "Fixed Start is active, so the first booking can only start at the anchor time."
      );
      return fixedSlot.valid ? [fixedSlot] : [];
    }

    return getFlexibleSlots({
      settings,
      bookings,
      requestedDuration,
      requestedTravelBuffer,
    }).map((slot) => ({
      ...slot,
      label: "first booking option",
      reason: "Empty optimized day with Flexible Start shows full first-booking availability."
    }));
  }

  const beforeStart = flow.flowStart - (requestedDuration + requestedTravelBuffer);
  const afterStart = Math.max(flow.flowEnd, roundUpToSlotIncrement(minimumStartMinutes));

  return [
    makeSlot(
      "next slot before flow",
      beforeStart,
      requestedDuration,
      requestedTravelBuffer,
      bookings,
      settings,
      "Optimized Mode only allows a booking to attach before the current flow."
    ),
    makeSlot(
      "next slot after flow",
      afterStart,
      requestedDuration,
      requestedTravelBuffer,
      bookings,
      settings,
      "Optimized Mode only allows a booking to attach after the current flow."
    ),
  ].filter((slot) => slot.valid);
}

export function getSchedulingPreview({ settings, bookings, minimumStartMinutes = 0, requestedDuration, requestedTravelBuffer }) {
  const duration = Number(requestedDuration);
  const travelBuffer = Math.max(0, Number(requestedTravelBuffer));
  const flow = getFlow(bookings);

  if (settings.unavailable) {
    return {
      flow,
      slots: [],
      warnings: ["This day is marked unavailable."],
    };
  }

  if (!isValidDuration(duration)) {
    return {
      flow,
      slots: [],
      warnings: ["Session duration must be at least 60 minutes and can include enhancement time."],
    };
  }

  const slots = settings.mode === "optimized"
    ? getOptimizedSlots({ settings, bookings, minimumStartMinutes, requestedDuration: duration, requestedTravelBuffer: travelBuffer })
    : getFlexibleSlots({ settings, bookings, requestedDuration: duration, requestedTravelBuffer: travelBuffer });

  return {
    flow,
    slots,
    warnings: [],
  };
}

export function createBooking({ serviceId, serviceName, start, duration, travelBuffer }) {
  const numericStart = typeof start === "number" ? start : timeToMinutes(start);

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    serviceId,
    serviceName,
    start: numericStart,
    duration: Number(duration),
    travelBuffer: Math.max(0, Number(travelBuffer)),
  };
}
