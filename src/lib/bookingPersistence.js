import { buildBookingClientLink } from "./clientData.js";
import {
  DEFAULT_SERVICES,
  DEFAULT_TRAVEL_BUFFER,
  minutesToTime,
  timeToMinutes,
} from "../schedulingEngine.js";
import { normalizeSessionPreferenceIds } from "./sessionPreferences.js";

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function cleanString(value) {
  return typeof value === "string" ? value : "";
}

function cleanOptionalString(value) {
  const normalized = cleanString(value).trim();
  return normalized || "";
}

function normalizeSessionPreferenceLabelSnapshots(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return { id: "", label: item.trim() };
      if (!item || typeof item !== "object") return null;
      return {
        id: cleanOptionalString(item.id),
        label: cleanOptionalString(item.label),
      };
    })
    .filter((item) => item?.label);
}

function normalizeBookingSessionPreferenceIds(booking = {}) {
  const ids = Array.isArray(booking.sessionPreferenceIds)
    ? booking.sessionPreferenceIds.map(cleanOptionalString).filter(Boolean)
    : [];
  const knownIds = normalizeSessionPreferenceIds(ids);
  const snapshotIds = new Set(
    normalizeSessionPreferenceLabelSnapshots(booking.sessionPreferenceLabels)
      .map((item) => item.id)
      .filter(Boolean)
  );
  const normalized = [];
  ids.forEach((id) => {
    if ((knownIds.includes(id) || snapshotIds.has(id)) && !normalized.includes(id)) {
      normalized.push(id);
    }
  });
  return normalized;
}

function isUuidString(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function bookingHoldPayload(booking) {
  const hold = booking?.hold && typeof booking.hold === "object" ? booking.hold : null;
  if (!hold || !isUuidString(hold.id) || !isUuidString(hold.token)) return {};

  return {
    hold_client_key: cleanOptionalString(hold.clientKey) || null,
    hold_id: hold.id,
    hold_token: hold.token,
  };
}

function bookingCancellationPayload(booking) {
  const cancelledAt = cleanOptionalString(booking.cancelledAt);
  const cancelledBy = cleanOptionalString(booking.cancelledBy);
  const cancellationWindow = cleanOptionalString(booking.cancellationWindow);
  return {
    ...(cancelledAt ? { cancelled_at: cancelledAt } : {}),
    ...(cancelledBy ? { cancelled_by: cancelledBy } : {}),
    ...(cancellationWindow ? { cancellation_window: cancellationWindow } : {}),
  };
}

export function generateBookingReference(now = new Date()) {
  const date = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const timestamp = date.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  let entropy = "";

  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const values = new Uint8Array(4);
    crypto.getRandomValues(values);
    entropy = Array.from(values, (value) => value.toString(36).padStart(2, "0")).join("").toUpperCase();
  } else {
    entropy = Math.floor(Math.random() * 1679616).toString(36).padStart(4, "0").toUpperCase();
  }

  return `VDM-${timestamp}-${entropy}`;
}

function inferPaymentMethod(paymentMethod, paymentStatus, status) {
  const method = cleanOptionalString(paymentMethod);
  if (method) return method;
  if (paymentStatus === "cash_on_arrival") return "cash";
  if (paymentStatus === "awaiting_verification" || status === "pending_payment_verification") return "bank_transfer";
  return "";
}

function inferPaymentStatus(paymentStatus, paymentMethod, status) {
  const currentStatus = cleanOptionalString(paymentStatus);
  if (currentStatus) return currentStatus;
  if (paymentMethod === "bank_transfer" || status === "pending_payment_verification") return "awaiting_verification";
  if (paymentMethod === "cash") return "cash_on_arrival";
  if (status === "cancelled") return "cancelled";
  return "";
}

