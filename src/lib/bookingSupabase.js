import { bookingToSupabasePayload, supabaseRowToStorageBooking } from "./bookingPersistence.js";
import { BOOKING_SYSTEM_UPDATE_REQUIRED_MESSAGE, bookingHoldErrorMessage } from "./bookingHoldErrors.js";
import { sanitizeSessionPreferences } from "./sessionPreferences.js";

let supabaseClientFactory = async () => {
  const module = await import("../supabaseClient.js");
  return module.supabase;
};
let publicSupabaseClientFactory = async () => {
  const module = await import("../supabaseClient.js");
  return module.publicSupabase || module.supabase;
};

export function setSupabaseClientFactory(factory) {
  supabaseClientFactory = factory;
  publicSupabaseClientFactory = factory;
}

export async function getSupabaseClient() {
  return await supabaseClientFactory();
}

export async function getPublicSupabaseClient() {
  return await publicSupabaseClientFactory();
}

export async function runSupabaseConfirmationOperation(operation, label) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 15000);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (timedOut || error?.name === "AbortError") {
      throw new Error(`${label} timed out. Please check your connection and try again.`);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function ensureSupabaseBookingId(booking) {
  const currentId = String(booking.id ?? "");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(currentId)) {
    return currentId;
  }

  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  throw new Error("Could not create a secure booking id.");
}

function isMissingSecureUpdateRpc(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    error?.code === "PGRST202" ||
    (message.includes("update_secure_booking") && message.includes("schema cache")) ||
    (message.includes("function") && message.includes("update_secure_booking") && message.includes("not"))
  );
}

function isMissingSessionPreferencesTable(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    (message.includes("session_preferences") && (message.includes("does not exist") || message.includes("schema cache")))
  );
}

function rowToSessionPreference(row = {}) {
  return {
    category: row.category || "Other",
    conflictIds: Array.isArray(row.conflict_ids) ? row.conflict_ids : [],
    deletedAt: row.deleted_at || "",
    id: row.id,
    label: row.label,
    sortOrder: row.sort_order,
    visible: row.is_visible !== false,
  };
}

function sessionPreferenceToRow(preference = {}) {
  return {
    category: preference.category || null,
    conflict_ids: Array.isArray(preference.conflictIds) ? preference.conflictIds : [],
    deleted_at: preference.deletedAt || null,
    id: preference.id,
    is_visible: preference.visible !== false,
    label: preference.label,
    sort_order: Number(preference.sortOrder) || 1,
  };
}

export async function loadSessionPreferencesFromSupabase({ includeHidden = false } = {}) {
  const supabase = await getSupabaseClient();
  let query = supabase
    .from("session_preferences")
    .select("id,label,category,is_visible,sort_order,conflict_ids,deleted_at,created_at,updated_at")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (!includeHidden) {
    query = query.eq("is_visible", true).is("deleted_at", null);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingSessionPreferencesTable(error)) {
      throw new Error("Session preferences table is unavailable. Please apply the latest Supabase migration.");
    }
    throw new Error(`Session preferences could not be loaded: ${error.message}`);
  }

  return sanitizeSessionPreferences((data || []).map(rowToSessionPreference));
}

export async function saveSessionPreferenceToSupabase(preference) {
  const supabase = await getSupabaseClient();
  const label = String(preference?.label || "").trim();
  const id = String(preference?.id || "").trim();
  if (!id || !label) throw new Error("Session preference is invalid.");

  const normalized = {
    category: String(preference?.category || "").trim() || "Other",
    conflictIds: Array.isArray(preference?.conflictIds)
      ? [...new Set(preference.conflictIds.map((conflictId) => String(conflictId || "").trim()).filter(Boolean))]
      : [],
    deletedAt: preference?.deletedAt || "",
    id,
    label,
    sortOrder: Math.max(1, Math.round(Number(preference?.sortOrder) || 1)),
    visible: preference?.visible !== false,
  };

  const { data, error } = await supabase
    .from("session_preferences")
    .upsert(sessionPreferenceToRow(normalized), { onConflict: "id" })
    .select("id,label,category,is_visible,sort_order,conflict_ids,deleted_at,created_at,updated_at")
    .single();

  if (error) {
    if (isMissingSessionPreferencesTable(error)) {
      throw new Error("Session preferences table is unavailable. Please apply the latest Supabase migration.");
    }
    throw new Error(`Session preference could not be saved: ${error.message}`);
  }

  return rowToSessionPreference(data);
}

export async function saveSessionPreferencesOrderToSupabase(preferences = []) {
  const supabase = await getSupabaseClient();
  const normalized = sanitizeSessionPreferences(preferences);

  const temporaryRows = normalized.map((preference, index) => ({
    id: preference.id,
    sort_order: 10000 + index,
  }));
  const finalRows = normalized.map((preference, index) => ({
    id: preference.id,
    sort_order: index + 1,
  }));

  for (const rowSet of [temporaryRows, finalRows]) {
    for (const row of rowSet) {
      const { error } = await supabase
        .from("session_preferences")
        .update({ sort_order: row.sort_order })
        .eq("id", row.id);
      if (error) {
        if (isMissingSessionPreferencesTable(error)) {
          throw new Error("Session preferences table is unavailable. Please apply the latest Supabase migration.");
        }
        throw new Error(`Session preference order could not be saved: ${error.message}`);
      }
    }
  }

  return loadSessionPreferencesFromSupabase({ includeHidden: true });
}

