import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_DAY_SETTINGS,
  DEFAULT_SERVICES,
  DEFAULT_TRAVEL_BUFFER,
  SLOT_INCREMENT,
  VALID_DURATIONS,
  createBooking,
  getBookingBlocks,
  getFlow,
  getSchedulingPreview,
  isValidDuration,
  minutesToTime,
  rangesOverlap,
  timeToMinutes,
} from "./schedulingEngine.js";
import {
  getBasketAwareSchedulingPreview,
  validateBasketAppointments,
} from "./lib/bookingBasket.js";
import { sanitizeServiceAreas, serviceAreas as DEFAULT_SERVICE_AREAS } from "./lib/serviceAreas.js";
import {
  buildBookingClientLink,
  ensureCurrentClientBookingAddress,
  getCurrentClientProfile,
  loadCurrentClientBookingContext,
  profileInputFromAuthUser,
  updateCurrentClientBookingDefaults,
  upsertCurrentClientProfile,
} from "./lib/clientData.js";
import {
  bookingToSupabasePayload,
  bookingToLegacySupabasePayload,
  normalizeStoredBooking,
  paymentMethodToBookingStatus,
  paymentMethodToPaymentStatus,
  normalizeAdminBookingApprovalPatch,
} from "./lib/bookingPersistence.js";
import {
  saveBookingToSupabase,
  updateBookingInSupabase,
  getSupabaseClient,
} from "./lib/bookingSupabase.js";
import { ClientAccountPanel } from "./components/Client/ClientAccountPanel.jsx";
import { BookAgainPanel } from "./components/Client/BookAgainPanel.jsx";
import { buildAdminCustomers } from "./components/Admin/adminCustomers.js";
import { BusinessAnalyticsDashboard } from "./components/Admin/BusinessAnalyticsDashboard.jsx";
import { AdminLogin } from "./components/Admin/AdminLogin.jsx";
import AdminWorkspace from "./components/Admin/AdminWorkspace.jsx";
import { BookingSummary } from "./components/Booking/BookingSummary.jsx";
import { BookingTopbar } from "./components/Booking/BookingTopbar.jsx";
import { Timeline } from "./components/Calendar/Timeline.jsx";
import { ServiceCard } from "./components/ui/DesignSystem.jsx";
import { WaitlistPanel } from "./components/Waitlist/WaitlistPanel.jsx";
import massageTreatmentImage from "./assets/massage-treatment-optimized.jpg";
import "./styles/app.css";

const SAMPLE_BOOKINGS = [
  {
    id: "booking-1",
    serviceId: "deep-tissue",
    serviceName: "Deep Tissue Recovery",
    start: "10:00",
    duration: 90,
    travelBuffer: 60,
  },
  {
    id: "booking-2",
    serviceId: "sports",
    serviceName: "Performance Sports Massage",
    start: "12:30",
    duration: 60,
    travelBuffer: 45,
  },
];

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STORAGE_VERSION = 1;
const BOOKINGS_STORAGE_KEY = "chainScheduler.bookings";
const WAITLIST_STORAGE_KEY = "chainScheduler.waitlistEntries";
const ENHANCEMENTS_STORAGE_KEY = "chainScheduler.enhancements";
const COVERAGE_ZONES_STORAGE_KEY = "chainScheduler.coverageZones";
const SERVICE_AREAS_STORAGE_KEY = "chainScheduler.serviceAreas";
const DEFAULT_ENHANCEMENTS = [
  { id: "head-massage", active: true, durationMinutes: 10, name: "Indian head massage", price: 18, description: "Focused scalp, neck, and shoulder release." },
  { id: "hot-stones", active: true, durationMinutes: 0, name: "Hot stones", price: 24, description: "Gentle heat for deeper muscle relaxation." },
  { id: "aromatherapy", active: true, durationMinutes: 0, name: "Aromatherapy oil", price: 12, description: "A calming oil blend added to your treatment." },
  { id: "extra-care", active: true, durationMinutes: 0, name: "Aftercare notes", price: 0, description: "Simple recovery tips after the appointment." },
];
const DEFAULT_COVERAGE_ZONES = {
  preapproval: ["W1", "W2", "W3", "W5", "W7", "W9", "W13", "WC1", "WC2", "NW1", "NW8", "SW1", "SW3", "SW4", "SW7", "SW8", "SW9", "SW12", "SW17", "SW18", "SE1", "SE11"],
  usual: ["W4", "W6", "W8", "W10", "W11", "W12", "W14", "SW5", "SW6", "SW10", "SW11", "SW13", "SW15"],
};
const WORKING_RULE_FIELDS = [
  "workingStart",
  "workingEnd",
  "mode",
  "startMode",
  "fixedStart",
  "releaseTime",
  "anchorReleaseEnabled",
];

function cloneValue(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function readStoredJson(key, fallback) {
  try {
    const storedValue = window.localStorage.getItem(key);
    if (!storedValue) return fallback;

    const payload = JSON.parse(storedValue);
    if (!payload || payload.version !== STORAGE_VERSION || !("data" in payload)) {
      return fallback;
    }

    return payload.data;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ version: STORAGE_VERSION, data: value }));
  } catch {
    // Persistence is best-effort in browsers where localStorage is blocked.
  }
}

function removeStoredValue(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Persistence is best-effort in browsers where localStorage is blocked.
  }
}

const BOOKING_CONFIRM_TIMEOUT_MS = 15000;

function logBookingConfirmation(stage, error = null) {
  if (error) {
    console.error(`[booking-confirm] ${stage}`, {
      code: error?.code || null,
      name: error?.name || "Error",
    });
    return;
  }
  console.info(`[booking-confirm] ${stage}`);
}

async function runSupabaseConfirmationOperation(operation, label) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, BOOKING_CONFIRM_TIMEOUT_MS);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (timedOut || error?.name === "AbortError") {
      throw new Error(`${label} timed out. Please check your connection and try again.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function postTransactionalEmail(emailRequest) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
  const endpoints = apiBaseUrl
    ? [`${apiBaseUrl}/api/internal-transactional-emails`]
    : ["/api/internal-transactional-emails", "http://127.0.0.1:8787/api/internal-transactional-emails"];

  let lastError = null;

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify(emailRequest),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        lastError = new Error(`Email API returned ${response.status}`);
        continue;
      }

      return response.json();
    } catch (error) {
      lastError = error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error("Email API unavailable");
}


async function postTelegramNotification(type, payload = {}) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
  const endpoints = apiBaseUrl
    ? [`${apiBaseUrl}/api/internal-telegram-notifications`]
    : ["/api/internal-telegram-notifications", "http://127.0.0.1:8787/api/internal-telegram-notifications"];

  let lastError = null;

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify({ payload, type }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.sent === false) {
        lastError = new Error(result.reason || result.error || `Telegram API returned ${response.status}`);
        continue;
      }

      return result;
    } catch (error) {
      lastError = error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error("Telegram API unavailable");
}

function notifyAdminTelegram(type, payload = {}) {
  postTelegramNotification(type, payload).catch((error) => {
    console.warn(`Telegram notification failed for ${type}`, error);
  });
}
async function postTelegramTest() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
  const endpoints = [
    "/api/telegram-test",
    "http://127.0.0.1:8787/api/telegram-test",
    ...(apiBaseUrl ? [`${apiBaseUrl}/api/telegram-test`] : []),
  ];

  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify({ source: "admin-settings" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.sent === false) {
        lastError = new Error(result.reason || result.error || `Telegram API returned ${response.status}`);
        continue;
      }

      return result;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Telegram API unavailable");
}

function telegramTestErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "");

  if (message.includes("missing_telegram_bot_token")) {
    return "Telegram bot token is missing. Add TELEGRAM_BOT_TOKEN in Vercel, then redeploy.";
  }

  if (message.includes("missing_telegram_chat_id")) {
    return "Telegram chat ID is missing. Add TELEGRAM_TEST_CHAT_ID in Vercel, then redeploy.";
  }

  if (message.toLowerCase().includes("chat not found")) {
    return "Telegram chat was not found. Open the bot, press Start, then check the chat ID.";
  }

  if (message.toLowerCase().includes("blocked by the user")) {
    return "Telegram cannot send because the bot is blocked. Unblock the bot and press Start.";
  }

  return message || "Telegram test could not be sent.";
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function engineBookingToStorageBooking(booking) {
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

function bookingDuplicateSignature(booking, dayKey = "") {
  const normalized = normalizeStoredBooking(booking) ?? engineBookingToStorageBooking(booking);
  if (!normalized) return "";

  return [
    String(dayKey || "").toLowerCase(),
    normalized.kind,
    normalized.clientName.trim().toLowerCase(),
    normalized.serviceId.trim().toLowerCase(),
    normalized.serviceName.trim().toLowerCase(),
    normalized.location.trim().toLowerCase(),
    normalized.startMinutes,
    normalized.duration,
    normalized.travelBuffer,
  ].join("|");
}

function dedupeStoredBookings(bookings, dayKey = "") {
  const seen = new Set();
  return bookings.filter((booking) => {
    const signature = bookingDuplicateSignature(booking, dayKey);
    if (!signature) return false;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

const pendingBookingSignatures = new Set();

function sanitizeStoredBookingsByDay(bookingsByDay) {
  if (!bookingsByDay || typeof bookingsByDay !== "object" || Array.isArray(bookingsByDay)) return {};

  return Object.fromEntries(
    Object.entries(bookingsByDay).map(([dayId, bookings]) => [
      dayId,
      Array.isArray(bookings)
        ? dedupeStoredBookings(bookings.map(normalizeStoredBooking).filter(Boolean), dayId)
        : [],
    ])
  );
}

function storageBookingToEngineBooking(booking) {
  const normalized = normalizeStoredBooking(booking);
  if (!normalized) return null;

  return {
    address: normalized.address,
    clientName: normalized.clientName,
    customerEmail: normalized.customerEmail,
    customerPhone: normalized.customerPhone,
    userId: normalized.userId,
    savedAddressId: normalized.savedAddressId,
    id: normalized.id,
    items: normalized.items,
    kind: normalized.kind,
    location: normalized.location,
    orderId: normalized.orderId,
    paymentId: normalized.paymentId,
    price: normalized.price,
    travelFee: normalized.travelFee,
    congestionFee: normalized.congestionFee,
    serviceId: normalized.serviceId,
    serviceName: normalized.serviceName,
    telegramUpdates: normalized.telegramUpdates,
    start: minutesToTime(normalized.startMinutes),
    duration: normalized.duration,
    travelBuffer: normalized.travelBuffer,
  };
}

function serviceIdForName(serviceName) {
  const normalizedName = String(serviceName ?? "").trim().toLowerCase();
  const matchedId = DEFAULT_SERVICES.find((service) => service.name.toLowerCase() === normalizedName)?.id;
  return matchedId || normalizedName.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom-service";
}

function supabaseRowToStorageBooking(row) {
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
    };
  }

  const serviceName = String(row.service ?? "Custom service");
  const startMinutes = Number(row.start_minutes);
  const duration = Number(row.duration_minutes);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(duration)) return null;

  return {
    address: typeof row.address === "string" ? row.address : "",
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
    orderId: typeof row.order_id === "string" ? row.order_id : "",
    paymentId: typeof row.payment_id === "string" ? row.payment_id : "",
    price: isFiniteNumber(row.price) ? Number(row.price) : 0,
    serviceId: serviceIdForName(serviceName),
    serviceName: typeof row.service_name === "string" ? row.service_name : serviceName,
    startMinutes,
    telegramUpdates: false,
    duration,
    travelFee: isFiniteNumber(row.travel_fee) ? Number(row.travel_fee) : 0,
    travelBuffer: DEFAULT_TRAVEL_BUFFER,
  };
}

function rowsToBookingsByDay(rows, days) {
  return rows.reduce((bookingsByDay, row) => {
    const day = days.find((item) => item.dateValue === row.date);
    const booking = supabaseRowToStorageBooking(row);
    if (!day || !booking) return bookingsByDay;

    const nextBookings = [...(bookingsByDay[day.id] ?? []), booking];
    bookingsByDay[day.id] = dedupeStoredBookings(nextBookings, day.dateValue ?? day.id);
    return bookingsByDay;
  }, {});
}

function publicBlockToStorageBooking(row) {
  if (!row || typeof row !== "object") return null;

  const startMinutes = Number(row.start_minutes);
  const duration = Number(row.duration_minutes);
  const travelBuffer = Number(row.buffer_minutes);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(duration)) return null;

  return {
    address: "",
    clientName: "",
    customerEmail: "",
    customerPhone: "",
    id: `public-${row.booking_id ?? row.date}-${startMinutes}`,
    items: [],
    location: "",
    serviceId: "reserved",
    serviceName: "Reserved",
    startMinutes,
    duration,
    travelBuffer: Number.isFinite(travelBuffer) ? Math.max(0, travelBuffer) : DEFAULT_TRAVEL_BUFFER,
  };
}

function publicBlocksToBookingsByDay(rows, days) {
  return rows.reduce((bookingsByDay, row) => {
    const day = days.find((item) => item.dateValue === row.date);
    const booking = publicBlockToStorageBooking(row);
    if (!day || !booking) return bookingsByDay;

    bookingsByDay[day.id] = [...(bookingsByDay[day.id] ?? []), booking];
    return bookingsByDay;
  }, {});
}

function writeBookingsCacheFromDays(days) {
  const bookingsByDay = days.reduce((storedBookings, day) => {
    storedBookings[day.id] = dedupeStoredBookings(
      day.bookings.map(engineBookingToStorageBooking).filter(Boolean),
      day.dateValue ?? day.id
    );
    return storedBookings;
  }, {});

  writeStoredJson(BOOKINGS_STORAGE_KEY, bookingsByDay);
}

async function createOrderInSupabase(order) {
  const supabase = await getSupabaseClient();
  logBookingConfirmation("create_secure_order started");
  const { data, error } = await runSupabaseConfirmationOperation(
    (signal) => supabase
      .rpc("create_secure_order", { order_payload: {
        id: order.id,
        user_id: order.userId || null,
        client_email: order.clientEmail || null,
        client_name: order.clientName || null,
        payment_id: order.paymentId,
        payment_provider: order.paymentProvider,
        payment_status: order.paymentStatus,
        total_amount: order.totalAmount,
      } })
      .abortSignal(signal),
    "Creating the checkout order"
  );

  if (error) {
    logBookingConfirmation("create_secure_order failed", error);
    throw new Error(`Could not create the checkout order: ${error.message}`);
  }
  logBookingConfirmation("create_secure_order succeeded");
  return data;
}


async function deleteBookingFromSupabase(bookingId) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from("bookings")
    .delete()
    .eq("id", bookingId);

  if (error) {
    throw new Error(`Supabase booking delete failed: ${error.message}`);
  }
}

async function duplicateBookingInSupabase(booking) {
  const draftBooking = {
    ...booking,
    id: crypto.randomUUID ? crypto.randomUUID() : "",
  };
  return saveBookingToSupabase(draftBooking);
}

async function loadBookingsFromSupabase(days) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Supabase booking load failed: ${error.message}`);
  }

  const bookingsByDay = rowsToBookingsByDay(data ?? [], days);
  return days.map((day) => ({
    ...day,
    bookings: (bookingsByDay[day.id] ?? []).map(storageBookingToEngineBooking).filter(Boolean),
  }));
}

async function loadPublicAvailabilityFromSupabase(days) {
  const supabase = await getSupabaseClient();
  const sortedDays = [...days].sort((first, second) => first.dateValue.localeCompare(second.dateValue));
  const { data, error } = await supabase.rpc("get_public_booking_blocks", {
    end_date: sortedDays[sortedDays.length - 1]?.dateValue,
    start_date: sortedDays[0]?.dateValue,
  });

  if (error) {
    throw new Error(`Supabase availability load failed: ${error.message}`);
  }

  const bookingsByDay = publicBlocksToBookingsByDay(data ?? [], days);
  return days.map((day) => ({
    ...day,
    bookings: (bookingsByDay[day.id] ?? []).map(storageBookingToEngineBooking).filter(Boolean),
  }));
}

async function createBookingHoldInSupabase({ dateValue, slot }) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc("create_booking_hold", {
    hold_buffer_minutes: slot.travelBuffer ?? DEFAULT_TRAVEL_BUFFER,
    hold_date: dateValue,
    hold_duration_minutes: slot.duration,
    hold_start_minutes: slot.start,
  });

  if (error) {
    throw new Error(`Could not hold this time: ${error.message}`);
  }

  const hold = Array.isArray(data) ? data[0] : data;
  if (!hold?.hold_id || !hold?.hold_token) {
    throw new Error("Could not hold this time. Please choose another slot.");
  }

  return {
    expiresAt: hold.expires_at,
    id: hold.hold_id,
    token: hold.hold_token,
  };
}

async function releaseBookingHoldInSupabase(hold) {
  if (hold?.previewOnly) return;
  if (!hold?.id || !hold?.token) return;

  const supabase = await getSupabaseClient();
  const { error } = await supabase.rpc("release_booking_hold", {
    release_hold_id: hold.id,
    release_hold_token: hold.token,
  });

  if (error) {
    console.warn("Could not release booking hold.", error);
  }
}

function normalizeStoredWaitlistEntry(entry) {
  if (!entry || typeof entry !== "object") return null;

  const preferenceType = entry.preferenceType ?? entry.type;
  if (!entry.id || !entry.clientName || !entry.preferredDate) return null;
  if (preferenceType !== "exact" && preferenceType !== "window") return null;
  if (!isFiniteNumber(entry.duration) || !entry.status) return null;

  return {
    ...entry,
    id: String(entry.id),
    clientName: String(entry.clientName),
    preferredDate: String(entry.preferredDate),
    preferenceType,
    duration: Number(entry.duration),
    flexibility: isFiniteNumber(entry.flexibility) ? Number(entry.flexibility) : 0,
    status: String(entry.status),
  };
}

function sanitizeStoredWaitlistEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(normalizeStoredWaitlistEntry).filter(Boolean);
}

function normalizeEnhancement(item) {
  if (!item || typeof item !== "object") return null;
  const name = String(item.name ?? "").trim();
  if (!name) return null;

  return {
    active: item.active !== false,
    description: String(item.description ?? "").trim(),
    durationMinutes: Math.max(0, Math.round(Number(item.durationMinutes) || 0)),
    id: String(item.id || `enhancement-${Date.now()}`),
    name,
    price: Math.max(0, Number(item.price) || 0),
  };
}

function sanitizeStoredEnhancements(items) {
  if (!Array.isArray(items)) return DEFAULT_ENHANCEMENTS;
  const normalized = items.map(normalizeEnhancement).filter(Boolean);
  return normalized.length ? normalized : DEFAULT_ENHANCEMENTS;
}

function normalizePostcodeAreaList(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(
      value
        .map((item) => String(item ?? "").toUpperCase().replace(/\s+/g, ""))
        .filter((item) => /^[A-Z]{1,2}\d[A-Z\d]?$/.test(item))
    ));
  }

  return normalizePostcodeAreaList(String(value ?? "").split(/[\s,;]+/));
}

function sanitizeCoverageZones(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const usual = normalizePostcodeAreaList(source.usual);
  const preapproval = normalizePostcodeAreaList(source.preapproval);

  return {
    preapproval: preapproval.length ? preapproval : DEFAULT_COVERAGE_ZONES.preapproval,
    usual: usual.length ? usual : DEFAULT_COVERAGE_ZONES.usual,
  };
}

function getPostcodeArea(postcode) {
  const compact = String(postcode ?? "").toUpperCase().replace(/\s+/g, "");
  const match = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)/);
  return match ? match[1] : "";
}

function getPostcodeCoverage(postcode, coverageZones = DEFAULT_COVERAGE_ZONES) {
  const area = getPostcodeArea(postcode);
  const usualAreas = new Set(normalizePostcodeAreaList(coverageZones.usual));
  const preApprovalAreas = new Set(normalizePostcodeAreaList(coverageZones.preapproval));

  if (!area) return { area, status: "missing", message: "Enter your treatment postcode to continue." };
  if (usualAreas.has(area)) return { area, status: "usual", message: "This postcode is in the usual working area." };
  if (preApprovalAreas.has(area)) {
    return {
      area,
      status: "preapproval",
      message: "This postcode is in the wider area and needs pre-approval before booking.",
    };
  }
  return {
    area,
    status: "outside",
    message: "This postcode is outside the current mobile massage coverage area.",
  };
}

function dateValueFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekdayLabelFromDate(date) {
  return WEEK_DAYS[(date.getDay() + 6) % 7];
}

function dateValueForOffset(offset) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return dateValueFromDate(date);
}

function addDaysToDateValue(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValueForOffset(days);
  date.setDate(date.getDate() + days);
  return dateValueFromDate(date);
}

function monthValueForDate(dateValue) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue.slice(0, 7) : todayValue().slice(0, 7);
}

function todayValue() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return dateValueFromDate(date);
}

function isPastDate(dateValue) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateValue) && dateValue < todayValue();
}

function displayDayName(days, dateValue) {
  const day = days.find((item) => item.dateValue === dateValue || item.label === dateValue);
  return day ? `${day.label} (${day.dateValue})` : dateValue;
}

function buildInitialDays() {
  const storedBookings = sanitizeStoredBookingsByDay(readStoredJson(BOOKINGS_STORAGE_KEY, {}));

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);
    const dateValue = dateValueFromDate(date);
    const label = weekdayLabelFromDate(date);
    const storedDayBookings = storedBookings[dateValue] ?? storedBookings[label.toLowerCase()] ?? [];

    return {
      id: `${label.toLowerCase()}-${dateValue}`,
      label,
      dateValue,
      settings: {
        ...cloneValue(DEFAULT_DAY_SETTINGS),
        dateLabel: label,
        anchorReleaseEnabled: false,
        workingStart: label === "Sun" ? "10:00" : DEFAULT_DAY_SETTINGS.workingStart,
        workingEnd: label === "Sat" || label === "Sun" ? "16:00" : DEFAULT_DAY_SETTINGS.workingEnd,
      },
      bookings: Array.isArray(storedDayBookings)
        ? storedDayBookings.map(storageBookingToEngineBooking).filter(Boolean)
        : index === 0 ? cloneValue(SAMPLE_BOOKINGS) : [],
    };
  });
}

function buildDaysStarting(startDateValue, existingDays = []) {
  const storedBookings = sanitizeStoredBookingsByDay(readStoredJson(BOOKINGS_STORAGE_KEY, {}));
  const baseDate = new Date(`${startDateValue}T00:00:00`);
  if (Number.isNaN(baseDate.getTime())) return buildInitialDays();

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + index);
    const dateValue = dateValueFromDate(date);
    const dayLabel = weekdayLabelFromDate(date);
    const existingDay = existingDays.find((day) => day.dateValue === dateValue);
    const storedDayBookings = storedBookings[dateValue] ?? storedBookings[dayLabel.toLowerCase()] ?? [];

    return {
      id: `${dayLabel.toLowerCase()}-${dateValue}`,
      label: dayLabel,
      dateValue,
      settings: existingDay?.settings
        ? cloneValue(existingDay.settings)
        : {
            ...cloneValue(DEFAULT_DAY_SETTINGS),
            dateLabel: dayLabel,
            anchorReleaseEnabled: false,
            workingStart: dayLabel === "Sun" ? "10:00" : DEFAULT_DAY_SETTINGS.workingStart,
            workingEnd: dayLabel === "Sat" || dayLabel === "Sun" ? "16:00" : DEFAULT_DAY_SETTINGS.workingEnd,
          },
      bookings: existingDay?.bookings
        ? cloneValue(existingDay.bookings)
        : storedDayBookings.map(storageBookingToEngineBooking).filter(Boolean),
    };
  });
}

function emptyInitialDays() {
  return buildInitialDays().map((day) => ({ ...day, bookings: [] }));
}

function formatRange(start, end) {
  return `${minutesToTime(start)} - ${minutesToTime(end)}`;
}