function normalizePaymentMetadata(booking) {
  const status = cleanOptionalString(booking.status) || "confirmed";
  const rawPaymentStatus = cleanOptionalString(booking.paymentStatus);
  const rawPaymentMethod = cleanOptionalString(booking.paymentMethod);
  const paymentMethod = inferPaymentMethod(rawPaymentMethod, rawPaymentStatus, status);
  const paymentStatus = inferPaymentStatus(rawPaymentStatus, paymentMethod, status);
  const bookingReference = cleanOptionalString(booking.bookingReference) || cleanOptionalString(booking.paymentReference);
  const paymentHoldExpiresAt = cleanOptionalString(booking.paymentHoldExpiresAt) || cleanOptionalString(booking.paymentExpiry) || null;
  const paymentReceivedAt = cleanOptionalString(booking.paymentReceivedAt) || null;

  return {
    bookingReference,
    cashOnArrivalRequest: Boolean(booking.cashOnArrivalRequest || (paymentMethod === "cash" && paymentStatus === "cash_on_arrival")),
    paymentExpiry: paymentHoldExpiresAt,
    paymentHoldExpiresAt,
    paymentMethod,
    paymentReceivedAt,
    paymentReference: bookingReference,
    paymentStatus,
    status,
  };
}

export function normalizeStoredBooking(booking) {
  if (!booking || typeof booking !== "object") return null;
  if (!booking.id || !booking.serviceId || !booking.serviceName) return null;

  const startMinutes = isFiniteNumber(booking.startMinutes)
    ? Number(booking.startMinutes)
    : typeof booking.start === "string"
      ? timeToMinutes(booking.start)
      : null;

  if (!isFiniteNumber(startMinutes) || !isFiniteNumber(booking.duration) || !isFiniteNumber(booking.travelBuffer)) return null;
  const paymentMetadata = normalizePaymentMetadata(booking);
  const price = isFiniteNumber(booking.price) ? Number(booking.price) : 0;
  const congestionFee = isFiniteNumber(booking.congestionFee) ? Number(booking.congestionFee) : 0;
  const travelFee = isFiniteNumber(booking.travelFee) ? Number(booking.travelFee) : 0;

  return {
    address: typeof booking.address === "string" ? booking.address : "",
    congestionFee,
    clientName: typeof booking.clientName === "string" ? booking.clientName : "",
    customerEmail: typeof booking.customerEmail === "string" ? booking.customerEmail : "",
    customerPhone: typeof booking.customerPhone === "string" ? booking.customerPhone : "",
    eventColor: typeof booking.eventColor === "string" ? booking.eventColor : "orange",
    isNewClient: Boolean(booking.isNewClient),
    userId: typeof booking.userId === "string" ? booking.userId : "",
    savedAddressId: typeof booking.savedAddressId === "string" ? booking.savedAddressId : "",
    id: String(booking.id),
    items: Array.isArray(booking.items)
      ? booking.items.map((item) => ({
          id: String(item.id ?? item.serviceId ?? ""),
          minutes: isFiniteNumber(item.minutes) ? Number(item.minutes) : 0,
          name: String(item.name ?? ""),
          price: isFiniteNumber(item.price) ? Number(item.price) : 0,
        })).filter((item) => item.name)
      : [],
    location: typeof booking.location === "string" ? booking.location : "",
    kind: booking.kind === "personal" ? "personal" : "booking",
    orderId: typeof booking.orderId === "string" ? booking.orderId : "",
    paymentId: typeof booking.paymentId === "string" ? booking.paymentId : "",
    paymentMethod: paymentMetadata.paymentMethod,
    paymentStatus: paymentMetadata.paymentStatus,
    bookingReference: paymentMetadata.bookingReference,
    paymentReference: paymentMetadata.paymentReference,
    paymentExpiry: paymentMetadata.paymentExpiry,
    paymentHoldExpiresAt: paymentMetadata.paymentHoldExpiresAt,
    paymentReceivedAt: paymentMetadata.paymentReceivedAt,
    cancelledAt: cleanOptionalString(booking.cancelledAt) || null,
    cancelledBy: cleanOptionalString(booking.cancelledBy),
    cancellationWindow: cleanOptionalString(booking.cancellationWindow),
    cashOnArrivalRequest: paymentMetadata.cashOnArrivalRequest,
    price,
    serviceId: String(booking.serviceId),
    serviceName: String(booking.serviceName),
    sessionNotes: cleanOptionalString(booking.sessionNotes || booking.notes),
    sessionPreferenceIds: normalizeBookingSessionPreferenceIds(booking),
    sessionPreferenceLabels: normalizeSessionPreferenceLabelSnapshots(booking.sessionPreferenceLabels),
    status: paymentMetadata.status,
    startMinutes,
    telegramUpdates: Boolean(booking.telegramUpdates),
    duration: Number(booking.duration),
    total: isFiniteNumber(booking.total) ? Number(booking.total) : price + congestionFee + travelFee,
    travelFee,
    travelBuffer: Math.max(0, Number(booking.travelBuffer)),
  };
}

