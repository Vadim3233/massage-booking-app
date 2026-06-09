import { buildBookingClientLink } from "./clientData.js";
import {
  DEFAULT_TRAVEL_BUFFER,
  minutesToTime,
  timeToMinutes,
} from "../schedulingEngine.js";

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
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

  return {
    address: typeof booking.address === "string" ? booking.address : "",
    congestionFee: isFiniteNumber(booking.congestionFee) ? Number(booking.congestionFee) : 0,
    clientName: typeof booking.clientName === "string" ? booking.clientName : "",
    customerEmail: typeof booking.customerEmail === "string" ? booking.customerEmail : "",
    customerPhone: typeof booking.customerPhone === "string" ? booking.customerPhone : "",
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
    paymentMethod: typeof booking.paymentMethod === "string" ? booking.paymentMethod : "",
    paymentStatus: typeof booking.paymentStatus === "string" ? booking.paymentStatus : "",
    bookingReference: typeof booking.bookingReference === "string" ? booking.bookingReference : "",
    paymentHoldExpiresAt: typeof booking.paymentHoldExpiresAt === "string" ? booking.paymentHoldExpiresAt : null,
    price: isFiniteNumber(booking.price) ? Number(booking.price) : 0,
    serviceId: String(booking.serviceId),
    serviceName: String(booking.serviceName),
    startMinutes,
    telegramUpdates: Boolean(booking.telegramUpdates),
    duration: Number(booking.duration),
    travelFee: isFiniteNumber(booking.travelFee) ? Number(booking.travelFee) : 0,
    travelBuffer: Math.max(0, Number(booking.travelBuffer)),
  };
}

export function paymentMethodToPaymentStatus(paymentMethod) {
  if (paymentMethod === "card") return "paid";
  if (paymentMethod === "alternative_requested") return "alternative_requested";
  if (paymentMethod === "cash") return "awaiting_verification";
  return "awaiting_verification";
}

export function paymentMethodToBookingStatus(paymentMethod) {
  if (paymentMethod === "bank_transfer") return "pending_payment_verification";
  if (paymentMethod === "alternative_requested") return "payment_method_review";
  if (paymentMethod === "cash") return "payment_method_review";
  return "confirmed";
}

export function normalizeAdminBookingApprovalPatch(patch = {}, currentBooking = {}) {
  const nextPatch = { ...patch };
  const nextPaymentMethod = nextPatch.paymentMethod ?? currentBooking.paymentMethod;
  let nextPaymentStatus = nextPatch.paymentStatus ?? currentBooking.paymentStatus;
  let nextStatus = nextPatch.status ?? currentBooking.status;

  const defaultMapping = {
    card: { paymentStatus: "paid", status: "confirmed" },
    bank_transfer: { paymentStatus: "awaiting_verification", status: "pending_payment_verification" },
    alternative_requested: { paymentStatus: "alternative_requested", status: "payment_method_review" },
    cash: { paymentStatus: "awaiting_verification", status: "payment_method_review" },
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
    } else if (nextPaymentStatus === "awaiting_verification") {
      if (nextPaymentMethod === "bank_transfer") {
        nextStatus = "pending_payment_verification";
      } else {
        nextStatus = "payment_method_review";
      }
    } else if (nextPaymentStatus === "alternative_requested") {
      nextStatus = "payment_method_review";
    } else if (nextPaymentStatus === "cash_on_arrival") {
      nextStatus = "payment_method_review";
    } else if (nextPaymentStatus === "cancelled") {
      nextStatus = "cancelled";
    }
  }

  if (Object.prototype.hasOwnProperty.call(nextPatch, "status")) {
    if (nextStatus === "confirmed") {
      nextPaymentStatus = "paid";
    }
    if (nextStatus === "pending_payment_verification") {
      nextPaymentStatus = "awaiting_verification";
    }
    if (nextStatus === "payment_method_review") {
      if (nextPaymentMethod === "alternative_requested") {
        nextPaymentStatus = "alternative_requested";
      } else if (nextPaymentMethod === "cash") {
        nextPaymentStatus = "awaiting_verification";
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

  return {
    address: typeof booking.address === "string" ? booking.address : "",
    congestionFee: isFiniteNumber(booking.congestionFee) ? Number(booking.congestionFee) : 0,
    clientName: typeof booking.clientName === "string" ? booking.clientName : "",
    customerEmail: typeof booking.customerEmail === "string" ? booking.customerEmail : "",
    customerPhone: typeof booking.customerPhone === "string" ? booking.customerPhone : "",
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
    paymentMethod: typeof booking.paymentMethod === "string" ? booking.paymentMethod : "",
    paymentStatus: typeof booking.paymentStatus === "string" ? booking.paymentStatus : "",
    bookingReference: typeof booking.bookingReference === "string" ? booking.bookingReference : "",
    paymentHoldExpiresAt: typeof booking.paymentHoldExpiresAt === "string" ? booking.paymentHoldExpiresAt : null,
    price: isFiniteNumber(booking.price) ? Number(booking.price) : 0,
    serviceId: String(booking.serviceId),
    serviceName: String(booking.serviceName),
    startMinutes,
    telegramUpdates: Boolean(booking.telegramUpdates),
    duration: Number(booking.duration),
    travelFee: isFiniteNumber(booking.travelFee) ? Number(booking.travelFee) : 0,
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
    status,
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
    status,
    notes: JSON.stringify({ appBooking: normalized }),
  };
}
