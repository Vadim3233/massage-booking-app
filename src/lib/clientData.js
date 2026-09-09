import { supabaseRowToStorageBooking } from "./bookingPersistence.js";
import { normalizeSessionPreferenceIds, sessionPreferenceLabels } from "./sessionPreferences.js";

/**
 * @typedef {Object} ClientProfile
 * @property {string} userId
 * @property {string} fullName
 * @property {string} email
 * @property {string} phone
 */

/**
 * @typedef {Object} ClientAddress
 * @property {string=} id
 * @property {string} userId
 * @property {string} label
 * @property {string} addressLine1
 * @property {string} addressLine2
 * @property {string} city
 * @property {string} postcode
 * @property {string} area
 * @property {string} instructions
 * @property {boolean} isDefault
 */

/**
 * @typedef {Object} ClientPreferences
 * @property {string} userId
 * @property {string[]} preferredServiceIds
 * @property {Record<string, number>} preferredDurations
 * @property {string|null} preferredAddressId
 * @property {string} usualArea
 * @property {string} usualNotes
 * @property {string|null} lastBookingId
 * @property {Object|null} favoriteSelection
 * @property {Object[]} recentBookingCombinations
 */

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSessionPreferenceSnapshotLabels(value = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return { id: "", label: cleanText(item) };
      if (!item || typeof item !== "object") return null;
      return { id: cleanText(item.id), label: cleanText(item.label) };
    })
    .filter((item) => item?.label);
}

function normalizeSelectionSessionPreferenceIds(ids = [], labels = []) {
  if (!Array.isArray(ids)) return [];
  const knownIds = normalizeSessionPreferenceIds(ids);
  const snapshotIds = new Set(normalizeSessionPreferenceSnapshotLabels(labels).map((item) => item.id).filter(Boolean));
  const normalized = [];
  ids.map(cleanText).filter(Boolean).forEach((id) => {
    if ((knownIds.includes(id) || snapshotIds.has(id)) && !normalized.includes(id)) {
      normalized.push(id);
    }
  });
  return normalized;
}

function requireUuidLike(value, fieldName) {
  const normalized = cleanText(value);
  if (!normalized) throw new Error(`${fieldName} is required.`);
  return normalized;
}

const CLIENT_BOOKING_FULL_SELECT = "id,user_id,client_name,client_email,client_phone,service_id,service,service_name,duration_minutes,selected_area,address,notes,price,selected_services,selected_durations,saved_address_id,created_at,date,start_minutes,status,payment_status,payment_method,payment_id,order_id,travel_fee,congestion_fee,cancelled_at,cancelled_by,cancellation_window";
const CLIENT_BOOKING_COMPAT_SELECT = "id,user_id,client_name,client_email,client_phone,service_id,service,service_name,duration_minutes,selected_area,address,notes,price,selected_services,selected_durations,saved_address_id,created_at,date,start_minutes,status";

function isMissingColumnError(error) {
  const message = cleanText(error?.message || error?.details || error?.hint).toLowerCase();
  return error?.code === "42703" || message.includes("column") && message.includes("does not exist");
}

async function fetchCurrentClientBookingRows({
  client,
  limit,
  orderBy = [],
  userId,
}) {
  const runQuery = async (selectColumns) => {
    let query = client
      .from("bookings")
      .select(selectColumns)
      .eq("user_id", userId);

    for (const [column, options] of orderBy) {
      query = query.order(column, options);
    }

    return query.limit(limit);
  };

  const result = await runQuery(CLIENT_BOOKING_FULL_SELECT);
  if (!result.error || !isMissingColumnError(result.error)) return result;

  return runQuery(CLIENT_BOOKING_COMPAT_SELECT);
}

function normalizeDurationMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([serviceId, duration]) => [cleanText(serviceId), Math.max(0, Math.round(Number(duration) || 0))])
      .filter(([serviceId, duration]) => serviceId && duration > 0)
  );
}

function normalizeSelectionServices(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((service) => ({
      id: cleanText(service?.id || service?.serviceId || service?.service_id),
      name: cleanText(service?.name || service?.serviceName || service?.service_name),
      durationMinutes: Math.max(0, Math.round(Number(
        service?.durationMinutes ?? service?.minutes ?? service?.duration_minutes
      ) || 0)),
      price: Math.max(0, Number(service?.price) || 0),
    }))
    .filter((service) => service.id || service.name);
}

export function normalizeBookingSelection(selection) {
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) return null;
  const services = normalizeSelectionServices(selection.services || selection.items);
  if (services.length === 0) return null;

  return {
    key: cleanText(selection.key) || bookingSelectionKey(services),
    services,
    totalDuration: Math.max(
      0,
      Math.round(Number(selection.totalDuration ?? selection.total_duration) || services.reduce(
        (total, service) => total + service.durationMinutes,
        0
      ))
    ),
    area: cleanText(selection.area),
    savedAddressId: cleanText(selection.savedAddressId || selection.saved_address_id) || null,
    address: cleanText(selection.address),
    notes: cleanText(selection.notes),
    sessionNotes: cleanText(selection.sessionNotes || selection.notes),
    sessionPreferenceIds: normalizeSelectionSessionPreferenceIds(selection.sessionPreferenceIds, selection.sessionPreferenceLabels),
    sessionPreferenceLabels: normalizeSessionPreferenceSnapshotLabels(selection.sessionPreferenceLabels),
    lastBookedAt: cleanText(selection.lastBookedAt || selection.last_booked_at),
  };
}