export function paymentMethodToPaymentStatus(paymentMethod) {
  if (paymentMethod === "bank_transfer") return "awaiting_verification";
  if (paymentMethod === "card") return "pending";
  if (paymentMethod === "alternative_requested") return "alternative_requested";
  if (paymentMethod === "cash") return "cash_on_arrival";
  return "pending";
}

export function paymentMethodToBookingStatus(paymentMethod) {
  if (paymentMethod === "bank_transfer") return "pending_payment_verification";
  if (paymentMethod === "card") return "payment_method_review";
  if (paymentMethod === "alternative_requested") return "payment_method_review";
  if (paymentMethod === "cash") return "payment_method_review";
  return "payment_method_review";
}

export function normalizeAdminBookingApprovalPatch(patch = {}, currentBooking = {}) {
  const nextPatch = { ...patch };
  const nextPaymentMethod = nextPatch.paymentMethod ?? currentBooking.paymentMethod;
  let nextPaymentStatus = nextPatch.paymentStatus ?? currentBooking.paymentStatus;
  let nextStatus = nextPatch.status ?? currentBooking.status;

  const defaultMapping = {
    card: { paymentStatus: "pending", status: "payment_method_review" },
    bank_transfer: { paymentStatus: "awaiting_verification", status: "pending_payment_verification" },
    alternative_requested: { paymentStatus: "alternative_requested", status: "payment_method_review" },
    cash: { paymentStatus: "cash_on_arrival", status: "payment_method_review" },
  };

  if (Object.prototype.hasOwnProperty.call(nextPatch, "paymentMethod") && nextPaymentMethod in defaultMapping) {
    const defaultValues = defaultMapping[nextPaymentMethod];
    if (!Object.prototype.hasOwnProperty.call(nextPatch, "paymentStatus")) {
      nextPaymentStatus = defaultValues.paymentStatus;
    }
    if (!Object.prototype.hasOwnProperty.call(nextPatch, "status")) {
      nextStatus = defaultValues.status;
    }
  }

  if (Object.prototype.hasOwnProperty.call(nextPatch, "paymentStatus")) {
    if (nextPaymentStatus === "paid") {
      nextStatus = "confirmed";
      if (!currentBooking.paymentReceivedAt && !Object.prototype.hasOwnProperty.call(nextPatch, "paymentReceivedAt")) {
        nextPatch.paymentReceivedAt = new Date().toISOString();
      }
    } else if (nextPaymentStatus === "awaiting_verification") {
      if (nextPaymentMethod === "bank_transfer") {
        nextStatus = "pending_payment_verification";
      } else {
        nextStatus = "payment_method_review";
      }
    } else if (nextPaymentStatus === "alternative_requested") {
      nextStatus = "payment_method_review";
    } else if (nextPaymentStatus === "cash_on_arrival") {
      const cashApprovalRequested = Object.prototype.hasOwnProperty.call(nextPatch, "status")
        && nextPatch.status === "confirmed";
      nextStatus = cashApprovalRequested || currentBooking.status === "confirmed"
        ? "confirmed"
        : "payment_method_review";
    } else if (nextPaymentStatus === "cancelled") {
      nextStatus = "cancelled";
    }
  }

  if (Object.prototype.hasOwnProperty.call(nextPatch, "status")) {
    if (nextStatus === "confirmed") {
      if (!(nextPaymentMethod === "cash" && nextPaymentStatus === "cash_on_arrival")) {
        nextPaymentStatus = "paid";
        if (!currentBooking.paymentReceivedAt && !Object.prototype.hasOwnProperty.call(nextPatch, "paymentReceivedAt")) {
          nextPatch.paymentReceivedAt = new Date().toISOString();
        }
      }
    }
    if (nextStatus === "pending_payment_verification") {
      nextPaymentStatus = "awaiting_verification";
    }
    if (nextStatus === "payment_method_review") {
      if (nextPaymentMethod === "alternative_requested") {
        nextPaymentStatus = "alternative_requested";
      } else if (nextPaymentMethod === "cash") {
        nextPaymentStatus = "cash_on_arrival";
      } else if (nextPaymentStatus !== "alternative_requested" && nextPaymentStatus !== "cash_on_arrival") {
        nextPaymentStatus = "awaiting_verification";
      }
    }
    if (nextStatus === "cancelled") {
      nextPaymentStatus = "cancelled";
    }
  }

  if (nextPaymentStatus !== currentBooking.paymentStatus) {
    nextPatch.paymentStatus = nextPaymentStatus;
  }
  if (nextStatus !== currentBooking.status) {
    nextPatch.status = nextStatus;
  }

  return nextPatch;
}

