import assert from "node:assert/strict";
import test from "node:test";
import { sendTransactionalEmail } from "../../server/emailProvider.js";
import { emailTemplates } from "../../server/emailTemplates.js";
import {
  buildIcs,
  calendarEventFromAppointment,
  calendarFileName,
  googleCalendarUrl,
  londonLocalToUtc,
} from "./calendarEvent.js";

const appointment = {
  address: "12 Example Road, Soho, London",
  bookingReference: "VM-1001",
  dateValue: "2026-11-05",
  duration: 60,
  end: 660,
  id: "11111111-2222-3333-4444-555555555555",
  serviceName: "Swedish massage",
  start: 600,
};

const confirmedCashPayload = {
  address: appointment.address,
  bookingId: appointment.id,
  bookingReference: appointment.bookingReference,
  customer: { name: "Jo" },
  date: "2026-11-05",
  dateValue: "2026-11-05",
  durationMinutes: 60,
  endMinutes: 660,
  items: [{ minutes: 60, name: "Swedish massage" }],
  location: "Soho",
  paymentMethod: "cash",
  paymentStatus: "cash_on_arrival",
  serviceName: "Swedish massage",
  startMinutes: 600,
  status: "confirmed",
  time: "10:00 - 11:00",
  total: 80,
};

test("London times convert correctly in winter, summer and on clock-change days", () => {
  assert.equal(londonLocalToUtc("2026-11-05", 600).toISOString(), "2026-11-05T10:00:00.000Z");
  assert.equal(londonLocalToUtc("2026-07-01", 600).toISOString(), "2026-07-01T09:00:00.000Z");
  assert.equal(londonLocalToUtc("2026-03-29", 720).toISOString(), "2026-03-29T11:00:00.000Z");
  assert.equal(londonLocalToUtc("2026-10-25", 720).toISOString(), "2026-10-25T12:00:00.000Z");
  assert.equal(londonLocalToUtc("not a date", 600), null);
  assert.equal(londonLocalToUtc("2026-11-05", null), null);
});

test("an appointment without usable timing or an id produces no event", () => {
  assert.equal(calendarEventFromAppointment({ ...appointment, dateValue: "" }), null);
  assert.equal(calendarEventFromAppointment({ ...appointment, start: undefined, end: undefined }), null);
  assert.equal(calendarEventFromAppointment({ ...appointment, id: "", bookingReference: "" }), null);
  assert.equal(calendarEventFromAppointment({ ...appointment, end: 600 }), null);
});

test("calendar file has correct times, escaping, line endings and folding", () => {
  const event = calendarEventFromAppointment(appointment, { confirmed: true });
  const ics = buildIcs(event, { now: new Date("2026-10-30T09:00:00Z") });

  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal(ics.replace(/\r\n/g, "").includes("\n"), false);
  assert.match(ics, /DTSTART:20261105T100000Z\r\n/);
  assert.match(ics, /DTEND:20261105T110000Z\r\n/);
  assert.match(ics, /DTSTAMP:20261030T090000Z\r\n/);
  assert.match(ics, /UID:11111111-2222-3333-4444-555555555555@vadmassage\.com\r\n/);
  assert.match(ics, /STATUS:CONFIRMED\r\n/);
  assert.match(ics, /SEQUENCE:1\r\n/);
  assert.match(ics, /LOCATION:12 Example Road\\, Soho\\, London\r\n/);
  assert.match(ics, /TRIGGER:-PT60M\r\n/);
  for (const line of ics.split("\r\n")) {
    assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
  }
  assert.equal(calendarFileName(event), "vadmassage-appointment-20261105.ics");
});

test("a long description is folded and unfolds back to the original text", () => {
  const event = calendarEventFromAppointment({ ...appointment, serviceName: "A very long treatment name ".repeat(6) }, { confirmed: true });
  const ics = buildIcs(event);
  const unfolded = ics.replace(/\r\n /g, "");
  assert.ok(unfolded.includes(`SUMMARY:VadMassage - ${"A very long treatment name ".repeat(6).trim()}`));
});

test("awaiting-confirmation entry is tentative, labelled, and replaced by the confirmed one", () => {
  const tentative = calendarEventFromAppointment(appointment, { confirmed: false });
  const confirmed = calendarEventFromAppointment(appointment, { confirmed: true });

  assert.equal(tentative.status, "TENTATIVE");
  assert.match(tentative.title, /awaiting confirmation/);
  assert.equal(confirmed.title, "VadMassage - Swedish massage");
  assert.equal(tentative.uid, confirmed.uid);
  assert.ok(confirmed.sequence > tentative.sequence);
  assert.match(buildIcs(tentative), /STATUS:TENTATIVE\r\n/);
});

