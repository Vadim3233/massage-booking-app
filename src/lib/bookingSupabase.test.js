import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cancelRecentBookingRequestInSupabase,
  loadSessionPreferencesFromSupabase,
  saveBookingToSupabase,
  saveSessionPreferenceToSupabase,
  saveSessionPreferencesOrderToSupabase,
  updateAdminPersonalEventInSupabase,
  updateBookingInSupabase,
  setSupabaseClientFactory,
} from "./bookingSupabase.js";
import {
  BOOKING_SYSTEM_UPDATE_REQUIRED_MESSAGE,
  CLIENT_BOOKING_LIMIT_MESSAGES,
} from "./bookingHoldErrors.js";
import {
  bookingToSupabasePayload,
  generateBookingReference,
  normalizeAdminBookingApprovalPatch,
  paymentMethodToBookingStatus,
  paymentMethodToPaymentStatus,
  supabaseRowToStorageBooking,
} from "./bookingPersistence.js";

const bookingSupabaseSource = readFileSync(new URL("./bookingSupabase.js", import.meta.url), "utf8");
const supabaseClientSource = readFileSync(new URL("../supabaseClient.js", import.meta.url), "utf8");

assert.doesNotMatch(
  bookingSupabaseSource,
  /\.from\(["']bookings["']\)\s*\.update/s,
  "bookingSupabase must not fall back to direct bookings.update"
);
assert.doesNotMatch(
  bookingSupabaseSource,
  /bookingToLegacySupabasePayload|updateBookingRowWithPayload/,
  "legacy direct-update fallback helpers must not be imported or restored"
);
assert.match(
  bookingSupabaseSource,
  /\.from\(["']session_preferences["']\)/,
  "session preferences must load from Supabase, not production localStorage"
);
assert.match(
  supabaseClientSource,
  /publicSupabase[\s\S]*persistSession:\s*false/,
  "public Supabase client must not use persisted browser auth sessions"
);
assert.match(
  bookingSupabaseSource,
  /export async function getPublicSupabaseClient/,
  "booking helpers should expose a stateless public Supabase client"
);
assert.doesNotMatch(
  bookingSupabaseSource,
  /usesPrivateClientRecord|await getPublicSupabaseClient\(\)/,
  "booking mutations must never select anonymous credentials because ownership fields are missing"
);

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
  customerPhone: "07123 456789",
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

const authenticatedUserId = "11111111-1111-4111-8111-111111111111";
const savedAddressId = "22222222-2222-4222-8222-222222222222";

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
assert.equal(paymentMethodToPaymentStatus("bank_transfer"), "awaiting_verification");
assert.equal(paymentMethodToBookingStatus("bank_transfer"), "pending_payment_verification");
assert.equal(paymentMethodToPaymentStatus("alternative_requested"), "alternative_requested");
assert.equal(paymentMethodToBookingStatus("alternative_requested"), "payment_method_review");
assert.equal(paymentMethodToPaymentStatus("cash"), "cash_on_arrival");
assert.equal(paymentMethodToBookingStatus("cash"), "payment_method_review");
{
  const fixedNow = new Date("2026-06-19T20:15:30.000Z");
  const firstReference = generateBookingReference(fixedNow);
  const secondReference = generateBookingReference(fixedNow);

  assert.match(firstReference, /^VDM-20260619201530-[0-9A-Z]{4,}$/);
  assert.match(secondReference, /^VDM-20260619201530-[0-9A-Z]{4,}$/);
  assert.notEqual(firstReference, secondReference);
}
{
  const selectedFilters = [];
  setSupabaseClientFactory(async () => ({
    from: (table) => {
      assert.equal(table, "session_preferences");
      const query = {
        eq: (field, value) => {
          selectedFilters.push([field, value]);
          return query;
        },
        is: (field, value) => {
          selectedFilters.push([field, value]);
          return query;
        },
        order: () => query,
        select: () => query,
        then: (resolve) => resolve({
          data: [
            {
              category: "Focus area",
              conflict_ids: [],
              deleted_at: null,
              id: "11111111-1111-4111-8111-111111111111",
              is_visible: true,
              label: "Neck focus",
              sort_order: 1,
            },
          ],
          error: null,
        }),
      };
      return query;
    },
  }));

  const preferences = await loadSessionPreferencesFromSupabase();
  assert.equal(preferences[0].label, "Neck focus");
  assert.deepEqual(selectedFilters, [["is_visible", true], ["deleted_at", null]]);
}

{
  let upsertedRow = null;
  setSupabaseClientFactory(async () => ({
    from: (table) => {
      assert.equal(table, "session_preferences");
      return {
        upsert: (row) => {
          upsertedRow = row;
          return {
            select: () => ({
              single: () => Promise.resolve({
                data: {
                  ...row,
                  created_at: "2026-07-13T12:00:00.000Z",
                  updated_at: "2026-07-13T12:00:00.000Z",
                },
                error: null,
              }),
            }),
          };
        },
      };
    },
  }));

  const saved = await saveSessionPreferenceToSupabase({
    category: "Include",
    conflictIds: ["11111111-1111-4111-8111-111111111127"],
    id: "11111111-1111-4111-8111-111111111122",
    label: "Foot massage",
    sortOrder: 12,
    visible: true,
  });
  assert.deepEqual(upsertedRow.conflict_ids, ["11111111-1111-4111-8111-111111111127"]);
  assert.deepEqual(saved.conflictIds, ["11111111-1111-4111-8111-111111111127"]);
}

{
  const updatedSortOrders = [];
  setSupabaseClientFactory(async () => ({
    from: (table) => {
      assert.equal(table, "session_preferences");
      return {
        update: (row) => ({
          eq: (field, value) => {
            updatedSortOrders.push([value, row.sort_order]);
            return Promise.resolve({ error: null });
          },
        }),
        select: () => {
          const query = {
            order: () => query,
            then: (resolve) => resolve({
              data: [
                {
                  category: "Focus area",
                  conflict_ids: [],
                  deleted_at: null,
                  id: "11111111-1111-4111-8111-111111111111",
                  is_visible: true,
                  label: "Neck focus",
                  sort_order: 1,
                },
              ],
              error: null,
            }),
          };
          return query;
        },
      };
    },
  }));

  await saveSessionPreferencesOrderToSupabase([
    { id: "11111111-1111-4111-8111-111111111112", label: "Shoulder focus", sortOrder: 1 },
    { id: "11111111-1111-4111-8111-111111111111", label: "Neck focus", sortOrder: 2 },
  ]);
  assert.deepEqual(updatedSortOrders, [
    ["11111111-1111-4111-8111-111111111112", 10000],
    ["11111111-1111-4111-8111-111111111111", 10001],
    ["11111111-1111-4111-8111-111111111112", 1],
    ["11111111-1111-4111-8111-111111111111", 2],
  ]);
}

{
  setSupabaseClientFactory(async () => ({
    from: () => {
      const query = {
        eq: () => query,
        is: () => query,
        order: () => query,
        select: () => query,
        then: (resolve) => resolve({
          data: null,
          error: { code: "42P01", message: "relation session_preferences does not exist" },
        }),
      };
      return query;
    },
  }));

  await assert.rejects(
    loadSessionPreferencesFromSupabase(),
    { message: /Session preferences table is unavailable/ }
  );
}
{
  const paidPatch = normalizeAdminBookingApprovalPatch(
    { paymentStatus: "paid" },
    { paymentMethod: "bank_transfer", paymentStatus: "awaiting_verification", status: "pending_payment_verification" }
  );
  assert.equal(paidPatch.paymentStatus, "paid");
  assert.equal(paidPatch.status, "confirmed");
  assert.match(paidPatch.paymentReceivedAt, /^\d{4}-\d{2}-\d{2}T/);
}
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
  assert.equal(paidPatch.paymentStatus, "paid");
  assert.match(paidPatch.paymentReceivedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(
    { ...currentCashBooking, ...paidPatch },
    { paymentMethod: "cash", paymentReceivedAt: paidPatch.paymentReceivedAt, paymentStatus: "paid", status: "confirmed" }
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
  const cancelledPayload = bookingToSupabasePayload({
    ...sampleBooking,
    id: "00000000-0000-4000-8000-000000000051",
    cancelledAt: "2026-07-09T14:05:00.000Z",
    cancelledBy: "admin",
    cancellationWindow: "late",
    paymentStatus: "cancelled",
    status: "cancelled",
  }, "cancelled");
  const cancelledNotes = JSON.parse(cancelledPayload.notes);
  assert.equal(cancelledNotes.appBooking.cancelledBy, "admin");
  assert.equal(cancelledNotes.appBooking.cancelledAt, "2026-07-09T14:05:00.000Z");
  assert.equal(cancelledNotes.appBooking.cancellationWindow, "late");
  assert.equal(cancelledPayload.cancelled_at, "2026-07-09T14:05:00.000Z");
  assert.equal(cancelledPayload.cancelled_by, "admin");
  assert.equal(cancelledPayload.cancellation_window, "late");

  const reloadedCancelled = supabaseRowToStorageBooking({
    ...cancelledPayload,
    cancelled_at: "2026-07-09T14:10:00.000Z",
    cancelled_by: "client",
    cancellation_window: "free",
  });
  assert.equal(reloadedCancelled.cancelledBy, "client");
  assert.equal(reloadedCancelled.cancelledAt, "2026-07-09T14:10:00.000Z");
  assert.equal(reloadedCancelled.cancellationWindow, "free");
}

{
  const guestPayload = bookingToSupabasePayload({
    ...sampleBooking,
    id: "00000000-0000-4000-8000-000000000041",
    customerEmail: "guest@example.com",
  });

  assert.equal(guestPayload.user_id, null);
  assert.equal(guestPayload.saved_address_id, null);
  assert.doesNotThrow(() => JSON.parse(guestPayload.notes));
}

{
  const authenticatedPayload = bookingToSupabasePayload({
    ...paymentMetadataBooking,
    id: "00000000-0000-4000-8000-000000000042",
    savedAddressId,
    userId: authenticatedUserId,
  }, paymentMetadataBooking.status);
  const notes = JSON.parse(authenticatedPayload.notes);

  assert.equal(authenticatedPayload.user_id, authenticatedUserId);
  assert.equal(authenticatedPayload.saved_address_id, savedAddressId);
  assert.equal(notes.appBooking.userId, authenticatedUserId);
  assert.equal(notes.appBooking.savedAddressId, savedAddressId);
  assert.equal(notes.appBooking.paymentMethod, "bank_transfer");
  assert.equal(notes.appBooking.paymentStatus, "awaiting_verification");
}

{
  const authenticatedWithoutSavedAddress = bookingToSupabasePayload({
    ...paymentMetadataBooking,
    id: "00000000-0000-4000-8000-000000000043",
    userId: authenticatedUserId,
  }, paymentMetadataBooking.status);

  assert.equal(authenticatedWithoutSavedAddress.user_id, authenticatedUserId);
  assert.equal(authenticatedWithoutSavedAddress.saved_address_id, null);
}

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
  assert.equal(notes.appBooking.paymentReference, "VB-20260618103000");
  assert.equal(notes.appBooking.paymentHoldExpiresAt, "2026-06-18T11:30:00.000Z");
  assert.equal(notes.appBooking.paymentExpiry, "2026-06-18T11:30:00.000Z");
  assert.equal(notes.appBooking.orderId, paymentMetadataBooking.orderId);
  assert.equal(notes.appBooking.paymentId, paymentMetadataBooking.paymentId);
  assert.equal(notes.appBooking.status, "pending_payment_verification");
  assert.equal(notes.appBooking.paymentStatus, paymentMetadataBooking.paymentStatus);

  const reloaded = supabaseRowToStorageBooking({
    ...payload,
    order_id: paymentMetadataBooking.orderId,
    payment_id: paymentMetadataBooking.paymentId,
  });

  assert.equal(reloaded.paymentMethod, "bank_transfer");
  assert.equal(reloaded.paymentStatus, "awaiting_verification");
  assert.equal(reloaded.bookingReference, "VB-20260618103000");
  assert.equal(reloaded.paymentReference, "VB-20260618103000");
  assert.equal(reloaded.paymentHoldExpiresAt, "2026-06-18T11:30:00.000Z");
  assert.equal(reloaded.paymentExpiry, "2026-06-18T11:30:00.000Z");
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

{
  const inferredReloaded = supabaseRowToStorageBooking({
    id: "00000000-0000-4000-8000-000000000031",
    client_email: "fallback@example.com",
    client_name: "Fallback Client",
    date: "2026-06-18",
    duration_minutes: 90,
    price: 120,
    selected_area: "Chelsea",
    service_id: "deep-tissue",
    service_name: "Deep Tissue Recovery",
    start_minutes: 600,
    status: "pending_payment_verification",
  });

  assert.equal(inferredReloaded.paymentMethod, "bank_transfer");
  assert.equal(inferredReloaded.paymentStatus, "awaiting_verification");
}

setSupabaseClientFactory(async () => ({
  rpc: (method, params) => {
    lastRpcCall = { method, params };
    return {
      abortSignal: () => Promise.resolve({ data: { id: "returned-id" }, error: null }),
    };
  },
}));

// 1. saveBookingToSupabase success path
const savedBooking = await saveBookingToSupabase({
  ...sampleBooking,
  hold: {
    clientKey: "client-key-12345678901234567890",
    id: "33333333-3333-4333-8333-333333333333",
    token: "44444444-4444-4444-8444-444444444444",
  },
  paymentStatus: "awaiting_verification",
  status: "pending_payment_verification",
});
assert.equal(savedBooking.id, "returned-id");
assert.equal(lastRpcCall.method, "create_secure_booking");
assert.equal(lastRpcCall.params.booking_payload.hold_client_key, "client-key-12345678901234567890");
assert.equal(lastRpcCall.params.booking_payload.hold_id, "33333333-3333-4333-8333-333333333333");
assert.equal(lastRpcCall.params.booking_payload.hold_token, "44444444-4444-4444-8444-444444444444");
assert.equal(lastRpcCall.params.booking_payload.payment_status, "awaiting_verification");
assert.equal(lastRpcCall.params.booking_payload.status, "pending_payment_verification");
assert.equal(lastRpcCall.params.booking_payload.id, sampleBooking.id);

setSupabaseClientFactory(async () => ({
  rpc: () => ({
    abortSignal: () => Promise.resolve({
      data: null,
      error: {
        code: "23P01",
        message: CLIENT_BOOKING_LIMIT_MESSAGES.minimumNotice,
      },
    }),
  }),
}));

await assert.rejects(
  () => saveBookingToSupabase({
    ...sampleBooking,
    hold: {
      clientKey: "client-key-12345678901234567890",
      id: "33333333-3333-4333-8333-333333333333",
      token: "44444444-4444-4444-8444-444444444444",
    },
  }),
  /Online appointments need at least 2 hours notice/
);

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

// 3. Admin personal-event updates also use the secure RPC, not a direct table update.
let directTableTouched = false;
setSupabaseClientFactory(async () => ({
  from: () => {
    directTableTouched = true;
    throw new Error("Direct table update should not be used.");
  },
  rpc: (method, params) => {
    lastUpdateRpcCall = { method, params };
    return Promise.resolve({ data: { id: params.booking_payload.id }, error: null });
  },
}));

await updateAdminPersonalEventInSupabase({
  ...sampleBooking,
  id: "00000000-0000-4000-8000-000000000006",
  kind: "personal",
  serviceId: "personal-event",
  serviceName: "Personal event",
  status: "confirmed",
});
assert.equal(lastUpdateRpcCall.method, "update_secure_booking");
assert.equal(directTableTouched, false);

// 7. Immediate confirmation-page cancellation uses the narrow public RPC.
let lastRecentCancellationRpcCall = null;
setSupabaseClientFactory(async () => ({
  rpc: (method, params) => {
    lastRecentCancellationRpcCall = { method, params };
    return Promise.resolve({
      data: {
        id: params.booking_id,
        booking_reference: params.booking_reference,
        client_name: "Jane Doe",
        client_email: "jane@example.com",
        client_phone: "07700900123",
        service_id: "massage",
        service_name: "Massage",
        service: "Massage",
        date: "2026-07-20",
        start_minutes: 900,
        duration_minutes: 60,
        selected_area: "Chiswick",
        price: 103,
        payment_method: "bank_transfer",
        payment_status: "cancelled",
        status: "cancelled",
        cancelled_at: "2026-07-20T14:10:00.000Z",
        cancelled_by: "client",
        cancellation_window: "grace",
      },
      error: null,
    });
  },
}));

const recentCancellation = await cancelRecentBookingRequestInSupabase({
  id: "00000000-0000-4000-8000-000000000008",
  bookingReference: "VDM-RECENT-CANCEL",
});
assert.deepEqual(lastRecentCancellationRpcCall, {
  method: "cancel_recent_booking_request",
  params: {
    booking_id: "00000000-0000-4000-8000-000000000008",
    booking_reference: "VDM-RECENT-CANCEL",
  },
});
assert.equal(recentCancellation.status, "cancelled");
assert.equal(recentCancellation.paymentStatus, "cancelled");
assert.equal(recentCancellation.cancellationWindow, "grace");

await assert.rejects(
  cancelRecentBookingRequestInSupabase({
    id: "00000000-0000-4000-8000-000000000008",
  }),
  /Booking reference is required/
);

// 4. RPC timeout/abort path
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

// 5b. Development-only preview holds must not reach the secure booking RPC.
let previewHoldRpcTouched = false;
setSupabaseClientFactory(async () => ({
  rpc: () => {
    previewHoldRpcTouched = true;
    throw new Error("Preview-only holds must fail before Supabase is called.");
  },
}));

await assert.rejects(
  saveBookingToSupabase({
    ...sampleBooking,
    hold: { previewOnly: true },
    id: "00000000-0000-4000-8000-000000000014",
  }),
  {
    message: BOOKING_SYSTEM_UPDATE_REQUIRED_MESSAGE,
  }
);
assert.equal(previewHoldRpcTouched, false);

// 6. Missing update_secure_booking fails safely and does not fall back to direct bookings.update.
directTableTouched = false;
setSupabaseClientFactory(async () => ({
  from: () => {
    directTableTouched = true;
    throw new Error("Direct table update should not be used.");
  },
  rpc: () => Promise.resolve({
    data: null,
    error: { code: "PGRST202", message: "Could not find the function update_secure_booking in the schema cache" },
  }),
}));

await assert.rejects(
  updateBookingInSupabase({
    ...sampleBooking,
    id: "00000000-0000-4000-8000-000000000007",
    paymentStatus: "paid",
    status: "confirmed",
  }),
  {
    message: /Secure booking update is unavailable/,
  }
);
assert.equal(directTableTouched, false);