export function engineBookingToStorageBooking(booking) {
  if (!booking || typeof booking !== "object") return null;
  if (!booking.id || !booking.serviceId || !booking.serviceName) return null;

  const startMinutes = typeof booking.start === "string"
    ? timeToMinutes(booking.start)
    : isFiniteNumber(booking.start)
      ? Number(booking.start)
      : null;

  if (!isFiniteNumber(startMinutes) || !isFiniteNumber(booking.duration) || !isFiniteNumber(booking.travelBuffer)) return null;
  const paymentMetadata = normalizePaymentMetadata(booking);
  const price = isFiniteNumber(booking.price) ? Number(booking.price) : 0;
  const congestionFee = isFiniteNumber(booking.congestionFee) ? Number(booking.congestionFee) : 0;
  const travelFee = isFiniteNumber(booking.travelFee) ? Number(booking.travelFee) : 0;

  return {
    address: typeof booking.address === "string" ? booking.address : "",
    congestionFee,
    clientName: typeof booking.clientName === "string" ? booking.clientName : "",
    customerEmail: typeof booking.customerEmail === "string" ? booking.customerEmail : "",
    customerPhone: typeof booking.customerPhone === "string" ? booking.customerPhone : "",
    eventColor: typeof booking.eventColor === "string" ? booking.eventColor : "orange",
    isNewClient: Boolean(booking.isNewClient),
    userId: typeof booking.userId === "string" ? booking.userId : "",
    savedAddressId: typeof booking.savedAddressId === "string" ? booking.savedAddressId : "",
    id: String(booking.id),
    items: Array.isArray(booking.items)
      ? booking.items.map((item) => ({
          id: String(item.id ?? item.serviceId ?? ""),
          minutes: isFiniteNumber(item.minutes) ? Number(item.minutes) : 0,
          name: String(item.name ?? ""),
          price: isFiniteNumber(item.price) ? Number(item.price) : 0,
        })).filter((item) => item.name)
      : [],
    location: typeof booking.location === "string" ? booking.location : "",
    kind: booking.kind === "personal" ? "personal" : "booking",
    orderId: typeof booking.orderId === "string" ? booking.orderId : "",
    paymentId: typeof booking.paymentId === "string" ? booking.paymentId : "",
    paymentMethod: paymentMetadata.paymentMethod,
    paymentStatus: paymentMetadata.paymentStatus,
    bookingReference: paymentMetadata.bookingReference,
    paymentReference: paymentMetadata.paymentReference,
    paymentExpiry: paymentMetadata.paymentExpiry,
    paymentHoldExpiresAt: paymentMetadata.paymentHoldExpiresAt,
    paymentReceivedAt: paymentMetadata.paymentReceivedAt,
    cancelledAt: cleanOptionalString(booking.cancelledAt) || null,
    cancelledBy: cleanOptionalString(booking.cancelledBy),
    cancellationWindow: cleanOptionalString(booking.cancellationWindow),
    cashOnArrivalRequest: paymentMetadata.cashOnArrivalRequest,
    price,
    serviceId: String(booking.serviceId),
    serviceName: String(booking.serviceName),
    sessionNotes: cleanOptionalString(booking.sessionNotes || booking.notes),
    sessionPreferenceIds: normalizeBookingSessionPreferenceIds(booking),
    sessionPreferenceLabels: normalizeSessionPreferenceLabelSnapshots(booking.sessionPreferenceLabels),
    status: paymentMetadata.status,
    startMinutes,
    telegramUpdates: Boolean(booking.telegramUpdates),
    duration: Number(booking.duration),
    total: isFiniteNumber(booking.total) ? Number(booking.total) : price + congestionFee + travelFee,
    travelFee,
    travelBuffer: Math.max(0, Number(booking.travelBuffer)),
  };
}

