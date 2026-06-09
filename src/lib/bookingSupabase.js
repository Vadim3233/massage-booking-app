import { bookingToSupabasePayload, bookingToLegacySupabasePayload } from "./bookingPersistence.js";

let supabaseClientFactory = async () => {
  const module = await import("../supabaseClient.js");
  return module.supabase;
};

export function setSupabaseClientFactory(factory) {
  supabaseClientFactory = factory;
}

export async function getSupabaseClient() {
  return await supabaseClientFactory();
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

function shouldRetryLegacyBookingPayload(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("column") && (
    message.includes("order_id") ||
    message.includes("service_id") ||
    message.includes("service_name") ||
    message.includes("end_minutes") ||
    message.includes("selected_area") ||
    message.includes("price") ||
    message.includes("travel_fee") ||
    message.includes("congestion_fee") ||
    message.includes("payment_id") ||
    message.includes("user_id") ||
    message.includes("saved_address_id") ||
    message.includes("selected_services") ||
    message.includes("selected_durations")
  );
}

export async function saveBookingToSupabase(booking, status = null) {
  const supabase = await getSupabaseClient();
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
    throw new Error(unavailable
      ? "This appointment is no longer available. Please choose another time."
      : `Booking could not be saved: ${error.message}`);
  }

  const returnedBooking = Array.isArray(data) ? data[0] : data;
  return {
    ...(returnedBooking && typeof returnedBooking === "object" ? returnedBooking : {}),
    id: returnedBooking?.id || (typeof returnedBooking === "string" ? returnedBooking : bookingId),
  };
}

export async function updateBookingInSupabase(booking) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc("update_secure_booking", {
    booking_payload: bookingToSupabasePayload(booking, booking.status || "confirmed"),
  });

  if (error) {
    throw new Error(`Supabase booking update failed: ${error.message}`);
  }

  return Array.isArray(data) ? data[0] : data;
}
