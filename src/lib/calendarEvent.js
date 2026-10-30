// Builds the calendar entry (.ics file and Google Calendar link) for a booking.
// Used by the confirmation page button and by the confirmation emails, so both
// describe the appointment identically. Times are Europe/London, like the booking engine.

const BOOKING_TIME_ZONE = "Europe/London";
const UID_DOMAIN = "vadmassage.com";
const CONTACT_EMAIL = "bookings@vadmassage.com";

function isMinutes(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function londonOffsetMs(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BOOKING_TIME_ZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const value = parts.find((part) => part.type === "timeZoneName")?.value || "GMT";
  const match = value.match(/^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/);
  if (!match || !match[1]) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * ((Number(match[2]) * 60) + Number(match[3] || 0)) * 60000;
}

// "2026-11-05" + 600 minutes after midnight, London time -> the real moment in time.
export function londonLocalToUtc(dateValue, minutes) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || ""));
  if (!match || !isMinutes(minutes)) return null;
  const localAsUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, Number(minutes));
  const firstGuess = localAsUtc - londonOffsetMs(new Date(localAsUtc));
  const corrected = new Date(localAsUtc - londonOffsetMs(new Date(firstGuess)));
  return Number.isNaN(corrected.getTime()) ? null : corrected;
}

function icsStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcsText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Calendar files limit lines to 75 bytes; longer lines continue on the next line after a space.
function foldLine(line) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const chunks = [];
  let current = "";
  let size = 0;
  let limit = 75;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (size + bytes > limit) {
      chunks.push(current);
      current = "";
      size = 0;
      limit = 74;
    }
    current += character;
    size += bytes;
  }
  chunks.push(current);
  return chunks.join("\r\n ");
}

// appointment: { id, bookingReference, dateValue, start, end, duration, serviceName, address, location }
// start/end are minutes after midnight. Returns null when the appointment cannot be placed in time.
export function calendarEventFromAppointment(appointment = {}, { confirmed = false } = {}) {
  const endMinutes = isMinutes(appointment.end)
    ? Number(appointment.end)
    : (isMinutes(appointment.start) && isMinutes(appointment.duration)
      ? Number(appointment.start) + Number(appointment.duration)
      : null);
  const start = londonLocalToUtc(appointment.dateValue, appointment.start);
  const end = londonLocalToUtc(appointment.dateValue, endMinutes);
  const uidSource = String(appointment.id || appointment.bookingReference || "").trim();
  if (!start || !end || end <= start || !uidSource) return null;

  const serviceName = String(appointment.serviceName || "").trim() || "Massage";
  const reference = String(appointment.bookingReference || "").trim();
  const duration = isMinutes(appointment.duration) ? Number(appointment.duration) : Math.round((end - start) / 60000);

  return {
    description: [
      confirmed ? "Your booking is confirmed." : "Awaiting confirmation. I'll confirm your booking as soon as I can.",
      reference ? `Booking reference: ${reference}` : "",
      `Duration: ${duration} minutes`,
      `To change or cancel, email ${CONTACT_EMAIL}.`,
    ].filter(Boolean).join("\n"),
    end,
    location: String(appointment.address || appointment.location || "").trim(),
    // A fresh version number lets the phone replace the "awaiting confirmation" entry when the confirmed file arrives.
    sequence: confirmed ? 1 : 0,
    start,
    status: confirmed ? "CONFIRMED" : "TENTATIVE",
    title: `VadMassage - ${serviceName}${confirmed ? "" : " (awaiting confirmation)"}`,
    uid: `${uidSource}@${UID_DOMAIN}`,
  };
}

export function buildIcs(event, { now = new Date(), reminderMinutes = 60 } = {}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VadMassage//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${icsStamp(now)}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTART:${icsStamp(event.start)}`,
    `DTEND:${icsStamp(event.end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : "",
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    `STATUS:${event.status}`,
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    `TRIGGER:-PT${reminderMinutes}M`,
    "ACTION:DISPLAY",
    "DESCRIPTION:Appointment reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

export function calendarFileName(event) {
  return `vadmassage-appointment-${icsStamp(event.start).slice(0, 8)}.ics`;
}

export function googleCalendarUrl(event) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    dates: `${icsStamp(event.start)}/${icsStamp(event.end)}`,
    details: event.description,
    text: event.title,
  });
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