export function bookingToSupabasePayload(booking, status = "confirmed") {
  const normalized = engineBookingToStorageBooking(booking);
  if (!normalized) throw new Error("Booking could not be saved because it has invalid booking data.");
  if (!booking.dateValue) throw new Error("Booking could not be saved because its date is missing.");
  const isPersonal = normalized.kind === "personal";
  const selectedServices = normalized.items.length
    ? normalized.items.map((item, index) => ({
        id: item.id || (index === 0 ? normalized.serviceId : ""),
        name: item.name,
        durationMinutes: item.minutes,
        price: item.price,
      }))
    : [{ id: normalized.serviceId, name: normalized.serviceName, durationMinutes: normalized.duration, price: normalized.price }];
  const clientLink = buildBookingClientLink({
    savedAddressId: normalized.savedAddressId,
    services: selectedServices,
    userId: normalized.userId,
  });

  return {
    ...clientLink,
    id: normalized.id,
    order_id: normalized.orderId || null,
    client_name: normalized.clientName || (isPersonal ? normalized.serviceName : "Guest"),
    client_email: normalized.customerEmail || "not-provided@example.local",
    client_phone: normalized.customerPhone || null,
    service_id: normalized.serviceId,
    service: normalized.serviceName,
    service_name: normalized.serviceName,
    date: booking.dateValue,
    start_minutes: normalized.startMinutes,
    end_minutes: normalized.startMinutes + normalized.duration,
    duration_minutes: normalized.duration,
    address: normalized.address || null,
    postcode: normalized.location || null,
    selected_area: normalized.location || null,
    price: normalized.price || 0,
    travel_fee: normalized.travelFee || 0,
    congestion_fee: normalized.congestionFee || 0,
    payment_id: normalized.paymentId || null,
    payment_status: normalized.paymentStatus || null,
    ...bookingCancellationPayload(normalized),
    status,
    ...bookingHoldPayload(booking),
    notes: JSON.stringify({ appBooking: normalized }),
  };
}

export function bookingToLegacySupabasePayload(booking, status = "confirmed") {
  const normalized = engineBookingToStorageBooking(booking);
  if (!normalized) throw new Error("Booking could not be saved because it has invalid booking data.");
  if (!booking.dateValue) throw new Error("Booking could not be saved because its date is missing.");
  const isPersonal = normalized.kind === "personal";

  return {
    id: normalized.id,
    client_name: normalized.clientName || (isPersonal ? normalized.serviceName : "Guest"),
    client_email: normalized.customerEmail || "not-provided@example.local",
    client_phone: normalized.customerPhone || null,
    service: normalized.serviceName,
    date: booking.dateValue,
    start_minutes: normalized.startMinutes,
    duration_minutes: normalized.duration,
    address: normalized.address || null,
    postcode: normalized.location || null,
    ...bookingCancellationPayload(normalized),
    status,
    notes: JSON.stringify({ appBooking: normalized }),
  };
}

function serviceIdForName(serviceName) {
  const normalizedName = String(serviceName ?? "").trim().toLowerCase();
  const matchedId = DEFAULT_SERVICES.find((service) => service.name.toLowerCase() === normalizedName)?.id;
  return matchedId || normalizedName.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom-service";
}

