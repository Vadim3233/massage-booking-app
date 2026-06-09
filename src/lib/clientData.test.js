import assert from "node:assert/strict";
import {
  bookingRowToSelection,
  buildFavoriteBookingCombination,
  buildBookingClientLink,
  buildRecentBookingCombinations,
  normalizeClientAddress,
  normalizeClientPreferences,
  normalizeClientProfile,
  profileInputFromAuthUser,
} from "./clientData.js";

const userId = "11111111-1111-4111-8111-111111111111";
const addressId = "22222222-2222-4222-8222-222222222222";

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

assert.throws(() => normalizeClientProfile({}), /Client user id is required/);
assert.throws(() => profileInputFromAuthUser(null), /authenticated user is required/);

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
