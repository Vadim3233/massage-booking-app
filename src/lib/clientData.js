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

function requireUuidLike(value, fieldName) {
  const normalized = cleanText(value);
  if (!normalized) throw new Error(`${fieldName} is required.`);
  return normalized;
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
  const { data, error } = await client
    .from("client_profiles")
    .upsert({
      user_id: userId,
      full_name: normalized.fullName || null,
      email: normalized.email || null,
      phone: normalized.phone || null,
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
  const { data, error } = await client
    .from("bookings")
    .select("id,user_id,service,service_name,duration_minutes,selected_area,address,notes,price,selected_services,selected_durations,saved_address_id,created_at,date,start_minutes")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, Number(limit) || 30)));
  if (error) throw error;
  return data || [];
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