function formatClock(totalMinutes) {
  const safeMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

function serviceNameFor(services, serviceId) {
  if (serviceId === "personal-event") return "Personal event";
  return services.find((service) => service.id === serviceId)?.name ?? "Custom service";
}

function isPersonalEvent(booking) {
  return booking?.kind === "personal" || booking?.serviceId === "personal-event";
}

function serviceAbbreviation(name) {
  const known = {
    "Cloud Nine Head Massage": "CNH",
    "Deep Tissue Recovery": "DTR",
    "Personal event": "PE",
    "Performance Sports Massage": "PSM",
    "Prenatal Wellness": "PW",
    "The Zero-Gravity Melt": "ZGM",
  };

  if (known[name]) return known[name];

  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function slotPositionLabel(slot) {
  if (slot.label === "next slot before flow") return "before flow";
  if (slot.label === "next slot after flow") return "after flow";
  if (slot.label === "fixed first booking") return "fixed anchor";
  if (slot.label === "first booking option") return "first booking";
  return "available slot";
}

function getSlotConnection(slot, flow) {
  if (!flow.hasBookings) return "first booking in the current flow";
  if (slot.label === "next slot before flow") return `connects into flow start at ${minutesToTime(flow.flowStart)}`;
  if (slot.label === "next slot after flow") return `continues from flow end at ${minutesToTime(flow.flowEnd)}`;
  return "does not attach to a current flow edge";
}

function getTravelRange(slot) {
  if (slot.travelBuffer <= 0) return "No travel buffer";
  return formatRange(slot.end, slot.bufferEnd);
}

function buildLinkedRequestId({ serviceId, dayLabel, duration }) {
  return [serviceId, dayLabel, duration].join("|");
}

function parseWindowPart(value) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
}

function parsePreferredWindow(preferredWindow) {
  const normalized = preferredWindow.replace(/\s+/g, "");
  const [startPart, endPart] = normalized.split("-");
  const start = parseWindowPart(startPart);
  const end = endPart ? parseWindowPart(endPart) : start;

  if (start === null || end === null) return null;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function slotMatchesWaitlistRequest(slot, entry) {
  if (slot.duration !== entry.duration) return false;

  const preferredWindow = parsePreferredWindow(entry.preferredWindow);
  if (!preferredWindow) return false;

  const flexibility = Number(entry.flexibility) || 0;
  if (entry.preferenceType === "exact") {
    return Math.abs(slot.start - preferredWindow.start) <= flexibility;
  }

  return slot.start >= preferredWindow.start - flexibility && slot.start <= preferredWindow.end + flexibility;
}

function getEffectiveWaitlistStatus(entry) {
  if (isPastDate(entry.preferredDate) && (entry.status === "joined" || entry.status === "offered")) {
    return "closed";
  }

  return entry.status;
}

function waitlistEntryKey(entry) {
  return [
    entry.linkedRequestId,
    entry.clientName.trim().toLowerCase(),
    entry.preferredDate,
    entry.preferenceType,
    entry.preferredWindow.trim().toLowerCase(),
    entry.duration,
    entry.flexibility || 0,
  ].join("|");
}

function getSlotRejectionReason(slot, settings, bookings) {
  if (!isValidDuration(slot.duration)) return "invalid duration";

  const workingStart = timeToMinutes(settings.workingStart);
  const workingEnd = timeToMinutes(settings.workingEnd);
  if (slot.start < workingStart || slot.bufferEnd > workingEnd) return "outside working hours";

  const overlappingBooking = getBookingBlocks(bookings).find((booking) =>
    rangesOverlap(slot.start, slot.bufferEnd, booking.start, booking.bufferEnd)
  );

  if (overlappingBooking) return `overlaps booking at ${formatRange(overlappingBooking.start, overlappingBooking.bufferEnd)}`;

  return "";
}

function buildDebugSlots({ settings, bookings, requestedDuration, requestedTravelBuffer }) {
  const duration = Number(requestedDuration);
  const travelBuffer = Math.max(0, Number(requestedTravelBuffer));
  const flow = getFlow(bookings);
  const candidateSlots = [];

  if (!isValidDuration(duration)) {
    return [
      {
        label: "requested booking",
        start: timeToMinutes(settings.workingStart),
        end: timeToMinutes(settings.workingStart) + duration,
        bufferEnd: timeToMinutes(settings.workingStart) + duration + travelBuffer,
        duration,
        travelBuffer,
        rejectedReason: "invalid duration",
      },
    ];
  }

  if (settings.mode === "optimized" && flow.hasBookings) {
    candidateSlots.push(
      {
        label: "next slot before flow",
        start: flow.flowStart - (duration + travelBuffer),
      },
      {
        label: "next slot after flow",
        start: flow.flowEnd,
      }
    );
  } else if (settings.mode === "optimized" && settings.startMode === "fixed") {
    candidateSlots.push({
      label: "fixed first booking",
      start: timeToMinutes(settings.fixedStart),
    });
  } else {
    const workingStart = timeToMinutes(settings.workingStart);
    const workingEnd = timeToMinutes(settings.workingEnd);
    for (let start = workingStart; start + duration + travelBuffer <= workingEnd; start += SLOT_INCREMENT) {
      candidateSlots.push({
        label: settings.mode === "optimized" ? "first booking option" : "available slot",
        start,
      });
    }
  }

  return candidateSlots
    .map((candidate) => {
      const slot = {
        ...candidate,
        end: candidate.start + duration,
        bufferEnd: candidate.start + duration + travelBuffer,
        duration,
        travelBuffer,
      };

      return {
        ...slot,
        rejectedReason: getSlotRejectionReason(slot, settings, bookings),
      };
    })
    .filter((slot) => slot.rejectedReason);
}

function ClientBookingInterface({
  days,
  coverageZones,
  serviceAreas,
  services,
  serviceDetails,
  enhancements,
  waitlistEntries,
  clientDayIndex,
  setClientDayIndex,
  clientServiceId,
  setClientServiceId,
  clientDuration,
  setClientDuration,
  clientSelectedSlot,
  setClientSelectedSlot,
  clientBookingMessage,
  setClientBookingMessage,
  clientIsConfirming,
  resetClientConfirmGuard,
  onConfirmBooking,
  waitlistForm,
  setWaitlistForm,
  waitlistFormOpen,
  setWaitlistFormOpen,
  onJoinWaitlist,
  onAcceptOffer,
  onCancelWaitlist,
  onChangeClientWeek,
  clientSession,
  clientProfile,
  clientBookingContext,
  clientBookingContextLoading,
  clientAuthLoading,
  clientAuthError,
  onGoogleLogin,
  onClientSignOut,
  isMobilePreviewFrame = false,
  onSwitchAdmin,
}) {
  const [clientStep, setClientStep] = useState("location");
  const [mobileProgressOpen, setMobileProgressOpen] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [areaSelectionMessage, setAreaSelectionMessage] = useState("");
  const [checkoutAppointments, setCheckoutAppointments] = useState([]);
  const [checkoutError, setCheckoutError] = useState("");
  const [confirmedAppointments, setConfirmedAppointments] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [bookingReference, setBookingReference] = useState("");
  const [paymentHoldExpiresAt, setPaymentHoldExpiresAt] = useState(null);
  const [alternativeModalOpen, setAlternativeModalOpen] = useState(false);
  useEffect(() => {
    if (clientStep === "checkout" && !bookingReference) {
      const ref = `VB-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0,14)}`;
      setBookingReference(ref);
      setPaymentHoldExpiresAt(new Date(Date.now() + 60 * 60 * 1000).toISOString());
    }
  }, [clientStep, bookingReference]);
  const holdMinutesLeft = paymentHoldExpiresAt ? Math.max(0, Math.ceil((new Date(paymentHoldExpiresAt).getTime() - Date.now()) / 60000)) : 0;
  const [selectedEnhancements, setSelectedEnhancements] = useState([]);
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [contactAccepted, setContactAccepted] = useState(false);
  const [activeBookingHold, setActiveBookingHold] = useState(null);
  const [holdIsCreating, setHoldIsCreating] = useState(false);
  const [contactDetails, setContactDetails] = useState({
    address: "",
    email: "",
    firstName: "",
    lastName: "",
    notes: "",
    phone: "",
    telegramUpdates: false,
  });
  const [serviceDurations, setServiceDurations] = useState({});
  const visibleServices = services.filter((service) => service.visible);
  const [fullDescriptionServiceId, setFullDescriptionServiceId] = useState(null);
  const areaPickerRef = useRef(null);
  const activeBookingHoldRef = useRef(null);
  const checkoutAppointmentsRef = useRef([]);

  useEffect(() => {
    setSelectedEnhancements((current) =>
      current.filter((id) => enhancements.some((item) => item.id === id && item.active !== false))
    );
  }, [enhancements]);

  useEffect(() => {
    if (selectedAreaId && !serviceAreas.some((area) => area.id === selectedAreaId && area.active !== false)) {
      setSelectedAreaId("");
    }
  }, [selectedAreaId, serviceAreas]);

  useEffect(() => {
    if (!clientSession?.user) return;

    const fullName = clientProfile?.fullName
      || clientSession.user.user_metadata?.full_name
      || clientSession.user.user_metadata?.name
      || "";
    const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts.shift() || "";
    const lastName = nameParts.join(" ");

    setContactDetails((current) => ({
      ...current,
      email: current.email || clientProfile?.email || clientSession.user.email || "",
      firstName: current.firstName || firstName,
      lastName: current.lastName || lastName,
      phone: current.phone || clientProfile?.phone || "",
    }));
  }, [clientProfile, clientSession]);

  useEffect(() => {
    checkoutAppointmentsRef.current = checkoutAppointments;
  }, [checkoutAppointments]);

  const selectedDay = days[clientDayIndex];
  const selectedServiceId = visibleServices.some((service) => service.id === clientServiceId)
    ? clientServiceId
    : "";
  const selectedServiceName = selectedServiceId ? serviceNameFor(services, selectedServiceId) : "Select a service";
  const clientWaitlistEntries = waitlistEntries.filter((entry) => getEffectiveWaitlistStatus(entry) === "joined" || getEffectiveWaitlistStatus(entry) === "offered");
  const offeredEntries = clientWaitlistEntries.filter((entry) => getEffectiveWaitlistStatus(entry) === "offered");
  const currentWeekStart = days[0]?.dateValue ?? todayValue();
  const currentMonthValue = monthValueForDate(currentWeekStart);
  const bookingSteps = [
    ["location", "Area"],
    ["treatment", "Treatment"],
    ["time", "Availability"],
    ["enhance", "Preferences"],
    ["details", "Details"],
    ["payment", "Confirm"],
  ];
  const currentStepIndex = Math.max(0, bookingSteps.findIndex(([id]) => id === clientStep));
  const currentStepLabel = bookingSteps[currentStepIndex]?.[1] ?? "Area";
  const treatmentOptions = (visibleServices.length > 0 ? visibleServices : services).map((service) => ({
    ...service,
    ...(serviceDetails[service.id] ?? {}),
  }));
  const fullDescriptionService = treatmentOptions.find((service) => service.id === fullDescriptionServiceId);
  const durationAdjustments = [30, 60, 90, 120];
  const basketItems = treatmentOptions
    .map((service) => ({
      ...service,
      minutes: Number(serviceDurations[service.id]) || 0,
    }))
    .filter((service) => service.minutes > 0);
  const orderTotalMinutes = basketItems.reduce((total, service) => total + service.minutes, 0);
  const orderDurationIsValid = isValidDuration(orderTotalMinutes);
  const chosenDayLabel = `${selectedDay.label}, ${selectedDay.dateValue}`;
  const selectedSlotLabel = clientSelectedSlot
    ? `${minutesToTime(clientSelectedSlot.start)} - ${minutesToTime(clientSelectedSlot.end)}`
    : "Choose a time";
  const basketTitle = basketItems.length === 0
    ? "Your booking"
    : basketItems.length === 1
      ? basketItems[0].name
      : `${basketItems.length} services booked`;
  const primaryServiceId = basketItems[0]?.id ?? selectedServiceId;
  const basePrice = orderTotalMinutes > 0 ? Math.round(orderTotalMinutes * 1.1 + 35) : 0;
  const activeEnhancements = enhancements.filter((item) => item.active !== false);
  const activeServiceAreas = serviceAreas.filter((area) => area.active !== false);
  const selectedArea = activeServiceAreas.find((area) => area.id === selectedAreaId) ?? null;
  const selectedEnhancementItems = activeEnhancements.filter((item) => selectedEnhancements.includes(item.id));
  const selectedEnhancementTotal = activeEnhancements
    .filter((item) => selectedEnhancements.includes(item.id))
    .reduce((total, item) => total + item.price, 0);
  const selectedEnhancementMinutes = selectedEnhancementItems.reduce((total, item) => total + (Number(item.durationMinutes) || 0), 0);
  const bookingDurationMinutes = orderTotalMinutes + selectedEnhancementMinutes;
  const bookingTotal = basePrice + selectedEnhancementTotal;
  const checkoutTotal = checkoutAppointments.reduce((total, item) => total + item.total, 0);
  const selectedDayBasketBookings = checkoutAppointments.filter((appointment) => appointment.dateValue === selectedDay.dateValue);
  const clientPreview = getBasketAwareSchedulingPreview({
    appointments: checkoutAppointments,
    bookings: selectedDay.bookings,
    dateValue: selectedDay.dateValue,
    requestedDuration: bookingDurationMinutes,
    requestedTravelBuffer: DEFAULT_TRAVEL_BUFFER,
    settings: selectedDay.settings,
  });
  const showFixedStartHint =
    selectedDay.settings.mode === "optimized" &&
    selectedDay.settings.startMode === "fixed" &&
    selectedDay.bookings.length === 0 &&
    selectedDayBasketBookings.length === 0 &&
    clientPreview.slots.length === 1;
  const contactFirstName = contactDetails.firstName.trim();
  const contactLastName = contactDetails.lastName.trim();
  const contactEmail = contactDetails.email.trim();
  const contactPhone = contactDetails.phone.trim();
  const contactAddress = contactDetails.address.trim();
  const normalizedContactPhone = contactPhone.replace(/[\s().-]/g, "");
  const phoneIsValid = /^\+?\d{10,15}$/.test(normalizedContactPhone);
  const contactContinueReason = !contactFirstName
    ? "Enter your first name to continue."
    : !contactLastName
      ? "Enter your last name to continue."
      : !contactEmail
    ? "Enter your email address to continue."
    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)
      ? "Enter a valid email address, for example name@example.com."
      : !contactPhone
        ? "Enter your phone number to continue."
        : !phoneIsValid
          ? "Enter a valid phone number with 10 to 15 digits."
          : !contactAddress
            ? "Enter your address to continue."
            : !termsAccepted
              ? "Tick the terms and conditions box to continue."
              : !contactAccepted
                ? "Tick the details confirmation box to continue."
                : "";
  const contactCanContinue = !contactContinueReason;
  const treatmentContinueReason = orderDurationIsValid
    ? ""
    : "Choose at least 30 minutes of treatment time to continue.";
  const timeContinueReason = clientSelectedSlot
    ? ""
    : "Choose an available appointment time to continue.";

  useEffect(() => {
    if (bookingDurationMinutes !== clientDuration) {
      setClientDuration(bookingDurationMinutes);
    }
  }, [bookingDurationMinutes, clientDuration, setClientDuration]);

  useEffect(() => {
    activeBookingHoldRef.current = activeBookingHold;
  }, [activeBookingHold]);

  useEffect(() => {
    return () => {
      if (activeBookingHoldRef.current) {
        releaseBookingHoldInSupabase(activeBookingHoldRef.current);
      }
      checkoutAppointmentsRef.current.forEach((appointment) => {
        if (appointment.hold) releaseBookingHoldInSupabase(appointment.hold);
      });
    };
  }, []);

  function clearActiveBookingHold() {
    setActiveBookingHold((current) => {
      if (current) {
        releaseBookingHoldInSupabase(current);
      }
      return null;
    });
  }

  function releaseCheckoutHolds(appointments = checkoutAppointments) {
    appointments.forEach((appointment) => {
      if (appointment.hold) releaseBookingHoldInSupabase(appointment.hold);
    });
  }

  function buildCurrentAppointmentDraft() {
    if (!selectedArea) return { error: "Choose your appointment area to continue." };
    if (!orderDurationIsValid || basketItems.length === 0) return { error: treatmentContinueReason || "Choose a treatment duration." };
    if (!clientSelectedSlot) return { error: timeContinueReason || "Choose an available appointment time." };

    const appointmentId = crypto.randomUUID ? crypto.randomUUID() : `basket-${Date.now()}`;
    const draftKey = [
      selectedArea.id,
      selectedDay.dateValue,
      clientSelectedSlot.start,
      clientSelectedSlot.bufferEnd,
      basketItems.map((item) => `${item.id}:${item.minutes}`).join("|"),
      selectedEnhancementItems.map((item) => item.id).join("|"),
    ].join("::");

    return {
      appointment: {
        congestionFee: 0,
        dateLabel: chosenDayLabel,
        dateValue: selectedDay.dateValue,
        dayIndex: clientDayIndex,
        draftKey,
        duration: bookingDurationMinutes,
        end: clientSelectedSlot.end,
        hold: activeBookingHold,
        id: appointmentId,
        items: [
          ...basketItems.map((item) => ({ id: item.id, minutes: item.minutes, name: item.name, price: item.price ?? 0 })),
          ...selectedEnhancementItems.map((item) => ({ id: item.id, minutes: Number(item.durationMinutes) || 0, name: item.name, price: item.price })),
        ],
        price: bookingTotal,
        selectedAreaId: selectedArea.id,
        selectedAreaName: selectedArea.name,
        serviceId: primaryServiceId,
        serviceName: basketItems.map((item) => item.name).join(" + "),
        start: clientSelectedSlot.start,
        slot: clientSelectedSlot,
        total: bookingTotal,
        travelBuffer: DEFAULT_TRAVEL_BUFFER,
        travelFee: 0,
      },
    };
  }

  function addCurrentAppointmentToBasket() {
    const draft = buildCurrentAppointmentDraft();
    if (draft.error) {
      setCheckoutError(draft.error);
      setClientBookingMessage(draft.error);
      return null;
    }

    const existing = checkoutAppointments.find((appointment) => appointment.draftKey === draft.appointment.draftKey);
    if (existing) {
      return existing;
    }

    setCheckoutAppointments((current) => [...current, draft.appointment]);
    setActiveBookingHold(null);
    setCheckoutError("");
    setClientBookingMessage("");
    return draft.appointment;
  }

  function resetCurrentAppointmentDraft() {
    setClientServiceId("");
    setServiceDurations({});
    setSelectedEnhancements([]);
    setClientSelectedSlot(null);
    setCheckoutError("");
    resetClientConfirmGuard();
  }

  function addAnotherAppointment() {
    const appointment = addCurrentAppointmentToBasket();
    if (!appointment) return;
    resetCurrentAppointmentDraft();
    setClientStep("treatment");
  }

  function continueToCheckoutDetails() {
    const appointment = addCurrentAppointmentToBasket();
    if (!appointment) return;
    setClientStep("details");
  }

  function removeCheckoutAppointment(appointmentId) {
    setCheckoutAppointments((current) => {
      const removed = current.find((appointment) => appointment.id === appointmentId);
      if (removed?.hold) releaseBookingHoldInSupabase(removed.hold);
      return current.filter((appointment) => appointment.id !== appointmentId);
    });
    setCheckoutError("");
    setClientBookingMessage("");
  }

  function editCheckoutAppointment(appointmentId) {
    const appointment = checkoutAppointments.find((item) => item.id === appointmentId);
    if (!appointment) return;

    removeCheckoutAppointment(appointmentId);
    setSelectedAreaId(appointment.selectedAreaId);
    setClientServiceId(appointment.serviceId);
    setServiceDurations(
      appointment.items
        .filter((item) => item.id && Number(item.minutes) > 0 && services.some((service) => service.id === item.id))
        .reduce((durations, item) => ({ ...durations, [item.id]: item.minutes }), {})
    );
    setSelectedEnhancements(
      appointment.items
        .filter((item) => enhancements.some((enhancement) => enhancement.id === item.id))
        .map((item) => item.id)
    );
    const dayIndex = days.findIndex((day) => day.dateValue === appointment.dateValue);
    if (dayIndex >= 0) setClientDayIndex(dayIndex);
    setClientSelectedSlot(null);
    setClientStep("time");
  }

  function updateSelectedArea(areaId) {
    setSelectedAreaId(areaId);
    setAreaSelectionMessage("");
    setClientBookingMessage("");
  }

  function goToTreatment() {
    if (!selectedArea) {
      const message = "Choose your appointment area to continue.";
      setAreaSelectionMessage(message);
      setClientBookingMessage(message);
      goToAreaStep();
      return;
    }

    setAreaSelectionMessage("");
    setClientBookingMessage("");
    setClientStep("treatment");
  }

  function updateService(serviceId) {
    setClientServiceId(serviceId);
    setClientBookingMessage("");
    resetClientConfirmGuard();
  }

  function selectDescriptionService(serviceId) {
    updateService(serviceId);
    setFullDescriptionServiceId(null);
  }

  function adjustServiceDuration(serviceId, delta) {
    clearActiveBookingHold();
    setServiceDurations((current) => {
      const currentMinutes = Number(current[serviceId]) || 0;
      const currentTotal = Object.values(current).reduce((total, value) => total + (Number(value) || 0), 0);
      if (delta > 0 && currentTotal + delta > 240) return current;

      const nextMinutes = Math.max(0, currentMinutes + delta);
      const next = { ...current };

      if (nextMinutes === 0) {
        delete next[serviceId];
      } else {
        next[serviceId] = nextMinutes;
      }

      return next;
    });
    setClientSelectedSlot(null);
    setClientBookingMessage("");
    resetClientConfirmGuard();
  }

  function removeServiceDuration(serviceId) {
    clearActiveBookingHold();
    setServiceDurations((current) => {
      const next = { ...current };
      delete next[serviceId];
      return next;
    });
    setClientSelectedSlot(null);
    setClientBookingMessage("");
    resetClientConfirmGuard();
  }

  function updateDay(index) {
    clearActiveBookingHold();
    setClientDayIndex(index);
    setClientSelectedSlot(null);
    setClientBookingMessage("");
    resetClientConfirmGuard();
  }

  function changeVisibleWeek(startDateValue, preferredIndex = 0) {
    clearActiveBookingHold();
    setClientSelectedSlot(null);
    setClientBookingMessage("");
    setWaitlistFormOpen(false);
    resetClientConfirmGuard();
    onChangeClientWeek(startDateValue, preferredIndex);
  }

  function goToAreaStep() {
    setClientStep("location");
    window.setTimeout(() => {
      areaPickerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  function openWaitlistPanel() {
    setWaitlistForm((current) => ({
      ...current,
      duration: bookingDurationMinutes,
      preferredDate: selectedDay.dateValue,
      preferenceType: "exact",
    }));
    setWaitlistFormOpen((current) => !current);
  }

  function toggleEnhancement(id) {
    const enhancement = activeEnhancements.find((item) => item.id === id);
    const changesDuration = Number(enhancement?.durationMinutes) > 0;
    if (changesDuration && clientSelectedSlot) {
      clearActiveBookingHold();
      setClientSelectedSlot(null);
      setClientBookingMessage("This enhancement changes the treatment length. Please choose a time again.");
    }
    setSelectedEnhancements((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  async function selectTimeSlot(slot) {
    setHoldIsCreating(true);
    setClientBookingMessage("");
    resetClientConfirmGuard();

    try {
      if (activeBookingHold) {
        await releaseBookingHoldInSupabase(activeBookingHold);
      }

      if (isMobilePreviewFrame) {
        setActiveBookingHold({
          bufferEnd: slot.bufferEnd,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          id: "mobile-preview-hold",
          previewOnly: true,
          start: slot.start,
          token: "mobile-preview-hold",
        });
        setClientSelectedSlot(slot);
        setClientBookingMessage("Preview mode: this time is selected, but not held in the live booking system.");
        return;
      }

      const hold = await createBookingHoldInSupabase({
        dateValue: selectedDay.dateValue,
        slot,
      });
      setActiveBookingHold({
        ...hold,
        bufferEnd: slot.bufferEnd,
        start: slot.start,
      });
      setClientSelectedSlot(slot);
      setClientBookingMessage("This time is held for 10 minutes while you finish your booking.");
    } catch (error) {
      setClientSelectedSlot(null);
      setActiveBookingHold(null);
      const message = String(error.message || "");
      setClientBookingMessage(
        message.includes("Time slot is no longer available")
          ? "This time is already booked or temporarily held by another booking window. Holds expire after 10 minutes, so please choose another time or try again shortly."
          : message || "This time is no longer available. Please choose another."
      );
    } finally {
      setHoldIsCreating(false);
    }
  }

  function updateContactDetail(field, value) {
    if (field === "address") setSelectedSavedAddressId("");
    setContactDetails((current) => ({ ...current, [field]: value }));
  }

  function applyReturningClientSelection(selection) {
    if (!selection?.services?.length) return;

    clearActiveBookingHold();
    const treatmentDurations = {};
    const enhancementIds = [];

    selection.services.forEach((item) => {
      if (services.some((service) => service.id === item.id) && Number(item.durationMinutes) > 0) {
        treatmentDurations[item.id] = Number(item.durationMinutes);
      } else if (enhancements.some((enhancement) => enhancement.id === item.id)) {
        enhancementIds.push(item.id);
      }
    });

    const firstServiceId = Object.keys(treatmentDurations)[0] || "";
    const area = activeServiceAreas.find((item) =>
      item.id === selection.area
      || item.name.toLowerCase() === String(selection.area || "").toLowerCase()
    );

    if (!firstServiceId) {
      setClientBookingMessage("This previous treatment is no longer available. Please choose another treatment.");
      setClientStep("treatment");
      return;
    }
    if (!area) {
      setClientBookingMessage("Please choose an available appointment area before selecting a time.");
      setClientStep("location");
      return;
    }

    setSelectedAreaId(area.id);
    setClientServiceId(firstServiceId);
    setServiceDurations(treatmentDurations);
    setSelectedEnhancements(enhancementIds);
    setSelectedSavedAddressId(selection.savedAddressId || "");
    setContactDetails((current) => ({
      ...current,
      address: selection.address || current.address,
      notes: selection.notes || current.notes,
    }));
    setClientSelectedSlot(null);
    setAreaSelectionMessage("");
    setCheckoutError("");
    setClientBookingMessage("Your usual session is ready. Choose a date and time.");
    resetClientConfirmGuard();
    setClientStep("time");
  }

  async function confirmPayment() {
    if (checkoutAppointments.length === 0) {
      setCheckoutError("Add at least one appointment before checkout.");
      return;
    }

    setCheckoutError("");
    let confirmationViewOpened = false;

    try {
      const confirmed = await onConfirmBooking({
        customer: {
          email: contactDetails.email.trim(),
          name: `${contactDetails.firstName} ${contactDetails.lastName}`.trim(),
          phone: contactDetails.phone.trim(),
          telegramUpdates: contactDetails.telegramUpdates,
        },
        emailPayload: {
          appointments: checkoutAppointments.map((appointment) => ({
            date: appointment.dateLabel,
            durationMinutes: appointment.duration,
            items: appointment.items,
            location: appointment.selectedAreaName,
            manageUrl: `mailto:bookings@vadmassage.com?subject=${encodeURIComponent(`Manage booking ${appointment.dateValue} ${minutesToTime(appointment.start)}`)}`,
            price: appointment.total,
            serviceName: appointment.serviceName,
            time: `${minutesToTime(appointment.start)} - ${minutesToTime(appointment.end)}`,
          })),
          customer: {
            email: contactDetails.email.trim(),
            name: `${contactDetails.firstName} ${contactDetails.lastName}`.trim(),
            phone: contactDetails.phone.trim(),
            telegramUpdates: contactDetails.telegramUpdates,
          },
          address: contactDetails.address.trim(),
          notes: contactDetails.notes.trim(),
          date: checkoutAppointments[0]?.dateLabel ?? "",
          durationMinutes: checkoutAppointments.reduce((total, appointment) => total + appointment.duration, 0),
          items: checkoutAppointments.flatMap((appointment) => appointment.items),
          location: checkoutAppointments.map((appointment) => appointment.selectedAreaName).filter(Boolean).join(", "),
          time: checkoutAppointments.length === 1 ? `${minutesToTime(checkoutAppointments[0].start)} - ${minutesToTime(checkoutAppointments[0].end)}` : `${checkoutAppointments.length} appointments`,
          total: checkoutTotal,
        },
        appointments: checkoutAppointments,
        paymentMethod,
        bookingReference,
        paymentHoldExpiresAt,
        savedAddressId: selectedSavedAddressId,
      });

      if (confirmed) {
        logBookingConfirmation("redirect attempted");
        releaseCheckoutHolds(checkoutAppointments);
        setActiveBookingHold(null);
        setConfirmedAppointments(checkoutAppointments);
        setCheckoutAppointments([]);
        resetCurrentAppointmentDraft();
        setClientBookingMessage("");
        confirmationViewOpened = true;
      }
    } catch (error) {
      logBookingConfirmation("confirmation view failed", error);
      setCheckoutError(error?.message || "Your appointment could not be confirmed. Please try again.");
    } finally {
      if (!confirmationViewOpened) {
        resetClientConfirmGuard();
      }
    }
  }

  async function requestAlternativePayment() {
    setCheckoutError("");
    let confirmationViewOpened = false;

    try {
      const confirmed = await onConfirmBooking({
        customer: {
          email: contactDetails.email.trim(),
          name: `${contactDetails.firstName} ${contactDetails.lastName}`.trim(),
          phone: contactDetails.phone.trim(),
          telegramUpdates: contactDetails.telegramUpdates,
        },
        emailPayload: {
          appointments: checkoutAppointments.map((appointment) => ({
            date: appointment.dateLabel,
            durationMinutes: appointment.duration,
            items: appointment.items,
            location: appointment.selectedAreaName,
            manageUrl: `mailto:bookings@vadmassage.com?subject=${encodeURIComponent(`Manage booking ${appointment.dateValue} ${minutesToTime(appointment.start)}`)}`,
            price: appointment.total,
            serviceName: appointment.serviceName,
            time: `${minutesToTime(appointment.start)} - ${minutesToTime(appointment.end)}`,
          })),
          customer: {
            email: contactDetails.email.trim(),
            name: `${contactDetails.firstName} ${contactDetails.lastName}`.trim(),
            phone: contactDetails.phone.trim(),
            telegramUpdates: contactDetails.telegramUpdates,
          },
          address: contactDetails.address.trim(),
          notes: contactDetails.notes.trim(),
          date: checkoutAppointments[0]?.dateLabel ?? "",
          durationMinutes: checkoutAppointments.reduce((total, appointment) => total + appointment.duration, 0),
          items: checkoutAppointments.flatMap((appointment) => appointment.items),
          location: checkoutAppointments.map((appointment) => appointment.selectedAreaName).filter(Boolean).join(", "),
          time: checkoutAppointments.length === 1 ? `${minutesToTime(checkoutAppointments[0].start)} - ${minutesToTime(checkoutAppointments[0].end)}` : `${checkoutAppointments.length} appointments`,
          total: checkoutTotal,
        },
        appointments: checkoutAppointments,
        paymentMethod: "alternative_requested",
        savedAddressId: selectedSavedAddressId,
      });

      if (confirmed) {
        setAlternativeModalOpen(false);
        releaseCheckoutHolds(checkoutAppointments);
        setActiveBookingHold(null);
        setConfirmedAppointments(checkoutAppointments);
        setCheckoutAppointments([]);
        resetCurrentAppointmentDraft();
        setClientBookingMessage("");
        confirmationViewOpened = true;
      }
    } catch (error) {
      setCheckoutError(error?.message || "Your request could not be submitted. Please try again.");
    } finally {
      if (!confirmationViewOpened) {
        resetClientConfirmGuard();
      }
    }
  }

  function handleConfirmedAppointmentAction(action, appointment) {
    const appointmentLabel = `${appointment.serviceName} on ${appointment.dateLabel} at ${minutesToTime(appointment.start)}`;
    const actionCopy = {
      cancel: "To cancel this appointment, please use the management link from your confirmation email or contact me directly.",
      edit: "To edit this appointment, please use the management link from your confirmation email or contact me directly.",
      manage: "Your confirmation email includes the management details for this appointment.",
      reschedule: "To reschedule this appointment, please use the management link from your confirmation email or contact me directly.",
    };

    setClientBookingMessage(`${appointmentLabel}: ${actionCopy[action]}`);
  }

  const bookingSummaryProps = {
    basketItems,
    basketTitle,
    bookingDurationMinutes,
    bookingTotal,
    checkoutAppointments,
    checkoutTotal,
    chosenDayLabel,
    goToAreaStep,
    removeServiceDuration,
    selectedArea,
    selectedEnhancementItems,
    selectedSlotLabel,
  };

  return (
    <section className="booking-page">
      <BookingTopbar
        bookingSteps={bookingSteps}
        clientStep={clientStep}
        currentStepIndex={currentStepIndex}
        currentStepLabel={currentStepLabel}
        mobileProgressOpen={mobileProgressOpen}
        onProgressToggle={() => setMobileProgressOpen((open) => !open)}
        onSelectStep={(id) => {
          setClientStep(id);
          setMobileProgressOpen(false);
        }}
        onStart={() => setClientStep("location")}
        onSwitchAdmin={onSwitchAdmin}
      />

      {clientBookingMessage && <p className="booking-status"><span aria-hidden="true" className="booking-status-icon" />{clientBookingMessage}</p>}

      {clientStep === "location" && (
        <section className="booking-landing">
          <div className="booking-hero-panel">
            <div className="booking-hero-art booking-hero-art-left" aria-hidden="true">
              <span className="hero-pin" />
              <span className="hero-hill hero-hill-a" />
              <span className="hero-hill hero-hill-b" />
            </div>
            <div className="booking-hero-art booking-hero-art-right" aria-hidden="true">
              <span className="hero-house">
                <span className="hero-roof" />
                <span className="hero-door" />
                <span className="hero-window hero-window-a" />
                <span className="hero-window hero-window-b" />
              </span>
              <span className="hero-hill hero-hill-c" />
              <span className="hero-hill hero-hill-d" />
            </div>
            <span className="hero-dot hero-dot-a" aria-hidden="true" />
            <span className="hero-dot hero-dot-b" aria-hidden="true" />
            <p className="boutique-kicker">Private mobile massage by appointment</p>
            <h1>Reserve <span>your private treatment</span></h1>
            <p className="area-picker-subtitle">Choose the area for your one-to-one mobile massage session.</p>
            {clientSession?.user && (
              <BookAgainPanel
                clientName={clientProfile?.fullName || ""}
                favoriteSelection={clientBookingContext?.favoriteSelection || null}
                lastSelection={clientBookingContext?.lastSelection || null}
                loading={clientBookingContextLoading}
                onApply={applyReturningClientSelection}
                recentSelections={clientBookingContext?.recentBookingCombinations || []}
                usualSelection={clientBookingContext?.usualSelection || null}
              />
            )}
            <div className="client-area-picker" ref={areaPickerRef}>
              {activeServiceAreas.length > 0 ? (
                activeServiceAreas.map((area) => (
                  <button
                    type="button"
                    className={selectedAreaId === area.id ? "client-area-option selected-client-area" : "client-area-option"}
                    key={area.id}
                    onClick={() => updateSelectedArea(area.id)}
                  >
                    {area.name}
                  </button>
                ))
              ) : (
                <p className="client-area-empty">Online booking areas are being updated. Please contact me directly.</p>
              )}
            </div>
            <p className="client-area-helper">
              I personally cover selected parts of these areas. If your address sits just outside my usual route, I will contact you before confirming your appointment.
            </p>
            {areaSelectionMessage && (
              <p className="postcode-coverage-note postcode-coverage-outside">
                {areaSelectionMessage}
              </p>
            )}
            <div className="postcode-row area-continue-row">
              <button type="button" onClick={goToTreatment}>
                Reserve your session <span aria-hidden="true">-&gt;</span>
              </button>
            </div>
            <div className="account-actions">
              <ClientAccountPanel
                error={clientAuthError}
                loading={clientAuthLoading}
                onGoogleLogin={onGoogleLogin}
                onSignOut={onClientSignOut}
                profile={clientProfile}
                session={clientSession}
              />
            </div>
          </div>
          <section className="therapist-profile-section" aria-label="Your therapist">
            <div className="therapist-profile-image">
              <img src={massageTreatmentImage} alt="Private mobile massage treatment" />
            </div>
            <div className="therapist-profile-copy">
              <p className="boutique-kicker">Your therapist</p>
              <h2>Personal treatment with Vadim</h2>
              <p>
                A calm, one-to-one mobile massage experience shaped around your body, your recovery needs,
                and the way you want to feel after the session.
              </p>
              <div className="therapist-credentials" aria-label="Therapist experience and specialist areas">
                <span>
                  <strong>Experienced care</strong>
                  <small>Focused hands-on treatment for recovery, tension, and mobility.</small>
                </span>
                <span>
                  <strong>Specialist areas</strong>
                  <small>Deep tissue, sports recovery, pregnancy comfort, and restorative treatments.</small>
                </span>
                <span>
                  <strong>Professional practice</strong>
                  <small>Qualification and insurance details available before your appointment.</small>
                </span>
              </div>
            </div>
          </section>
          <div className="how-it-works">
            <article className="how-card-treatment">
              <span>01</span>
              <div className="how-card-illustration calendar-illustration" aria-hidden="true">
                <i className="illustration-shadow" />
                <i className="calendar-page" />
                <i className="calendar-rings" />
                <i className="calendar-check" />
                <i className="illustration-sparkle sparkle-a" />
                <i className="illustration-sparkle sparkle-b" />
              </div>
              <strong>Choose your treatment</strong>
              <small>Choose the treatment style and session length that feels right for you.</small>
            </article>
            <article className="how-card-time">
              <span>02</span>
              <div className="how-card-illustration clock-illustration" aria-hidden="true">
                <i className="illustration-shadow" />
                <i className="clock-leaf leaf-left" />
                <i className="clock-leaf leaf-right" />
                <i className="clock-face" />
                <i className="clock-hands" />
                <i className="illustration-sparkle sparkle-a" />
                <i className="illustration-sparkle sparkle-b" />
              </div>
              <strong>Select availability</strong>
              <small>Appointments available around existing travel and treatment time.</small>
            </article>
            <article className="how-card-home">
              <span>03</span>
              <div className="how-card-illustration lounge-illustration" aria-hidden="true">
                <i className="illustration-shadow" />
                <i className="floor-lamp" />
                <i className="lounge-chair" />
                <i className="lounge-cushion" />
                <i className="lounge-plant" />
                <i className="illustration-sparkle sparkle-a" />
                <i className="illustration-sparkle sparkle-b" />
              </div>
              <strong>Relax at home</strong>
              <small>Your therapist arrives prepared for a tailored mobile session.</small>
            </article>
          </div>
        </section>
      )}

      {clientStep === "treatment" && (
        <section className="booking-workspace">
          <div className="booking-main-panel">
            <h2>Choose your treatment</h2>
            <div className="treatment-layout">
              <div className="treatment-list">
                {treatmentOptions.map((service) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    selected={service.id === selectedServiceId}
                    selectedMinutes={Number(serviceDurations[service.id]) || 0}
                    onSelect={() => updateService(service.id)}
                    onFullDescription={() => setFullDescriptionServiceId(service.id)}
                  />
                ))}
              </div>
              <div className="duration-adjuster-list">
                {durationAdjustments.map((duration) => (
                  <div className="duration-adjuster-row" key={duration}>
                    <button
                      type="button"
                      className="duration-adjust-button"
                      aria-label={`Add ${duration} minutes to ${selectedServiceName}`}
                      onClick={() => adjustServiceDuration(selectedServiceId, duration)}
                      disabled={!selectedServiceId || orderTotalMinutes + duration > 240}
                    >
                      +
                    </button>
                    <div className={duration === 60 ? "duration-pill selected-duration-pill" : "duration-pill"}>
                      <strong>{duration}</strong>
                      <span>minutes</span>
                    </div>
                    <button
                      type="button"
                      className="duration-adjust-button"
                      aria-label={`Remove ${duration} minutes from ${selectedServiceName}`}
                      onClick={() => adjustServiceDuration(selectedServiceId, -duration)}
                      disabled={!selectedServiceId || (Number(serviceDurations[selectedServiceId]) || 0) <= 0}
                    >
                      -
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <p className="duration-builder-hint">
              Selected treatment: <strong>{selectedServiceName}</strong>. Build your preferred session length in calm 30-minute steps.
            </p>
            {!orderDurationIsValid && (
              <p className="client-alert">Choose at least 60 minutes total, up to 240 minutes.</p>
            )}
            <div className="booking-footer-actions">
              <button type="button" className="secondary-button" onClick={() => setClientStep("location")}>Back</button>
              <button type="button" disabled={!orderDurationIsValid} title={treatmentContinueReason} onClick={() => setClientStep("time")}>Next</button>
            </div>
            {treatmentContinueReason && <p className="booking-validation-message">{treatmentContinueReason}</p>}
          </div>
          <BookingSummary {...bookingSummaryProps} />
        </section>
      )}

      {clientStep === "time" && (
        <section className="booking-workspace">
          <div className="booking-main-panel">
            <h2>Select availability</h2>
            <div className="time-calendar-controls">
              <button type="button" onClick={() => changeVisibleWeek(addDaysToDateValue(currentWeekStart, -7), 0)}>
                <span>Previous</span>
                <strong>week</strong>
              </button>
              <button type="button" onClick={() => changeVisibleWeek(addDaysToDateValue(currentWeekStart, 7), 0)}>
                <span>Next</span>
                <strong>week</strong>
              </button>
              <label className="time-month-control">
                <span>Month</span>
                <input
                  aria-label="Choose month"
                  type="month"
                  value={currentMonthValue}
                  onChange={(event) => {
                    if (!event.target.value) return;
                    changeVisibleWeek(`${event.target.value}-01`, 0);
                  }}
                />
              </label>
            </div>
            <div className="booking-date-strip">
              {days.map((day, index) => (
                <button
                  key={day.id}
                  type="button"
                  className={index === clientDayIndex ? "date-card selected-date-card" : "date-card"}
                  onClick={() => updateDay(index)}
                >
                  <span>{day.label}</span>
                  <strong>{day.dateValue.slice(5)}</strong>
                </button>
              ))}
            </div>
            {showFixedStartHint && <p className="client-hint">This day starts at a fixed first appointment time.</p>}
            {clientPreview.slots.length > 0 ? (
              <div className="time-slot-grid">
                {clientPreview.slots.map((slot) => {
                  const selected = clientSelectedSlot?.start === slot.start && clientSelectedSlot?.bufferEnd === slot.bufferEnd;

                  return (
                    <button
                      key={`${slot.start}-${slot.bufferEnd}`}
                      type="button"
                      className={selected ? "time-slot-card selected-time-slot" : "time-slot-card"}
                      disabled={holdIsCreating}
                      onClick={() => selectTimeSlot(slot)}
                    >
                      <strong>{minutesToTime(slot.start)}</strong>
                      <span>{formatRange(slot.start, slot.end)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="no-slot-card">
                <p>No appointment availability is open for this treatment and day.</p>
              </div>
            )}
            <div className="time-waitlist-card">
              <div>
                <strong>Prefer another time?</strong>
                <span>Join the waiting list and I will contact you if a suitable appointment opens.</span>
              </div>
              <button type="button" className="outline-action" onClick={openWaitlistPanel}>
                {waitlistFormOpen ? "Hide waitlist" : "Join waiting list"}
              </button>
            </div>
            {waitlistFormOpen && (
              <form className="waitlist-form compact-waitlist-form" onSubmit={onJoinWaitlist}>
                <input
                  type="text"
                  required
                  placeholder="Name"
                  value={waitlistForm.clientName}
                  onChange={(event) => setWaitlistForm((current) => ({ ...current, clientName: event.target.value }))}
                />
                <input
                  type="text"
                  required
                  placeholder="Preferred time or window"
                  value={waitlistForm.preferredWindow}
                  onChange={(event) => setWaitlistForm((current) => ({ ...current, preferredWindow: event.target.value }))}
                />
                <button type="submit">Join</button>
              </form>
            )}
            <div className="booking-footer-actions">
              <button type="button" className="secondary-button" onClick={() => setClientStep("treatment")}>Back</button>
              <button type="button" className="secondary-button" disabled={!clientSelectedSlot || holdIsCreating} onClick={addAnotherAppointment}>Add another appointment</button>
              <button type="button" className="secondary-button" disabled={!clientSelectedSlot || holdIsCreating} onClick={() => setClientStep("enhance")}>Treatment preferences</button>
              <button type="button" disabled={!clientSelectedSlot || holdIsCreating} title={timeContinueReason} onClick={continueToCheckoutDetails}>Continue to checkout</button>
            </div>
            {timeContinueReason && <p className="booking-validation-message">{timeContinueReason}</p>}
            {checkoutError && <p className="booking-validation-message">{checkoutError}</p>}
            {holdIsCreating && <p className="booking-hold-message">Holding this time...</p>}
            {activeBookingHold && !holdIsCreating && (
              <p className="booking-hold-message">
                This time is held for 10 minutes while you finish your booking.
              </p>
            )}
          </div>
          <BookingSummary {...bookingSummaryProps} />
        </section>
      )}

      {clientStep === "enhance" && (
        <section className="booking-workspace">
          <div className="booking-main-panel">
            <h2>Treatment preferences</h2>
            <div className="enhancement-list">
              {activeEnhancements.map((item) => (
                <label className="enhancement-card" key={item.id}>
                  <input
                    type="checkbox"
                    checked={selectedEnhancements.includes(item.id)}
                    onChange={() => toggleEnhancement(item.id)}
                  />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.description}{Number(item.durationMinutes) > 0 ? ` Adds ${item.durationMinutes} minutes.` : ""}</small>
                  </span>
                  <b>{item.price === 0 ? "Free" : `\u00a3${item.price}`}</b>
                </label>
              ))}
            </div>
            <div className="booking-footer-actions">
              <button type="button" className="secondary-button" onClick={() => setClientStep("time")}>Back</button>
              <button type="button" className="secondary-button" disabled={!clientSelectedSlot || !orderDurationIsValid} onClick={addAnotherAppointment}>Add another appointment</button>
              <button type="button" disabled={!clientSelectedSlot || !orderDurationIsValid} onClick={continueToCheckoutDetails}>Continue to checkout</button>
            </div>
            {checkoutError && <p className="booking-validation-message">{checkoutError}</p>}
          </div>
          <BookingSummary {...bookingSummaryProps} />
        </section>
      )}

      {clientStep === "details" && (
        <section className="booking-workspace">
          <div className="booking-main-panel">
            <h2>Your details</h2>
            <div className="contact-form-grid">
              <label>First name<input type="text" placeholder="First name" value={contactDetails.firstName} onChange={(event) => updateContactDetail("firstName", event.target.value)} /></label>
              <label>Last name<input type="text" placeholder="Last name" value={contactDetails.lastName} onChange={(event) => updateContactDetail("lastName", event.target.value)} /></label>
              <label>Email<input type="email" placeholder="you@example.com" value={contactDetails.email} onChange={(event) => updateContactDetail("email", event.target.value)} /></label>
              <label>Phone<input type="tel" placeholder="07..." value={contactDetails.phone} onChange={(event) => updateContactDetail("phone", event.target.value)} /></label>
              <label className="wide-field">Address<input type="text" placeholder="Street and house number" value={contactDetails.address} onChange={(event) => updateContactDetail("address", event.target.value)} /></label>
              <label className="wide-field">Notes<input type="text" placeholder="Treatment preferences, pressure, injuries, or anything I should know" value={contactDetails.notes} onChange={(event) => updateContactDetail("notes", event.target.value)} /></label>
            </div>
            <label className="consent-row">
              <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
              <span>I read terms and conditions.</span>
            </label>
            <label className="consent-row">
              <input type="checkbox" checked={contactAccepted} onChange={(event) => setContactAccepted(event.target.checked)} />
              <span>I confirm these details are correct.</span>
            </label>
            <div className="booking-footer-actions">
              <button type="button" className="secondary-button" onClick={() => setClientStep("enhance")}>Back</button>
              <button
                type="button"
                className="secondary-button"
                disabled={checkoutAppointments.length === 0}
                onClick={() => {
                  resetCurrentAppointmentDraft();
                  setClientStep("treatment");
                }}
              >
                Add another appointment
              </button>
              <button type="button" disabled={!contactCanContinue || checkoutAppointments.length === 0} title={contactContinueReason} onClick={() => setClientStep("payment")}>Continue to checkout</button>
            </div>
            {contactContinueReason && <p className="booking-validation-message">{contactContinueReason}</p>}
            {checkoutAppointments.length === 0 && <p className="booking-validation-message">Add at least one appointment before checkout.</p>}
          </div>
          <BookingSummary {...bookingSummaryProps} />
        </section>
      )}

      {clientStep === "payment" && (
        <section className="booking-workspace">
          <div className="booking-main-panel">
            {confirmedAppointments.length > 0 ? (
              <>
                <h2>Your appointments are confirmed</h2>
                <div className="checkout-appointment-list">
                  {confirmedAppointments.map((appointment) => (
                    <article className="checkout-appointment-card confirmed-appointment-card" key={appointment.id}>
                      <span>{appointment.dateLabel}</span>
                      <strong>{appointment.serviceName}</strong>
                      <p>{minutesToTime(appointment.start)} - {minutesToTime(appointment.end)} / {appointment.duration} minutes / {appointment.selectedAreaName}</p>
                      <div className="checkout-card-actions">
                        <button type="button" onClick={() => handleConfirmedAppointmentAction("manage", appointment)}>Manage this booking</button>
                        <button type="button" onClick={() => handleConfirmedAppointmentAction("reschedule", appointment)}>Reschedule</button>
                        <button type="button" onClick={() => handleConfirmedAppointmentAction("edit", appointment)}>Edit</button>
                        <button type="button" onClick={() => handleConfirmedAppointmentAction("cancel", appointment)}>Cancel</button>
                      </div>
                    </article>
                  ))}
                </div>
                {clientBookingMessage && <p className="booking-status">{clientBookingMessage}</p>}
              </>
            ) : (
              <>
                <h2>Review appointments</h2>
                <p className="checkout-intro-copy">Check each appointment separately before confirming everything together.</p>
                <div className="checkout-appointment-list">
                  {checkoutAppointments.map((appointment) => (
                    <article className="checkout-appointment-card" key={appointment.id}>
                      <div>
                        <span>{appointment.dateLabel}</span>
                        <strong>{appointment.serviceName}</strong>
                        <p>{minutesToTime(appointment.start)} - {minutesToTime(appointment.end)} / {appointment.duration} minutes / {appointment.selectedAreaName}</p>
                        <small>{appointment.items.map((item) => item.minutes ? `${item.minutes} ${item.name}` : item.name).join(" + ")}</small>
                      </div>
                      <b>{"\u00a3"}{appointment.total.toFixed(2)}</b>
                      <div className="checkout-card-actions">
                        <button type="button" onClick={() => editCheckoutAppointment(appointment.id)}>Edit</button>
                        <button type="button" onClick={() => removeCheckoutAppointment(appointment.id)}>Remove</button>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="checkout-total-panel">
                  <span>Total</span>
                  <strong>{"\u00a3"}{checkoutTotal.toFixed(2)}</strong>
                </div>
                <div className="reservation-panel">
                  <div className="reservation-row">
                    <span>Reference</span>
                    <div>
                      <small>Booking reference</small>
                      <strong>{bookingReference || "Generating..."}</strong>
                    </div>
                    <div>
                      <button type="button" onClick={() => { if (navigator.clipboard) navigator.clipboard.writeText(bookingReference || ""); }}>Copy</button>
                    </div>
                  </div>
                  <div className="reservation-row">
                    <span>Amount</span>
                    <div>
                      <small>Amount due</small>
                      <strong>{"\u00a3"}{checkoutTotal.toFixed(2)}</strong>
                    </div>
                  </div>
                  <div className="reservation-row">
                    <span>Wise</span>
                    <div>
                      <small>Wise payment link</small>
                      <strong><em>Payment link placeholder</em></strong>
                      <div><button type="button" onClick={() => { if (navigator.clipboard) navigator.clipboard.writeText("https://wise.example/payment"); }}>Copy link</button></div>
                    </div>
                  </div>
                  <div className="reservation-row">
                    <span>Bank</span>
                    <div>
                      <small>Bank details</small>
                      <strong>Account: 12345678 | Sort: 12-34-56 | Name: VAD Massage</strong>
                      <div><button type="button" onClick={() => { if (navigator.clipboard) navigator.clipboard.writeText("Account: 12345678 Sort: 12-34-56 Name: VAD Massage"); }}>Copy</button></div>
                    </div>
                  </div>
                  <p className="booking-note">Your selected appointment time is reserved for 60 minutes while payment is completed.</p>
                  <p className="booking-note">Your booking will be confirmed once payment has been received and verified.</p>
                  <div className="reservation-expiry">Reservation expires in <strong>{holdMinutesLeft} minutes</strong></div>
                  {checkoutError && <p className="booking-validation-message">{checkoutError}</p>}
                  <div className="reservation-actions">
                    <button type="button" className="pay-button" disabled={checkoutAppointments.length === 0 || clientIsConfirming} onClick={confirmPayment}>
                      {clientIsConfirming ? "Confirming..." : "I've completed the bank transfer"}
                    </button>
                    <button type="button" className="alternative-link" onClick={() => setAlternativeModalOpen(true)}>Can't pay by bank transfer?</button>
                  </div>
                </div>
              </>
            )}
            <div className="booking-footer-actions">
              <button type="button" className="secondary-button" onClick={() => setClientStep("details")}>Back</button>
              {!confirmedAppointments.length && (
                <button type="button" className="secondary-button" onClick={() => { resetCurrentAppointmentDraft(); setClientStep("treatment"); }}>Add another appointment</button>
              )}
            </div>
          </div>
          <BookingSummary {...bookingSummaryProps} />
        </section>
      )}

      {fullDescriptionService && (
        <div className="booking-modal-backdrop" role="presentation">
          <div className="booking-modal service-description-modal" role="dialog" aria-modal="true">
            <img src={fullDescriptionService.imageUrl || massageTreatmentImage} alt="" />
            <h2>{fullDescriptionService.name}</h2>
            <p>{fullDescriptionService.longDescription}</p>
            <button type="button" onClick={() => selectDescriptionService(fullDescriptionService.id)}>Select service</button>
            <button type="button" className="modal-close" onClick={() => setFullDescriptionServiceId(null)}>Close</button>
          </div>
        </div>
      )}

      {alternativeModalOpen && (
        <div className="booking-modal-backdrop" role="presentation">
          <div className="booking-modal alternative-payment-modal" role="dialog" aria-modal="true">
            <h2>Need another payment option?</h2>
            <p>If bank transfer isn't convenient, you can request an alternative payment arrangement for this booking. Requests are reviewed individually.</p>
            <div className="modal-actions">
              <button type="button" onClick={async () => { await requestAlternativePayment(); }}>Request alternative payment method</button>
              <button type="button" className="modal-close" onClick={() => setAlternativeModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {clientWaitlistEntries.length > 0 && (
        <section className="client-card client-offers-card">
          <div className="section-heading">
            <p className="eyebrow">Waitlist</p>
            <h2>Your requests</h2>
          </div>
          <div className="client-offer-list">
            {clientWaitlistEntries.map((entry) => (
              <article className="client-offer-card" key={entry.id}>
                <strong>{entry.clientName}</strong>
                <span>{displayDayName(days, entry.preferredDate)} / {entry.preferredWindow}</span>
                <small>{entry.duration} minute session / {getEffectiveWaitlistStatus(entry)}</small>
                {getEffectiveWaitlistStatus(entry) !== "offered" && (
                  <button type="button" className="ghost-button" onClick={() => onCancelWaitlist(entry.id)}>Cancel request</button>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {offeredEntries.length > 0 && (
        <section className="client-card client-offers-card">
          <div className="section-heading">
            <p className="eyebrow">Offers</p>
            <h2>Waitlist offers</h2>
          </div>
          <div className="client-offer-list">
            {offeredEntries.map((entry) => (
              <article className="client-offer-card" key={entry.id}>
                <strong>{entry.clientName}</strong>
                <span>{entry.offeredDayLabel} at {minutesToTime(entry.offeredSlot.start)}</span>
                <small>{entry.duration} minute session</small>
                <button type="button" className="ghost-button" onClick={() => onCancelWaitlist(entry.id)}>Cancel request</button>
                <button type="button" onClick={() => onAcceptOffer(entry.id)}>Accept offer</button>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

const ADMIN_TABS = [
  { id: "calendar", label: "Calendar" },
  { id: "customers", label: "Customer List" },
  { id: "waitlist", label: "Waitlist" },
  { id: "analytics", label: "Analytics" },
  { id: "settings", label: "Settings" },
];

const SERVICE_COLORS = ["#6ea8fe", "#8fd6b3", "#f4bf75", "#d6a3f5", "#f09393"];

function buildInitialServiceDetails(services) {
  const defaultCopy = {
    "deep-tissue": {
      longDescription: "A focused recovery treatment for tight muscles, restricted movement, and deep postural tension. Ideal when you want firm pressure and targeted work.",
      shortDescription: "Focused pressure for tight muscles and recovery.",
    },
    sports: {
      longDescription: "A performance-led massage for active clients, combining targeted muscle work, mobility support, and recovery-focused pressure.",
      shortDescription: "Recovery massage for active bodies.",
    },
    "head-massage": {
      longDescription: "A calming treatment for the scalp, neck, and shoulders, designed to reduce stress and release light upper-body tension.",
      shortDescription: "Relaxing scalp, neck, and shoulder release.",
    },
    prenatal: {
      longDescription: "A gentle, supportive massage for pregnancy comfort, using careful positioning and softer pressure for relaxation and relief.",
      shortDescription: "Gentle support for pregnancy comfort.",
    },
    "zero-gravity": {
      longDescription: "A deeply relaxing full-body treatment designed to slow the nervous system and create a floating, restorative feeling.",
      shortDescription: "Deep relaxation and full-body reset.",
    },
  };

  return Object.fromEntries(
    services.map((service, index) => [
      service.id,
      {
        buffer: service.id === "head-massage" ? 30 : DEFAULT_TRAVEL_BUFFER,
        duration: service.id === "head-massage" ? 60 : 90,
        imageUrl: massageTreatmentImage,
        longDescription: defaultCopy[service.id]?.longDescription ?? "A professional mobile massage treatment tailored to the client's needs.",
        price: service.id === "head-massage" ? 78 : 120 + index * 12,
        shortDescription: defaultCopy[service.id]?.shortDescription ?? "Professional mobile massage treatment.",
      },
    ])
  );
}

function compactDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function fullDateLabel(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", weekday: "short" });
}

function monthRangeLabel(days, selectedDayIndex) {
  const selectedDate = new Date(`${days[selectedDayIndex]?.dateValue ?? todayValue()}T00:00:00`);
  if (Number.isNaN(selectedDate.getTime())) return "Select date";

  const firstDate = new Date(selectedDate);
  firstDate.setDate(selectedDate.getDate() - selectedDate.getDay() + 1);
  const lastDate = new Date(firstDate);
  lastDate.setDate(firstDate.getDate() + 6);
  const firstMonth = firstDate.toLocaleDateString("en-GB", { month: "short" });
  const lastMonth = lastDate.toLocaleDateString("en-GB", { month: "short" });
  const year = selectedDate.getFullYear();
  return `${firstMonth}${firstMonth === lastMonth ? "" : ` - ${lastMonth}`} ${year}`;
}

function clientNameForBooking(booking) {
  if (isPersonalEvent(booking)) return booking.clientName || "Personal event";
  return booking.clientName || "Walk-in client";
}

function customerInitials(name) {
  const parts = String(name || "Guest").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "G";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function itemsForBooking(booking) {
  if (isPersonalEvent(booking)) return [{ minutes: booking.duration, name: booking.serviceName || "Personal event" }];
  return Array.isArray(booking.items) && booking.items.length > 0
    ? booking.items
    : [{ minutes: booking.duration, name: booking.serviceName }];
}

function mapUrlForBooking(booking) {
  const destination = booking.address || booking.location || "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
}

function App() {
  const initialSearchParams = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const isMobilePreviewFrame = initialSearchParams.get("mobilePreviewFrame") === "1";
  const initialView = initialSearchParams.get("view") === "admin" ? "admin" : "client";
  const [services, setServices] = useState(DEFAULT_SERVICES);
  const [serviceDetails, setServiceDetails] = useState(() => buildInitialServiceDetails(DEFAULT_SERVICES));
  const [enhancements, setEnhancements] = useState(() =>
    sanitizeStoredEnhancements(readStoredJson(ENHANCEMENTS_STORAGE_KEY, DEFAULT_ENHANCEMENTS))
  );
  const [coverageZones, setCoverageZones] = useState(() =>
    sanitizeCoverageZones(readStoredJson(COVERAGE_ZONES_STORAGE_KEY, DEFAULT_COVERAGE_ZONES))
  );
  const [serviceAreas, setServiceAreas] = useState(() =>
    sanitizeServiceAreas(readStoredJson(SERVICE_AREAS_STORAGE_KEY, DEFAULT_SERVICE_AREAS))
  );
  const [days, setDays] = useState(buildInitialDays);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedServiceId, setSelectedServiceId] = useState(DEFAULT_SERVICES[0].id);
  const [requestedDuration, setRequestedDuration] = useState(90);
  const [requestedTravelBuffer, setRequestedTravelBuffer] = useState(DEFAULT_TRAVEL_BUFFER);
  const [manualStart, setManualStart] = useState("14:15");
  const [showInvalidSlots, setShowInvalidSlots] = useState(false);
  const [activeView, setActiveView] = useState(initialView);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [authSession, setAuthSession] = useState(null);
  const [clientProfile, setClientProfile] = useState(null);
  const [clientBookingContext, setClientBookingContext] = useState(null);
  const [clientBookingContextLoading, setClientBookingContextLoading] = useState(false);
  const [clientAuthError, setClientAuthError] = useState("");
  const [adminSession, setAdminSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [adminAuthError, setAdminAuthError] = useState("");
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [clientDayIndex, setClientDayIndex] = useState(1);
  const [clientServiceId, setClientServiceId] = useState("");
  const [clientDuration, setClientDuration] = useState(60);
  const [clientSelectedSlot, setClientSelectedSlot] = useState(null);
  const [clientBookingMessage, setClientBookingMessage] = useState("");
  const [clientIsConfirming, setClientIsConfirming] = useState(false);
  const clientConfirmingRef = useRef(false);
  const [waitlistEntries, setWaitlistEntries] = useState(() => {
    return sanitizeStoredWaitlistEntries(readStoredJson(WAITLIST_STORAGE_KEY, []));
  });
  const [waitlistFormOpen, setWaitlistFormOpen] = useState(false);
  const [waitlistForm, setWaitlistForm] = useState({
    clientName: "",
    preferredDate: dateValueForOffset(0),
    preferenceType: "exact",
    preferredWindow: "",
    duration: 60,
    flexibility: 0,
  });

  const selectedDay = days[selectedDayIndex];
  const settings = selectedDay.settings;
  const bookings = selectedDay.bookings;
  const visibleServices = services.filter((service) => service.visible);
  const preview = useMemo(
    () => getSchedulingPreview({ settings, bookings, requestedDuration, requestedTravelBuffer }),
    [settings, bookings, requestedDuration, requestedTravelBuffer]
  );
  const invalidSlots = useMemo(
    () => buildDebugSlots({ settings, bookings, requestedDuration, requestedTravelBuffer }),
    [settings, bookings, requestedDuration, requestedTravelBuffer]
  );

  const sortedBookings = getBookingBlocks(bookings);
  const totalRequestedBlock = Number(requestedDuration) + Math.max(0, Number(requestedTravelBuffer));
  const anchorIsActive = settings.startMode === "fixed" && !preview.flow.hasBookings;
  const anchorState = settings.startMode !== "fixed"
    ? "inactive"
    : anchorIsActive
      ? "active"
      : "released";
  const mobilePreviewUrl = typeof window === "undefined"
    ? ""
    : `${window.location.origin}${window.location.pathname}?mobilePreviewFrame=1&view=${activeView}`;

  useEffect(() => {
    let cancelled = false;
    let subscription;

    async function applySession(session) {
      if (cancelled) return;
      setAuthSession(session);
      setClientAuthError("");

      if (!session?.user) {
        setClientProfile(null);
        setClientBookingContext(null);
        setClientBookingContextLoading(false);
        setAdminSession(null);
        return;
      }

      let isAdmin = false;
      try {
        const { isCurrentUserBookingAdmin } = await import("./supabaseClient.js");
        isAdmin = await isCurrentUserBookingAdmin();
        if (!cancelled) setAdminSession(isAdmin ? session : null);
      } catch (error) {
        if (!cancelled) {
          setAdminSession(null);
          console.warn("Could not verify admin access.", error);
        }
      }

      if (isAdmin) {
        if (!cancelled) {
          setClientProfile(null);
          setClientBookingContext(null);
          setClientBookingContextLoading(false);
        }
        return;
      }

      if (!cancelled) setClientBookingContextLoading(true);
      try {
        const existingProfile = await getCurrentClientProfile().catch(() => null);
        const profileInput = profileInputFromAuthUser(session.user, existingProfile);
        const profile = await upsertCurrentClientProfile(profileInput);
        const bookingContext = await loadCurrentClientBookingContext();
        if (!cancelled) {
          setClientProfile(profile);
          setClientBookingContext(bookingContext);
        }
      } catch (error) {
        if (!cancelled) {
          setClientBookingContext(null);
          setClientAuthError("Signed in, but your returning-client shortcuts could not be loaded yet.");
          console.warn("Client profile or booking context sync failed.", error);
        }
      } finally {
        if (!cancelled) setClientBookingContextLoading(false);
      }
    }

    import("./supabaseClient.js")
      .then(({ getCurrentSession, supabase }) => {
        if (cancelled) return null;
        const authListener = supabase.auth.onAuthStateChange((event, session) => {
          applySession(session);
          setAdminAuthError("");
          if (event === "PASSWORD_RECOVERY") {
            setPasswordRecovery(true);
            setActiveView("admin");
          }
        });
        subscription = authListener.data.subscription;
        return getCurrentSession();
      })
      .then((session) => applySession(session))
      .catch((error) => {
        if (!cancelled) {
          setClientAuthError(error.message || "Could not check your session.");
          setAdminAuthError(error.message || "Could not check admin session.");
        }
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });

    const authError = new URLSearchParams(window.location.search).get("error_description");
    if (authError) setClientAuthError(authError);

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (adminSession) return;

    let cancelled = false;

    loadPublicAvailabilityFromSupabase(days)
      .then((availabilityDays) => {
        if (cancelled) return;
        setDays(availabilityDays);
        writeBookingsCacheFromDays(availabilityDays);
      })
      .catch((error) => {
        console.warn("Supabase public availability load failed. Falling back to localStorage cache.", error);
      });

    return () => {
      cancelled = true;
    };
  }, [adminSession]);

  useEffect(() => {
    if (!adminSession) return;

    let cancelled = false;

    loadBookingsFromSupabase(days)
      .then((supabaseDays) => {
        if (cancelled) return;
        setDays(supabaseDays);
        writeBookingsCacheFromDays(supabaseDays);
      })
      .catch((error) => {
        console.warn("Supabase booking load failed. Falling back to localStorage cache.", error);
        setAdminAuthError(error.message || "Could not load admin bookings.");
      });

    return () => {
      cancelled = true;
    };
  }, [adminSession]);

  useEffect(() => {
    writeBookingsCacheFromDays(days);
  }, [days]);

  useEffect(() => {
    writeStoredJson(WAITLIST_STORAGE_KEY, sanitizeStoredWaitlistEntries(waitlistEntries));
  }, [waitlistEntries]);

  useEffect(() => {
    writeStoredJson(ENHANCEMENTS_STORAGE_KEY, sanitizeStoredEnhancements(enhancements));
  }, [enhancements]);

  useEffect(() => {
    writeStoredJson(COVERAGE_ZONES_STORAGE_KEY, sanitizeCoverageZones(coverageZones));
  }, [coverageZones]);

  useEffect(() => {
    writeStoredJson(SERVICE_AREAS_STORAGE_KEY, sanitizeServiceAreas(serviceAreas));
  }, [serviceAreas]);

  function updateEnhancement(id, patch) {
    setEnhancements((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
              durationMinutes: "durationMinutes" in patch ? Math.max(0, Math.round(Number(patch.durationMinutes) || 0)) : item.durationMinutes,
              price: "price" in patch ? Math.max(0, Number(patch.price) || 0) : item.price,
            }
          : item
      )
    );
  }

  function addEnhancement() {
    const id = crypto.randomUUID ? crypto.randomUUID() : `enhancement-${Date.now()}`;
    setEnhancements((current) => [
      ...current,
      {
        active: true,
        description: "Describe this enhancement.",
        durationMinutes: 0,
        id,
        name: "New enhancement",
        price: 0,
      },
    ]);
  }

  function deleteEnhancement(id) {
    const confirmed = window.confirm("Delete this enhancement?");
    if (!confirmed) return;
    setEnhancements((current) => current.filter((item) => item.id !== id));
  }

  function updateCoverageZone(zone, value) {
    setCoverageZones((current) => sanitizeCoverageZones({ ...current, [zone]: normalizePostcodeAreaList(value) }));
  }

  function updateServiceArea(areaId, patch) {
    setServiceAreas((current) =>
      sanitizeServiceAreas(current).map((area) =>
        area.id === areaId ? { ...area, ...patch } : area
      )
    );
  }

  function addServiceArea() {
    setServiceAreas((current) => {
      const existingIds = new Set(current.map((area) => area.id));
      const customCount = current.filter((area) => area.custom).length + 1;
      const trimmedName = `New area ${customCount}`;
      const baseId = "custom_area";
      let id = baseId;
      let suffix = 2;
      while (existingIds.has(id)) {
        id = `${baseId}_${suffix}`;
        suffix += 1;
      }

      return sanitizeServiceAreas([
        ...current,
        { active: true, custom: true, id, name: trimmedName },
      ]);
    });
  }

  function deleteServiceArea(areaId) {
    const area = serviceAreas.find((item) => item.id === areaId);
    if (!area?.custom) return;
    const confirmed = window.confirm(`Delete ${area.name}?`);
    if (!confirmed) return;
    setServiceAreas((current) => sanitizeServiceAreas(current.filter((item) => item.id !== areaId)));
  }

  async function handleClientGoogleLogin() {
    setClientAuthError("");
    try {
      const { signInClientWithGoogle } = await import("./supabaseClient.js");
      const redirectTo = `${window.location.origin}${window.location.pathname}?view=client`;
      await signInClientWithGoogle(redirectTo);
    } catch (error) {
      const message = error.message || "Google login could not be started.";
      setClientAuthError(message);
      throw new Error(message);
    }
  }

  async function handleClientSignOut() {
    setClientAuthError("");
    try {
      const { signOutCurrentUser } = await import("./supabaseClient.js");
      await signOutCurrentUser();
      setAuthSession(null);
      setClientProfile(null);
      setClientBookingContext(null);
      setClientBookingContextLoading(false);
      setAdminSession(null);
      setActiveView("client");
    } catch (error) {
      const message = error.message || "Could not sign out.";
      setClientAuthError(message);
      throw new Error(message);
    }
  }

  async function syncClientProfileFromBookingCustomer(customer) {
    if (!authSession?.user) return;
    try {
      const existingProfile = await getCurrentClientProfile().catch(() => clientProfile);
      const profileInput = profileInputFromAuthUser(authSession.user, existingProfile, customer?.phone || "");
      const profile = await upsertCurrentClientProfile({
        ...profileInput,
        fullName: customer?.name?.trim() || profileInput.fullName,
      });
      setClientProfile(profile);
    } catch (error) {
      console.warn("Booking succeeded, but the client profile could not be updated.", error);
    }
  }

  async function syncReturningClientBookingDefaults({
    appointments = [],
    bookingIds = [],
    emailPayload = {},
    savedAddressId = "",
  }) {
    if (!authSession?.user || appointments.length === 0) return;

    try {
      const area = appointments[0]?.selectedAreaName || emailPayload.location || "";
      const savedAddress = savedAddressId
        ? { id: savedAddressId }
        : await ensureCurrentClientBookingAddress({
            addressLine1: emailPayload.address || "",
            area,
            instructions: emailPayload.notes || "",
          });
      await updateCurrentClientBookingDefaults({
        address: emailPayload.address || "",
        area,
        bookingIds,
        notes: emailPayload.notes || "",
        savedAddressId: savedAddress?.id || savedAddressId,
        services: appointments[0]?.items || [],
      });
      const context = await loadCurrentClientBookingContext();
      setClientBookingContext(context);
    } catch (error) {
      console.warn("Booking succeeded, but returning-client preferences could not be updated.", error);
    }
  }

  async function handleAdminLogin(email, password) {
    setAdminAuthError("");

    try {
      const { isCurrentUserBookingAdmin, signInAdmin, signOutCurrentUser } = await import("./supabaseClient.js");
      const session = await signInAdmin(email, password);
      const isAdmin = await isCurrentUserBookingAdmin();
      if (!isAdmin) {
        await signOutCurrentUser();
        throw new Error("This account does not have admin access.");
      }
      setAuthSession(session);
      setAdminSession(session);
    } catch (error) {
      const message = error.message || "Admin login failed.";
      setAdminAuthError(message);
      throw new Error(message);
    }
  }

  async function handleAdminLogout() {
    setAdminAuthError("");

    try {
      const { signOutAdmin } = await import("./supabaseClient.js");
      await signOutAdmin();
      setAdminSession(null);
      setPasswordRecovery(false);
      setActiveView("client");
    } catch (error) {
      const message = error.message || "Admin logout failed.";
      setAdminAuthError(message);
      throw new Error(message);
    }
  }

  async function handleAdminPasswordRecovery(email) {
    setAdminAuthError("");

    try {
      const { requestAdminPasswordRecovery } = await import("./supabaseClient.js");
      const redirectTo = `${window.location.origin}${window.location.pathname}?view=admin`;
      await requestAdminPasswordRecovery(email, redirectTo);
    } catch (error) {
      const message = error.message || "Could not send password reset email.";
      setAdminAuthError(message);
      throw new Error(message);
    }
  }

  async function handleAdminPasswordUpdate(password) {
    setAdminAuthError("");

    try {
      const { updateAdminPassword } = await import("./supabaseClient.js");
      await updateAdminPassword(password);
      setPasswordRecovery(false);
    } catch (error) {
      const message = error.message || "Could not update password.";
      setAdminAuthError(message);
      throw new Error(message);
    }
  }

  function updateSelectedDay(patch) {
    setDays((current) =>
      current.map((day, index) => (index === selectedDayIndex ? { ...day, ...patch(day) } : day))
    );
  }

  function updateSetting(key, value) {
    updateSelectedDay((day) => ({ settings: { ...day.settings, [key]: value } }));
  }

  function setSelectedDayBookings(nextBookings) {
    updateSelectedDay((day) => ({
      bookings: typeof nextBookings === "function" ? nextBookings(day.bookings) : nextBookings,
    }));
  }

  async function addBookingAt(start) {
    const serviceId = visibleServices.some((service) => service.id === selectedServiceId)
      ? selectedServiceId
      : visibleServices[0]?.id;

    if (!serviceId) return;

    try {
      await addBookingToDay(selectedDayIndex, {
        serviceId,
        start,
        duration: requestedDuration,
        travelBuffer: requestedTravelBuffer,
      });
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function addBookingToDay(dayIndex, { address = "", clientName = "", congestionFee = 0, customerEmail = "", customerPhone = "", items = [], kind = "booking", location = "", orderId = "", paymentId = "", price = 0, savedAddressId = "", serviceId, serviceName: providedServiceName = "", start, duration, telegramUpdates = false, travelBuffer, travelFee = 0, userId = "", paymentMethod = "", paymentStatus = "", bookingReference = "", paymentHoldExpiresAt = null, status = "confirmed" }) {
    const serviceName = providedServiceName || serviceNameFor(services, serviceId);
    const linkedRequestId = buildLinkedRequestId({
      serviceId,
      dayLabel: days[dayIndex].dateValue ?? days[dayIndex].label,
      duration,
    });
    const bookingSlot = {
      start,
      end: start + duration,
      bufferEnd: start + duration + travelBuffer,
      duration,
      travelBuffer,
    };
    const booking = {
      ...createBooking({
        serviceId,
        serviceName,
        start,
        duration,
        travelBuffer,
      }),
      address,
      clientName,
      congestionFee,
      customerEmail,
      customerPhone,
      dateValue: days[dayIndex].dateValue,
      items,
      kind,
      location,
      orderId,
      paymentId,
      price,
      savedAddressId,
      start: minutesToTime(start),
      telegramUpdates,
      travelFee,
      userId,
    };
    const dayKey = days[dayIndex]?.dateValue ?? days[dayIndex]?.id ?? "";
    const bookingSignature = bookingDuplicateSignature(booking, dayKey);
    const alreadyExists = days[dayIndex]?.bookings.some((existingBooking) =>
      bookingDuplicateSignature(existingBooking, dayKey) === bookingSignature
    );

    if (alreadyExists || pendingBookingSignatures.has(bookingSignature)) {
      setClientBookingMessage("This appointment is already in the calendar.");
      return null;
    }

    pendingBookingSignatures.add(bookingSignature);
    let savedBooking;
    try {
      const insertedRow = await saveBookingToSupabase(booking, status);
      savedBooking = { ...booking, id: String(insertedRow?.id ?? booking.id) };
    } finally {
      pendingBookingSignatures.delete(bookingSignature);
    }

    setDays((current) =>
      current.map((day, index) => {
        if (index !== dayIndex) return day;
        const currentDayKey = day.dateValue ?? day.id;
        const currentSignature = bookingDuplicateSignature(savedBooking, currentDayKey);
        const currentAlreadyHasBooking = day.bookings.some((existingBooking) =>
          bookingDuplicateSignature(existingBooking, currentDayKey) === currentSignature
        );

        return {
          ...day,
          bookings: currentAlreadyHasBooking ? day.bookings : [...day.bookings, savedBooking],
        };
      })
    );
    setWaitlistEntries((current) =>
      current.map((entry) =>
        entry.linkedRequestId === linkedRequestId &&
        slotMatchesWaitlistRequest(bookingSlot, entry) &&
        (entry.status === "joined" || entry.status === "offered")
          ? { ...entry, status: "closed" }
          : entry
      )
    );

    if (kind === "booking") {
      notifyAdminTelegram("booking_created", { booking: savedBooking, paymentStatus: paymentStatus || "awaiting_verification" });
    }

    return savedBooking;
  }

  async function createAdminAppointment(appointment) {
    await addBookingToDay(appointment.dayIndex, appointment);
    setSelectedDayIndex(appointment.dayIndex);
  }

  async function createAdminPersonalEvents(events) {
    for (const event of events) {
      await addBookingToDay(event.dayIndex, event);
    }
  }

  function resetClientConfirmGuard() {
    clientConfirmingRef.current = false;
    setClientIsConfirming(false);
  }

  function changeClientVisibleWeek(startDateValue, preferredIndex = 0) {
    const visibleWeek = buildDaysStarting(startDateValue, days);
    const nextIndex = Math.min(Math.max(0, preferredIndex), visibleWeek.length - 1);

    setDays(visibleWeek);
    setSelectedDayIndex(nextIndex);
    setClientDayIndex(nextIndex);

    const loader = adminSession ? loadBookingsFromSupabase : loadPublicAvailabilityFromSupabase;
    loader(visibleWeek)
      .then((loadedDays) => {
        setDays(loadedDays);
        writeBookingsCacheFromDays(loadedDays);
      })
      .catch((error) => {
        console.warn("Could not load the selected week from Supabase. Showing local availability.", error);
      });
  }

  async function confirmClientBooking({ appointments = [], customer, dayIndex, emailPayload, hold, paymentMethod = "card", savedAddressId = "", serviceId, slot, bookingReference = "", paymentHoldExpiresAt = null }) {
    if (clientConfirmingRef.current) return false;

    clientConfirmingRef.current = true;
    setClientIsConfirming(true);
    setClientBookingMessage("");
    logBookingConfirmation("confirm started");

    try {
      // Always create an order for client-originated bookings so payment metadata is tracked.
      const orderId = crypto.randomUUID ? crypto.randomUUID() : `order-${Date.now()}`;
      const paymentId = `pay_${orderId}`;
      const totalAmount = appointments.length > 0
        ? appointments.reduce((total, appointment) => total + appointment.total, 0)
        : Number(emailPayload?.total) || 0;
      const paymentStatus = paymentMethodToPaymentStatus(paymentMethod);
      await createOrderInSupabase({
        clientEmail: customer?.email ?? "",
        clientName: customer?.name ?? "",
        id: orderId,
        userId: authSession?.user?.id || "",
        paymentId,
        paymentProvider: "manual-demo",
        paymentStatus,
        totalAmount,
      });

      if (appointments.length > 0) {
        logBookingConfirmation("slot revalidation started");
        const basketValidation = validateBasketAppointments({ appointments, days, serviceAreas });
        if (!basketValidation.ok) {
          logBookingConfirmation("slot revalidation failed");
          throw new Error(`${basketValidation.message} Please edit that appointment only.`);
        }
        logBookingConfirmation("slot revalidation succeeded");

        const savedBookings = [];
        for (const appointment of appointments) {
          const appointmentDayIndex = days.findIndex((day) => day.dateValue === appointment.dateValue);
          if (appointmentDayIndex < 0) {
            throw new Error("An appointment date is no longer available. Please edit that appointment.");
          }
          const savedAppointment = await addBookingToDay(appointmentDayIndex, {
            address: emailPayload?.address ?? "",
            clientName: customer?.name ?? "",
            congestionFee: appointment.congestionFee,
            customerEmail: customer?.email ?? "",
            customerPhone: customer?.phone ?? "",
            duration: appointment.duration,
            items: appointment.items,
            location: appointment.selectedAreaName,
            orderId,
            paymentId,
            paymentMethod,
            paymentStatus,
            bookingReference: bookingReference || undefined,
            paymentHoldExpiresAt,
            status: paymentMethodToBookingStatus(paymentMethod),
            price: appointment.price,
            savedAddressId,
            serviceId: appointment.serviceId,
            serviceName: appointment.serviceName,
            start: appointment.start,
            telegramUpdates: Boolean(customer?.telegramUpdates),
            travelBuffer: appointment.travelBuffer,
            travelFee: appointment.travelFee,
            userId: authSession?.user?.id || "",
          });
          if (!savedAppointment) {
            throw new Error("An appointment could not be added because it is already in the calendar.");
          }
          savedBookings.push(savedAppointment);
          logBookingConfirmation("notification started");
          notifyAdminTelegram("payment_status", {
            amount: appointment.total,
            booking: savedAppointment,
            paymentMethod,
            status: paymentStatus,
          });
          logBookingConfirmation("notification backgrounded");
        }

        void Promise.all([
          syncClientProfileFromBookingCustomer(customer),
          syncReturningClientBookingDefaults({
            appointments,
            bookingIds: savedBookings.map((booking) => booking.id),
            emailPayload,
            savedAddressId,
          }),
        ]).catch(() => {
          logBookingConfirmation("client preference sync failed");
        });

        appointments.forEach((appointment) => {
          if (appointment.hold) void releaseBookingHoldInSupabase(appointment.hold);
        });
        setClientSelectedSlot(null);
        if (paymentMethod === "bank_transfer") {
          setClientBookingMessage("Your appointments are reserved. Your booking is awaiting payment verification.");
        } else if (paymentMethod === "alternative_requested") {
          setClientBookingMessage("Your alternative payment request has been submitted and will be reviewed.");
        } else {
          setClientBookingMessage("Your appointments are confirmed.");
        }

        logBookingConfirmation("notification started");
        const emailTask = postTransactionalEmail({
          payload: {
            ...emailPayload,
            orderId,
            paymentId,
          },
          to: customer?.email,
          type: "bookingConfirmation",
        });
        logBookingConfirmation("notification backgrounded");
        void emailTask.catch(() => {
          logBookingConfirmation("notification failed");
          setClientBookingMessage("Your appointments are confirmed. Confirmation email could not be queued.");
        });
        return true;
      }

      logBookingConfirmation("slot revalidation started");
      const day = days[dayIndex];
      if (!day || !slot) {
        logBookingConfirmation("slot revalidation failed");
        throw new Error("The selected appointment time is missing. Please choose it again.");
      }
      const latestPreview = getSchedulingPreview({
        settings: day.settings,
        bookings: day.bookings,
        requestedDuration: clientDuration,
        requestedTravelBuffer: DEFAULT_TRAVEL_BUFFER,
      });
      const stillAvailable = latestPreview.slots.some((availableSlot) => {
        return (
          availableSlot.start === slot.start &&
          availableSlot.end === slot.end &&
          availableSlot.bufferEnd === slot.bufferEnd
        );
      });
      if (!stillAvailable) {
        logBookingConfirmation("slot revalidation failed");
        setClientSelectedSlot(null);
        throw new Error("This time is no longer available. Please choose another.");
      }
      logBookingConfirmation("slot revalidation succeeded");

      const savedBooking = await addBookingToDay(dayIndex, {
        address: emailPayload?.address ?? "",
        clientName: customer?.name ?? "",
        customerEmail: customer?.email ?? "",
        customerPhone: customer?.phone ?? "",
        items: emailPayload?.items ?? [],
        location: emailPayload?.location ?? "",
        savedAddressId,
        serviceId,
        start: slot.start,
        duration: clientDuration,
        telegramUpdates: Boolean(customer?.telegramUpdates),
        travelBuffer: DEFAULT_TRAVEL_BUFFER,
        userId: authSession?.user?.id || "",
        orderId,
        paymentId,
        paymentMethod,
        paymentStatus,
        bookingReference: bookingReference || undefined,
        paymentHoldExpiresAt,
        status: paymentMethodToBookingStatus(paymentMethod),
      });

      void Promise.all([
        syncClientProfileFromBookingCustomer(customer),
        syncReturningClientBookingDefaults({
          appointments: [{
            items: emailPayload?.items ?? [],
            selectedAreaName: emailPayload?.location ?? "",
          }],
          bookingIds: savedBooking.id ? [savedBooking.id] : [],
          emailPayload,
          savedAddressId,
        }),
      ]).catch(() => {
        logBookingConfirmation("client preference sync failed");
      });

      void releaseBookingHoldInSupabase(hold);
      setClientSelectedSlot(null);
      if (paymentMethod === "bank_transfer") {
        setClientBookingMessage("Booking reserved. Your booking is awaiting payment verification.");
      } else if (paymentMethod === "alternative_requested") {
        setClientBookingMessage("Your alternative payment request has been submitted and will be reviewed.");
      } else {
        setClientBookingMessage("Booking confirmed.");
      }
      setSelectedDayIndex(dayIndex);

      logBookingConfirmation("notification started");
      const emailTask = postTransactionalEmail({
        payload: emailPayload,
        to: customer?.email,
        type: "bookingConfirmation",
      });
      logBookingConfirmation("notification backgrounded");
      void emailTask.catch(() => {
        logBookingConfirmation("notification failed");
        setClientBookingMessage("Booking confirmed. Confirmation email could not be queued.");
      });
      return true;
    } catch (error) {
      logBookingConfirmation("confirm failed", error);
      setClientBookingMessage(error?.message || "Your appointment could not be confirmed. Please try again.");
      return false;
    } finally {
      setClientIsConfirming(false);
      clientConfirmingRef.current = false;
    }
  }

  function joinWaitlist(event) {
    event.preventDefault();

    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      linkedRequestId: buildLinkedRequestId({
        serviceId: clientServiceId,
        dayLabel: waitlistForm.preferredDate,
        duration: Number(waitlistForm.duration),
      }),
      serviceId: clientServiceId,
      clientName: waitlistForm.clientName.trim(),
      preferredDate: waitlistForm.preferredDate,
      preferenceType: waitlistForm.preferenceType,
      preferredWindow: waitlistForm.preferredWindow.trim(),
      duration: Number(waitlistForm.duration),
      flexibility: Number(waitlistForm.flexibility) || 0,
      status: isPastDate(waitlistForm.preferredDate) ? "closed" : "joined",
      createdAt: new Date().toISOString(),
    };

    const duplicateExists = waitlistEntries.some((currentEntry) => {
      return (
        waitlistEntryKey(currentEntry) === waitlistEntryKey(entry) &&
        (getEffectiveWaitlistStatus(currentEntry) === "joined" || getEffectiveWaitlistStatus(currentEntry) === "offered")
      );
    });

    if (duplicateExists) {
      setClientBookingMessage("You already have this waitlist request.");
      setWaitlistFormOpen(false);
      return;
    }

    setWaitlistEntries((current) => [...current, entry]);
    notifyAdminTelegram("waitlist_request", {
      ...entry,
      area: selectedArea?.name || "",
      email: contactDetails.email,
      phone: contactDetails.phone,
    });
    setWaitlistForm((current) => ({
      ...current,
      clientName: "",
      preferredWindow: "",
      duration: clientDuration,
      preferenceType: "exact",
      preferredDate: days[clientDayIndex]?.dateValue ?? current.preferredDate,
    }));
    setWaitlistFormOpen(false);
  }

  function sendWaitlistOffer(entryId, offer) {
    setWaitlistEntries((current) =>
      current.map((entry) =>
        entry.id === entryId && getEffectiveWaitlistStatus(entry) === "joined" && slotMatchesWaitlistRequest(offer.slot, entry)
          ? {
              ...entry,
              status: "offered",
              offeredDayIndex: offer.dayIndex,
              offeredDayLabel: offer.dayLabel,
              offeredServiceId: offer.serviceId,
              offeredSlot: offer.slot,
            }
          : entry
      )
    );
  }

  function closeWaitlistRequest(entryId) {
    setWaitlistEntries((current) =>
      current.map((entry) =>
        entry.id === entryId && entry.status !== "accepted" ? { ...entry, status: "closed" } : entry
      )
    );
  }

  function cancelWaitlistRequest(entryId) {
    closeWaitlistRequest(entryId);
  }

  async function acceptWaitlistOffer(entryId) {
    const entry = waitlistEntries.find((item) => item.id === entryId);
    if (!entry || getEffectiveWaitlistStatus(entry) !== "offered" || !entry.offeredSlot) return;

    const offeredDay = days[entry.offeredDayIndex];
    const latestPreview = getSchedulingPreview({
      settings: offeredDay.settings,
      bookings: offeredDay.bookings,
      requestedDuration: entry.duration,
      requestedTravelBuffer: DEFAULT_TRAVEL_BUFFER,
    });
    const stillAvailable = latestPreview.slots.some((slot) => {
      return (
        slot.start === entry.offeredSlot.start &&
        slot.end === entry.offeredSlot.end &&
        slot.bufferEnd === entry.offeredSlot.bufferEnd
      );
    });

    if (!stillAvailable) {
      setClientBookingMessage("This offer is no longer available.");
      return;
    }

    try {
      await addBookingToDay(entry.offeredDayIndex, {
        clientName: entry.clientName,
        serviceId: entry.offeredServiceId,
        start: entry.offeredSlot.start,
        duration: entry.duration,
        travelBuffer: DEFAULT_TRAVEL_BUFFER,
        userId: authSession?.user?.id || "",
      });
    } catch (error) {
      console.error(error);
      setClientBookingMessage(error.message);
      return;
    }

    setWaitlistEntries((current) =>
      current.map((item) => (item.id === entryId ? { ...item, status: "accepted" } : item))
    );
    setSelectedDayIndex(entry.offeredDayIndex);
  }

  async function updateBooking(id, patch) {
    const booking = bookings.find((item) => item.id === id);
    if (!booking) return null;

    const nextBooking = { ...booking, ...patch, dateValue: selectedDay.dateValue };
    try {
      await updateBookingInSupabase(nextBooking);
      setSelectedDayBookings((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
      return nextBooking;
    } catch (error) {
      window.alert(error.message);
      return null;
    }
  }

  async function removeBooking(id) {
    const bookingToDelete = bookings.find((item) => item.id === id);

    try {
      await deleteBookingFromSupabase(id);
      setSelectedDayBookings((current) => current.filter((booking) => booking.id !== id));
      if (bookingToDelete) {
        notifyAdminTelegram("booking_cancelled", { booking: { ...bookingToDelete, dateValue: selectedDay.dateValue }, cancellationStatus: "deleted by admin" });
      }
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function updateBookingAcrossDays(id, patch) {
    let nextBooking = null;
    let oldBooking = null;

    for (const day of days) {
      const booking = day.bookings.find((item) => item.id === id);
      if (booking) {
        oldBooking = { ...booking, dateValue: day.dateValue };
        nextBooking = { ...booking, ...patch, dateValue: day.dateValue };
        break;
      }
    }

    if (!nextBooking) return null;

    const normalizedPatch = normalizeAdminBookingApprovalPatch(patch, nextBooking);
    nextBooking = { ...nextBooking, ...normalizedPatch };

    try {
      await updateBookingInSupabase(nextBooking);
      notifyAdminTelegram("booking_modified", { bookingId: id, newBooking: nextBooking, oldBooking });
      setDays((current) =>
        current.map((day) => ({
          ...day,
          bookings: day.bookings.map((booking) => (booking.id === id ? { ...booking, ...patch } : booking)),
        }))
      );
      return nextBooking;
    } catch (error) {
      window.alert(error.message || "Could not update this appointment.");
      return null;
    }
  }

  async function duplicateBookingAcrossDays(id) {
    let sourceDay = null;
    let sourceBooking = null;

    for (const day of days) {
      const booking = day.bookings.find((item) => item.id === id);
      if (booking) {
        sourceDay = day;
        sourceBooking = booking;
        break;
      }
    }

    if (!sourceDay || !sourceBooking) return null;

    try {
      const insertedRow = await duplicateBookingInSupabase({ ...sourceBooking, dateValue: sourceDay.dateValue });
      const duplicate = {
        ...sourceBooking,
        id: String(insertedRow?.id),
        start: minutesToTime(typeof sourceBooking.start === "string" ? timeToMinutes(sourceBooking.start) : sourceBooking.start),
      };

      setDays((current) =>
        current.map((day) => (day.id === sourceDay.id ? { ...day, bookings: [...day.bookings, duplicate] } : day))
      );
      return duplicate;
    } catch (error) {
      window.alert(error.message || "Could not duplicate this appointment.");
      return null;
    }
  }

  async function deleteBookingAcrossDays(id) {
    const confirmed = window.confirm("Delete this appointment?");
    if (!confirmed) return;

    try {
      const deletedBooking = days.flatMap((day) => day.bookings).find((booking) => booking.id === id);
      await deleteBookingFromSupabase(id);
      if (deletedBooking) notifyAdminTelegram("booking_cancelled", { booking: deletedBooking, cancellationStatus: "deleted by admin" });
      setDays((current) =>
        current.map((day) => ({
          ...day,
          bookings: day.bookings.filter((booking) => booking.id !== id),
        }))
      );
    } catch (error) {
      window.alert(error.message || "Could not delete this appointment.");
    }
  }

  function resetCurrentDay() {
    updateSelectedDay(() => ({
      settings: { ...DEFAULT_DAY_SETTINGS, dateLabel: selectedDay.label, anchorReleaseEnabled: false },
      bookings: selectedDayIndex === 0 ? SAMPLE_BOOKINGS : [],
    }));
  }

  function resetStoredData() {
    const confirmed = window.confirm("Are you sure you want to clear all stored bookings and waitlist data?");
    if (!confirmed) return;

    removeStoredValue(BOOKINGS_STORAGE_KEY);
    removeStoredValue(WAITLIST_STORAGE_KEY);
    setDays(emptyInitialDays());
    setWaitlistEntries([]);
    setClientSelectedSlot(null);
    setClientBookingMessage("");
    resetClientConfirmGuard();
  }

  return (
    <>
    <main className={activeView === "client" ? "app-shell client-app-shell" : "admin-root"}>
      {false && activeView === "admin" && (
      <header className="hero">
        <div>
          <p className="eyebrow">Vad Massage</p>
          <h1>{activeView === "admin" ? "Admin dashboard for a mobile massage flow" : "Simple mobile massage booking"}</h1>
          <p className="hero-copy">
            {activeView === "admin"
              ? "Preview Flexible Mode against Optimized Mode, including visible travel buffers and the current flow edge slots."
              : "Choose a service, pick a duration, and book one of the available times."}
          </p>
          <div className="view-switcher" aria-label="Choose app view">
            <button
              className={activeView === "admin" ? "view-button active-view" : "view-button"}
              type="button"
              onClick={() => setActiveView("admin")}
            >
              Admin dashboard
            </button>
            <button
              className={activeView === "client" ? "view-button active-view" : "view-button"}
              type="button"
              onClick={() => setActiveView("client")}
            >
              Client booking
            </button>
          </div>
        </div>
        <div className="mode-card">
          {activeView === "admin" ? (
            <>
              <span>Day Mode</span>
              <strong>{settings.mode === "optimized" ? "Optimized Mode" : "Flexible Mode"}</strong>
              <small>{settings.mode === "optimized" ? "Attach before or after the current flow." : "Show all valid slots inside working hours."}</small>
            </>
          ) : (
            <>
              <span>Booking</span>
              <strong>{clientDuration} minutes</strong>
              <small>{clientServiceId ? serviceNameFor(services, clientServiceId) : "No service selected"}</small>
            </>
          )}
        </div>
      </header>
      )}

      {activeView === "client" ? (
        <ClientBookingInterface
          coverageZones={coverageZones}
          days={days}
          serviceAreas={serviceAreas}
          services={services}
          serviceDetails={serviceDetails}
          enhancements={enhancements}
          waitlistEntries={waitlistEntries}
          clientDayIndex={clientDayIndex}
          setClientDayIndex={setClientDayIndex}
          clientServiceId={clientServiceId}
          setClientServiceId={setClientServiceId}
          clientDuration={clientDuration}
          setClientDuration={setClientDuration}
          clientSelectedSlot={clientSelectedSlot}
          setClientSelectedSlot={setClientSelectedSlot}
          clientBookingMessage={clientBookingMessage}
          setClientBookingMessage={setClientBookingMessage}
          clientIsConfirming={clientIsConfirming}
          resetClientConfirmGuard={resetClientConfirmGuard}
          onConfirmBooking={confirmClientBooking}
          waitlistForm={waitlistForm}
          setWaitlistForm={setWaitlistForm}
          waitlistFormOpen={waitlistFormOpen}
          setWaitlistFormOpen={setWaitlistFormOpen}
          onJoinWaitlist={joinWaitlist}
          onAcceptOffer={acceptWaitlistOffer}
          onCancelWaitlist={cancelWaitlistRequest}
          onChangeClientWeek={changeClientVisibleWeek}
          clientSession={authSession}
          clientProfile={clientProfile}
          clientBookingContext={clientBookingContext}
          clientBookingContextLoading={clientBookingContextLoading}
          clientAuthLoading={authLoading}
          clientAuthError={clientAuthError}
          onGoogleLogin={handleClientGoogleLogin}
          onClientSignOut={handleClientSignOut}
          isMobilePreviewFrame={isMobilePreviewFrame}
          onSwitchAdmin={() => setActiveView("admin")}
        />
      ) : (
        <>
          {(authLoading || passwordRecovery || !adminSession) ? (
            <AdminLogin
              authError={adminAuthError}
              authLoading={authLoading}
              onBackClient={() => setActiveView("client")}
              onLogin={handleAdminLogin}
              onLogout={handleAdminLogout}
              onRequestPasswordRecovery={handleAdminPasswordRecovery}
              onUpdatePassword={handleAdminPasswordUpdate}
              passwordRecovery={passwordRecovery}
              session={adminSession}
            />
          ) : (
            <>
              <AdminLogin
                authError={adminAuthError}
                authLoading={authLoading}
                onBackClient={() => setActiveView("client")}
                onLogin={handleAdminLogin}
                onLogout={handleAdminLogout}
                onRequestPasswordRecovery={handleAdminPasswordRecovery}
                onUpdatePassword={handleAdminPasswordUpdate}
                passwordRecovery={passwordRecovery}
                session={adminSession}
              />
              <AdminWorkspace
                bookings={bookings}
                coverageZones={coverageZones}
                days={days}
                enhancements={enhancements}
                serviceAreas={serviceAreas}
                onCloseWaitlistRequest={closeWaitlistRequest}
                onCreateAppointment={createAdminAppointment}
                onCreatePersonalEvent={createAdminPersonalEvents}
                onDeleteBooking={deleteBookingAcrossDays}
                onDuplicateBooking={duplicateBookingAcrossDays}
                onAddEnhancement={addEnhancement}
                onDeleteEnhancement={deleteEnhancement}
                onUpdateEnhancement={updateEnhancement}
                onUpdateCoverageZone={updateCoverageZone}
                onAddServiceArea={addServiceArea}
                onDeleteServiceArea={deleteServiceArea}
                onUpdateServiceArea={updateServiceArea}
                onResetCurrentDay={resetCurrentDay}
                onResetStoredData={resetStoredData}
                onSendWaitlistOffer={sendWaitlistOffer}
                onServiceDetailChange={(serviceId, patch) =>
                  setServiceDetails((current) => ({
                    ...current,
                    [serviceId]: {
                      ...(current[serviceId] ?? {}),
                      ...patch,
                    },
                  }))
                }
                onServiceNameChange={(serviceId, name) =>
                  setServices((current) =>
                    current.map((item) => (item.id === serviceId ? { ...item, name } : item))
                  )
                }
                onServiceVisibilityChange={(serviceId) =>
                  setServices((current) =>
                    current.map((item) => (item.id === serviceId ? { ...item, visible: !item.visible } : item))
                  )
                }
                onSetActiveView={setActiveView}
                onSetSelectedDayIndex={setSelectedDayIndex}
                onUpdateBooking={updateBookingAcrossDays}
                onUpdateSetting={updateSetting}
                preview={preview}
                requestedDuration={requestedDuration}
                requestedTravelBuffer={requestedTravelBuffer}
                selectedDay={selectedDay}
                selectedDayIndex={selectedDayIndex}
                services={services}
                serviceDetails={serviceDetails}
                settings={settings}
                waitlistEntries={waitlistEntries}
              />
            </>
          )}
          {false && (
      <section className="dashboard-grid">
        <section className="panel week-panel">
          <div className="section-heading row-heading">
            <div>
              <p className="eyebrow">Week View</p>
              <h2>Choose a day</h2>
            </div>
            <button type="button" className="danger-button compact-button" onClick={resetStoredData}>Reset stored data</button>
          </div>
          <div className="week-strip">
            {days.map((day, index) => {
              const dayPreview = getSchedulingPreview({
                settings: day.settings,
                bookings: day.bookings,
                requestedDuration,
                requestedTravelBuffer,
              });

              return (
                <button
                  className={index === selectedDayIndex ? "day-pill active-day" : "day-pill"}
                  key={day.id}
                  type="button"
                  onClick={() => setSelectedDayIndex(index)}
                >
                  <strong>{day.label}</strong>
                  <span>{day.settings.mode === "optimized" ? "Optimized" : "Flexible"}</span>
                  <small>{day.bookings.length} bookings / {dayPreview.slots.length} next slots</small>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="panel controls-panel">
          <div className="section-heading">
            <p className="eyebrow">Day Settings</p>
            <h2>{selectedDay.label} working rules</h2>
          </div>

          <label>
            Working start
            <input type="time" value={settings.workingStart} onChange={(event) => updateSetting("workingStart", event.target.value)} />
          </label>
          <label>
            Working end
            <input type="time" value={settings.workingEnd} onChange={(event) => updateSetting("workingEnd", event.target.value)} />
          </label>
          <label>
            Day Mode
            <select value={settings.mode} onChange={(event) => updateSetting("mode", event.target.value)}>
              <option value="flexible">Flexible Mode</option>
              <option value="optimized">Optimized Mode</option>
            </select>
          </label>
          <label>
            Start of Day
            <select value={settings.startMode} onChange={(event) => updateSetting("startMode", event.target.value)}>
              <option value="flexible">Flexible Start</option>
              <option value="fixed">Fixed Start</option>
            </select>
          </label>
          <label>
            Fixed Start time
            <input type="time" value={settings.fixedStart} onChange={(event) => updateSetting("fixedStart", event.target.value)} />
          </label>
          <label className="toggle-row setting-toggle">
            <input
              type="checkbox"
              checked={Boolean(settings.anchorReleaseEnabled)}
              onChange={(event) => updateSetting("anchorReleaseEnabled", event.target.checked)}
            />
            <span>Anchor release enabled</span>
          </label>
          <label>
            Anchor release time
            <input
              type="time"
              value={settings.releaseTime}
              disabled={!settings.anchorReleaseEnabled}
              onChange={(event) => updateSetting("releaseTime", event.target.value)}
            />
          </label>
          <div className="anchor-state-card">
            <span>Anchor state</span>
            <strong>{anchorState}</strong>
            <small>anchor time: {settings.fixedStart}</small>
            <small>release time: {settings.anchorReleaseEnabled ? settings.releaseTime : "disabled"}</small>
          </div>
        </aside>

        <section className="panel services-panel">
          <div className="section-heading">
            <p className="eyebrow">Services</p>
            <h2>Show or hide</h2>
          </div>
          <div className="service-list">
            {services.map((service) => (
              <label className="toggle-row" key={service.id}>
                <input
                  type="checkbox"
                  checked={service.visible}
                  onChange={() =>
                    setServices((current) =>
                      current.map((item) => (item.id === service.id ? { ...item, visible: !item.visible } : item))
                    )
                  }
                />
                <span>{service.name}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="panel request-panel">
          <div className="section-heading">
            <p className="eyebrow">Engine Preview</p>
            <h2>Requested booking</h2>
          </div>
          <label>
            Service selection
            <select
              value={visibleServices.some((service) => service.id === selectedServiceId) ? selectedServiceId : visibleServices[0]?.id ?? ""}
              disabled={visibleServices.length === 0}
              onChange={(event) => setSelectedServiceId(event.target.value)}
            >
              {visibleServices.map((service) => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </select>
          </label>
          <label>
            Duration selection
            <select value={requestedDuration} onChange={(event) => setRequestedDuration(Number(event.target.value))}>
              {VALID_DURATIONS.map((duration) => (
                <option key={duration} value={duration}>{duration} minutes</option>
              ))}
            </select>
          </label>
          <label>
            Travel buffer adjustment
            <input
              type="number"
              min="0"
              step="15"
              value={requestedTravelBuffer}
              onChange={(event) => setRequestedTravelBuffer(Number(event.target.value))}
            />
          </label>
          <div className="button-row">
            <button type="button" className="ghost-button" onClick={() => setRequestedTravelBuffer(0)}>Set buffer to 0</button>
            <button type="button" className="ghost-button" onClick={() => setRequestedTravelBuffer(DEFAULT_TRAVEL_BUFFER)}>Default 60m</button>
          </div>
          <div className="request-summary">
            <div>
              <span>session duration</span>
              <strong>{requestedDuration}m</strong>
            </div>
            <div>
              <span>travel buffer</span>
              <strong>{requestedTravelBuffer}m</strong>
            </div>
            <div>
              <span>total block length</span>
              <strong>{totalRequestedBlock}m</strong>
            </div>
          </div>
          <label className="toggle-row setting-toggle">
            <input
              type="checkbox"
              checked={showInvalidSlots}
              onChange={(event) => setShowInvalidSlots(event.target.checked)}
            />
            <span>Show invalid slots</span>
          </label>
        </section>

        <Timeline settings={settings} bookings={bookings} previewSlots={preview.slots} />

        <section className="panel flow-panel">
          <div className="section-heading">
            <p className="eyebrow">Current Flow</p>
            <h2>Flow start and flow end</h2>
          </div>
          {preview.flow.hasBookings ? (
            <>
              <p className="current-flow-line">Current flow: {minutesToTime(preview.flow.flowStart)} &rarr; {minutesToTime(preview.flow.flowEnd)}</p>
              <div className="flow-stats">
                <div><span>flow start</span><strong>{minutesToTime(preview.flow.flowStart)}</strong></div>
                <div><span>flow end</span><strong>{minutesToTime(preview.flow.flowEnd)}</strong></div>
              </div>
            </>
          ) : (
            <p className="muted-copy">No bookings yet. Optimized Mode follows empty day rules until the first booking is made.</p>
          )}
          <div className="slot-list">
            <p className="list-label">Returned available slots</p>
            {preview.slots.length === 0 && <p className="muted-copy">No valid next slots for this request inside the current working hours.</p>}
            {preview.slots.map((slot) => (
              <article className="slot-card" key={`${slot.label}-${slot.start}`}>
                <div className="slot-card-top">
                  <span>{slot.label}</span>
                  <b>{slotPositionLabel(slot)}</b>
                </div>
                <strong>{formatRange(slot.start, slot.end)}</strong>
                <small>travel buffer: {slot.travelBuffer}m / buffer ends {minutesToTime(slot.bufferEnd)}</small>
                <dl className="slot-detail-grid">
                  <div>
                    <dt>start time</dt>
                    <dd>{minutesToTime(slot.start)}</dd>
                  </div>
                  <div>
                    <dt>booking time range</dt>
                    <dd>{formatRange(slot.start, slot.end)}</dd>
                  </div>
                  <div>
                    <dt>travel time range</dt>
                    <dd>{getTravelRange(slot)}</dd>
                  </div>
                  <div>
                    <dt>connection point to flow</dt>
                    <dd>{getSlotConnection(slot, preview.flow)}</dd>
                  </div>
                </dl>
                <small>{slot.reason}</small>
                <button type="button" onClick={() => addBookingAt(slot.start)}>Add booking here</button>
              </article>
            ))}
            {showInvalidSlots && invalidSlots.map((slot) => (
              <article className="slot-card invalid-slot-card" key={`invalid-${slot.label}-${slot.start}`}>
                <div className="slot-card-top">
                  <span>{slot.label}</span>
                  <b>rejected</b>
                </div>
                <strong>{minutesToTime(slot.start)} candidate</strong>
                <small>reason: {slot.rejectedReason}</small>
                <dl className="slot-detail-grid">
                  <div>
                    <dt>start time</dt>
                    <dd>{minutesToTime(slot.start)}</dd>
                  </div>
                  <div>
                    <dt>booking time range</dt>
                    <dd>{formatRange(slot.start, slot.end)}</dd>
                  </div>
                  <div>
                    <dt>travel time range</dt>
                    <dd>{getTravelRange(slot)}</dd>
                  </div>
                  <div>
                    <dt>connection point to flow</dt>
                    <dd>{getSlotConnection(slot, preview.flow)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section className="panel bookings-panel">
          <div className="section-heading row-heading">
            <div>
              <p className="eyebrow">Bookings</p>
              <h2>{selectedDay.label} bookings</h2>
            </div>
            <button type="button" className="ghost-button" onClick={resetCurrentDay}>Reset day</button>
          </div>
          <div className="manual-add">
            <div className="add-booking-summary">
              <span>Add booking</span>
              <strong>{serviceNameFor(services, selectedServiceId)}</strong>
              <small>{requestedDuration}m session / {requestedTravelBuffer}m travel buffer</small>
            </div>
            <label>
              Start time
              <input type="time" value={manualStart} onChange={(event) => setManualStart(event.target.value)} />
            </label>
            <button type="button" disabled={visibleServices.length === 0} onClick={() => addBookingAt(timeToMinutes(manualStart))}>Add booking</button>
          </div>
          <div className="booking-list">
            {sortedBookings.map((booking) => (
              <article className="booking-editor" key={booking.id}>
                <div className="booking-editor-title">
                  <span>Edit booking</span>
                  <strong>{formatRange(booking.start, booking.sessionEnd)}</strong>
                </div>
                <label>
                  Service
                  <select
                    value={booking.serviceId}
                    onChange={(event) => {
                      const serviceId = event.target.value;
                      updateBooking(booking.id, { serviceId, serviceName: serviceNameFor(services, serviceId) });
                    }}
                  >
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>{service.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Start
                  <input type="time" value={minutesToTime(booking.start)} onChange={(event) => updateBooking(booking.id, { start: event.target.value })} />
                </label>
                <label>
                  Duration
                  <select value={booking.duration} onChange={(event) => updateBooking(booking.id, { duration: Number(event.target.value) })}>
                    {VALID_DURATIONS.map((duration) => (
                      <option key={duration} value={duration}>{duration} minutes</option>
                    ))}
                  </select>
                </label>
                <label>
                  Travel buffer
                  <input type="number" min="0" step="15" value={booking.travelBuffer} onChange={(event) => updateBooking(booking.id, { travelBuffer: Number(event.target.value) })} />
                </label>
                <div className="booking-actions">
                  <button type="button" className="ghost-button compact-button" onClick={() => updateBooking(booking.id, { travelBuffer: 0 })}>Buffer 0</button>
                  <button type="button" className="ghost-button compact-button" onClick={() => updateBooking(booking.id, { travelBuffer: DEFAULT_TRAVEL_BUFFER })}>Default 60m</button>
                  <button type="button" className="danger-button compact-button" onClick={() => removeBooking(booking.id)}>Delete booking</button>
                </div>
              </article>
            ))}
          </div>
        </section>
        <WaitlistPanel
          waitlistEntries={waitlistEntries}
          days={days}
          services={services}
          displayDayName={displayDayName}
          getEffectiveWaitlistStatus={getEffectiveWaitlistStatus}
          slotMatchesWaitlistRequest={slotMatchesWaitlistRequest}
          onSendOffer={sendWaitlistOffer}
          onCloseRequest={closeWaitlistRequest}
        />
      </section>
          )}
        </>
      )}
    </main>
    {!isMobilePreviewFrame && (
      <>
        <button type="button" className="mobile-preview-trigger square-green-action" onClick={() => setMobilePreviewOpen(true)}>
          Mobile
        </button>
        {mobilePreviewOpen && (
          <div className="mobile-preview-backdrop" role="presentation">
            <section className="mobile-preview-panel" role="dialog" aria-modal="true" aria-label="Mobile preview">
              <header>
                <div>
                  <p>Temporary preview</p>
                  <h2>{activeView === "admin" ? "Admin mobile" : "Client mobile"}</h2>
                </div>
                <button type="button" onClick={() => setMobilePreviewOpen(false)}>Close</button>
              </header>
              <div className="mobile-device-frame">
                <iframe title="Mobile app preview" src={mobilePreviewUrl} />
              </div>
            </section>
          </div>
        )}
      </>
    )}
    </>
  );
}

export default App;
export {
  bookingToSupabasePayload,
  bookingToLegacySupabasePayload,
  normalizeStoredBooking,
};



