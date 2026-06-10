import assert from "node:assert/strict";
import {
  saveBookingToSupabase,
  updateBookingInSupabase,
  setSupabaseClientFactory,
} from "./bookingSupabase.js";
import {
  normalizeAdminBookingApprovalPatch,
  paymentMethodToBookingStatus,
  paymentMethodToPaymentStatus,
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
assert.equal(paymentMethodToPaymentStatus("cash"), "awaiting_verification");
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
  { paymentMethod: "cash", status: "payment_method_review" }
);

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