export function bookingSelectionKey(services = []) {
  return normalizeSelectionServices(services)
    .map((service) => `${service.id || service.name.toLowerCase()}:${service.durationMinutes}`)
    .sort()
    .join("|");
}

export function bookingRowToSelection(row = {}) {
  let services = normalizeSelectionServices(row.selected_services);
  if (services.length === 0) {
    services = normalizeSelectionServices([{
      id: row.service_id || row.service,
      name: row.service_name || row.service,
      durationMinutes: row.duration_minutes,
      price: row.price,
    }]);
  }
  if (services.length === 0) return null;

  return normalizeBookingSelection({
    services,
    totalDuration: row.duration_minutes,
    area: row.selected_area || row.location,
    savedAddressId: row.saved_address_id,
    address: row.address,
    notes: row.notes,
    sessionNotes: row.sessionNotes,
    sessionPreferenceIds: row.sessionPreferenceIds,
    sessionPreferenceLabels: row.sessionPreferenceLabels,
    lastBookedAt: row.created_at,
  });
}

export function buildRecentBookingCombinations(rows = [], limit = 3) {
  const seen = new Set();
  const selections = [];

  for (const row of rows) {
    const selection = bookingRowToSelection(row);
    if (!selection || seen.has(selection.key)) continue;
    seen.add(selection.key);
    selections.push(selection);
    if (selections.length >= limit) break;
  }

  return selections;
}

export function buildFavoriteBookingCombination(rows = []) {
  const combinations = new Map();

  rows.forEach((row, index) => {
    const selection = bookingRowToSelection(row);
    if (!selection) return;
    const current = combinations.get(selection.key) || { count: 0, firstIndex: index, selection };
    current.count += 1;
    combinations.set(selection.key, current);
  });

  return [...combinations.values()]
    .sort((left, right) => right.count - left.count || left.firstIndex - right.firstIndex)[0]
    ?.selection || null;
}

export function normalizeClientProfile(profile = {}) {
  return {
    userId: requireUuidLike(profile.userId, "Client user id"),
    fullName: cleanText(profile.fullName),
    email: cleanText(profile.email).toLowerCase(),
    phone: cleanText(profile.phone),
  };
}

export function normalizeClientAddress(address = {}) {
  return {
    id: cleanText(address.id) || undefined,
    userId: requireUuidLike(address.userId, "Client user id"),
    label: cleanText(address.label) || "Home",
    addressLine1: cleanText(address.addressLine1),
    addressLine2: cleanText(address.addressLine2),
    city: cleanText(address.city) || "London",
    postcode: cleanText(address.postcode).toUpperCase(),
    area: cleanText(address.area),
    instructions: cleanText(address.instructions),
    isDefault: Boolean(address.isDefault),
  };
}

export function normalizeClientPreferences(preferences = {}) {
  return {
    userId: requireUuidLike(preferences.userId, "Client user id"),
    preferredServiceIds: Array.isArray(preferences.preferredServiceIds)
      ? [...new Set(preferences.preferredServiceIds.map(cleanText).filter(Boolean))]
      : [],
    preferredDurations: normalizeDurationMap(preferences.preferredDurations),
    preferredAddressId: cleanText(preferences.preferredAddressId) || null,
    usualArea: cleanText(preferences.usualArea),
    usualNotes: cleanText(preferences.usualNotes),
    lastBookingId: cleanText(preferences.lastBookingId) || null,
    favoriteSelection: normalizeBookingSelection(preferences.favoriteSelection),
    recentBookingCombinations: Array.isArray(preferences.recentBookingCombinations)
      ? preferences.recentBookingCombinations.map(normalizeBookingSelection).filter(Boolean).slice(0, 3)
      : [],
  };
}

/**
 * Converts a Supabase Auth user into the profile shape used by the app.
 * Existing phone data wins because Google does not normally provide a phone.
 */
export function profileInputFromAuthUser(user, existingProfile = null, knownPhone = "") {
  if (!user?.id) throw new Error("An authenticated user is required.");
  const metadata = user.user_metadata || {};
  return normalizeClientProfile({
    userId: user.id,
    fullName: metadata.full_name || metadata.name || existingProfile?.fullName || "",
    email: user.email || existingProfile?.email || "",
    phone: cleanText(knownPhone) || existingProfile?.phone || "",
  });
}

async function resolveClient(client) {
  if (client) return client;
  const module = await import("../supabaseClient.js");
  return module.supabase;
}

async function getAuthenticatedUserId(client) {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user?.id) throw new Error("A signed-in client is required for this operation.");
  return data.user.id;
}

