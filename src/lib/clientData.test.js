import assert from "node:assert/strict";
import {
  bookingRowToSelection,
  buildClientBookingDetailsViewModel,
  buildFavoriteBookingCombination,
  buildBookAgainPrefill,
  buildBookingClientLink,
  buildRecentBookingCombinations,
  canClientCancelBooking,
  canClientRescheduleBooking,
  cancelCurrentClientBooking,
  ensureCurrentClientBookingAddress,
  groupClientPortalBookings,
  linkRecentGuestBookingToCurrentClient,
  listCurrentClientPortalBookings,
  normalizeClientPortalBooking,
  normalizeClientAddress,
  normalizeClientPreferences,
  normalizeClientProfile,
  profileInputFromAuthUser,
  rescheduleCurrentClientBooking,
  shouldShowPostBookingGoogleSaveCta,
  upsertCurrentClientProfile,
} from "./clientData.js";

const userId = "11111111-1111-4111-8111-111111111111";
const addressId = "22222222-2222-4222-8222-222222222222";
const bookingId = "33333333-3333-4333-8333-333333333333";

assert.equal(
  bookingRowToSelection({
    service: "Deep Tissue Recovery",
    duration_minutes: 90,
    selected_area: "Chelsea",
  })?.area,
  "Chelsea"
);

assert.deepEqual(normalizeClientProfile({
  userId,
  fullName: "  Maya Shah  ",
  email: "  MAYA@EXAMPLE.COM ",
  phone: " 07123 456789 ",
}), {
  userId,
  fullName: "Maya Shah",
  email: "maya@example.com",
  phone: "07123 456789",
});

assert.deepEqual(normalizeClientAddress({
  userId,
  label: " ",
  addressLine1: " 12 Example Road ",
  postcode: " sw3 1aa ",
  isDefault: true,
}), {
  id: undefined,
  userId,
  label: "Home",
  addressLine1: "12 Example Road",
  addressLine2: "",
  city: "London",
  postcode: "SW3 1AA",
  area: "",
  instructions: "",
  isDefault: true,
});

assert.deepEqual(normalizeClientPreferences({
  userId,
  preferredServiceIds: ["deep-tissue", " deep-tissue ", "sports-massage"],
  preferredDurations: { "deep-tissue": 89.7, invalid: 0 },
  preferredAddressId: addressId,
  usualArea: " Chelsea ",
}), {
  userId,
  preferredServiceIds: ["deep-tissue", "sports-massage"],
  preferredDurations: { "deep-tissue": 90 },
  preferredAddressId: addressId,
  usualArea: "Chelsea",
  usualNotes: "",
  lastBookingId: null,
  favoriteSelection: null,
  recentBookingCombinations: [],
});

const guestLink = buildBookingClientLink({
  services: [{ id: "deep-tissue", name: "Deep Tissue Recovery", durationMinutes: 60, price: 101 }],
});
assert.equal(guestLink.user_id, null);
assert.equal(guestLink.saved_address_id, null);
assert.deepEqual(guestLink.selected_durations, [{ service_id: "deep-tissue", duration_minutes: 60 }]);

const authenticatedLink = buildBookingClientLink({
  userId,
  savedAddressId: addressId,
  services: [
    { serviceId: "sports-massage", serviceName: "Performance Sports Massage", minutes: 90, price: 134 },
    { id: "aftercare", name: "Aftercare notes", minutes: 0, price: 0 },
  ],
});
assert.equal(authenticatedLink.user_id, userId);
assert.equal(authenticatedLink.saved_address_id, addressId);
assert.equal(authenticatedLink.selected_services.length, 2);
assert.deepEqual(authenticatedLink.selected_durations, [
  { service_id: "sports-massage", duration_minutes: 90 },
  { service_id: "aftercare", duration_minutes: 0 },
]);

assert.equal(shouldShowPostBookingGoogleSaveCta({
  clientSession: null,
  confirmedAppointments: [{ id: bookingId }],
}), true);
assert.equal(shouldShowPostBookingGoogleSaveCta({
  clientSession: { user: { id: userId } },
  confirmedAppointments: [{ id: bookingId }],
}), false);
assert.equal(shouldShowPostBookingGoogleSaveCta({
  clientSession: null,
  confirmedAppointments: [],
}), false);

