import assert from "node:assert/strict";
import {
  saveBookingToSupabase,
  updateBookingInSupabase,
  setSupabaseClientFactory,
} from "./bookingSupabase.js";
import {
  bookingToSupabasePayload,
  normalizeAdminBookingApprovalPatch,
  paymentMethodToBookingStatus,
  paymentMethodToPaymentStatus,
  supabaseRowToStorageBooking,
} from "./bookingPersistence.js";

const sampleBooking = {
  id: "00000000-0000-4000-8000-000000000001",
  serviceId: "deep-tissue",
  serviceName: "Deep Tissue Recovery",
  start: "10:00",
  duration: 60,
  travelBuffer: 15,
  price: 100,
  dateValue: "2026-06-10",
  customerEmail: "test@example.com",
};

const paymentMetadataBooking = {
  ...sampleBooking,
  id: "00000000-0000-4000-8000-000000000011",
  bookingReference: "VB-20260618103000",
  orderId: "00000000-0000-4000-8000-000000000012",
  paymentHoldExpiresAt: "2026-06-18T11:30:00.000Z",
  paymentId: "pay_00000000-0000-4000-8000-000000000012",
  paymentMethod: "bank_transfer",
  paymentStatus: "awaiting_verification",
  status: "pending_payment_verification",
};

let lastRpcCall = null;
setSupabaseClientFactory(async () => ({
  rpc: (method, params) => {
    lastRpcCall = { method, params };
    return {
      abortSignal: () => Promise.resolve({ data: { id: "returned-id" }, error: null }),
    };
  },
}));

assert.equal(paymentMethodToPaymentStatus("card"), "pending");
assert.equal(paymentMethodToBookingStatus("bank_transfer"), "pending_payment_verification");
assert.equal(paymentMethodToPaymentStatus("alternative_requested"), "alternative_requested");
assert.equal(paymentMethodToBookingStatus("alternative_requested"), "payment_method_review");
assert.equal(paymentMethodToPaymentStatus("cash"), "cash_on_arrival");
assert.equal(paymentMethodToBookingStatus("cash"), "payment_method_review");
assert.deepEqual(
  normalizeAdminBookingApprovalPatch(
    { paymentStatus: "paid" },
    { paymentMethod: "bank_transfer", paymentStatus: "awaiting_verification", status: "pending_payment_verification" }
  ),
  { paymentStatus: "paid", status: "confirmed" }
);
assert.deepEqual(
  normalizeAdminBookingApprovalPatch(
    { status: "cancelled" },
    { paymentMethod: "card", paymentStatus: "paid", status: "confirmed" }
  ),
  { status: "cancelled", paymentStatus: "cancelled" }
);
assert.deepEqual(
  normalizeAdminBookingApprovalPatch(
    { paymentMethod: "cash" },
    { paymentMethod: "bank_transfer", paymentStatus: "awaiting_verification", status: "pending_payment_verification" }
  ),
  { paymentMethod: "cash", paymentStatus: "cash_on_arrival", status: "payment_method_review" }
);
assert.deepEqual(
  normalizeAdminBookingApprovalPatch(
    { paymentStatus: "cash_on_arrival", status: "confirmed" },
    { paymentMethod: "cash", paymentStatus: "cash_on_arrival", status: "payment_method_review" }
  ),
  { paymentStatus: "cash_on_arrival", status: "confirmed" }
);
{
  const currentCashBooking = {
    paymentMethod: "cash",
    paymentStatus: "cash_on_arrival",
    status: "confirmed",
  };
  const paidPatch = normalizeAdminBookingApprovalPatch(
    { paymentStatus: "paid" },
    currentCashBooking
  );
  assert.deepEqual(paidPatch, { paymentStatus: "paid" });
  assert.deepEqual(
    { ...currentCashBooking, ...paidPatch },
    { paymentMethod: "cash", paymentStatus: "paid", status: "confirmed" }
  );
}
assert.deepEqual(
  normalizeAdminBookingApprovalPatch(
    { paymentStatus: "cancelled", status: "cancelled" },
    { paymentMethod: "cash", paymentStatus: "cash_on_arrival", status: "payment_method_review" }
  ),
  { paymentStatus: "cancelled", status: "cancelled" }
);