function profileFromRow(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    fullName: row.full_name || "",
    email: row.email || "",
    phone: row.phone || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function addressFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label || "Home",
    addressLine1: row.address_line_1 || "",
    addressLine2: row.address_line_2 || "",
    city: row.city || "",
    postcode: row.postcode || "",
    area: row.area || "",
    instructions: row.instructions || "",
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function preferencesFromRow(row, userId) {
  if (!row) {
    return normalizeClientPreferences({ userId });
  }

  return {
    userId: row.user_id,
    preferredServiceIds: Array.isArray(row.preferred_service_ids) ? row.preferred_service_ids : [],
    preferredDurations: normalizeDurationMap(row.preferred_durations),
    preferredAddressId: row.preferred_address_id || null,
    usualArea: row.usual_area || "",
    usualNotes: row.usual_notes || "",
    lastBookingId: row.last_booking_id || null,
    favoriteSelection: normalizeBookingSelection(row.favorite_selection),
    recentBookingCombinations: Array.isArray(row.recent_booking_combinations)
      ? row.recent_booking_combinations.map(normalizeBookingSelection).filter(Boolean).slice(0, 3)
      : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getCurrentClientProfile(client = null) {
  client = await resolveClient(client);
  const userId = await getAuthenticatedUserId(client);
  const { data, error } = await client.from("client_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return profileFromRow(data);
}

export async function upsertCurrentClientProfile(profile, client = null) {
  client = await resolveClient(client);
  const userId = await getAuthenticatedUserId(client);
  const normalized = normalizeClientProfile({ ...profile, userId });
  let phone = normalized.phone;

  if (!phone) {
    const { data: existingProfile, error: existingProfileError } = await client
      .from("client_profiles")
      .select("phone")
      .eq("user_id", userId)
      .maybeSingle();
    if (existingProfileError) throw existingProfileError;
    phone = cleanText(existingProfile?.phone);
  }

  const { data, error } = await client
    .from("client_profiles")
    .upsert({
      user_id: userId,
      full_name: normalized.fullName || null,
      email: normalized.email || null,
      phone: phone || null,
    }, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return profileFromRow(data);
}

export async function listCurrentClientAddresses(client = null) {
  client = await resolveClient(client);
  const userId = await getAuthenticatedUserId(client);
  const { data, error } = await client
    .from("client_addresses")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(addressFromRow);
}

export async function upsertCurrentClientAddress(address, client = null) {
  client = await resolveClient(client);
  const userId = await getAuthenticatedUserId(client);
  const normalized = normalizeClientAddress({ ...address, userId });
  if (!normalized.addressLine1) throw new Error("Address line 1 is required.");

  if (normalized.isDefault) {
    const { error: clearDefaultError } = await client
      .from("client_addresses")
      .update({ is_default: false })
      .eq("user_id", userId)
      .eq("is_default", true);
    if (clearDefaultError) throw clearDefaultError;
  }

  const row = {
    user_id: userId,
    label: normalized.label,
    address_line_1: normalized.addressLine1,
    address_line_2: normalized.addressLine2 || null,
    city: normalized.city,
    postcode: normalized.postcode || null,
    area: normalized.area || null,
    instructions: normalized.instructions || null,
    is_default: normalized.isDefault,
  };
  if (normalized.id) row.id = normalized.id;

  const { data, error } = await client
    .from("client_addresses")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return addressFromRow(data);
}

export async function deleteCurrentClientAddress(addressId, client = null) {
  client = await resolveClient(client);
  const userId = await getAuthenticatedUserId(client);
  const { error } = await client
    .from("client_addresses")
    .delete()
    .eq("id", requireUuidLike(addressId, "Address id"))
    .eq("user_id", userId);
  if (error) throw error;
}

export async function getCurrentClientPreferences(client = null) {
  client = await resolveClient(client);
  const userId = await getAuthenticatedUserId(client);
  const { data, error } = await client.from("client_preferences").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return preferencesFromRow(data, userId);
}

export async function upsertCurrentClientPreferences(preferences, client = null) {
  client = await resolveClient(client);
  const userId = await getAuthenticatedUserId(client);
  const normalized = normalizeClientPreferences({ ...preferences, userId });
  const { data, error } = await client
    .from("client_preferences")
    .upsert({
      user_id: userId,
      preferred_service_ids: normalized.preferredServiceIds,
      preferred_durations: normalized.preferredDurations,
      preferred_address_id: normalized.preferredAddressId,
      usual_area: normalized.usualArea || null,
      usual_notes: normalized.usualNotes || null,
      last_booking_id: normalized.lastBookingId,
      favorite_selection: normalized.favoriteSelection,
      recent_booking_combinations: normalized.recentBookingCombinations,
    }, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return preferencesFromRow(data, userId);
}

export async function listCurrentClientBookingHistory(limit = 30, client = null) {
  client = await resolveClient(client);
  const userId = await getAuthenticatedUserId(client);
  const { data, error } = await fetchCurrentClientBookingRows({
    client,
    userId,
    limit: Math.max(1, Math.min(100, Number(limit) || 30)),
    orderBy: [["created_at", { ascending: false }]],
  });
  if (error) throw error;
  return data || [];
}

export async function listCurrentClientPortalBookings(limit = 100, client = null) {
  client = await resolveClient(client);
  const userId = await getAuthenticatedUserId(client);
  const { data, error } = await fetchCurrentClientBookingRows({
    client,
    userId,
    limit: Math.max(1, Math.min(200, Number(limit) || 100)),
    orderBy: [
      ["date", { ascending: false }],
      ["start_minutes", { ascending: false }],
    ],
  });
  if (error) throw error;
  return (data || []).map(normalizeClientPortalBooking).filter(Boolean);
}

export async function rescheduleCurrentClientBooking({
  bookingId,
  newDate,
  newStartMinutes,
} = {}, client = null) {
  client = await resolveClient(client);
  await getAuthenticatedUserId(client);

  const normalizedBookingId = requireUuidLike(bookingId, "Booking id");
  const normalizedDate = cleanText(newDate);
  const normalizedStartMinutes = Number(newStartMinutes);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    throw new Error("New booking date is required.");
  }
  if (!Number.isInteger(normalizedStartMinutes) || normalizedStartMinutes < 0 || normalizedStartMinutes >= 1440) {
    throw new Error("New start time is invalid.");
  }

  const { data, error } = await client.rpc("reschedule_client_booking", {
    booking_id: normalizedBookingId,
    new_date: normalizedDate,
    new_start_minutes: normalizedStartMinutes,
  });
  if (error) throw error;

  return normalizeClientPortalBooking(data);
}

export async function cancelCurrentClientBooking({ bookingId } = {}, client = null) {
  client = await resolveClient(client);
  await getAuthenticatedUserId(client);

  const normalizedBookingId = requireUuidLike(bookingId, "Booking id");
  const { data, error } = await client.rpc("cancel_client_booking", {
    booking_id: normalizedBookingId,
  });
  if (error) throw error;

  return normalizeClientPortalBooking(data);
}

export async function loadCurrentClientBookingContext(client = null) {
  client = await resolveClient(client);
  const [preferences, addresses, bookings] = await Promise.all([
    getCurrentClientPreferences(client),
    listCurrentClientAddresses(client),
    listCurrentClientBookingHistory(30, client),
  ]);
  const preferredAddress = addresses.find((address) => address.id === preferences.preferredAddressId)
    || addresses.find((address) => address.isDefault)
    || null;
  const historyFavorite = buildFavoriteBookingCombination(bookings);
  const favoriteSelection = preferences.favoriteSelection || historyFavorite;
  const recentBookingCombinations = buildRecentBookingCombinations(bookings, 3);
  const lastSelection = bookingRowToSelection(bookings[0]);

  function applyDefaults(selection) {
    if (!selection) return null;
    return normalizeBookingSelection({
      ...selection,
      area: selection.area || preferences.usualArea || preferredAddress?.area,
      savedAddressId: selection.savedAddressId || preferredAddress?.id,
      address: selection.address || preferredAddress?.addressLine1,
      notes: selection.notes || preferences.usualNotes,
    });
  }

  return {
    addresses,
    bookings,
    favoriteSelection: applyDefaults(favoriteSelection),
    lastSelection: applyDefaults(lastSelection),
    preferredAddress,
    preferences,
    recentBookingCombinations: recentBookingCombinations.map(applyDefaults).filter(Boolean),
    usualSelection: applyDefaults(favoriteSelection || lastSelection),
  };
}

export async function ensureCurrentClientBookingAddress({
  addressLine1 = "",
  area = "",
  instructions = "",
}, client = null) {
  client = await resolveClient(client);
  const normalizedAddress = cleanText(addressLine1);
  if (!normalizedAddress) return null;
  const addresses = await listCurrentClientAddresses(client);
  const match = addresses.find((address) =>
    address.addressLine1.toLowerCase() === normalizedAddress.toLowerCase()
    && address.area.toLowerCase() === cleanText(area).toLowerCase()
  );
  if (match) return match;

  return upsertCurrentClientAddress({
    addressLine1: normalizedAddress,
    area,
    instructions,
    isDefault: addresses.length === 0,
    label: addresses.length === 0 ? "Home" : "Saved address",
  }, client);
}

function minutesToClock(value) {
  const totalMinutes = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatClientBookingDate(value) {
  const date = new Date(`${cleanText(value)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return cleanText(value) || "Date pending";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    weekday: "short",
    year: "numeric",
  }).format(date);
}

function parsePublicBookingNotes(row = {}, booking = {}) {
  const rawNotes = cleanText(row.notes);
  const candidates = [
    booking.publicNotes,
    booking.customerNotes,
    booking.instructions,
    booking.entryInstructions,
    booking.additionalNotes,
  ];

  if (rawNotes) {
    try {
      const parsed = JSON.parse(rawNotes);
      candidates.push(
        parsed.publicNotes,
        parsed.customerNotes,
        parsed.instructions,
        parsed.entryInstructions,
        parsed.additionalNotes,
        parsed.appBooking?.publicNotes,
        parsed.appBooking?.customerNotes,
        parsed.appBooking?.instructions,
        parsed.appBooking?.entryInstructions,
        parsed.appBooking?.additionalNotes,
        parsed.appBooking?.notes
      );
    } catch {
      candidates.push(rawNotes);
    }
  }

  return candidates
    .map(cleanText)
    .find(Boolean) || "";
}

function parsePublicBookingSessionPreferenceIds(row = {}, booking = {}) {
  const rawNotes = cleanText(row.notes);
  const candidates = [booking.sessionPreferenceIds];

  if (rawNotes) {
    try {
      const parsed = JSON.parse(rawNotes);
      candidates.push(parsed.sessionPreferenceIds, parsed.appBooking?.sessionPreferenceIds);
    } catch {
      // Legacy plain-text notes do not contain structured preferences.
    }
  }

  for (const candidate of candidates) {
    const normalized = Array.isArray(candidate)
      ? [...new Set(candidate.map(cleanText).filter(Boolean))]
      : [];
    if (normalized.length > 0) return normalized;
  }

  return [];
}

function parsePublicBookingSessionPreferenceLabels(row = {}, booking = {}) {
  const rawNotes = cleanText(row.notes);
  const candidates = [booking.sessionPreferenceLabels];

  if (rawNotes) {
    try {
      const parsed = JSON.parse(rawNotes);
      candidates.push(parsed.sessionPreferenceLabels, parsed.appBooking?.sessionPreferenceLabels);
    } catch {
      // Legacy plain-text notes do not contain structured preference labels.
    }
  }

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const normalized = normalizeSessionPreferenceSnapshotLabels(candidate);
    if (normalized.length > 0) return normalized;
  }

  return [];
}

export function clientBookingStatusLabel(value = {}) {
  const status = cleanText(value.status).toLowerCase();
  const paymentStatus = cleanText(value.paymentStatus).toLowerCase();
  const combined = `${status} ${paymentStatus}`;

  if (combined.includes("cancel")) return "Cancelled";
  if (combined.includes("expired")) return "Expired";
  if (combined.includes("completed")) return "Completed";
  if (paymentStatus === "paid" || status === "confirmed") return "Confirmed";
  if (paymentStatus === "awaiting_verification" || status === "pending_payment_verification") {
    return "I'll confirm once I've checked your payment";
  }
  if (
    status === "payment_method_review"
    || paymentStatus === "cash_on_arrival"
    || paymentStatus === "alternative_requested"
    || paymentStatus === "pending"
  ) {
    return "I'll confirm shortly";
  }

  return status || paymentStatus
    ? cleanText(status || paymentStatus).replace(/[_-]+/g, " ")
    : "Pending";
}

export function clientPaymentMethodLabel(value = "") {
  const method = cleanText(value).toLowerCase();
  if (method === "bank_transfer") return "Bank transfer";
  if (method === "cash" || method === "cash_on_arrival") return "Cash on arrival";
  if (method === "card") return "Card";
  if (method === "alternative_requested") return "I'll be in touch about payment";
  return method ? method.replace(/[_-]+/g, " ") : "Not selected";
}

function formatClientBookingDateTime(value) {
  const rawValue = cleanText(value);
  if (!rawValue) return "";
  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function clientCancellationByLabel(value) {
  const actor = cleanText(value).toLowerCase();
  if (actor === "client") return "Cancelled by you";
  if (actor === "admin") return "Cancelled by therapist/admin";
  return "";
}

function clientCancellationWindowLabel(value) {
  const window = cleanText(value).toLowerCase();
  if (window === "free" || window === "grace") return "Free cancellation";
  if (window === "late") return "Late cancellation";
  return "";
}

export function normalizeClientPortalBooking(row = {}) {
  const booking = supabaseRowToStorageBooking(row);
  if (!booking) return null;

  const dateValue = cleanText(row.date || booking.dateValue);
  const startMinutes = Math.max(0, Math.round(Number(row.start_minutes ?? booking.startMinutes) || 0));
  const duration = Math.max(0, Math.round(Number(row.duration_minutes ?? booking.duration) || 0));
  const endMinutes = startMinutes + duration;
  const status = cleanText(row.status || booking.status) || "confirmed";
  const paymentStatus = cleanText(row.payment_status || booking.paymentStatus);
  const services = normalizeSelectionServices(
    Array.isArray(booking.items) && booking.items.length > 0
      ? booking.items.map((item) => ({
          id: item.id,
          name: item.name,
          durationMinutes: item.minutes,
          price: item.price,
        }))
      : Array.isArray(row.selected_services) && row.selected_services.length > 0
        ? row.selected_services
        : [{
            id: row.service_id || booking.serviceId || row.service,
            name: row.service_name || booking.serviceName || row.service,
            durationMinutes: row.duration_minutes ?? booking.duration,
            price: row.price ?? booking.price,
          }]
  );

  const sessionPreferenceLabelsSnapshot = parsePublicBookingSessionPreferenceLabels(row, booking);
  const sessionPreferenceIds = normalizeSelectionSessionPreferenceIds(
    parsePublicBookingSessionPreferenceIds(row, booking),
    sessionPreferenceLabelsSnapshot
  );
  const sessionNotes = cleanText(booking.sessionNotes) || parsePublicBookingNotes(row, booking);

  const price = Math.max(0, Number(row.price ?? booking.price) || 0);
  const congestionFee = Math.max(0, Number(row.congestion_fee ?? booking.congestionFee) || 0);
  const travelFee = Math.max(0, Number(row.travel_fee ?? booking.travelFee) || 0);
  const total = price + congestionFee + travelFee;

  return {
    id: cleanText(row.id || booking.id),
    userId: cleanText(row.user_id || booking.userId),
    dateValue,
    time: startMinutes > 0 || endMinutes > 0
      ? `${minutesToClock(startMinutes)} - ${minutesToClock(endMinutes)}`
      : "",
    startMinutes,
    duration,
    serviceId: cleanText(row.service_id || booking.serviceId || services[0]?.id),
    serviceName: cleanText(row.service_name || booking.serviceName || row.service || booking.serviceId),
    services,
    address: cleanText(row.address || booking.address),
    area: cleanText(row.selected_area || booking.location),
    clientName: cleanText(row.client_name || booking.clientName),
    customerEmail: cleanText(row.client_email || booking.customerEmail),
    customerPhone: cleanText(row.client_phone || booking.customerPhone),
    savedAddressId: cleanText(row.saved_address_id || booking.savedAddressId),
    bookingReference: cleanText(booking.bookingReference || booking.paymentReference),
    notes: sessionNotes,
    sessionNotes,
    sessionPreferenceIds,
    sessionPreferenceLabels: sessionPreferenceLabelsSnapshot,
    sessionPreferences: sessionPreferenceLabels(sessionPreferenceIds, undefined, sessionPreferenceLabelsSnapshot),
    paymentMethod: cleanText(row.payment_method || booking.paymentMethod),
    paymentReference: cleanText(booking.paymentReference || booking.bookingReference),
    congestionFee,
    price,
    total,
    travelFee,
    status,
    paymentStatus,
    cancellationLabel: status === "cancelled" || paymentStatus === "cancelled"
      ? "Cancelled"
      : status === "refunded" || paymentStatus === "refunded"
        ? "Refunded"
        : status === "no-show"
          ? "No-show"
          : status === "expired" || paymentStatus === "expired"
          ? "Expired"
            : "",
    createdAt: cleanText(row.created_at || booking.createdAt),
    cancelledAt: cleanText(row.cancelled_at || booking.cancelledAt),
    cancelledBy: cleanText(row.cancelled_by || booking.cancelledBy),
    cancellationWindow: cleanText(row.cancellation_window || booking.cancellationWindow),
  };
}

export function buildClientBookingDetailsViewModel(booking = {}, { userId = "" } = {}) {
  const requestedUserId = cleanText(userId);
  if (!requestedUserId || cleanText(booking.userId) !== requestedUserId) return null;

  const paymentStatus = clientBookingStatusLabel({
    status: "",
    paymentStatus: booking.paymentStatus,
  });
  const statusLabel = clientBookingStatusLabel(booking);
  const serviceAmount = Math.max(0, Number(booking.price) || 0);
  const congestionFee = Math.max(0, Number(booking.congestionFee) || 0);
  const travelFee = Math.max(0, Number(booking.travelFee) || 0);
  const amount = serviceAmount + congestionFee + travelFee;
  const paymentMethod = cleanText(booking.paymentMethod);
  const paymentReference = cleanText(booking.paymentReference || booking.bookingReference);

  return {
    id: cleanText(booking.id),
    statusLabel,
    paymentStatusLabel: paymentStatus === "Pending" ? statusLabel : paymentStatus,
    bookingReference: cleanText(booking.bookingReference) || "Pending",
    serviceName: cleanText(booking.serviceName) || "Massage appointment",
    durationLabel: booking.duration ? `${booking.duration} minutes` : "Duration pending",
    dateLabel: formatClientBookingDate(booking.dateValue),
    time: cleanText(booking.time) || "Time pending",
    area: cleanText(booking.area) || "Area confirmed",
    address: cleanText(booking.address) || "Address not provided",
    clientName: cleanText(booking.clientName) || "Name not provided",
    clientEmail: cleanText(booking.customerEmail) || "Email not provided",
    clientPhone: cleanText(booking.customerPhone) || "Phone not provided",
    notes: cleanText(booking.sessionNotes || booking.notes),
    sessionNotes: cleanText(booking.sessionNotes || booking.notes),
    sessionPreferences: sessionPreferenceLabels(booking.sessionPreferenceIds, undefined, booking.sessionPreferenceLabels),
    paymentMethodLabel: clientPaymentMethodLabel(paymentMethod),
    amount,
    amountLabel: `£${amount.toFixed(2)}`,
    congestionFee,
    congestionFeeLabel: congestionFee > 0 ? `£${congestionFee.toFixed(2)}` : "",
    serviceAmount,
    serviceAmountLabel: `£${serviceAmount.toFixed(2)}`,
    travelFee,
    travelFeeLabel: travelFee > 0 ? `£${travelFee.toFixed(2)}` : "",
    paymentReference,
    confirmationEmail: cleanText(booking.customerEmail) || "Email not provided",
    cancelledAtLabel: formatClientBookingDateTime(booking.cancelledAt),
    cancelledByLabel: clientCancellationByLabel(booking.cancelledBy),
    cancellationWindowLabel: clientCancellationWindowLabel(booking.cancellationWindow),
    bankTransferRelevant: paymentMethod === "bank_transfer"
      || cleanText(booking.paymentStatus) === "awaiting_verification"
      || cleanText(booking.status) === "pending_payment_verification",
  };
}

const RESCHEDULE_BLOCKED_STATUSES = new Set([
  "cancelled",
  "canceled",
  "expired",
  "completed",
  "refunded",
  "no-show",
  "no_show",
]);

const RESCHEDULE_ALLOWED_STATUSES = new Set([
  "confirmed",
  "pending_payment_verification",
  "payment_method_review",
]);

const RESCHEDULE_ALLOWED_PAYMENT_STATUSES = new Set([
  "",
  "paid",
  "payment_received",
  "confirmed",
  "awaiting_verification",
  "pending",
  "cash_on_arrival",
  "alternative_requested",
]);

const RESCHEDULE_CONTACT_MESSAGE = "Online rescheduling is available up to 24 hours before your appointment. Please contact me directly.";
const CANCELLATION_FREE_MESSAGE = "Your booking can be cancelled free of charge.";
const CANCELLATION_GRACE_MESSAGE = "Your booking can be cancelled free of charge because it was made less than 1 hour ago.";
const CANCELLATION_LATE_MESSAGE = "Within 24 hours, the full session fee applies because the time is reserved for you and hard to replace.";
const CANCELLATION_BLOCKED_MESSAGE = "This booking can no longer be cancelled online.";

function bookingStartDate(booking = {}) {
  const dateValue = cleanText(booking.dateValue || booking.date);
  const rawStartMinutes = booking.startMinutes ?? booking.start_minutes;
  const startMinutes = Number(rawStartMinutes);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return null;
  if (!Number.isFinite(startMinutes) || startMinutes < 0 || startMinutes >= 24 * 60) return null;

  const appointmentDate = new Date(`${dateValue}T${minutesToClock(startMinutes)}:00`);
  return Number.isNaN(appointmentDate.getTime()) ? null : appointmentDate;
}

function bookingCreatedDate(booking = {}) {
  const rawCreatedAt = cleanText(booking.createdAt || booking.created_at);
  if (!rawCreatedAt) return null;
  const createdAt = new Date(rawCreatedAt);
  return Number.isNaN(createdAt.getTime()) ? null : createdAt;
}

export function canClientRescheduleBooking(booking = {}, now = new Date(), options = {}) {
  const currentTime = now instanceof Date && !Number.isNaN(now.getTime()) ? now.getTime() : Date.now();
  const requestedUserId = cleanText(options.userId);
  const bookingUserId = cleanText(booking.userId || booking.user_id);

  if (requestedUserId && bookingUserId !== requestedUserId) {
    return {
      eligible: false,
      code: "wrong_client",
      message: "This booking is not available in your signed-in account.",
    };
  }

  const startDate = bookingStartDate(booking);
  if (!startDate) {
    return {
      eligible: false,
      code: "invalid_date_time",
      message: "This booking date or time could not be checked. Please contact me directly.",
    };
  }

  const normalizedStatus = cleanText(booking.status).toLowerCase() || "confirmed";
  const normalizedPaymentStatus = cleanText(booking.paymentStatus || booking.payment_status).toLowerCase();
  const combinedStatus = `${normalizedStatus} ${normalizedPaymentStatus}`;

  const blockedStatus = [...RESCHEDULE_BLOCKED_STATUSES].find((status) => combinedStatus.includes(status));
  if (blockedStatus) {
    return {
      eligible: false,
      code: blockedStatus.replace(/_/g, "-"),
      message: "This booking cannot be rescheduled online. Please contact me directly.",
    };
  }

  if (
    !RESCHEDULE_ALLOWED_STATUSES.has(normalizedStatus)
    || !RESCHEDULE_ALLOWED_PAYMENT_STATUSES.has(normalizedPaymentStatus)
  ) {
    return {
      eligible: false,
      code: "unsupported_status",
      message: "This booking cannot be rescheduled online yet. Please contact me directly.",
    };
  }

  const appointmentTime = startDate.getTime();
  if (appointmentTime <= currentTime) {
    return {
      eligible: false,
      code: "past",
      message: "Past appointments cannot be rescheduled online.",
    };
  }

  const hoursUntilAppointment = (appointmentTime - currentTime) / (60 * 60 * 1000);
  if (hoursUntilAppointment <= 24) {
    return {
      eligible: false,
      code: "within_24_hours",
      message: RESCHEDULE_CONTACT_MESSAGE,
    };
  }

  return {
    eligible: true,
    code: "eligible",
    message: "You can reschedule this appointment online.",
  };
}

export function canClientCancelBooking(booking = {}, now = new Date(), options = {}) {
  const currentTime = now instanceof Date && !Number.isNaN(now.getTime()) ? now.getTime() : Date.now();
  const requestedUserId = cleanText(options.userId);
  const bookingUserId = cleanText(booking.userId || booking.user_id);

  if (requestedUserId && bookingUserId !== requestedUserId) {
    return {
      eligible: false,
      code: "wrong_client",
      cancellationWindow: null,
      message: "This booking is not available in your signed-in account.",
    };
  }

  const startDate = bookingStartDate(booking);
  if (!startDate) {
    return {
      eligible: false,
      code: "invalid_date_time",
      cancellationWindow: null,
      message: "This booking date or time could not be checked. Please contact me directly.",
    };
  }

  const normalizedStatus = cleanText(booking.status).toLowerCase() || "confirmed";
  const normalizedPaymentStatus = cleanText(booking.paymentStatus || booking.payment_status).toLowerCase();
  const combinedStatus = `${normalizedStatus} ${normalizedPaymentStatus}`;
  const blockedStatus = [...RESCHEDULE_BLOCKED_STATUSES].find((status) => combinedStatus.includes(status));
  if (blockedStatus) {
    return {
      eligible: false,
      code: blockedStatus.replace(/_/g, "-"),
      cancellationWindow: null,
      message: CANCELLATION_BLOCKED_MESSAGE,
    };
  }

  const appointmentTime = startDate.getTime();
  if (appointmentTime <= currentTime) {
    return {
      eligible: false,
      code: "past",
      cancellationWindow: null,
      message: CANCELLATION_BLOCKED_MESSAGE,
    };
  }

  const hoursUntilAppointment = (appointmentTime - currentTime) / (60 * 60 * 1000);
  if (hoursUntilAppointment > 24) {
    return {
      eligible: true,
      code: "eligible",
      cancellationWindow: "free",
      message: CANCELLATION_FREE_MESSAGE,
    };
  }

  const createdAt = bookingCreatedDate(booking);
  const withinGracePeriod = createdAt && (currentTime - createdAt.getTime()) < (60 * 60 * 1000);
  if (withinGracePeriod) {
    return {
      eligible: true,
      code: "eligible",
      cancellationWindow: "grace",
      message: CANCELLATION_GRACE_MESSAGE,
    };
  }

  return {
    eligible: true,
    code: "eligible",
    cancellationWindow: "late",
    message: CANCELLATION_LATE_MESSAGE,
  };
}

export function buildBookAgainPrefill(booking = {}) {
  if (!booking || typeof booking !== "object") return null;

  const services = normalizeSelectionServices(
    Array.isArray(booking.services) && booking.services.length > 0
      ? booking.services
      : [{
          id: booking.serviceId,
          name: booking.serviceName,
          durationMinutes: booking.duration,
        }]
  );
  if (services.length === 0) return null;

  const totalDuration = Math.max(
    0,
    Math.round(Number(booking.duration) || services.reduce((total, service) => total + service.durationMinutes, 0))
  );

  return {
    address: cleanText(booking.address),
    area: cleanText(booking.area),
    clientName: cleanText(booking.clientName),
    customerEmail: cleanText(booking.customerEmail).toLowerCase(),
    customerPhone: cleanText(booking.customerPhone),
    savedAddressId: cleanText(booking.savedAddressId) || null,
    services,
    serviceId: cleanText(booking.serviceId || services[0]?.id),
    serviceName: cleanText(booking.serviceName || services[0]?.name),
    sessionNotes: cleanText(booking.sessionNotes || booking.notes),
    sessionPreferenceIds: normalizeSelectionSessionPreferenceIds(booking.sessionPreferenceIds, booking.sessionPreferenceLabels),
    sessionPreferenceLabels: normalizeSessionPreferenceSnapshotLabels(booking.sessionPreferenceLabels),
    totalDuration,
  };
}

function bookingTimestamp(booking) {
  const date = new Date(`${booking.dateValue || "1970-01-01"}T${minutesToClock(booking.startMinutes || 0)}:00`);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function groupClientPortalBookings(bookings = [], now = new Date()) {
  const nowTime = now instanceof Date && !Number.isNaN(now.getTime()) ? now.getTime() : Date.now();
  const grouped = {
    upcoming: [],
    past: [],
    cancelled: [],
  };

  bookings.filter(Boolean).forEach((booking) => {
    const statusText = `${booking.status || ""} ${booking.paymentStatus || ""}`.toLowerCase();
    if (
      booking.cancellationLabel
      || statusText.includes("cancel")
      || statusText.includes("expired")
      || statusText.includes("refund")
      || statusText.includes("no-show")
    ) {
      grouped.cancelled.push(booking);
      return;
    }

    if (bookingTimestamp(booking) >= nowTime) {
      grouped.upcoming.push(booking);
    } else {
      grouped.past.push(booking);
    }
  });

  grouped.upcoming.sort((left, right) => bookingTimestamp(left) - bookingTimestamp(right));
  grouped.past.sort((left, right) => bookingTimestamp(right) - bookingTimestamp(left));
  grouped.cancelled.sort((left, right) => bookingTimestamp(right) - bookingTimestamp(left));
  return grouped;
}
export async function updateCurrentClientBookingDefaults({
  address = "",
  area = "",
  bookingIds = [],
  notes = "",
  services = [],
  savedAddressId = "",
}, client = null) {
  client = await resolveClient(client);
  const userId = await getAuthenticatedUserId(client);
  const current = await getCurrentClientPreferences(client);
  const history = await listCurrentClientBookingHistory(30, client);
  const favoriteSelection = buildFavoriteBookingCombination(history)
    || normalizeBookingSelection({ services, area, address, notes, savedAddressId });
  const recentBookingCombinations = buildRecentBookingCombinations(history, 3);
  const latestBookingId = cleanText(bookingIds[0]) || history[0]?.id || null;
  const preferredServices = normalizeSelectionServices(services);

  return upsertCurrentClientPreferences({
    ...current,
    userId,
    preferredServiceIds: preferredServices.map((service) => service.id).filter(Boolean),
    preferredDurations: Object.fromEntries(
      preferredServices.filter((service) => service.id && service.durationMinutes > 0)
        .map((service) => [service.id, service.durationMinutes])
    ),
    preferredAddressId: cleanText(savedAddressId) || current.preferredAddressId,
    usualArea: cleanText(area) || current.usualArea,
    usualNotes: cleanText(notes),
    lastBookingId: latestBookingId,
    favoriteSelection,
    recentBookingCombinations,
  }, client);
}

/**
 * Builds optional booking columns without changing the existing guest payload.
 * Pass no user id to keep a booking fully guest-based.
 */
export function buildBookingClientLink({ userId = "", savedAddressId = "", services = [] } = {}) {
  const selectedServices = Array.isArray(services)
    ? services.map((service) => ({
        id: cleanText(service.id || service.serviceId),
        name: cleanText(service.name || service.serviceName),
        durationMinutes: Math.max(0, Math.round(Number(service.durationMinutes || service.minutes) || 0)),
        price: Math.max(0, Number(service.price) || 0),
      })).filter((service) => service.id || service.name)
    : [];

  return {
    user_id: cleanText(userId) || null,
    saved_address_id: cleanText(savedAddressId) || null,
    selected_services: selectedServices,
    selected_durations: selectedServices.map((service) => ({
      service_id: service.id || null,
      duration_minutes: service.durationMinutes,
    })),
  };
}
