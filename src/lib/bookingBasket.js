import { DEFAULT_TRAVEL_BUFFER, getSchedulingPreview, minutesToTime } from "../schedulingEngine.js";

export function basketAppointmentToBooking(appointment) {
  return {
    id: `basket-${appointment.id}`,
    serviceId: appointment.serviceId,
    serviceName: appointment.serviceName,
    start: minutesToTime(appointment.start),
    duration: appointment.duration,
    travelBuffer: appointment.travelBuffer ?? DEFAULT_TRAVEL_BUFFER,
  };
}

export function getBasketBookingsForDate(appointments, dateValue) {
  return appointments
    .filter((appointment) => appointment.dateValue === dateValue)
    .map(basketAppointmentToBooking);
}

export function getBasketAwareSchedulingPreview({
  appointments = [],
  bookings = [],
  dateValue,
  requestedDuration,
  requestedTravelBuffer = DEFAULT_TRAVEL_BUFFER,
  settings,
}) {
  return getSchedulingPreview({
    settings,
    bookings: [...bookings, ...getBasketBookingsForDate(appointments, dateValue)],
    requestedDuration,
    requestedTravelBuffer,
  });
}

export function getActiveServiceAreas(serviceAreas = []) {
  return serviceAreas.filter((area) => area.active !== false);
}

export function validateBasketAppointments({
  appointments = [],
  days = [],
  serviceAreas = [],
}) {
  const activeAreaIds = new Set(getActiveServiceAreas(serviceAreas).map((area) => area.id));
  const temporaryBookingsByDate = new Map();

  for (const appointment of appointments) {
    const day = days.find((item) => item.dateValue === appointment.dateValue);

    if (!activeAreaIds.has(appointment.selectedAreaId)) {
      return {
        appointment,
        message: `${appointment.selectedAreaName || "This area"} is no longer available for online booking.`,
        ok: false,
        reason: "inactive_area",
      };
    }

    if (!day) {
      return {
        appointment,
        message: `${appointment.dateLabel || appointment.dateValue} is no longer visible in the calendar.`,
        ok: false,
        reason: "missing_day",
      };
    }

    const temporaryBookings = temporaryBookingsByDate.get(day.dateValue) ?? [];
    const preview = getSchedulingPreview({
      settings: day.settings,
      bookings: [...day.bookings, ...temporaryBookings],
      requestedDuration: appointment.duration,
      requestedTravelBuffer: appointment.travelBuffer ?? DEFAULT_TRAVEL_BUFFER,
    });
    const expectedEnd = appointment.end ?? appointment.start + appointment.duration;
    const expectedBufferEnd = expectedEnd + (appointment.travelBuffer ?? DEFAULT_TRAVEL_BUFFER);
    const stillAvailable = preview.slots.some((slot) => (
      slot.start === appointment.start &&
      slot.end === expectedEnd &&
      slot.bufferEnd === expectedBufferEnd
    ));

    if (!stillAvailable) {
      return {
        appointment,
        message: `${appointment.dateLabel || appointment.dateValue} at ${minutesToTime(appointment.start)} is no longer available.`,
        ok: false,
        reason: "unavailable_slot",
      };
    }

    temporaryBookingsByDate.set(day.dateValue, [
      ...temporaryBookings,
      basketAppointmentToBooking(appointment),
    ]);
  }

  return { ok: true };
}

export function cancelSingleBooking(bookings, bookingId) {
  return bookings.map((booking) =>
    booking.id === bookingId ? { ...booking, status: "cancelled" } : booking
  );
}

export function rescheduleSingleBooking(bookings, bookingId, patch) {
  return bookings.map((booking) =>
    booking.id === bookingId ? { ...booking, ...patch, status: booking.status || "confirmed" } : booking
  );
}