{
  const payload = bookingToSupabasePayload(
    paymentMetadataBooking,
    paymentMetadataBooking.status
  );
  const notes = JSON.parse(payload.notes);

  assert.equal(payload.order_id, paymentMetadataBooking.orderId);
  assert.equal(payload.payment_id, paymentMetadataBooking.paymentId);
  assert.equal(payload.status, "pending_payment_verification");
  assert.equal(notes.appBooking.paymentMethod, "bank_transfer");
  assert.equal(notes.appBooking.paymentStatus, "awaiting_verification");
  assert.equal(notes.appBooking.bookingReference, "VB-20260618103000");
  assert.equal(notes.appBooking.paymentHoldExpiresAt, "2026-06-18T11:30:00.000Z");
  assert.equal(notes.appBooking.orderId, paymentMetadataBooking.orderId);
  assert.equal(notes.appBooking.paymentId, paymentMetadataBooking.paymentId);
  assert.equal(notes.appBooking.status, "pending_payment_verification");

  const reloaded = supabaseRowToStorageBooking({
    ...payload,
    order_id: paymentMetadataBooking.orderId,
    payment_id: paymentMetadataBooking.paymentId,
  });

  assert.equal(reloaded.paymentMethod, "bank_transfer");
  assert.equal(reloaded.paymentStatus, "awaiting_verification");
  assert.equal(reloaded.bookingReference, "VB-20260618103000");
  assert.equal(reloaded.paymentHoldExpiresAt, "2026-06-18T11:30:00.000Z");
  assert.equal(reloaded.orderId, paymentMetadataBooking.orderId);
  assert.equal(reloaded.paymentId, paymentMetadataBooking.paymentId);
  assert.equal(reloaded.status, "pending_payment_verification");
}

{
  const fallbackReloaded = supabaseRowToStorageBooking({
    id: "00000000-0000-4000-8000-000000000021",
    booking_reference: "VB-FALLBACK-1",
    client_email: "fallback@example.com",
    client_name: "Fallback Client",
    client_phone: "07123456789",
    date: "2026-06-18",
    duration_minutes: 90,
    order_id: "00000000-0000-4000-8000-000000000022",
    payment_hold_expires_at: "2026-06-18T12:00:00.000Z",
    payment_id: "pay_fallback",
    payment_method: "bank_transfer",
    payment_status: "awaiting_verification",
    price: 120,
    selected_area: "Chelsea",
    service_id: "deep-tissue",
    service_name: "Deep Tissue Recovery",
    start_minutes: 600,
    status: "pending_payment_verification",
    travel_fee: 0,
  });

  assert.equal(fallbackReloaded.paymentMethod, "bank_transfer");
  assert.equal(fallbackReloaded.paymentStatus, "awaiting_verification");
  assert.equal(fallbackReloaded.bookingReference, "VB-FALLBACK-1");
  assert.equal(fallbackReloaded.paymentHoldExpiresAt, "2026-06-18T12:00:00.000Z");
  assert.equal(fallbackReloaded.orderId, "00000000-0000-4000-8000-000000000022");
  assert.equal(fallbackReloaded.paymentId, "pay_fallback");
  assert.equal(fallbackReloaded.status, "pending_payment_verification");
}

// 1. saveBookingToSupabase success path
const savedBooking = await saveBookingToSupabase({
  ...sampleBooking,
  status: "pending_payment_verification",
});
assert.equal(savedBooking.id, "returned-id");
assert.equal(lastRpcCall.method, "create_secure_booking");
assert.equal(lastRpcCall.params.booking_payload.status, "pending_payment_verification");
assert.equal(lastRpcCall.params.booking_payload.id, sampleBooking.id);

// 2. updateBookingInSupabase success path via secure RPC
let lastUpdateRpcCall = null;
setSupabaseClientFactory(async () => ({
  rpc: (method, params) => {
    lastUpdateRpcCall = { method, params };
    return {
      data: "00000000-0000-4000-8000-000000000005",
      error: null,
    };
  },
}));

const updatedBooking = await updateBookingInSupabase({
  ...sampleBooking,
  id: "00000000-0000-4000-8000-000000000005",
  status: "cancelled",
});
assert.equal(lastUpdateRpcCall.method, "update_secure_booking");
assert.equal(lastUpdateRpcCall.params.booking_payload.id, "00000000-0000-4000-8000-000000000005");
assert.equal(lastUpdateRpcCall.params.booking_payload.status, "cancelled");
assert.equal(updatedBooking, "00000000-0000-4000-8000-000000000005");

// 3. RPC timeout/abort path
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

try {
  globalThis.setTimeout = (callback) => {
    callback();
    return 1;
  };
  globalThis.clearTimeout = () => {};

  setSupabaseClientFactory(async () => ({
    rpc: () => ({
      abortSignal: (signal) => new Promise((resolve, reject) => {
        if (signal.aborted) {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
          return;
        }

        signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    }),
  }));

  await assert.rejects(
    saveBookingToSupabase({
      ...sampleBooking,
      id: "00000000-0000-4000-8000-000000000003",
    }),
    {
      message: /Creating the booking timed out/,
    }
  );
} finally {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
}

// 4. updateBookingInSupabase success path
let updateCallCount = 0;

// 5. Supabase error handling path
setSupabaseClientFactory(async () => ({
  rpc: () => ({
    abortSignal: () => Promise.resolve({ data: null, error: { message: "generic failure" } }),
  }),
}));

await assert.rejects(
  saveBookingToSupabase({
    ...sampleBooking,
    id: "00000000-0000-4000-8000-000000000004",
  }),
  {
    message: /Booking could not be saved: generic failure/,
  }
);