test("Google Calendar link carries title, UTC times and location", () => {
  const url = new URL(googleCalendarUrl(calendarEventFromAppointment(appointment, { confirmed: true })));
  assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("dates"), "20261105T100000Z/20261105T110000Z");
  assert.equal(url.searchParams.get("text"), "VadMassage - Swedish massage");
  assert.equal(url.searchParams.get("location"), appointment.address);
});

test("confirmed booking email attaches a calendar file", () => {
  const email = emailTemplates.bookingConfirmation(confirmedCashPayload);
  assert.equal(email.attachments.length, 1);
  assert.equal(email.attachments[0].filename, "vadmassage-appointment-20261105.ics");
  assert.match(email.attachments[0].contentType, /^text\/calendar/);
  assert.match(email.attachments[0].content, /DTSTART:20261105T100000Z/);
  assert.match(email.html, /Add to Calendar/);
});

test("emails for bookings still waiting for confirmation carry no calendar file", () => {
  const pendingBank = emailTemplates.bookingConfirmation({
    ...confirmedCashPayload,
    paymentMethod: "bank_transfer",
    paymentStatus: "awaiting_verification",
    status: "pending_payment_verification",
  });
  const cashAwaitingApproval = emailTemplates.bookingConfirmation({ ...confirmedCashPayload, status: "payment_method_review" });

  assert.equal(pendingBank.attachments, undefined);
  assert.equal(cashAwaitingApproval.attachments, undefined);
});

test("several confirmed appointments get separately named files", () => {
  const email = emailTemplates.bookingConfirmation({
    appointments: [
      { dateValue: "2026-11-05", durationMinutes: 60, endMinutes: 660, id: "a1", serviceName: "Massage", startMinutes: 600 },
      { dateValue: "2026-11-05", durationMinutes: 60, endMinutes: 900, id: "a2", serviceName: "Massage", startMinutes: 840 },
    ],
    bookingReference: "VM-1002",
    customer: { name: "Jo" },
    paymentStatus: "paid",
    status: "confirmed",
    total: 160,
  });

  assert.deepEqual(email.attachments.map((file) => file.filename), [
    "vadmassage-appointment-20261105-1.ics",
    "vadmassage-appointment-20261105-2.ics",
  ]);
});

test("receipt for a confirmed booking carries the file; without timing it stays a plain receipt", () => {
  const withFile = emailTemplates.receipt({ ...confirmedCashPayload, paymentMethod: "bank_transfer", paymentStatus: "paid" });
  assert.equal(withFile.attachments.length, 1);
  assert.match(withFile.html, /Thursday,? 5 November 2026/);

  const plain = emailTemplates.receipt({ bookingReference: "VM-1", status: "confirmed", total: 80 });
  assert.equal(plain.attachments, undefined);
});

test("cancellation email reminds the client to remove the calendar entry", () => {
  const email = emailTemplates.cancellationConfirmation({ date: "2026-11-05", time: "10:00 - 11:00" });
  assert.match(email.html, /remember to remove it/);
  assert.match(email.text, /remove it from your calendar|remember to remove it/);
});

test("provider sends the calendar file as a base64 attachment", async () => {
  const realFetch = globalThis.fetch;
  const savedEnv = { key: process.env.RESEND_API_KEY, provider: process.env.EMAIL_PROVIDER };
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_PROVIDER = "resend";
  let sentBody = null;
  globalThis.fetch = async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ id: "email-1" }) };
  };

  try {
    const result = await sendTransactionalEmail({ payload: confirmedCashPayload, to: "client@example.test", type: "bookingConfirmation" });
    assert.equal(result.sent, true);
    assert.equal(sentBody.attachments.length, 1);
    assert.equal(sentBody.attachments[0].filename, "vadmassage-appointment-20261105.ics");
    assert.match(sentBody.attachments[0].content_type, /^text\/calendar/);
    assert.match(Buffer.from(sentBody.attachments[0].content, "base64").toString("utf8"), /^BEGIN:VCALENDAR\r\n/);

    await sendTransactionalEmail({ payload: { date: "2026-11-05", time: "10:00" }, to: "client@example.test", type: "cancellationConfirmation" });
    assert.equal("attachments" in sentBody, false);
  } finally {
    globalThis.fetch = realFetch;
    if (savedEnv.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = savedEnv.key;
    if (savedEnv.provider === undefined) delete process.env.EMAIL_PROVIDER; else process.env.EMAIL_PROVIDER = savedEnv.provider;
  }
});
