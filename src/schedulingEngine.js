export const VALID_DURATIONS = [60, 90, 120, 150, 180, 210, 240];
export const DEFAULT_TRAVEL_BUFFER = 60;
export const SLOT_INCREMENT = 30;

// Strict duration validation - only allow durations in VALID_DURATIONS
export function isValidDuration(duration) {
  const minutes = Number(duration);
  return Number.isFinite(minutes) && VALID_DURATIONS.includes(minutes);
}

export const DEFAULT_SERVICES = [
  { id: "deep-tissue", name: "Deep Tissue Recovery", visible: true },
  { id: "sports", name: "Performance Sports Massage", visible: true },
  { id: "head-massage", name: "Cloud Nine Head Massage", visible: true },
  { id: "prenatal", name: "Prenatal Wellness", visible: true },
  { id: "zero-gravity", name: "The Zero-Gravity Melt", visible: true },
];

export const DEFAULT_DAY_SETTINGS = {
  dateLabel: "Today",
  workingStart: "09:00",
  workingEnd: "18:00",
  mode: "optimized",
  startMode: "flexible",
  fixedStart: "10:00",
  releaseTime: "11:00",
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

export function getOptimizedSlots({ settings, bookings, requestedDuration, requestedTravelBuffer }) {
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
  const afterStart = flow.flowEnd;

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

export function getSchedulingPreview({ settings, bookings, requestedDuration, requestedTravelBuffer }) {
  const duration = Number(requestedDuration);
  const travelBuffer = Math.max(0, Number(requestedTravelBuffer));
  const flow = getFlow(bookings);

  if (!isValidDuration(duration)) {
    return {
      flow,
      slots: [],
      warnings: ["Session duration must be at least 60 minutes and can include enhancement time."],
    };
  }

  const slots = settings.mode === "optimized"
    ? getOptimizedSlots({ settings, bookings, requestedDuration: duration, requestedTravelBuffer: travelBuffer })
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