assert.deepEqual(profileInputFromAuthUser({
  id: userId,
  email: "maya@example.com",
  user_metadata: { full_name: "Maya Shah" },
}, {
  userId,
  fullName: "Previous name",
  email: "previous@example.com",
  phone: "07123 456789",
}), {
  userId,
  fullName: "Maya Shah",
  email: "maya@example.com",
  phone: "07123 456789",
});

assert.equal(profileInputFromAuthUser({
  id: userId,
  email: "maya@example.com",
  user_metadata: {},
}, {
  userId,
  fullName: "Maya Shah",
  email: "maya@example.com",
  phone: "07123 456789",
}, "07999 123456").phone, "07999 123456");

{
  const calls = [];
  const profileClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from(table) {
      calls.push({ table });
      return {
        select(columns = "*") {
          calls.push({ select: columns });
          return {
            eq(column, value) {
              calls.push({ eq: [column, value] });
              return {
                maybeSingle: async () => ({
                  data: { phone: "07123 456789" },
                  error: null,
                }),
              };
            },
            single: async () => ({
              data: {
                user_id: userId,
                full_name: "Maya Shah",
                email: "maya@example.com",
                phone: calls.find((call) => call.upsert)?.upsert.phone,
              },
              error: null,
            }),
          };
        },
        upsert(payload) {
          calls.push({ upsert: payload });
          return {
            select() {
              return {
                single: async () => ({
                  data: {
                    user_id: payload.user_id,
                    full_name: payload.full_name,
                    email: payload.email,
                    phone: payload.phone,
                  },
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };

  const profile = await upsertCurrentClientProfile({
    userId,
    fullName: "Maya Shah",
    email: "maya@example.com",
    phone: "",
  }, profileClient);

  assert.equal(profile.phone, "07123 456789");
  assert.equal(calls.find((call) => call.upsert).upsert.phone, "07123 456789");
}

assert.throws(() => normalizeClientProfile({}), /Client user id is required/);
assert.throws(() => profileInputFromAuthUser(null), /authenticated user is required/);

{
  const calls = [];
  const addressClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from(table) {
      calls.push({ table });
      return {
        select() {
          const listQuery = {
            eq(column, value) {
              calls.push({ eq: [column, value] });
              return listQuery;
            },
            order(column, options) {
              calls.push({ order: [column, options] });
              return listQuery;
            },
            then(resolve, reject) {
              return Promise.resolve({ data: [], error: null }).then(resolve, reject);
            },
          };
          return listQuery;
        },
        update(payload) {
          calls.push({ update: payload });
          const updateQuery = {
            eq(column, value) {
              calls.push({ eq: [column, value] });
              return updateQuery;
            },
            then(resolve, reject) {
              return Promise.resolve({ error: null }).then(resolve, reject);
            },
          };
          return updateQuery;
        },
        upsert(payload) {
          calls.push({ upsertAddress: payload });
          return {
            select() {
              return {
                single: async () => ({
                  data: {
                    id: addressId,
                    user_id: payload.user_id,
                    label: payload.label,
                    address_line_1: payload.address_line_1,
                    address_line_2: payload.address_line_2,
                    city: payload.city,
                    postcode: payload.postcode,
                    area: payload.area,
                    instructions: payload.instructions,
                    is_default: payload.is_default,
                  },
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };

  const savedAddress = await ensureCurrentClientBookingAddress({
    addressLine1: "14 Oak Avenue",
    area: "Chelsea",
    instructions: "Ring twice",
  }, addressClient);

  assert.equal(savedAddress.id, addressId);
  assert.equal(savedAddress.addressLine1, "14 Oak Avenue");
  assert.equal(savedAddress.isDefault, true);
  assert.equal(calls.find((call) => call.upsertAddress).upsertAddress.user_id, userId);
}

await assert.rejects(
  ensureCurrentClientBookingAddress({
    addressLine1: "14 Oak Avenue",
    area: "Chelsea",
  }, {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  }),
  /signed-in client is required/
);

{
  const calls = [];
  const linkClient = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: userId,
            email: "google@example.com",
            user_metadata: { full_name: "" },
          },
        },
        error: null,
      }),
    },
    rpc(name, payload) {
      calls.push({ rpc: name, payload });
      return Promise.resolve({ data: [bookingId], error: null });
    },
    from(table) {
      calls.push({ table });
      return {
        select() {
          if (table === "client_profiles") {
            return {
              eq(column, value) {
                calls.push({ eq: [column, value] });
                return {
                  maybeSingle: async () => ({
                    data: {
                      user_id: userId,
                      full_name: "Existing Client",
                      email: "google@example.com",
                      phone: "07123 456789",
                    },
                    error: null,
                  }),
                };
              },
            };
          }

          const listQuery = {
            eq(column, value) {
              calls.push({ eq: [column, value] });
              return listQuery;
            },
            order(column, options) {
              calls.push({ order: [column, options] });
              return listQuery;
            },
            then(resolve, reject) {
              return Promise.resolve({ data: [], error: null }).then(resolve, reject);
            },
          };
          return listQuery;
        },
        update(payload) {
          calls.push({ update: payload });
          const updateQuery = {
            eq(column, value) {
              calls.push({ eq: [column, value] });
              return updateQuery;
            },
            then(resolve, reject) {
              return Promise.resolve({ error: null }).then(resolve, reject);
            },
          };
          return updateQuery;
        },
        upsert(payload) {
          calls.push({ upsert: table, payload });
          return {
            select() {
              return {
                single: async () => {
                  if (table === "client_addresses") {
                    return {
                      data: {
                        id: addressId,
                        user_id: payload.user_id,
                        label: payload.label,
                        address_line_1: payload.address_line_1,
                        address_line_2: payload.address_line_2,
                        city: payload.city,
                        postcode: payload.postcode,
                        area: payload.area,
                        instructions: payload.instructions,
                        is_default: payload.is_default,
                      },
                      error: null,
                    };
                  }

                  return {
                    data: {
                      user_id: payload.user_id,
                      full_name: payload.full_name,
                      email: payload.email,
                      phone: payload.phone,
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const result = await linkRecentGuestBookingToCurrentClient({
    bookings: [{ id: bookingId, bookingReference: "VDM-20260703-ABC" }],
    customer: {
      email: "guest@example.com",
      name: "Maya Shah",
      phone: "",
    },
    address: "14 Oak Avenue, London",
    area: "Chelsea",
    notes: "Ring twice",
  }, linkClient);

  const profileUpsert = calls.find((call) => call.upsert === "client_profiles").payload;
  const rpcCall = calls.find((call) => call.rpc === "link_recent_guest_booking_to_client");

  assert.equal(result.emailMismatch, true);
  assert.equal(result.linkedBookingIds[0], bookingId);
  assert.equal(profileUpsert.full_name, "Maya Shah");
  assert.equal(profileUpsert.email, "google@example.com");
  assert.equal(profileUpsert.phone, "07123 456789");
  assert.deepEqual(rpcCall.payload.link_payload.bookings, [{
    id: bookingId,
    booking_reference: "VDM-20260703-ABC",
  }]);
  assert.equal(rpcCall.payload.link_payload.saved_address_id, addressId);
  assert.equal(JSON.stringify(rpcCall.payload).includes("guest@example.com"), false);
}

const futureBookingRow = {
  id: "44444444-4444-4444-8444-444444444444",
  user_id: userId,
  client_name: "Maya Shah",
  client_email: "maya@example.com",
  client_phone: "07123 456789",
  date: "2026-07-20",
  start_minutes: 600,
  service_id: "deep-tissue",
  service: "deep-tissue",
  service_name: "Deep Tissue Recovery",
  duration_minutes: 60,
  selected_area: "Chelsea",
  address: "14 Oak Avenue, London",
  status: "confirmed",
  payment_status: "paid",
  notes: JSON.stringify({
    appBooking: {
      id: "44444444-4444-4444-8444-444444444444",
      serviceId: "deep-tissue",
      serviceName: "Deep Tissue Recovery",
      duration: 60,
      startMinutes: 600,
      travelBuffer: 60,
      address: "14 Oak Avenue, London",
      bookingReference: "VDM-UPCOMING",
      status: "confirmed",
      paymentStatus: "paid",
    },
  }),
};

const pastBookingRow = {
  ...futureBookingRow,
  id: "55555555-5555-4555-8555-555555555555",
  date: "2026-06-01",
  duration_minutes: 90,
  service: "sports-massage",
  service_id: "sports-massage",
  service_name: "Performance Sports Massage",
  address: "9 Example Street",
  notes: JSON.stringify({
    appBooking: {
      id: "55555555-5555-4555-8555-555555555555",
      serviceId: "sports-massage",
      serviceName: "Performance Sports Massage",
      duration: 90,
      startMinutes: 780,
      travelBuffer: 60,
      address: "9 Example Street",
      bookingReference: "VDM-PAST",
      status: "completed",
      paymentStatus: "paid",
    },
  }),
};

const cancelledBookingRow = {
  ...futureBookingRow,
  id: "66666666-6666-4666-8666-666666666666",
  date: "2026-07-22",
  status: "cancelled",
  payment_status: "cancelled",
  cancelled_at: "2026-07-04T10:15:00Z",
  cancelled_by: "client",
  cancellation_window: "late",
  notes: JSON.stringify({
    appBooking: {
      id: "66666666-6666-4666-8666-666666666666",
      serviceId: "relaxing",
      serviceName: "Relaxing Massage",
      duration: 60,
      startMinutes: 900,
      travelBuffer: 60,
      address: "10 Example Road",
      bookingReference: "VDM-CANCELLED",
      status: "cancelled",
      paymentStatus: "cancelled",
    },
  }),
};

assert.equal(normalizeClientPortalBooking(futureBookingRow).bookingReference, "VDM-UPCOMING");
assert.equal(normalizeClientPortalBooking(futureBookingRow).time, "10:00 - 11:00");
assert.equal(normalizeClientPortalBooking(cancelledBookingRow).cancellationLabel, "Cancelled");
assert.equal(normalizeClientPortalBooking(cancelledBookingRow).cancelledBy, "client");
assert.equal(normalizeClientPortalBooking(cancelledBookingRow).cancellationWindow, "late");

{
  const feeBookingRow = {
    ...futureBookingRow,
    price: 90,
    congestion_fee: 18,
    travel_fee: 0,
  };
  const portalBooking = normalizeClientPortalBooking(feeBookingRow);
  const details = buildClientBookingDetailsViewModel(portalBooking, { userId });

  assert.equal(portalBooking.price, 90);
  assert.equal(portalBooking.congestionFee, 18);
  assert.equal(portalBooking.travelFee, 0);
  assert.equal(portalBooking.total, 108);
  assert.equal(details.serviceAmountLabel, "£90.00");
  assert.equal(details.congestionFeeLabel, "£18.00");
  assert.equal(details.travelFeeLabel, "");
  assert.equal(details.amountLabel, "£108.00");

  const noFeeDetails = buildClientBookingDetailsViewModel(
    normalizeClientPortalBooking({ ...feeBookingRow, congestion_fee: 0 }),
    { userId }
  );
  assert.equal(noFeeDetails.amountLabel, "£90.00");
  assert.equal(noFeeDetails.congestionFeeLabel, "");

  const bothFeeDetails = buildClientBookingDetailsViewModel(
    normalizeClientPortalBooking({ ...feeBookingRow, congestion_fee: 18, travel_fee: 12 }),
    { userId }
  );
  assert.equal(bothFeeDetails.amountLabel, "£120.00");
  assert.equal(bothFeeDetails.travelFeeLabel, "£12.00");

  const originalTotal = details.amountLabel;
  const laterAreaSettings = { congestionFee: 99, travelFee: 25 };
  assert.equal(laterAreaSettings.congestionFee + laterAreaSettings.travelFee, 124);
  assert.equal(buildClientBookingDetailsViewModel(portalBooking, { userId }).amountLabel, originalTotal);
}

{
  const privateNoteRow = {
    ...futureBookingRow,
    payment_method: "bank_transfer",
    payment_status: "awaiting_verification",
    price: 120,
    status: "pending_payment_verification",
    notes: JSON.stringify({
      adminNotes: "Do not show this admin note",
      privateNotes: "Do not show this private note",
      appBooking: {
        id: futureBookingRow.id,
        serviceId: "deep-tissue",
        serviceName: "Deep Tissue Recovery",
        duration: 60,
        startMinutes: 600,
        travelBuffer: 60,
        address: "14 Oak Avenue, London",
        bookingReference: "VDM-UPCOMING",
        paymentMethod: "bank_transfer",
        paymentStatus: "awaiting_verification",
        notes: "Use the side entrance",
        sessionNotes: "Spend more time on my right shoulder",
        sessionPreferenceIds: [
          "11111111-1111-4111-8111-111111111111",
          "11111111-1111-4111-8111-111111111121",
          "33333333-3333-4333-8333-333333333333",
          "unknown_preference",
        ],
        sessionPreferenceLabels: [
          { id: "11111111-1111-4111-8111-111111111111", label: "Neck focus when booked" },
          { id: "11111111-1111-4111-8111-111111111121", label: "Head massage when booked" },
          { id: "33333333-3333-4333-8333-333333333333", label: "Custom preference when booked" },
        ],
        status: "pending_payment_verification",
      },
    }),
  };
  const portalBooking = normalizeClientPortalBooking(privateNoteRow);
  const details = buildClientBookingDetailsViewModel(portalBooking, { userId });

  assert.equal(details.statusLabel, "I'll confirm once I've checked your payment");
  assert.equal(details.paymentStatusLabel, "I'll confirm once I've checked your payment");
  assert.equal(details.bookingReference, "VDM-UPCOMING");
  assert.equal(details.paymentReference, "VDM-UPCOMING");
  assert.equal(details.paymentMethodLabel, "Bank transfer");
  assert.equal(details.amountLabel, "£120.00");
  assert.equal(details.confirmationEmail, "maya@example.com");
  assert.equal(details.notes, "Spend more time on my right shoulder");
  assert.equal(details.sessionNotes, "Spend more time on my right shoulder");
  assert.deepEqual(details.sessionPreferences, [
    "Neck focus when booked",
    "Head massage when booked",
    "Custom preference when booked",
  ]);
  assert.equal(JSON.stringify(details).includes("admin note"), false);
  assert.equal(JSON.stringify(details).includes("private note"), false);
  assert.equal(details.bankTransferRelevant, true);
  assert.equal(buildClientBookingDetailsViewModel(portalBooking, { userId: "wrong-user" }), null);
  assert.equal(buildClientBookingDetailsViewModel(portalBooking, { userId: "" }), null);
}

{
  const historicBooking = normalizeClientPortalBooking(futureBookingRow);
  const historicDetails = buildClientBookingDetailsViewModel(historicBooking, { userId });
  assert.deepEqual(historicDetails.sessionPreferences, []);
  assert.equal(historicDetails.sessionNotes, "");
}

{
  const now = new Date("2026-07-03T09:00:00");
  const reschedulableBooking = {
    dateValue: "2026-07-05",
    startMinutes: 600,
    status: "confirmed",
    paymentStatus: "paid",
    userId,
  };

  assert.deepEqual(canClientRescheduleBooking(reschedulableBooking, now, { userId }), {
    eligible: true,
    code: "eligible",
    message: "You can reschedule this appointment online.",
  });

  assert.deepEqual(canClientRescheduleBooking({
    ...reschedulableBooking,
    dateValue: "2026-07-04",
    startMinutes: 540,
  }, now, { userId }), {
    eligible: false,
    code: "within_24_hours",
    message: "Online rescheduling is available up to 24 hours before your appointment. Please contact me directly.",
  });

  assert.equal(canClientRescheduleBooking({
    ...reschedulableBooking,
    dateValue: "2026-07-03",
    startMinutes: 480,
  }, now, { userId }).code, "past");

  assert.equal(canClientRescheduleBooking({
    ...reschedulableBooking,
    status: "cancelled",
  }, now, { userId }).code, "cancelled");

  assert.equal(canClientRescheduleBooking({
    ...reschedulableBooking,
    status: "completed",
  }, now, { userId }).code, "completed");

  assert.equal(canClientRescheduleBooking({
    ...reschedulableBooking,
    status: "expired",
  }, now, { userId }).code, "expired");

  assert.equal(canClientRescheduleBooking({
    ...reschedulableBooking,
    status: "no-show",
  }, now, { userId }).code, "no-show");

  assert.equal(canClientRescheduleBooking({
    ...reschedulableBooking,
    status: "refunded",
  }, now, { userId }).code, "refunded");

  assert.equal(canClientRescheduleBooking({
    ...reschedulableBooking,
    status: "pending_payment_verification",
    paymentStatus: "awaiting_verification",
  }, now, { userId }).eligible, true);

  assert.equal(canClientRescheduleBooking({
    ...reschedulableBooking,
    status: "payment_method_review",
    paymentStatus: "cash_on_arrival",
  }, now, { userId }).eligible, true);

  assert.equal(canClientRescheduleBooking({
    ...reschedulableBooking,
    dateValue: "",
  }, now, { userId }).code, "invalid_date_time");

  assert.equal(canClientRescheduleBooking({
    ...reschedulableBooking,
    startMinutes: 1440,
  }, now, { userId }).code, "invalid_date_time");

  assert.equal(canClientRescheduleBooking({
    ...reschedulableBooking,
    userId: "another-client",
  }, now, { userId }).code, "wrong_client");
}

{
  const now = new Date("2026-07-03T09:00:00");
  const cancellableBooking = {
    createdAt: "2026-07-01T09:00:00",
    dateValue: "2026-07-05",
    paymentStatus: "paid",
    startMinutes: 600,
    status: "confirmed",
    userId,
  };

  assert.deepEqual(canClientCancelBooking(cancellableBooking, now, { userId }), {
    eligible: true,
    code: "eligible",
    cancellationWindow: "free",
    message: "Your booking can be cancelled free of charge.",
  });

  assert.deepEqual(canClientCancelBooking({
    ...cancellableBooking,
    createdAt: "2026-07-03T08:20:00",
    dateValue: "2026-07-03",
    startMinutes: 1200,
  }, now, { userId }), {
    eligible: true,
    code: "eligible",
    cancellationWindow: "grace",
    message: "Your booking can be cancelled free of charge because it was made less than 1 hour ago.",
  });

  assert.deepEqual(canClientCancelBooking({
    ...cancellableBooking,
    createdAt: "2026-07-03T07:30:00",
    dateValue: "2026-07-03",
    startMinutes: 1200,
  }, now, { userId }), {
    eligible: true,
    code: "eligible",
    cancellationWindow: "late",
    message: "Within 24 hours, the full session fee applies because the time is reserved for you and hard to replace.",
  });

  assert.equal(canClientCancelBooking({
    ...cancellableBooking,
    status: "completed",
  }, now, { userId }).code, "completed");

  assert.equal(canClientCancelBooking({
    ...cancellableBooking,
    status: "no-show",
  }, now, { userId }).code, "no-show");

  assert.equal(canClientCancelBooking({
    ...cancellableBooking,
    status: "expired",
  }, now, { userId }).code, "expired");

  assert.equal(canClientCancelBooking({
    ...cancellableBooking,
    status: "refunded",
  }, now, { userId }).code, "refunded");

  assert.equal(canClientCancelBooking({
    ...cancellableBooking,
    status: "cancelled",
  }, now, { userId }).code, "cancelled");

  assert.equal(canClientCancelBooking({
    ...cancellableBooking,
    dateValue: "2026-07-03",
    startMinutes: 480,
  }, now, { userId }).code, "past");

  assert.equal(canClientCancelBooking({
    ...cancellableBooking,
    userId: "another-client",
  }, now, { userId }).code, "wrong_client");

  assert.equal(canClientCancelBooking({
    ...cancellableBooking,
    dateValue: "",
  }, now, { userId }).code, "invalid_date_time");

  const paymentStatusSnapshot = cancellableBooking.paymentStatus;
  canClientCancelBooking(cancellableBooking, now, { userId });
  assert.equal(cancellableBooking.paymentStatus, paymentStatusSnapshot);
}

{
  const cancelledDetails = buildClientBookingDetailsViewModel(
    normalizeClientPortalBooking(cancelledBookingRow),
    { userId }
  );
  assert.equal(cancelledDetails.statusLabel, "Cancelled");
  assert.equal(cancelledDetails.bookingReference, "VDM-CANCELLED");
  assert.equal(cancelledDetails.cancelledByLabel, "Cancelled by you");
  assert.equal(cancelledDetails.cancellationWindowLabel, "Late cancellation");
  assert.match(cancelledDetails.cancelledAtLabel, /4 Jul 2026/);
}

{
  const portalBooking = normalizeClientPortalBooking(pastBookingRow);
  const originalSnapshot = JSON.stringify(portalBooking);
  const prefill = buildBookAgainPrefill(portalBooking);

  assert.equal(prefill.area, "Chelsea");
  assert.equal(prefill.serviceId, "sports-massage");
  assert.equal(prefill.serviceName, "Performance Sports Massage");
  assert.equal(prefill.totalDuration, 90);
  assert.equal(prefill.address, "9 Example Street");
  assert.equal(prefill.clientName, "Maya Shah");
  assert.equal(prefill.customerEmail, "maya@example.com");
  assert.equal(prefill.customerPhone, "07123 456789");
  assert.equal("bookingReference" in prefill, false);
  assert.equal("paymentStatus" in prefill, false);
  assert.equal("status" in prefill, false);
  assert.equal("dateValue" in prefill, false);
  assert.equal("startMinutes" in prefill, false);
  assert.equal("time" in prefill, false);
  assert.equal(JSON.stringify(portalBooking), originalSnapshot);
}

{
  const grouped = groupClientPortalBookings(
    [
      normalizeClientPortalBooking(futureBookingRow),
      normalizeClientPortalBooking(pastBookingRow),
      normalizeClientPortalBooking(cancelledBookingRow),
    ],
    new Date("2026-07-03T10:00:00Z")
  );

  assert.equal(grouped.upcoming.length, 1);
  assert.equal(grouped.past.length, 1);
  assert.equal(grouped.cancelled.length, 1);
  assert.equal(grouped.cancelled[0].bookingReference, "VDM-CANCELLED");
}

{
  const calls = [];
  const portalClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from(table) {
      calls.push({ table });
      return {
        select(columns) {
          calls.push({ select: columns });
          const query = {
            eq(column, value) {
              calls.push({ eq: [column, value] });
              return query;
            },
            order(column, options) {
              calls.push({ order: [column, options] });
              return query;
            },
            limit(value) {
              calls.push({ limit: value });
              return Promise.resolve({
                data: [futureBookingRow, pastBookingRow, cancelledBookingRow],
                error: null,
              });
            },
          };
          return query;
        },
      };
    },
  };

  const bookings = await listCurrentClientPortalBookings(100, portalClient);
  assert.equal(bookings.length, 3);
  assert.deepEqual(calls.find((call) => call.eq)?.eq, ["user_id", userId]);
  assert.equal(calls.some((call) => call.eq?.[0] === "client_email"), false);
  assert.equal(calls.some((call) => call.eq?.[0] === "email"), false);
}

{
  const calls = [];
  let queryAttempt = 0;
  const portalClientWithOlderSchema = {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from(table) {
      calls.push({ table });
      return {
        select(columns) {
          queryAttempt += 1;
          calls.push({ select: columns });
          const query = {
            eq(column, value) {
              calls.push({ eq: [column, value] });
              return query;
            },
            order(column, options) {
              calls.push({ order: [column, options] });
              return query;
            },
            limit(value) {
              calls.push({ limit: value });
              if (queryAttempt === 1) {
                return Promise.resolve({
                  data: null,
                  error: {
                    code: "42703",
                    message: "column bookings.payment_status does not exist",
                  },
                });
              }
              return Promise.resolve({
                data: [{ ...futureBookingRow, payment_status: undefined }],
                error: null,
              });
            },
          };
          return query;
        },
      };
    },
  };

  const bookings = await listCurrentClientPortalBookings(100, portalClientWithOlderSchema);
  assert.equal(bookings.length, 1);
  assert.equal(queryAttempt, 2);
  assert.equal(calls[0].table, "bookings");
  assert.match(calls[1].select, /payment_status/);
  assert.doesNotMatch(calls.find((call, index) => index > 1 && call.select)?.select || "", /payment_status/);
  assert.equal(calls.some((call) => call.eq?.[0] === "client_email"), false);
  assert.equal(calls.some((call) => call.eq?.[0] === "email"), false);
  assert.equal(bookings[0].userId, userId);
}

{
  const calls = [];
  const rescheduleClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    rpc(name, payload) {
      calls.push({ rpc: name, payload });
      return Promise.resolve({
        data: {
          ...futureBookingRow,
          date: "2026-07-25",
          start_minutes: 720,
        },
        error: null,
      });
    },
  };

  const rescheduled = await rescheduleCurrentClientBooking({
    bookingId: futureBookingRow.id,
    newDate: "2026-07-25",
    newStartMinutes: 720,
  }, rescheduleClient);

  assert.deepEqual(calls[0], {
    rpc: "reschedule_client_booking",
    payload: {
      booking_id: futureBookingRow.id,
      new_date: "2026-07-25",
      new_start_minutes: 720,
    },
  });
  assert.equal(rescheduled.dateValue, "2026-07-25");
  assert.equal(rescheduled.time, "12:00 - 13:00");
  assert.equal(rescheduled.status, "confirmed");
  assert.equal(rescheduled.paymentStatus, "paid");
  assert.equal(rescheduled.bookingReference, "VDM-UPCOMING");
}

await assert.rejects(
  rescheduleCurrentClientBooking({
    bookingId: futureBookingRow.id,
    newDate: "25/07/2026",
    newStartMinutes: 720,
  }, {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
  }),
  /New booking date is required/
);

await assert.rejects(
  rescheduleCurrentClientBooking({
    bookingId: futureBookingRow.id,
    newDate: "2026-07-25",
    newStartMinutes: 1440,
  }, {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
  }),
  /New start time is invalid/
);

{
  const calls = [];
  const cancellationClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    rpc(name, payload) {
      calls.push({ rpc: name, payload });
      return Promise.resolve({
        data: {
          ...futureBookingRow,
          status: "cancelled",
          cancelled_at: "2026-07-03T09:10:00.000Z",
          cancelled_by: "client",
          cancellation_window: "free",
        },
        error: null,
      });
    },
  };

  const cancelled = await cancelCurrentClientBooking({
    bookingId: futureBookingRow.id,
  }, cancellationClient);

  assert.deepEqual(calls[0], {
    rpc: "cancel_client_booking",
    payload: {
      booking_id: futureBookingRow.id,
    },
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.paymentStatus, "paid");
  assert.equal(cancelled.bookingReference, "VDM-UPCOMING");
}

await assert.rejects(
  listCurrentClientPortalBookings(100, {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  }),
  /signed-in client is required/
);

const historyRows = [
  {
    id: "booking-3",
    selected_area: "Chelsea",
    selected_services: [
      { id: "deep-tissue", name: "Deep Tissue Recovery", durationMinutes: 90, price: 134 },
    ],
    duration_minutes: 90,
    created_at: "2026-06-06T12:00:00Z",
  },
  {
    id: "booking-2",
    selected_area: "Fulham",
    selected_services: [
      { id: "sports-massage", name: "Performance Sports Massage", durationMinutes: 60, price: 101 },
    ],
    duration_minutes: 60,
    created_at: "2026-06-05T12:00:00Z",
  },
  {
    id: "booking-1",
    selected_area: "Chelsea",
    selected_services: [
      { id: "deep-tissue", name: "Deep Tissue Recovery", durationMinutes: 90, price: 134 },
    ],
    duration_minutes: 90,
    created_at: "2026-06-01T12:00:00Z",
  },
];

assert.equal(bookingRowToSelection(historyRows[0]).totalDuration, 90);
assert.equal(buildFavoriteBookingCombination(historyRows).services[0].id, "deep-tissue");
assert.deepEqual(
  buildRecentBookingCombinations(historyRows).map((selection) => selection.services[0].id),
  ["deep-tissue", "sports-massage"]
);

console.log("Client data tests passed.");
