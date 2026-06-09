import assert from "node:assert/strict";
import { bookingToSupabasePayload } from "./lib/bookingPersistence.js";
import { buildAdminTelegramMessage, friendlyPaymentStatus } from "../server/telegramProvider.js";
import { emailTemplates } from "../server/emailTemplates.js";

// Test 1: Bank transfer client booking payload
{
  const booking = {
    id: "test-1",
    serviceId: "deep-tissue",
    serviceName: "Deep Tissue",
    start: "10:00",
    duration: 60,
    travelBuffer: 0,
  };
  const wrapper = { ...booking, dateValue: "2026-06-10", price: 100, bookingReference: "VAD-TEST-1", paymentHoldExpiresAt: "2026-06-10T11:00:00Z" };
  const payload = bookingToSupabasePayload(wrapper, "pending_payment_verification");
  assert.equal(payload.status, "pending_payment_verification");
  const notes = JSON.parse(payload.notes);
  assert.equal(notes.appBooking.bookingReference, "VAD-TEST-1");
  assert.equal(notes.appBooking.paymentHoldExpiresAt, "2026-06-10T11:00:00Z");
}

// Test 2: Alternative payment request payload
{
  const booking = {
    id: "test-2",
    serviceId: "sports",
    serviceName: "Sports Massage",
    start: "12:00",
    duration: 60,
    travelBuffer: 0,
  };
  const wrapper = { ...booking, dateValue: "2026-06-11", price: 120, bookingReference: "VAD-ALT-1", paymentHoldExpiresAt: "2026-06-11T13:00:00Z" };
  const payload = bookingToSupabasePayload(wrapper, "payment_method_review");
  assert.equal(payload.status, "payment_method_review");
  const notes = JSON.parse(payload.notes);
  assert.equal(notes.appBooking.bookingReference, "VAD-ALT-1");
  assert.equal(notes.appBooking.paymentHoldExpiresAt, "2026-06-11T13:00:00Z");
}

// Test 3: Admin confirm simulated via generating payload with paid/confirmed
{
  const booking = {
    id: "test-3",
    serviceId: "relax",
    serviceName: "Relax Massage",
    start: "14:00",
    duration: 60,
    travelBuffer: 0,
  };
  const wrapper = { ...booking, dateValue: "2026-06-12", price: 80, bookingReference: "VAD-ADM-1", paymentHoldExpiresAt: "2026-06-12T15:00:00Z" };
  const payload = bookingToSupabasePayload(wrapper, "confirmed");
  assert.equal(payload.status, "confirmed");
  const notes = JSON.parse(payload.notes);
  assert.equal(notes.appBooking.bookingReference, "VAD-ADM-1");
}

// Test 4: Friendly status labels
{
  assert.equal(friendlyPaymentStatus("pending_payment_verification"), "Awaiting Payment Verification");
  assert.equal(friendlyPaymentStatus("payment_method_review"), "Alternative payment request under review");
}

// Test 5: Telegram/email formatting includes booking reference/payment status/expiry
{
  const booking = {
    id: "test-4",
    clientName: "Jane Doe",
    serviceName: "Deep Tissue",
    duration: 90,
    dateValue: "2026-06-13",
    start: "18:00",
    price: 115,
    bookingReference: "VAD-260613-1800",
    paymentHoldExpiresAt: "2026-06-13T19:00:00Z",
    paymentMethod: "bank_transfer",
    paymentStatus: "awaiting_verification",
  };
  const text = buildAdminTelegramMessage("booking_created", { booking });
  assert.ok(text.includes("Reference:"), "Telegram should include Reference");
  assert.ok(text.includes("Payment Status"), "Telegram should include Payment Status label");
  assert.ok(text.includes("Reservation Expires"), "Telegram should include Reservation Expires");

  const email = emailTemplates.bookingConfirmation({
    customer: { name: "Jane Doe" },
    appointments: [],
    date: "13 June 2026",
    time: "18:00",
    total: 115,
    bookingReference: booking.bookingReference,
    status: "pending_payment_verification",
    paymentMethod: booking.paymentMethod,
    paymentHoldExpiresAt: booking.paymentHoldExpiresAt,
  });

  assert.ok(email.subject.toLowerCase().includes("awaiting payment verification") || email.subject.toLowerCase().includes("received"), "Email subject should mention pending/received");
  assert.ok(email.html.includes(booking.bookingReference), "Email HTML should include booking reference");
  assert.ok(email.html.includes("Payment details"), "Email should include payment details section");
}

// Test 6: Cash-on-arrival and review states should still be treated as pending, not confirmed.
{
  const email = emailTemplates.bookingConfirmation({
    customer: { name: "Jamie Cash" },
    appointments: [],
    date: "14 June 2026",
    time: "16:00",
    total: 95,
    bookingReference: "VAD-CASH-1",
    status: "payment_method_review",
    paymentMethod: "cash",
    paymentStatus: "cash_on_arrival",
    paymentHoldExpiresAt: "2026-06-14T17:00:00Z",
  });

  assert.ok(
    email.subject.toLowerCase().includes("pending") || email.subject.toLowerCase().includes("awaiting"),
    "Cash-on-arrival review email should signal pending approval"
  );
  assert.ok(email.html.includes("VAD-CASH-1"), "Email should include booking reference for cash reviews");
  assert.ok(email.html.includes("Payment details"), "Email should include payment details section for cash reviews");
}

console.log("Reservation flow tests passed.");
