import assert from "node:assert/strict";
import {
  getUnpaidReservationAutomationAction,
  isGenuineUnpaidReservationCandidate,
  isInternalMaintenanceRequestAuthorized,
  londonAppointmentInstant,
  shouldRecordReminderDelivery,
} from "./unpaidReservationAutomation.js";

const baseBooking = {
  dateValue: "2026-07-20",
  kind: "booking",
  paymentStatus: "pending",
  serviceId: "massage",
  startMinutes: 600,
  status: "pending",
};

function actionFor(hoursUntilAppointment, overrides = {}) {
  const appointmentAt = londonAppointmentInstant(baseBooking.dateValue, baseBooking.startMinutes);
  const now = new Date(appointmentAt.getTime() - (hoursUntilAppointment * 60 * 60 * 1000));
  return getUnpaidReservationAutomationAction({ ...baseBooking, ...overrides }, now);
}

assert.equal(isGenuineUnpaidReservationCandidate(baseBooking), true);
assert.equal(actionFor(120).stage, "five_day");
assert.equal(actionFor(48).stage, "forty_eight_hour");
assert.equal(actionFor(26).stage, "twenty_six_hour");
assert.equal(actionFor(24).stage, "twenty_four_hour_expiry");
assert.equal(actionFor(24).type, "expire");

assert.equal(
  getUnpaidReservationAutomationAction({ ...baseBooking, paymentStatus: "awaiting_verification" }, new Date("2026-07-15T09:00:00.000Z")),
  null,
  "Reported bank transfers must not be treated as unpaid"
);
assert.equal(actionFor(48, { paymentStatus: "paid", status: "confirmed" }), null);
assert.equal(actionFor(48, { paymentStatus: "cash_on_arrival", status: "confirmed" }), null);
assert.equal(actionFor(48, { paymentStatus: "cash_on_arrival", status: "payment_method_review" }), null);
assert.equal(actionFor(48, { paymentStatus: "alternative_requested", status: "payment_method_review" }), null);
assert.equal(actionFor(48, { kind: "personal", serviceId: "personal-event" }), null);

for (const status of ["cancelled", "canceled", "expired", "rejected", "refunded", "completed", "no-show", "no_show"]) {
  assert.equal(actionFor(48, { status }), null, `${status} bookings are excluded`);
}

for (const paymentStatus of ["cancelled", "canceled", "expired", "rejected", "refunded"]) {
  assert.equal(actionFor(48, { paymentStatus }), null, `${paymentStatus} payments are excluded`);
}

assert.equal(
  actionFor(48, { unpaidReservationReminders: { forty_eight_hour: "2026-07-18T09:00:00.000Z" } }),
  null,
  "Already delivered reminders are not sent again"
);
assert.equal(actionFor(23.5).stage, "twenty_four_hour_expiry", "Repeated expiry remains idempotent while state is still pending");
assert.equal(actionFor(23.5, { status: "expired", paymentStatus: "expired" }), null, "Expired state stops repeated expiry");

assert.equal(
  getUnpaidReservationAutomationAction({
    ...baseBooking,
    status: "confirmed",
    paymentStatus: "paid",
  }, new Date("2026-07-18T09:00:00.000Z")),
  null,
  "Status changes before sending must be rechecked"
);

const summerAppointment = londonAppointmentInstant("2026-07-20", 600);
assert.equal(summerAppointment.toISOString(), "2026-07-20T09:00:00.000Z", "London summer time is handled");
const winterAppointment = londonAppointmentInstant("2026-12-20", 600);
assert.equal(winterAppointment.toISOString(), "2026-12-20T10:00:00.000Z", "London winter time is handled");

assert.equal(isInternalMaintenanceRequestAuthorized({ "x-internal-api-secret": "secret" }, "secret"), true);
assert.equal(isInternalMaintenanceRequestAuthorized({ "x-internal-api-secret": "wrong" }, "secret"), false);
assert.equal(isInternalMaintenanceRequestAuthorized({}, "secret"), false);
assert.equal(isInternalMaintenanceRequestAuthorized({ "x-internal-api-secret": "secret" }, ""), false);
assert.equal(
  isInternalMaintenanceRequestAuthorized(new Headers({ "x-internal-api-secret": "secret" }), "secret"),
  true
);

assert.equal(shouldRecordReminderDelivery({ sent: true }), true);
assert.equal(shouldRecordReminderDelivery({ sent: false }), false);
assert.equal(shouldRecordReminderDelivery({ error: "provider failed" }), false);

console.log("Unpaid reservation automation eligibility tests passed.");