export function supabaseRowToStorageBooking(row) {
  if (!row || typeof row !== "object") return null;

  let noteData = {};
  try {
    noteData = row.notes ? JSON.parse(row.notes) : {};
  } catch {
    noteData = {};
  }

  const savedBooking = normalizeStoredBooking(noteData.appBooking);
  if (savedBooking) {
    return {
      ...savedBooking,
      id: String(row.id ?? savedBooking.id),
      userId: typeof row.user_id === "string" ? row.user_id : savedBooking.userId,
      savedAddressId: typeof row.saved_address_id === "string" ? row.saved_address_id : savedBooking.savedAddressId,
      cancelledAt: cleanOptionalString(row.cancelled_at) || savedBooking.cancelledAt || null,
      cancelledBy: cleanOptionalString(row.cancelled_by) || savedBooking.cancelledBy || "",
      cancellationWindow: cleanOptionalString(row.cancellation_window) || savedBooking.cancellationWindow || "",
      congestionFee: isFiniteNumber(row.congestion_fee) ? Number(row.congestion_fee) : savedBooking.congestionFee,
      price: isFiniteNumber(row.price) ? Number(row.price) : savedBooking.price,
      total: (isFiniteNumber(row.price) ? Number(row.price) : savedBooking.price)
        + (isFiniteNumber(row.congestion_fee) ? Number(row.congestion_fee) : savedBooking.congestionFee)
        + (isFiniteNumber(row.travel_fee) ? Number(row.travel_fee) : savedBooking.travelFee),
      travelFee: isFiniteNumber(row.travel_fee) ? Number(row.travel_fee) : savedBooking.travelFee,
    };
  }

  const serviceName = String(row.service_name ?? row.service ?? "Custom service");
  const startMinutes = Number(row.start_minutes);
  const duration = Number(row.duration_minutes);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(duration)) return null;

  return {
    address: typeof row.address === "string" ? row.address : "",
    bookingReference: cleanOptionalString(row.booking_reference) || cleanOptionalString(row.payment_reference),
    congestionFee: isFiniteNumber(row.congestion_fee) ? Number(row.congestion_fee) : 0,
    clientName: typeof row.client_name === "string" ? row.client_name : "",
    customerEmail: typeof row.client_email === "string" ? row.client_email : "",
    customerPhone: typeof row.client_phone === "string" ? row.client_phone : "",
    userId: typeof row.user_id === "string" ? row.user_id : "",
    savedAddressId: typeof row.saved_address_id === "string" ? row.saved_address_id : "",
    id: String(row.id),
    items: [],
    kind: serviceIdForName(serviceName) === "personal-event" ? "personal" : "booking",
    location: typeof row.selected_area === "string" ? row.selected_area : typeof row.postcode === "string" ? row.postcode : "",
    isNewClient: false,
    orderId: typeof row.order_id === "string" ? row.order_id : "",
    paymentHoldExpiresAt: cleanOptionalString(row.payment_hold_expires_at) || cleanOptionalString(row.payment_expiry) || null,
    paymentId: typeof row.payment_id === "string" ? row.payment_id : "",
    paymentMethod: inferPaymentMethod(row.payment_method, row.payment_status, row.status),
    paymentStatus: inferPaymentStatus(row.payment_status, row.payment_method, row.status),
    paymentReference: cleanOptionalString(row.booking_reference) || cleanOptionalString(row.payment_reference),
    paymentExpiry: cleanOptionalString(row.payment_hold_expires_at) || cleanOptionalString(row.payment_expiry) || null,
    paymentReceivedAt: cleanOptionalString(row.payment_received_at) || null,
    cancelledAt: cleanOptionalString(row.cancelled_at) || null,
    cancelledBy: cleanOptionalString(row.cancelled_by),
    cancellationWindow: cleanOptionalString(row.cancellation_window),
    cashOnArrivalRequest: Boolean(row.cash_on_arrival_request || row.payment_method === "cash" || row.payment_status === "cash_on_arrival"),
    price: isFiniteNumber(row.price) ? Number(row.price) : 0,
    serviceId: typeof row.service_id === "string" && row.service_id ? row.service_id : serviceIdForName(serviceName),
    serviceName,
    sessionNotes: "",
    sessionPreferenceIds: [],
    sessionPreferenceLabels: [],
    startMinutes,
    status: typeof row.status === "string" ? row.status : "confirmed",
    telegramUpdates: false,
    duration,
    total: (isFiniteNumber(row.price) ? Number(row.price) : 0)
      + (isFiniteNumber(row.congestion_fee) ? Number(row.congestion_fee) : 0)
      + (isFiniteNumber(row.travel_fee) ? Number(row.travel_fee) : 0),
    travelFee: isFiniteNumber(row.travel_fee) ? Number(row.travel_fee) : 0,
    travelBuffer: DEFAULT_TRAVEL_BUFFER,
  };
}