export async function saveBookingToSupabase(booking, status = null) {
  if (booking?.hold?.previewOnly) {
    throw new Error(BOOKING_SYSTEM_UPDATE_REQUIRED_MESSAGE);
  }

  const usesPrivateClientRecord = Boolean(booking?.userId || booking?.savedAddressId);
  const supabase = usesPrivateClientRecord ? await getSupabaseClient() : await getPublicSupabaseClient();
  const bookingId = ensureSupabaseBookingId(booking);
  const bookingWithId = { ...booking, id: bookingId };

  const { data, error } = await runSupabaseConfirmationOperation(
    (signal) => supabase
      .rpc("create_secure_booking", {
        booking_payload: bookingToSupabasePayload(bookingWithId, status || bookingWithId.status || "confirmed"),
      })
      .abortSignal(signal),
    "Creating the booking"
  );

  if (error) {
    const unavailable = error.code === "23P01" || /no longer available/i.test(error.message);
    const friendlyMessage = bookingHoldErrorMessage(error);
    const rawMessage = String(error.message || "");
    const hasSpecificFriendlyMessage = friendlyMessage && (
      friendlyMessage !== rawMessage ||
      /2 hours notice|CLIENT_BOOKING_MINIMUM_NOTICE/i.test(rawMessage)
    );
    throw new Error(
      hasSpecificFriendlyMessage
        ? friendlyMessage
        : unavailable
          ? "This appointment is no longer available. Please choose another time."
          : `Booking could not be saved: ${error.message}`
    );
  }

  const returnedBooking = Array.isArray(data) ? data[0] : data;
  return {
    ...(returnedBooking && typeof returnedBooking === "object" ? returnedBooking : {}),
    id: returnedBooking?.id || (typeof returnedBooking === "string" ? returnedBooking : bookingId),
  };
}

export async function saveAdminPersonalEventToSupabase(booking) {
  const supabase = await getSupabaseClient();
  const bookingId = ensureSupabaseBookingId(booking);
  const bookingWithId = { ...booking, id: bookingId, kind: "personal", status: booking.status || "confirmed" };
  const payload = bookingToSupabasePayload(bookingWithId, bookingWithId.status);

  const { data, error } = await runSupabaseConfirmationOperation(
    (signal) => supabase
      .rpc("create_admin_personal_event", { booking_payload: payload })
      .abortSignal(signal),
    "Creating the personal event"
  );

  if (error) {
    throw new Error(`Personal event could not be saved to Supabase: ${error.message}`);
  }

  const returnedBooking = Array.isArray(data) ? data[0] : data;
  return {
    ...(returnedBooking && typeof returnedBooking === "object" ? returnedBooking : {}),
    id: returnedBooking?.id || (typeof returnedBooking === "string" ? returnedBooking : bookingId),
  };
}

export async function updateAdminPersonalEventInSupabase(booking) {
  const supabase = await getSupabaseClient();
  const payload = bookingToSupabasePayload({ ...booking, kind: "personal" }, booking.status || "confirmed");
  const { data, error } = await supabase.rpc("update_secure_booking", {
    booking_payload: payload,
  });

  if (error) {
    if (isMissingSecureUpdateRpc(error)) {
      throw new Error("Secure booking update is unavailable. Please apply the latest Supabase migrations before editing appointments.");
    }
    throw new Error(`Supabase personal event update failed: ${error.message}`);
  }

  return Array.isArray(data) ? data[0] : data;
}

export async function updateBookingInSupabase(booking) {
  const supabase = await getSupabaseClient();
  const payload = bookingToSupabasePayload(booking, booking.status || "confirmed");
  const { data, error } = await supabase.rpc("update_secure_booking", {
    booking_payload: payload,
  });

  if (error) {
    if (isMissingSecureUpdateRpc(error)) {
      throw new Error("Secure booking update is unavailable. Please apply the latest Supabase migrations before editing appointments.");
    }
    throw new Error(`Supabase booking update failed: ${error.message}`);
  }

  return Array.isArray(data) ? data[0] : data;
}

export async function cancelRecentBookingRequestInSupabase(booking) {
  const supabase = await getSupabaseClient();
  const bookingId = String(booking?.id || "").trim();
  const bookingReference = String(booking?.bookingReference || booking?.paymentReference || "").trim();

  if (!bookingId || !bookingReference) {
    throw new Error("Booking reference is required to cancel this booking.");
  }

  const { data, error } = await supabase.rpc("cancel_recent_booking_request", {
    booking_id: bookingId,
    booking_reference: bookingReference,
  });

  if (error) {
    const message = String(error?.message || "");
    if (error?.code === "PGRST202" || /cancel_recent_booking_request.*schema cache/i.test(message)) {
      throw new Error("Immediate online cancellation is unavailable. Please contact me directly and I'll sort it.");
    }
    throw new Error(message || "This booking could not be cancelled automatically.");
  }

  return supabaseRowToStorageBooking(Array.isArray(data) ? data[0] : data);
}
