import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Dumbbell,
  Info,
  Landmark,
  LockKeyhole,
  Mail,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Star,
  Settings as SettingsIcon,
  Sun,
  X,
  UserRound,
  WalletCards,
} from "lucide-react";
import {
  DEFAULT_DAY_SETTINGS,
  DEFAULT_SERVICES,
  DEFAULT_TRAVEL_BUFFER,
  CLIENT_MINIMUM_BOOKING_NOTICE_MINUTES,
  SLOT_INCREMENT,
  VALID_DURATIONS,
  addDaysToPlainDateValue,
  createBooking,
  dateValueInTimeZone,
  daysBetweenPlainDateValues,
  filterClientBookableSlots,
  getBookingBlocks,
  getFlow,
  getSchedulingPreview,
  isValidDuration,
  minutesToTime,
  minutesInTimeZone,
  normalizePlainDateValue,
  roundUpToSlotIncrement,
  rangesOverlap,
  timeToMinutes,
} from "./schedulingEngine.js";
import { getServiceAreaFees } from "./lib/serviceAreas.js";
import {
  buildBookingClientLink,
  buildBookAgainPrefill,
  ensureCurrentClientBookingAddress,
  getCurrentClientProfile,
  groupClientPortalBookings,
  linkRecentGuestBookingToCurrentClient,
  listCurrentClientPortalBookings,
  loadCurrentClientBookingContext,
  normalizeClientPortalBooking,
  profileInputFromAuthUser,
  shouldShowPostBookingGoogleSaveCta,
  updateCurrentClientBookingDefaults,
  upsertCurrentClientProfile,
} from "./lib/clientData.js";
import {
  bookingToSupabasePayload,
  bookingToLegacySupabasePayload,
  generateBookingReference,
  normalizeStoredBooking,
  paymentMethodToBookingStatus,
  paymentMethodToPaymentStatus,
  normalizeAdminBookingApprovalPatch,
  supabaseRowToStorageBooking,
} from "./lib/bookingPersistence.js";
import {
  saveAdminPersonalEventToSupabase,
  saveBookingToSupabase,
  loadSessionPreferencesFromSupabase,
  updateAdminPersonalEventInSupabase,
  updateBookingInSupabase,
  cancelRecentBookingRequestInSupabase,
  saveSessionPreferencesOrderToSupabase,
  saveSessionPreferenceToSupabase,
  getSupabaseClient,
  getPublicSupabaseClient,
} from "./lib/bookingSupabase.js";
import {
  cacheWeeklyWorkingSchedule,
  deleteWorkingHoursOverrideFromSupabase,
  loadAndCacheWeeklyWorkingScheduleFromSupabase,
  loadWorkingHoursOverridesFromSupabase,
  readCachedWeeklyWorkingSchedule,
  saveWorkingHoursOverrideToSupabase,
  saveWeeklyWorkingScheduleToSupabase,
} from "./lib/workingHoursSupabase.js";
import {
  addExpense,
  deleteExpense,
  DEFAULT_FINANCIAL_SETTINGS,
  EXPENSE_CATEGORIES,
  normalizeFinancialSettings,
  sanitizeExpenses,
  updateExpense,
  updateFinancialSettings,
} from "./lib/financialAnalytics.js";
import {
  shouldAutoReleaseReservation,
  shouldShowReservationInactivityModal,
} from "./lib/clientReservationInactivity.js";
import {
  DEFAULT_COVERAGE_ZONES,
  getPostcodeArea,
  getPostcodeCoverage,
  normalizePostcodeAreaList,
  sanitizeCoverageZones,
} from "./lib/coverageZones.js";
import {
  CLIENT_TREATMENT_CARD_DETAILS,
  getClientTreatmentCardDetails,
  getServiceIconFromText,
} from "./lib/clientTreatmentCards.js";
import {
  customerInitials,
  serviceAbbreviation,
} from "./lib/customerDisplay.js";
import { bookingHoldErrorMessage } from "./lib/bookingHoldErrors.js";
import { getFrontendBankTransferDetails } from "./lib/bankTransferDetails.js";
import {
  SESSION_PREFERENCE_CATEGORIES,
  SESSION_PREFERENCES,
  sanitizeSessionPreferences,
  sessionPreferenceSnapshots,
  sessionPreferenceLabels,
  toggleSessionPreferenceId,
  visibleSessionPreferences as getVisibleSessionPreferences,
} from "./lib/sessionPreferences.js";
import {
  WEEKLY_WORKING_DAY_KEYS,
  WEEKLY_WORKING_DAY_LABELS,
  applyHoursToWorkingDays,
  applyWorkingHoursOverridesToDays,
  copyWeeklyDaySettings,
  dateWorkingHoursOverridePayload,
  defaultWeeklyWorkingSchedule,
  normalizeWeeklyWorkingSchedule,
  resetWeeklyWorkingDay,
  resolveWorkingHoursSettingsForDate,
  validateWeeklyWorkingSchedule,
  weeklySettingsForDateValue,
} from "./lib/weeklyWorkingSchedule.js";
import { buildTelegramStartUrl, normalizeTelegramBotUrl } from "./lib/telegramLinks.js";
import { ClientEmailSignInForm } from "./components/Client/ClientAccountPanel.jsx";
import { ClientOnboarding } from "./components/Client/ClientOnboarding.jsx";
import { useServiceAreaSettings } from "./hooks/useServiceAreaSettings.js";
import { useClientBookingAccess } from "./hooks/useClientBookingAccess.js";
import { clientAccessErrorMessage, requireClientBookingAccess } from "./lib/clientAccess.js";
import { MyBookingsPanel } from "./components/Client/MyBookingsPanel.jsx";
import { AdminLogin } from "./components/Admin/AdminLogin.jsx";
import {
  ClientDetailsStep,
  ClientDurationStep,
  ClientLocationStep,
  ClientTimeStep,
  ClientTreatmentStep,
} from "./components/Booking/ClientBookingFlowScreens.jsx";
import { BookingTopbar } from "./components/Booking/BookingTopbar.jsx";
import { Timeline } from "./components/Calendar/Timeline.jsx";
import { WaitlistPanel } from "./components/Waitlist/WaitlistPanel.jsx";
import { AdminPanelErrorBoundary } from "./components/system/AdminPanelErrorBoundary.jsx";
import { RuntimeDiagnosticOverlay } from "./components/system/RuntimeDiagnosticOverlay.jsx";
import { SETTINGS_NAVIGATION } from "./config/adminSettingsNavigation.js";
import { DEFAULT_DOCUMENT_SETTINGS } from "./config/documentSettings.js";
import {
  DEFAULT_PERSONAL_EVENT_COLOR,
  PERSONAL_EVENT_COLORS,
  personalEventColorClass,
} from "./config/personalEventColors.js";
import {
  BOOKING_HOLD_CLIENT_KEY_STORAGE_KEY,
  BOOKINGS_STORAGE_KEY,
  CLIENT_NOTES_STORAGE_KEY,
  CLIENT_PROFILES_STORAGE_KEY,
  COVERAGE_ZONES_STORAGE_KEY,
  DOCUMENT_SETTINGS_STORAGE_KEY,
  ENHANCEMENTS_STORAGE_KEY,
  EXPENSES_STORAGE_KEY,
  FINANCIAL_SETTINGS_STORAGE_KEY,
  SERVICE_CATALOGUE_MIGRATION_KEY,
  SERVICE_DETAILS_STORAGE_KEY,
  SERVICES_STORAGE_KEY,
  SESSION_PREFERENCES_STORAGE_KEY,
  WAITLIST_STORAGE_KEY,
} from "./config/storageKeys.js";
import {
  DAY_SETTINGS_TIME_OPTIONS,
  WEEK_DAYS,
  addDaysToDateValue,
  dateValueForOffset,
  dayNumberLabel,
  daysBetweenDateValues,
  formatClock,
  formatRange,
  fullDateLabel,
  isPastDate,
  isValidDateValue,
  monthRangeLabel,
  monthShortLabel,
  monthValueForDate,
  todayValue,
  weekStartDateValue,
  weekdayLabelFromDateValue,
  yearShortLabel,
} from "./lib/dateTime.js";
import {
  clearRecentGuestBookingContext,
  cloneValue,
  readRecentGuestBookingContext,
  readStoredJson,
  removeStoredValue,
  sanitizeClientNotes,
  sanitizeClientProfiles,
  sanitizeDocumentSettings,
  storeRecentGuestBookingContext,
  writeStoredJson,
} from "./lib/localStorage.js";
import {
  notifyAdminTelegram,
  postTelegramTest,
  postTransactionalEmail,
  telegramTestErrorMessage,
} from "./lib/notifications.js";
import { buildClientAuthRedirectUrl } from "./lib/authRedirect.js";
import {
  getClientEnhancements,
  sanitizeStoredEnhancements,
} from "./lib/enhancementSettings.js";
import {
  enhancementSeedForUninitializedSupabase,
  loadAndCacheEnhancementsFromSupabase,
  readCachedEnhancements,
  saveEnhancementsToSupabase,
} from "./lib/enhancementSupabase.js";
import massageTreatmentImage from "./assets/massage-treatment-optimized.jpg";
import "./styles/app.css";

const LiveAdminWorkspace = React.lazy(() => import("./components/Admin/LiveAdminWorkspace.jsx").then((module) => ({ default: module.LiveAdminWorkspace })));

const SAMPLE_BOOKINGS = [
  {
    id: "booking-1",
    serviceId: "massage",
    serviceName: "Massage",
    start: "10:00",
    duration: 90,
    travelBuffer: 60,
  },
  {
    id: "booking-2",
    serviceId: "soft-tissue-therapy",
    serviceName: "Soft Tissue Therapy",
    start: "12:30",
    duration: 60,
    travelBuffer: 45,
  },
];

const AGENDA_EMPTY_FUTURE_DAYS = 90;
const ADMIN_BOOKING_LOAD_PAST_DAYS = 365;
const ADMIN_BOOKING_LOAD_FUTURE_DAYS = 730;
const ADMIN_APPOINTMENT_SLOT_INCREMENT = 15;
const THREE_DAY_SCROLL_PAST_DAYS = 180;
const THREE_DAY_SCROLL_FUTURE_DAYS = 365;
const CURRENT_SERVICE_CATALOGUE_VERSION = "2026-07-new-service-structure";
const CLIENT_TELEGRAM_BOT_URL = normalizeTelegramBotUrl(import.meta.env.VITE_TELEGRAM_BOT_URL);
if (!CLIENT_TELEGRAM_BOT_URL) console.warn("Client Telegram updates unavailable: configure VITE_TELEGRAM_BOT_URL with the public bot URL.");
const DEFAULT_SESSION_PREFERENCE_DRAFT = {
  category: "Focus area",
  conflictIds: [],
  id: "",
  label: "",
  sortOrder: 1,
  visible: true,
};
const WAITLIST_NO_PREFERENCE = "No preference";
const WAITLIST_TIME_MODE_OPTIONS = [
  { value: "none", label: WAITLIST_NO_PREFERENCE },
  { value: "exact", label: "At a specific time" },
  { value: "window", label: "Within a time range" },
];
const WAITLIST_DATE_MODE_OPTIONS = [
  { value: "single", label: "One preferred date" },
  { value: "range", label: "A date range" },
  { value: "any", label: "Any suitable date" },
];
const WAITLIST_TIME_OPTIONS = Array.from(
  { length: Math.floor(((20 - 9) * 60) / 30) + 1 },
  (_, index) => minutesToTime(9 * 60 + index * 30)
);
const WAITLIST_RANGE_FROM_OPTIONS = WAITLIST_TIME_OPTIONS.slice(0, -1);
const DEFAULT_WAITLIST_TIME = WAITLIST_TIME_OPTIONS[0];
const DEFAULT_WAITLIST_RANGE_END = WAITLIST_TIME_OPTIONS[1];

function friendlyClientAuthError(error, fallback) {
  const message = String(error?.message || error || "").trim();
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("unsupported provider") || lowerMessage.includes("provider is not enabled")) {
    return "Google sign-in is not enabled yet. Please use email sign-in.";
  }

  if (lowerMessage.includes("email") && lowerMessage.includes("not enabled")) {
    return "Email sign-in is not enabled yet. Please contact Vad for help signing in.";
  }

  return fallback || message || "Sign-in could not be started.";
}

function getBookingHoldClientKey() {
  const createKey = () => (
    crypto.randomUUID
      ? crypto.randomUUID()
      : `hold-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
  );

  try {
    const storedValue = window.localStorage.getItem(BOOKING_HOLD_CLIENT_KEY_STORAGE_KEY);
    if (storedValue && /^[A-Za-z0-9:_-]{20,120}$/.test(storedValue)) return storedValue;

    const nextValue = createKey();
    window.localStorage.setItem(BOOKING_HOLD_CLIENT_KEY_STORAGE_KEY, nextValue);
    return nextValue;
  } catch {
    return createKey();
  }
}

function confirmedAppointmentToClientPortalBooking(appointment = {}, userId = "") {
  const startMinutes = typeof appointment.start === "number"
    ? appointment.start
    : timeToMinutes(appointment.start);

  return normalizeClientPortalBooking({
    address: appointment.address,
    booking_reference: appointment.bookingReference || appointment.paymentReference,
    cancelled_at: appointment.cancelledAt,
    cancelled_by: appointment.cancelledBy,
    cancellation_window: appointment.cancellationWindow,
    client_email: appointment.customerEmail,
    client_name: appointment.clientName,
    client_phone: appointment.customerPhone,
    congestion_fee: appointment.congestionFee,
    date: appointment.dateValue,
    duration_minutes: appointment.duration,
    id: appointment.id,
    order_id: appointment.orderId,
    payment_hold_expires_at: appointment.paymentHoldExpiresAt,
    payment_id: appointment.paymentId,
    payment_method: appointment.paymentMethod,
    payment_reference: appointment.paymentReference || appointment.bookingReference,
    payment_status: appointment.paymentStatus,
    price: appointment.price ?? appointment.total,
    saved_address_id: appointment.savedAddressId,
    selected_area: appointment.selectedAreaName || appointment.location,
    selected_services: appointment.items?.length
      ? appointment.items.map((item) => ({
          durationMinutes: item.minutes || item.durationMinutes,
          id: item.id || item.serviceId,
          name: item.name || item.serviceName,
          price: item.price,
        }))
      : undefined,
    service_id: appointment.serviceId,
    service_name: appointment.serviceName,
    start_minutes: startMinutes,
    status: appointment.status,
    travel_fee: appointment.travelFee,
    user_id: appointment.userId || userId,
  });
}

function mergeClientPortalBookings(serverBookings = [], optimisticBookings = []) {
  const merged = new Map();
  optimisticBookings.filter(Boolean).forEach((booking) => {
    if (booking.id) merged.set(booking.id, booking);
  });
  serverBookings.filter(Boolean).forEach((booking) => {
    if (booking.id) merged.set(booking.id, booking);
  });
  return [...merged.values()];
}

function isMissingBookingHoldRpc(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    error?.code === "PGRST202" ||
    (message.includes("create_booking_hold") && message.includes("schema cache")) ||
    (message.includes("function") && message.includes("create_booking_hold") && message.includes("not"))
  );
}

const BOOKING_HOLD_UNAVAILABLE_MESSAGE =
  "I can't reserve this time because the booking hold update has not been applied to the database yet. Please contact me directly while I finish the update.";

function authRedirectParamsFromWindow() {
  if (typeof window === "undefined") return new URLSearchParams();

  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    hashParams.forEach((value, key) => {
      if (!params.has(key)) params.set(key, value);
    });
  }

  return params;
}

function isPasswordRecoveryRedirect() {
  const params = authRedirectParamsFromWindow();
  if (params.get("type") === "recovery") return true;
  if (params.has("recovery_token")) return true;

  return params.get("view") === "admin" && params.has("code");
}

const BOOKING_CONFIRM_TIMEOUT_MS = 15000;

function logBookingConfirmation(stage, error = null) {
  if (error) {
    const payload = {
      code: error?.code || null,
      name: error?.name || "Error",
    };
    if (import.meta.env.DEV) {
      payload.message = error?.message || String(error);
      payload.details = error?.details || null;
      payload.hint = error?.hint || null;
    }
    console.error(`[booking-confirm] ${stage}`, payload);
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

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function cleanPaymentString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function inferBookingPaymentMethod(paymentMethod, paymentStatus, status) {
  const method = cleanPaymentString(paymentMethod);
  if (method) return method;
  if (paymentStatus === "cash_on_arrival") return "cash";
  if (paymentStatus === "awaiting_verification" || status === "pending_payment_verification") return "bank_transfer";
  return "";
}

function inferBookingPaymentStatus(paymentStatus, paymentMethod, status) {
  const currentStatus = cleanPaymentString(paymentStatus);
  if (currentStatus) return currentStatus;
  if (paymentMethod === "bank_transfer" || status === "pending_payment_verification") return "awaiting_verification";
  if (paymentMethod === "cash") return "cash_on_arrival";
  if (status === "cancelled") return "cancelled";
  return "";
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
  const bookingStatus = cleanPaymentString(booking.status) || "confirmed";
  const paymentMethod = inferBookingPaymentMethod(booking.paymentMethod, booking.paymentStatus, bookingStatus);
  const paymentStatus = inferBookingPaymentStatus(booking.paymentStatus, paymentMethod, bookingStatus);
  const bookingReference = cleanPaymentString(booking.bookingReference) || cleanPaymentString(booking.paymentReference);
  const paymentHoldExpiresAt = cleanPaymentString(booking.paymentHoldExpiresAt) || cleanPaymentString(booking.paymentExpiry) || null;

  return {
    address: typeof booking.address === "string" ? booking.address : "",
    congestionFee: isFiniteNumber(booking.congestionFee) ? Number(booking.congestionFee) : 0,
    clientName: typeof booking.clientName === "string" ? booking.clientName : "",
    customerEmail: typeof booking.customerEmail === "string" ? booking.customerEmail : "",
    customerPhone: typeof booking.customerPhone === "string" ? booking.customerPhone : "",
    eventColor: typeof booking.eventColor === "string" ? booking.eventColor : DEFAULT_PERSONAL_EVENT_COLOR,
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
    paymentMethod,
    paymentStatus,
    bookingReference,
    paymentReference: bookingReference,
    paymentExpiry: paymentHoldExpiresAt,
    paymentHoldExpiresAt,
    paymentReceivedAt: cleanPaymentString(booking.paymentReceivedAt) || null,
    cancelledAt: cleanPaymentString(booking.cancelledAt) || null,
    cancelledBy: cleanPaymentString(booking.cancelledBy),
    cancellationWindow: cleanPaymentString(booking.cancellationWindow),
    cashOnArrivalRequest: Boolean(booking.cashOnArrivalRequest || (paymentMethod === "cash" && paymentStatus === "cash_on_arrival")),
    price: isFiniteNumber(booking.price) ? Number(booking.price) : 0,
    serviceId: String(booking.serviceId),
    serviceName: String(booking.serviceName),
    status: bookingStatus,
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
    normalized.status,
    normalized.paymentStatus,
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
    eventColor: normalized.eventColor ?? DEFAULT_PERSONAL_EVENT_COLOR,
    userId: normalized.userId,
    savedAddressId: normalized.savedAddressId,
    id: normalized.id,
    items: normalized.items,
    isNewClient: normalized.isNewClient,
    kind: normalized.kind,
    location: normalized.location,
    orderId: normalized.orderId,
    paymentId: normalized.paymentId,
    paymentMethod: normalized.paymentMethod,
    paymentStatus: normalized.paymentStatus,
    bookingReference: normalized.bookingReference,
    paymentReference: normalized.paymentReference,
    paymentExpiry: normalized.paymentExpiry,
    paymentHoldExpiresAt: normalized.paymentHoldExpiresAt,
    paymentReceivedAt: normalized.paymentReceivedAt,
    cancelledAt: normalized.cancelledAt,
    cancelledBy: normalized.cancelledBy,
    cancellationWindow: normalized.cancellationWindow,
    cashOnArrivalRequest: normalized.cashOnArrivalRequest,
    price: normalized.price,
    travelFee: normalized.travelFee,
    congestionFee: normalized.congestionFee,
    serviceId: normalized.serviceId,
    serviceName: normalized.serviceName,
    status: normalized.status,
    telegramUpdates: normalized.telegramUpdates,
    start: minutesToTime(normalized.startMinutes),
    duration: normalized.duration,
    travelBuffer: normalized.travelBuffer,
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
    throw new Error(clientAccessErrorMessage(error) || `Could not create the checkout order: ${error.message}`);
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
  const supabase = await getPublicSupabaseClient();
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
  const clientKey = getBookingHoldClientKey();
  const holdDateValue = normalizePlainDateValue(dateValue);
  if (!holdDateValue) {
    throw new Error("Could not hold this time: Booking date is invalid.");
  }
  const { data, error } = await supabase.rpc("create_booking_hold", {
    hold_buffer_minutes: slot.travelBuffer ?? DEFAULT_TRAVEL_BUFFER,
    hold_client_key: clientKey,
    hold_date: holdDateValue,
    hold_duration_minutes: slot.duration,
    hold_start_minutes: slot.start,
  });

  if (error) {
    if (isMissingBookingHoldRpc(error)) {
      console.warn("Booking hold RPC is not available in this Supabase project. Apply the latest migration before taking client bookings.", {
        code: error?.code || null,
      });
      throw new Error(BOOKING_HOLD_UNAVAILABLE_MESSAGE);
    }

    throw new Error(clientAccessErrorMessage(error) || `Could not hold this time: ${error.message}`);
  }

  const hold = Array.isArray(data) ? data[0] : data;
  if (!hold?.hold_id || !hold?.hold_token) {
    throw new Error("Could not hold this time. Please choose another slot.");
  }

  return {
    clientKey,
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
    release_client_key: getBookingHoldClientKey(),
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

function displayDayName(days, dateValue) {
  const day = days.find((item) => item.dateValue === dateValue || item.label === dateValue);
  return day ? `${day.label} (${day.dateValue})` : dateValue;
}

function buildInitialDays() {
  const storedBookings = sanitizeStoredBookingsByDay(readStoredJson(BOOKINGS_STORAGE_KEY, {}));
  const weeklyWorkingSchedule = readCachedWeeklyWorkingSchedule();
  const baseDateValue = todayValue();

  return Array.from({ length: 7 }, (_, index) => {
    const dateValue = addDaysToDateValue(baseDateValue, index);
    const label = weekdayLabelFromDateValue(dateValue);
    const storedDayBookings = storedBookings[dateValue] ?? storedBookings[label.toLowerCase()] ?? [];

    return {
      id: `${label.toLowerCase()}-${dateValue}`,
      label,
      dateValue,
      hasDateOverride: false,
      settings: {
        ...weeklySettingsForDateValue(dateValue, weeklyWorkingSchedule),
        dateLabel: label,
      },
      bookings: Array.isArray(storedDayBookings)
        ? storedDayBookings.map(storageBookingToEngineBooking).filter(Boolean)
        : index === 0 ? cloneValue(SAMPLE_BOOKINGS) : [],
    };
  });
}

function buildDaysStarting(startDateValue, existingDays = []) {
  const storedBookings = sanitizeStoredBookingsByDay(readStoredJson(BOOKINGS_STORAGE_KEY, {}));
  const weeklyWorkingSchedule = readCachedWeeklyWorkingSchedule();
  const baseDateValue = normalizePlainDateValue(startDateValue);
  if (!baseDateValue) return buildInitialDays();

  return Array.from({ length: 7 }, (_, index) => {
    const dateValue = addDaysToDateValue(baseDateValue, index);
    const dayLabel = weekdayLabelFromDateValue(dateValue);
    const existingDay = existingDays.find((day) => day.dateValue === dateValue);
    const storedDayBookings = storedBookings[dateValue] ?? storedBookings[dayLabel.toLowerCase()] ?? [];

    return {
      id: `${dayLabel.toLowerCase()}-${dateValue}`,
      label: dayLabel,
      dateValue,
      hasDateOverride: false,
      settings: {
        ...weeklySettingsForDateValue(dateValue, weeklyWorkingSchedule),
        dateLabel: dayLabel,
      },
      bookings: existingDay?.bookings
        ? cloneValue(existingDay.bookings)
        : storedDayBookings.map(storageBookingToEngineBooking).filter(Boolean),
    };
  });
}

function buildDaysForDateRange(startDateValue, endDateValue = startDateValue, existingDays = []) {
  if (!isValidDateValue(startDateValue) || !isValidDateValue(endDateValue) || endDateValue < startDateValue) return [];
  const dayCount = Math.max(7, daysBetweenDateValues(startDateValue, endDateValue) + 1);
  const visibleDays = buildDaysStarting(startDateValue, existingDays);

  if (dayCount <= visibleDays.length) return visibleDays;

  const storedBookings = sanitizeStoredBookingsByDay(readStoredJson(BOOKINGS_STORAGE_KEY, {}));
  const baseDateValue = normalizePlainDateValue(startDateValue);
  const weeklyWorkingSchedule = readCachedWeeklyWorkingSchedule();

  return Array.from({ length: dayCount }, (_, index) => {
    const dateValue = addDaysToDateValue(baseDateValue, index);
    const dayLabel = weekdayLabelFromDateValue(dateValue);
    const existingDay = existingDays.find((day) => day.dateValue === dateValue);
    const storedDayBookings = storedBookings[dateValue] ?? storedBookings[dayLabel.toLowerCase()] ?? [];

    return {
      id: `${dayLabel.toLowerCase()}-${dateValue}`,
      label: dayLabel,
      dateValue,
      hasDateOverride: false,
      settings: {
        ...weeklySettingsForDateValue(dateValue, weeklyWorkingSchedule),
        dateLabel: dayLabel,
      },
      bookings: existingDay?.bookings
        ? cloneValue(existingDay.bookings)
        : storedDayBookings.map(storageBookingToEngineBooking).filter(Boolean),
    };
  });
}

function buildAdminBookingLoadDays(existingDays = [], centerDateValue = todayValue()) {
  const safeCenterDate = isValidDateValue(centerDateValue) ? centerDateValue : todayValue();
  const loadStartDate = addDaysToDateValue(safeCenterDate, -ADMIN_BOOKING_LOAD_PAST_DAYS);
  const loadEndDate = addDaysToDateValue(safeCenterDate, ADMIN_BOOKING_LOAD_FUTURE_DAYS);
  return buildDaysForDateRange(loadStartDate, loadEndDate, existingDays);
}

function dateRangeForDays(days = []) {
  const dateValues = days
    .map((day) => normalizePlainDateValue(day?.dateValue))
    .filter(Boolean)
    .sort();
  if (!dateValues.length) return null;
  return {
    endDate: dateValues[dateValues.length - 1],
    startDate: dateValues[0],
  };
}

function mergeLoadedWorkingHoursOverrides(currentOverrides, loadedOverrides, range) {
  const nextOverrides = { ...(currentOverrides || {}) };
  if (range?.startDate && range?.endDate) {
    Object.keys(nextOverrides).forEach((dateValue) => {
      if (dateValue >= range.startDate && dateValue <= range.endDate) {
        delete nextOverrides[dateValue];
      }
    });
  }
  return {
    ...nextOverrides,
    ...(loadedOverrides || {}),
  };
}

function emptyInitialDays() {
  return buildInitialDays().map((day) => ({ ...day, bookings: [] }));
}

function serviceNameFor(services, serviceId) {
  if (serviceId === "personal-event") return "Personal event";
  return services.find((service) => service.id === serviceId)?.name ?? "Custom service";
}

function isPersonalEvent(booking) {
  return booking?.kind === "personal" || booking?.serviceId === "personal-event";
}

function isCancelledBooking(booking) {
  return booking?.status === "cancelled" || booking?.paymentStatus === "cancelled";
}

function activeBookingsForDay(bookings = []) {
  return bookings.filter((booking) => !isCancelledBooking(booking));
}

function isSlotUnavailableError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("time slot is no longer available")
    || message.includes("time has just been taken")
    || message.includes("currently being held")
    || message.includes("please choose another time");
}

function activeBookingsExcludingMatchingHold(bookings = [], appointment = {}) {
  let skippedOwnHold = false;
  const appointmentStart = Number(appointment.start);
  const appointmentDuration = Number(appointment.duration);
  const appointmentTravelBuffer = Number(appointment.travelBuffer ?? DEFAULT_TRAVEL_BUFFER);

  return activeBookingsForDay(bookings).filter((booking) => {
    if (skippedOwnHold || booking?.serviceId !== "reserved") return true;
    const bookingStart = timeToMinutes(booking.start);
    const bookingDuration = Number(booking.duration);
    const bookingTravelBuffer = Number(booking.travelBuffer ?? DEFAULT_TRAVEL_BUFFER);
    const isMatchingHold = (
      Number.isFinite(appointmentStart) &&
      Number.isFinite(appointmentDuration) &&
      bookingStart === appointmentStart &&
      bookingDuration === appointmentDuration &&
      bookingTravelBuffer === appointmentTravelBuffer
    );
    if (!isMatchingHold) return true;

    skippedOwnHold = true;
    return false;
  });
}

function getClientBookablePreviewForDay({ day, bookings, requestedDuration, requestedTravelBuffer }) {
  const minimumStartMinutes = day.dateValue === dateValueInTimeZone()
    ? roundUpToSlotIncrement(minutesInTimeZone() + CLIENT_MINIMUM_BOOKING_NOTICE_MINUTES)
    : 0;
  const basePreview = getSchedulingPreview({
    bookings,
    dateValue: day.dateValue,
    minimumStartMinutes,
    requestedDuration,
    requestedTravelBuffer,
    settings: day.settings,
  });
  const bookableSlots = filterClientBookableSlots(basePreview.slots, day.dateValue, {
    minimumNoticeMinutes: CLIENT_MINIMUM_BOOKING_NOTICE_MINUTES,
  });

  if (day.dateValue !== todayValue() || basePreview.warnings.length > 0 || bookableSlots.length > 0) {
    return {
      ...basePreview,
      slots: bookableSlots,
      unfilteredSlots: basePreview.slots,
    };
  }

  const laterTodayPreview = getSchedulingPreview({
    bookings,
    dateValue: day.dateValue,
    minimumStartMinutes,
    requestedDuration,
    requestedTravelBuffer,
    settings: { ...day.settings, mode: "flexible", startMode: "flexible" },
  });
  const laterTodaySlots = filterClientBookableSlots(laterTodayPreview.slots, day.dateValue, {
    minimumNoticeMinutes: CLIENT_MINIMUM_BOOKING_NOTICE_MINUTES,
  });

  return laterTodaySlots.length > 0
    ? {
        ...laterTodayPreview,
        slots: laterTodaySlots,
        unfilteredSlots: laterTodayPreview.slots,
      }
    : {
        ...basePreview,
        slots: [],
        unfilteredSlots: basePreview.slots,
      };
}

function cancelledBookingsForDay(bookings = []) {
  return bookings.filter(isCancelledBooking);
}

function getActiveBookingBlocks(bookings = []) {
  return getBookingBlocks(activeBookingsForDay(bookings));
}

function getCancelledBookingBlocks(bookings = []) {
  return getBookingBlocks(cancelledBookingsForDay(bookings));
}

function getCalendarEntryBlocks(bookings = []) {
  return getBookingBlocks(bookings);
}

function hasCalendarEntries(day) {
  return getCalendarEntryBlocks(day?.bookings ?? []).length > 0;
}

function shouldShowCalendarHistoryDay(day, currentDateValue = todayValue()) {
  if (!day?.dateValue || day.dateValue >= currentDateValue) return true;
  return hasCalendarEntries(day);
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

function nextWaitlistRangeEnd(startValue) {
  const startIndex = WAITLIST_TIME_OPTIONS.indexOf(startValue);
  if (startIndex < 0) return DEFAULT_WAITLIST_RANGE_END;
  return WAITLIST_TIME_OPTIONS[Math.min(startIndex + 1, WAITLIST_TIME_OPTIONS.length - 1)];
}

function waitlistRangeEndOptions(startValue) {
  const startIndex = WAITLIST_TIME_OPTIONS.indexOf(startValue);
  if (startIndex < 0) return WAITLIST_TIME_OPTIONS.slice(1);
  return WAITLIST_TIME_OPTIONS.slice(startIndex + 1);
}

function buildWaitlistPreferredWindow(form) {
  if (form.preferredWindow === WAITLIST_NO_PREFERENCE) return WAITLIST_NO_PREFERENCE;
  if (form.preferenceType !== "window") return form.preferredWindow;
  return `${form.preferredWindow}-${form.preferredWindowEnd || nextWaitlistRangeEnd(form.preferredWindow)}`;
}

function waitlistRangeValidationMessage(form) {
  if (form.preferenceType !== "window" || form.preferredWindow === WAITLIST_NO_PREFERENCE) return "";

  const start = parseWindowPart(form.preferredWindow);
  const end = parseWindowPart(form.preferredWindowEnd || "");
  if (start === null || end === null || end <= start) {
    return "Please choose a time range where To is later than From.";
  }

  return "";
}

function waitlistDateValidationMessage(form) {
  if (form.datePreferenceType !== "range") return "";
  if (!form.preferredDate || !form.preferredDateEnd) return "Please choose a start and end date.";
  if (form.preferredDateEnd < form.preferredDate) return "Please choose an end date after the start date.";
  return "";
}

function waitlistContactValidationMessage(form) {
  if (form.email.trim() || form.phone.trim()) return "";
  return "Please add an email address or phone number so I can contact you.";
}

function parsePreferredWindow(preferredWindow) {
  const label = preferredWindow.trim().toLowerCase().replace(/[–—]/g, "-");
  if (label === "morning (9am-12pm)") return { start: 9 * 60, end: 12 * 60 };
  if (label === "afternoon (12pm-4pm)") return { start: 12 * 60, end: 16 * 60 };
  if (label === "evening (4pm-8pm)") return { start: 16 * 60, end: 20 * 60 };

  const normalized = preferredWindow.replace(/\s+/g, "");
  const [startPart, endPart] = normalized.split("-");
  const start = parseWindowPart(startPart);
  const end = endPart ? parseWindowPart(endPart) : start;

  if (start === null || end === null) return null;
  return { start: Math.min(start, end), end: Math.max(start, end), single: !endPart };
}

function slotMatchesWaitlistRequest(slot, entry) {
  if (slot.duration !== entry.duration) return false;
  if (!entry.preferredWindow || entry.preferredWindow === WAITLIST_NO_PREFERENCE) return true;

  const preferredWindow = parsePreferredWindow(entry.preferredWindow);
  if (!preferredWindow) return false;

  const flexibility = Number(entry.flexibility) || 0;
  if (entry.preferenceType === "exact") {
    return Math.abs(slot.start - preferredWindow.start) <= flexibility;
  }

  if (preferredWindow.single) {
    return slot.start >= preferredWindow.start - flexibility;
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
  serviceAreasMessage = "",
  services,
  serviceDetails,
  enhancements,
  sessionPreferences,
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
  clientAuthActionLoading,
  clientAuthError,
  clientAuthNotice,
  onEmailLogin,
  onGoogleLogin,
  onClientSignOut,
  isMobilePreviewFrame = false,
  onSwitchAdmin,
  onClientStepChange,
}) {
  const showLocalPreviewControls = import.meta.env.DEV;
  const bookingAccess = useClientBookingAccess(clientSession?.user?.id || null, clientAuthLoading);
  const initialClientStep = (() => {
    if (typeof window === "undefined") return "location";
    const requestedStep = new URLSearchParams(window.location.search).get("clientStep");
    const allowedSteps = new Set(["location", "treatment", "duration", "time", "review", "details", "payment", "my-bookings"]);
    return allowedSteps.has(requestedStep) ? requestedStep : "location";
  })();
  const [clientStep, setClientStep] = useState(initialClientStep);
  const [mobileProgressOpen, setMobileProgressOpen] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [showMoreAreas, setShowMoreAreas] = useState(false);
  const [bookingDetailsOpen, setBookingDetailsOpen] = useState(false);
  const [areaSelectionMessage, setAreaSelectionMessage] = useState("");
  const [checkoutAppointments, setCheckoutAppointments] = useState([]);
  const [checkoutError, setCheckoutError] = useState("");
  const [confirmedAppointments, setConfirmedAppointments] = useState([]);
  const [confirmationCancellationPending, setConfirmationCancellationPending] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cashPaymentReviewOpen, setCashPaymentReviewOpen] = useState(false);
  const [reservationInactivityModalOpen, setReservationInactivityModalOpen] = useState(false);
  const [reservationInactivityModalOpenedAt, setReservationInactivityModalOpenedAt] = useState(null);
  const [reservationLastActivityAt, setReservationLastActivityAt] = useState(null);
  const [bookingReference, setBookingReference] = useState("");
  const [paymentHoldExpiresAt, setPaymentHoldExpiresAt] = useState(null);
  const [copiedPaymentKey, setCopiedPaymentKey] = useState("");
  const [myBookingsLoading, setMyBookingsLoading] = useState(false);
  const [myBookingsError, setMyBookingsError] = useState("");
  const [myBookingsGrouped, setMyBookingsGrouped] = useState(() => groupClientPortalBookings([]));
  const [myBookingsReturnStep, setMyBookingsReturnStep] = useState("location");
  const [clientTelegramConnected, setClientTelegramConnected] = useState(false);
  useEffect(() => {
    let active = true;
    if (!clientSession?.user) { setClientTelegramConnected(false); return () => { active = false; }; }
    getSupabaseClient().then((client) => client.rpc("get_my_telegram_connection"))
      .then(({ data, error }) => { if (active && !error) setClientTelegramConnected(data?.connected === true); })
      .catch(() => { if (active) setClientTelegramConnected(false); });
    return () => { active = false; };
  }, [clientSession?.user?.id]);
  useEffect(() => {
    onClientStepChange?.(clientStep);
    if (clientStep !== "payment") {
      setCashPaymentReviewOpen(false);
    }
  }, [clientStep, onClientStepChange]);

  const refreshMyBookings = useCallback(async () => {
    if (!clientSession?.user) {
      setMyBookingsGrouped(groupClientPortalBookings([]));
      return;
    }

    const optimisticBookings = confirmedAppointments
      .map((appointment) => confirmedAppointmentToClientPortalBooking(appointment, clientSession.user.id))
      .filter(Boolean);

    setMyBookingsLoading(true);
    setMyBookingsError("");
    try {
      const bookings = await listCurrentClientPortalBookings(100);
      setMyBookingsGrouped(groupClientPortalBookings(mergeClientPortalBookings(bookings, optimisticBookings)));
    } catch (error) {
      setMyBookingsGrouped(groupClientPortalBookings(optimisticBookings));
      setMyBookingsError(error?.message || "Your saved bookings could not be loaded.");
    } finally {
      setMyBookingsLoading(false);
    }
  }, [clientSession, confirmedAppointments]);

  const openMyBookings = useCallback(() => {
    if (clientSession?.user && confirmedAppointments.length > 0) {
      const optimisticBookings = confirmedAppointments
        .map((appointment) => confirmedAppointmentToClientPortalBooking(appointment, clientSession.user.id))
        .filter(Boolean);
      setMyBookingsGrouped((current) => groupClientPortalBookings(mergeClientPortalBookings([
        ...(current?.upcoming || []),
        ...(current?.past || []),
        ...(current?.cancelled || []),
      ], optimisticBookings)));
    }
    setMyBookingsReturnStep(clientStep === "my-bookings" ? "location" : clientStep);
    setClientStep("my-bookings");
  }, [clientSession, clientStep, confirmedAppointments]);

  const returnFromMyBookings = useCallback(() => {
    const returnStep = myBookingsReturnStep && myBookingsReturnStep !== "my-bookings"
      ? myBookingsReturnStep
      : "location";
    setClientStep(returnStep);
  }, [myBookingsReturnStep]);
  useEffect(() => {
    if (clientStep === "payment" && !bookingReference) {
      setBookingReference(generateBookingReference());
    }
    if (clientStep === "payment" && !paymentHoldExpiresAt) {
      setPaymentHoldExpiresAt(new Date(Date.now() + 60 * 60 * 1000).toISOString());
    }
  }, [clientStep, bookingReference, paymentHoldExpiresAt]);
  useEffect(() => {
    let cancelled = false;

    async function loadMyBookings() {
      if (clientStep !== "my-bookings") return;
      if (!clientSession?.user) {
        setMyBookingsGrouped(groupClientPortalBookings([]));
        return;
      }
      if (!cancelled) await refreshMyBookings();
    }

    loadMyBookings();
    return () => {
      cancelled = true;
    };
  }, [clientSession, clientStep, refreshMyBookings]);
  const [selectedEnhancements, setSelectedEnhancements] = useState([]);
  const [timeReselectMessage, setTimeReselectMessage] = useState("");
  const [temporaryUnavailableSlots, setTemporaryUnavailableSlots] = useState([]);
  const [selectedSessionPreferenceIds, setSelectedSessionPreferenceIds] = useState([]);
  const [selectedSessionPreferenceIdsBySession, setSelectedSessionPreferenceIdsBySession] = useState({});
  const [activeSessionPreferenceKey, setActiveSessionPreferenceKey] = useState("");
  const [sessionPreferencesExpanded, setSessionPreferencesExpanded] = useState(false);
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [contactAccepted, setContactAccepted] = useState(false);
  const [activeBookingHold, setActiveBookingHold] = useState(null);
  const [holdIsCreating, setHoldIsCreating] = useState(false);
  const [returnToReviewAfterArea, setReturnToReviewAfterArea] = useState(false);
  const [returnToReviewAfterDuration, setReturnToReviewAfterDuration] = useState(false);
  const [contactDetails, setContactDetails] = useState({
    address: "",
    email: "",
    firstName: "",
    lastName: "",
    notes: "",
    phone: "",
    telegramUpdates: false,
  });
  const [contactNameInput, setContactNameInput] = useState("");
  const [addressDetails, setAddressDetails] = useState({
    additionalNotes: "",
    apartment: "",
    city: "London",
    entryInstructions: "",
    postcode: "",
    streetAddress: "",
  });
  const [serviceDurations, setServiceDurations] = useState({});
  const [durationQuantitiesByService, setDurationQuantitiesByService] = useState({});
  const visibleServices = services.filter((service) => service.visible);
  const [fullDescriptionServiceId, setFullDescriptionServiceId] = useState(null);
  const bookingPageRef = useRef(null);
  const areaPickerRef = useRef(null);
  const confirmationDetailsRef = useRef(null);
  const activeBookingHoldRef = useRef(null);
  const checkoutAppointmentsRef = useRef([]);

  function resetClientStepScroll() {
    const page = bookingPageRef.current;
    const activeScreen = page?.querySelector(
      ".booking-location-screen, .booking-treatment-screen, .booking-duration-screen, .booking-datetime-screen, .booking-review-screen, .booking-address-screen, .booking-payment-screen"
    );
    const activePanel = page?.querySelector(
      ".location-selection-panel, .treatment-selection-panel, .duration-selection-panel, .time-selection-panel, .review-selection-panel, .address-selection-panel, .payment-selection-panel"
    );
    const appShell = page?.closest(".client-app-shell");
    const scrollTargets = [
      document.scrollingElement,
      document.documentElement,
      document.body,
      appShell,
      page,
      activeScreen,
      activePanel,
    ].filter(Boolean);

    scrollTargets.forEach((target) => {
      target.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
      if ("scrollTop" in target) target.scrollTop = 0;
      if ("scrollLeft" in target) target.scrollLeft = 0;
    });
  }

  useEffect(() => {
    if (document.activeElement?.closest?.(".booking-page")) {
      document.activeElement.blur?.();
    }

    let firstTimeoutId;
    let secondTimeoutId;

    window.requestAnimationFrame(() => {
      resetClientStepScroll();
      firstTimeoutId = window.setTimeout(resetClientStepScroll, 80);
      secondTimeoutId = window.setTimeout(resetClientStepScroll, 180);
    });

    return () => {
      window.clearTimeout(firstTimeoutId);
      window.clearTimeout(secondTimeoutId);
    };
  }, [clientStep, confirmedAppointments.length]);

  useEffect(() => {
    setSelectedEnhancements((current) =>
      current.filter((id) => enhancements.some((item) => item.id === id && item.active !== false))
    );
  }, [enhancements]);

  useEffect(() => {
    const visibleIds = new Set(getVisibleSessionPreferences(sessionPreferences).map((preference) => preference.id));
    setSelectedSessionPreferenceIds((current) => current.filter((id) => visibleIds.has(id)));
    setSelectedSessionPreferenceIdsBySession((current) => Object.fromEntries(
      Object.entries(current)
        .map(([sessionKey, ids]) => [
          sessionKey,
          Array.isArray(ids) ? ids.filter((id) => visibleIds.has(id)) : [],
        ])
        .filter(([, ids]) => ids.length > 0)
    ));
  }, [sessionPreferences]);

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

  const clientTodayValue = todayValue();
  const selectedDay = days[clientDayIndex]?.dateValue >= clientTodayValue
    ? days[clientDayIndex]
    : days.find((day) => day.dateValue === clientTodayValue) ?? buildDaysStarting(clientTodayValue)[0];
  const clientDateWindow = buildDaysForDateRange(clientTodayValue, addDaysToDateValue(clientTodayValue, 30), days)
    .filter((day) => day.dateValue >= clientTodayValue);
  const premiumDateStripRef = useRef(null);
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
    ["duration", "Duration"],
    ["time", "Date & Time"],
    ["review", "Review"],
    ["details", "Your Details"],
    ["payment", "Payment"],
  ];
  const currentStepIndex = Math.max(0, bookingSteps.findIndex(([id]) => id === clientStep));
  const currentStepLabel = bookingSteps[currentStepIndex]?.[1] ?? "Area";
  const treatmentOptions = visibleServices.map((service) => ({
    ...service,
    ...(serviceDetails[service.id] ?? {}),
  }));
  const fullDescriptionService = treatmentOptions.find((service) => service.id === fullDescriptionServiceId);
  const selectedServiceDurationMinutes = selectedServiceId ? Number(serviceDurations[selectedServiceId]) || 0 : 0;
  const selectedDurationQuantities = selectedServiceId
    ? durationQuantitiesByService[selectedServiceId] ?? getDurationQuantitiesFromMinutes(selectedServiceDurationMinutes)
    : {};
  const selectedBasketService = treatmentOptions.find((service) => service.id === selectedServiceId);
  const rawBasketItems = selectedBasketService && selectedServiceDurationMinutes > 0
    ? CLIENT_DURATION_OPTIONS.flatMap((option) =>
        Array.from({ length: Math.max(0, Number(selectedDurationQuantities[option.minutes]) || 0) }, (_, index) => ({
          ...selectedBasketService,
          itemKey: `${selectedBasketService.id}-${option.minutes}-${index}`,
          minutes: option.minutes,
          price: getServiceDurationPrice(selectedBasketService, option.minutes),
        }))
      )
    : [];
  let guestSessionCount = 0;
  let extraSessionCount = 0;
  const basketItems = rawBasketItems.map((item) => {
    if (item.minutes === 30) {
      extraSessionCount += 1;
      return {
        ...item,
        reviewLabel: extraSessionCount === 1 ? "Extra 30 minutes" : `Extra 30 minutes ${extraSessionCount}`,
        reviewSubLabel: `${item.name} add-on`,
      };
    }

    guestSessionCount += 1;
    return {
      ...item,
      reviewLabel: `Guest ${guestSessionCount}`,
      reviewSubLabel: `${item.name} · ${item.minutes} minutes`,
    };
  });
  const reviewSessionPreferenceTargets = basketItems.filter((item) => item.minutes !== 30);
  const reviewSessionPreferenceKeys = reviewSessionPreferenceTargets.map((item, index) => item.itemKey || `${item.id}-${item.minutes}-${index}`);
  const firstSessionPreferenceKey = reviewSessionPreferenceKeys[0] || "";
  const currentSessionPreferenceKey = reviewSessionPreferenceKeys.includes(activeSessionPreferenceKey)
    ? activeSessionPreferenceKey
    : firstSessionPreferenceKey;
  const hasSessionPreferenceMapSelections = Object.values(selectedSessionPreferenceIdsBySession)
    .some((ids) => Array.isArray(ids) && ids.length > 0);
  const selectedCurrentSessionPreferenceIds = selectedSessionPreferenceIdsBySession[currentSessionPreferenceKey]
    || (!hasSessionPreferenceMapSelections && currentSessionPreferenceKey === firstSessionPreferenceKey ? selectedSessionPreferenceIds : [])
    || [];
  const selectedSessionPreferenceGroups = reviewSessionPreferenceTargets.map((item, index) => {
    const sessionKey = reviewSessionPreferenceKeys[index];
    const ids = selectedSessionPreferenceIdsBySession[sessionKey]
      || (!hasSessionPreferenceMapSelections && sessionKey === firstSessionPreferenceKey ? selectedSessionPreferenceIds : [])
      || [];

    return {
      ids,
      key: sessionKey,
      label: item.reviewLabel || `Guest ${index + 1}`,
      preferenceLabels: sessionPreferenceLabels(ids, sessionPreferences),
    };
  });
  const currentSessionPreferenceLabel = selectedSessionPreferenceGroups.find((group) => group.key === currentSessionPreferenceKey)?.label
    || "this guest";
  const reviewSessionPreferenceKeySignature = reviewSessionPreferenceKeys.join("|");

  useEffect(() => {
    const keys = reviewSessionPreferenceKeySignature ? reviewSessionPreferenceKeySignature.split("|").filter(Boolean) : [];

    if (keys.length === 0) {
      if (activeSessionPreferenceKey) setActiveSessionPreferenceKey("");
      setSelectedSessionPreferenceIdsBySession((current) => (Object.keys(current).length > 0 ? {} : current));
      return;
    }

    if (!keys.includes(activeSessionPreferenceKey)) {
      setActiveSessionPreferenceKey(keys[0]);
    }

    setSelectedSessionPreferenceIdsBySession((current) => {
      const next = {};
      keys.forEach((key) => {
        if (Array.isArray(current[key]) && current[key].length > 0) next[key] = current[key];
      });

      if (Object.keys(next).length === 0 && selectedSessionPreferenceIds.length > 0) {
        next[keys[0]] = selectedSessionPreferenceIds;
      }

      const currentJson = JSON.stringify(current);
      const nextJson = JSON.stringify(next);
      return currentJson === nextJson ? current : next;
    });
  }, [activeSessionPreferenceKey, reviewSessionPreferenceKeySignature, selectedSessionPreferenceIds]);

  const orderTotalMinutes = basketItems.reduce((total, service) => total + service.minutes, 0);
  const orderDurationIsValid = isValidDuration(orderTotalMinutes);
  const chosenDayLabel = `${selectedDay.label}, ${selectedDay.dateValue}`;
  const selectedSlotLabel = clientSelectedSlot
    ? `${minutesToTime(clientSelectedSlot.start)} - ${minutesToTime(clientSelectedSlot.end)}`
    : "Choose a time";
  const primaryServiceId = basketItems[0]?.id ?? selectedServiceId;
  const selectedTreatmentDetails = getClientTreatmentCardDetails(
    treatmentOptions.find((service) => service.id === primaryServiceId) || {}
  );
  const basePrice = basketItems.reduce((total, item) => total + getServiceDurationPrice(item, item.minutes), 0);
  const activeEnhancements = enhancements
    .filter((item) => item.active !== false)
    .map((item) => ({ ...item, durationMinutes: 0 }));
  const activeServiceAreas = serviceAreas.filter((area) => area.active !== false);
  const selectedArea = activeServiceAreas.find((area) => area.id === selectedAreaId) ?? null;
  const selectedAreaFees = getServiceAreaFees(serviceAreas, selectedAreaId);
  useEffect(() => {
    const appointments = checkoutAppointmentsRef.current;
    if (appointments.some((appointment) => appointment.selectedAreaId !== selectedAreaId
      || appointment.congestionFee !== selectedAreaFees.congestionFee
      || appointment.travelFee !== selectedAreaFees.travelSurcharge)) {
      releaseCheckoutHolds(appointments);
      setCheckoutAppointments([]);
    }
  }, [selectedAreaId, selectedAreaFees.congestionFee, selectedAreaFees.travelSurcharge]);
  const featuredServiceAreas = PRIMARY_CLIENT_AREA_IDS
    .map((areaId) => activeServiceAreas.find((area) => area.id === areaId))
    .filter(Boolean);
  const secondaryServiceAreas = activeServiceAreas.filter((area) => !PRIMARY_CLIENT_AREA_IDS.includes(area.id));
  const visibleServiceAreas = featuredServiceAreas.length === 0
    ? activeServiceAreas
    : showMoreAreas
      ? [...featuredServiceAreas, ...secondaryServiceAreas]
      : featuredServiceAreas;
  const selectedEnhancementItems = activeEnhancements.filter((item) => selectedEnhancements.includes(item.id));
  const selectedEnhancementTotal = activeEnhancements
    .filter((item) => selectedEnhancements.includes(item.id))
    .reduce((total, item) => total + item.price, 0);
  const selectedEnhancementMinutes = selectedEnhancementItems.reduce((total, item) => total + (Number(item.durationMinutes) || 0), 0);
  const clientVisibleSessionPreferences = getVisibleSessionPreferences(sessionPreferences);
  const visibleSessionPreferences = sessionPreferencesExpanded
    ? clientVisibleSessionPreferences
    : clientVisibleSessionPreferences.slice(0, 6);
  const showSessionPreferencesMoreButton = clientVisibleSessionPreferences.length > 6;
  const selectedSessionPreferenceSnapshots = sessionPreferenceSnapshots(selectedSessionPreferenceIds, sessionPreferences);
  const selectedSessionPreferenceLabels = selectedSessionPreferenceSnapshots.map((preference) => preference.label);
  const bookingDurationMinutes = orderTotalMinutes + selectedEnhancementMinutes;
  const bookingSubtotal = basePrice + selectedEnhancementTotal;
  const bookingTotal = bookingSubtotal + selectedAreaFees.congestionFee + selectedAreaFees.travelSurcharge;
  const checkoutTotal = checkoutAppointments.reduce((total, item) => total + item.total, 0);
  const paymentDisplayTotal = checkoutAppointments.length > 0 ? checkoutTotal : bookingTotal;
  const paymentActionsDisabled = clientIsConfirming || (checkoutAppointments.length === 0 && !clientSelectedSlot);
  const confirmedPaymentTotal = confirmedAppointments.reduce((total, appointment) => {
    const amount = Number(appointment.total ?? appointment.price ?? appointment.amount ?? 0);
    if (Number.isFinite(amount)) return total + amount;
    return total;
  }, 0);
  const confirmedPaymentReference = bookingReference || confirmedAppointments[0]?.bookingReference || "Pending";
  const confirmationTelegramUrl = clientTelegramConnected ? "" : buildTelegramStartUrl(CLIENT_TELEGRAM_BOT_URL, confirmedPaymentReference);
  const showConfirmationGoogleSaveCta = shouldShowPostBookingGoogleSaveCta({
    clientSession,
    confirmedAppointments,
  });
  const confirmationDetailsSaved = Boolean(clientSession?.user && confirmedAppointments.length > 0);
  const confirmationCanCancel = confirmedAppointments.some((appointment) => !isCancelledBooking(appointment));
  const selectedDayActiveBookings = activeBookingsForDay(selectedDay.bookings);
  const temporaryUnavailableBookingsForSelectedDay = temporaryUnavailableSlots
    .filter((slot) => slot.dateValue === selectedDay.dateValue && slot.expiresAt > Date.now())
    .map((slot) => ({
      id: slot.id,
      serviceId: "reserved",
      serviceName: "Reserved",
      start: slot.start,
      duration: slot.duration,
      status: "confirmed",
      travelBuffer: slot.travelBuffer,
    }));
  const clientAvailabilityBlocks = [
    ...selectedDayActiveBookings,
    ...temporaryUnavailableBookingsForSelectedDay,
  ];
  const clientPreviewSettings = selectedDay.settings?.unavailable && !selectedDay.settings?.customWorkingHours && selectedDayActiveBookings.length === 0
    ? {
        ...DEFAULT_DAY_SETTINGS,
        dateLabel: selectedDay.label,
        workingStart: selectedDay.label === "Sun" ? "10:00" : DEFAULT_DAY_SETTINGS.workingStart,
        workingEnd: selectedDay.label === "Sat" || selectedDay.label === "Sun" ? "16:00" : DEFAULT_DAY_SETTINGS.workingEnd,
      }
    : selectedDay.settings;
  const clientMinimumStartMinutes = selectedDay.dateValue === dateValueInTimeZone()
    ? roundUpToSlotIncrement(minutesInTimeZone() + CLIENT_MINIMUM_BOOKING_NOTICE_MINUTES)
    : 0;
  const rawClientPreview = getSchedulingPreview({
    bookings: clientAvailabilityBlocks,
    dateValue: selectedDay.dateValue,
    minimumStartMinutes: clientMinimumStartMinutes,
    requestedDuration: bookingDurationMinutes,
    requestedTravelBuffer: DEFAULT_TRAVEL_BUFFER,
    settings: clientPreviewSettings,
  });
  const clientPreview = getClientBookablePreviewForDay({
    day: { ...selectedDay, settings: clientPreviewSettings },
    bookings: clientAvailabilityBlocks,
    requestedDuration: bookingDurationMinutes,
    requestedTravelBuffer: DEFAULT_TRAVEL_BUFFER,
  });
  const clientNoSlotMessage = clientPreview.warnings[0]
    || (rawClientPreview.slots.length > 0 && clientPreview.slots.length === 0 && selectedDay.dateValue === todayValue()
      ? "No remaining appointment times are available today with at least 2 hours notice. Please choose another day."
      : "No appointment availability is open for this treatment and day.");
  const showFixedStartHint =
    clientPreviewSettings.mode === "optimized" &&
    clientPreviewSettings.startMode === "fixed" &&
    selectedDayActiveBookings.length === 0 &&
    clientPreview.slots.length === 1;
  const contactFirstName = contactDetails.firstName.trim();
  const contactLastName = contactDetails.lastName.trim();
  const contactFullName = `${contactFirstName} ${contactLastName}`.trim();
  const contactEmail = contactDetails.email.trim();
  const contactPhone = contactDetails.phone.trim();
  const contactStreetAddress = addressDetails.streetAddress.trim();
  const contactCity = addressDetails.city.trim();
  const contactPostcode = addressDetails.postcode.trim();
  const normalizedContactPhone = contactPhone.replace(/[\s().-]/g, "");
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail);
  const phoneIsValid = /^\+?\d{10,15}$/.test(normalizedContactPhone);
  const contactContinueReason = !contactFullName
    ? "Enter your full name to continue."
    : !contactEmail
      ? "Enter your email address to continue."
      : !emailIsValid
        ? "Enter a valid email address, for example name@example.com."
        : !contactStreetAddress
          ? "Enter your street address to continue."
          : !contactCity
            ? "Enter your city to continue."
            : !contactPostcode
              ? "Enter your postcode to continue."
              : !contactPhone
                ? "Enter your phone number to continue."
                : !phoneIsValid
                  ? "Enter a valid phone number with 10 to 15 digits."
                  : "";
  const contactCanContinue = !contactContinueReason;
  const treatmentContinueReason = orderDurationIsValid
    ? ""
    : orderTotalMinutes > MAX_BOOKING_DURATION_MINUTES
      ? `The longest single booking is ${formatAgendaDuration(MAX_BOOKING_DURATION_MINUTES)}. Please choose ${formatAgendaDuration(MAX_BOOKING_DURATION_MINUTES)} or less, or make a second booking for extra time.`
      : orderTotalMinutes > 0 && orderTotalMinutes < 60
        ? "The shortest booking is 60 minutes."
        : "Choose a session duration to continue.";
  const timeContinueReason = clientSelectedSlot
    ? ""
    : "Choose an available appointment time to continue.";
  const reviewContinueReason = !selectedArea
    ? "Choose your appointment area to continue."
    : !selectedServiceId || basketItems.length === 0
      ? "Choose a treatment to continue."
      : !orderDurationIsValid
        ? treatmentContinueReason
        : !clientSelectedSlot
          ? timeContinueReason
          : "";
  const reviewSessionHeading = "Your Session";
  const treatmentTotal = basePrice;
  const reviewSessionItems = basketItems;
  const reviewGuestSessionCount = reviewSessionItems.filter((item) => item.minutes !== 30).length;
  const reviewExtraSessionMinutes = reviewSessionItems
    .filter((item) => item.minutes === 30)
    .reduce((total, item) => total + item.minutes, 0);
  const reviewSessionSummaryLabel = [
    reviewGuestSessionCount > 0 ? `${reviewGuestSessionCount} guest${reviewGuestSessionCount === 1 ? "" : "s"}` : "",
    reviewExtraSessionMinutes > 0 ? `${reviewExtraSessionMinutes} min extra` : "",
  ].filter(Boolean).join(" + ");
  const reviewPriceRows = [
    { label: "Treatment", value: treatmentTotal, show: treatmentTotal > 0 },
    ...selectedEnhancementItems.map((item) => ({
      label: item.name,
      value: item.price,
      valueLabel: Number(item.price) > 0 ? formatMoney(item.price) : "Free",
      show: true,
    })),
    { label: "Travel Fee", value: selectedAreaFees.travelSurcharge, show: selectedAreaFees.travelSurcharge > 0 },
    { label: "Congestion Fee", value: selectedAreaFees.congestionFee, show: selectedAreaFees.congestionFee > 0 },
  ].filter((row) => row.show);

  function formatMoney(value) {
    const amount = Number(value) || 0;
    return `\u00a3${Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2)}`;
  }

  function formatReviewDate(dateValue, fallback = "") {
    if (!dateValue) return fallback || "Choose a date";
    const parsed = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return fallback || dateValue;
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      weekday: "long",
      year: "numeric",
    }).format(parsed);
  }

  function formatWaitlistRequestDate(dateValue) {
    if (!dateValue) return "selected date";
    const parsed = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateValue;
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      weekday: "long",
    }).format(parsed);
  }

  function formatReviewTime(minutes) {
    if (!Number.isFinite(Number(minutes))) return "Choose a time";
    const date = new Date(2024, 0, 1, 0, Number(minutes));
    return new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date).toUpperCase();
  }

  function getClientStepPrerequisiteReason(targetStep) {
    if (["treatment", "duration", "time", "review", "details", "payment"].includes(targetStep) && !selectedAreaId) {
      return "Choose your area to continue.";
    }
    if (["duration", "time", "review", "details", "payment"].includes(targetStep) && !selectedServiceId) {
      return "Choose a treatment to continue.";
    }
    if (["time", "review", "details", "payment"].includes(targetStep) && treatmentContinueReason) {
      return treatmentContinueReason;
    }
    if (["review", "details", "payment"].includes(targetStep) && !clientSelectedSlot) {
      return timeContinueReason;
    }
    if (["details", "payment"].includes(targetStep) && holdIsCreating) {
      return "Please wait while I reserve this time.";
    }
    if (targetStep === "payment" && contactContinueReason) {
      return contactContinueReason;
    }

    return "";
  }

  function getClientStepNavigationReason(targetStep) {
    const targetIndex = bookingSteps.findIndex(([id]) => id === targetStep);
    if (targetIndex < 0 || targetIndex <= currentStepIndex) return "";
    return getClientStepPrerequisiteReason(targetStep);
  }

  function firstClientStepForMissingPrerequisite(targetStep) {
    if (targetStep === "payment" && confirmedAppointments.length > 0) {
      return "";
    }
    if (["treatment", "duration", "time", "review", "details", "payment"].includes(targetStep) && !selectedAreaId) {
      return "location";
    }
    if (["duration", "time", "review", "details", "payment"].includes(targetStep) && !selectedServiceId) {
      return "treatment";
    }
    if (["time", "review", "details", "payment"].includes(targetStep) && treatmentContinueReason) {
      return "duration";
    }
    if (["review", "details", "payment"].includes(targetStep) && !clientSelectedSlot) {
      return "time";
    }
    if (targetStep === "payment" && contactContinueReason) {
      return "details";
    }
    return "";
  }

  function navigateClientStepFromProgress(targetStep) {
    if (targetStep === clientStep) return;

    const reason = getClientStepNavigationReason(targetStep);
    if (reason) {
      setClientBookingMessage(reason);
      if (["details", "payment"].includes(targetStep)) setCheckoutError(reason);
      return;
    }

    if (["details", "payment"].includes(targetStep) && checkoutAppointments.length === 0) {
      const appointment = addCurrentAppointmentToBasket();
      if (!appointment) return;
    }

    setCheckoutError("");
    setClientBookingMessage("");
    setMobileProgressOpen(false);
    setClientStep(targetStep);
  }

  useEffect(() => {
    if (!isMobilePreviewFrame) return;
    if (!bookingSteps.some(([id]) => id === clientStep)) return;

    const fallbackStep = firstClientStepForMissingPrerequisite(clientStep);
    if (!fallbackStep || fallbackStep === clientStep) return;

    const reason = getClientStepPrerequisiteReason(clientStep);
    if (reason) {
      setClientBookingMessage(reason);
      setCheckoutError(reason);
    }
    setClientStep(fallbackStep);
  }, [
    basketItems.length,
    clientSelectedSlot,
    clientStep,
    confirmedAppointments.length,
    contactContinueReason,
    isMobilePreviewFrame,
    orderDurationIsValid,
    selectedAreaId,
    selectedServiceId,
    treatmentContinueReason,
  ]);

  function renderPremiumStepProgress(extraClassName = "") {
    return (
      <div className={`premium-step-progress premium-client-stepper ${extraClassName}`.trim()} aria-label="Booking progress">
        {bookingSteps.map(([id, label], index) => {
          const isActive = id === clientStep;
          const isCompleted = index < currentStepIndex;
          const navigationReason = getClientStepNavigationReason(id);
          return (
            <button
              type="button"
              className={isActive ? "premium-step-item active-premium-step-item" : isCompleted ? "premium-step-item completed-premium-step-item" : "premium-step-item"}
              disabled={Boolean(navigationReason)}
              key={id}
              onClick={() => navigateClientStepFromProgress(id)}
              title={navigationReason || `Go to ${label}`}
            >
              <i className={isActive ? "premium-step-dot active-premium-step" : isCompleted ? "premium-step-dot completed-premium-step" : "premium-step-dot"}>
                {isCompleted ? <Check aria-hidden="true" size={20} strokeWidth={2.4} /> : index + 1}
              </i>
              <small>{label}</small>
            </button>
          );
        })}
      </div>
    );
  }

  useEffect(() => {
    if (bookingDurationMinutes !== clientDuration) {
      setClientDuration(bookingDurationMinutes);
    }
  }, [bookingDurationMinutes, clientDuration, setClientDuration]);

  useEffect(() => {
    activeBookingHoldRef.current = activeBookingHold;
  }, [activeBookingHold]);

  useEffect(() => {
    if (!clientSelectedSlot) {
      setReservationInactivityModalOpen(false);
      setReservationInactivityModalOpenedAt(null);
      setReservationLastActivityAt(null);
      return;
    }

    setReservationInactivityModalOpen(false);
    setReservationInactivityModalOpenedAt(null);
    setReservationLastActivityAt(Date.now());
  }, [clientSelectedSlot]);

  useEffect(() => {
    if (!clientSelectedSlot || reservationInactivityModalOpen) return undefined;

    const recordActivity = () => {
      setReservationLastActivityAt(Date.now());
    };
    const activityEvents = ["click", "input", "keydown", "scroll", "touchstart"];
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true });
    });

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
    };
  }, [clientSelectedSlot, reservationInactivityModalOpen]);

  useEffect(() => {
    if (!clientSelectedSlot) return undefined;

    const timer = window.setInterval(() => {
      const now = Date.now();
      if (shouldAutoReleaseReservation({
        inactivityModalOpen: reservationInactivityModalOpen,
        modalOpenedAt: reservationInactivityModalOpenedAt,
        now,
      })) {
        releaseClientAppointmentReservation({ returnToStart: true });
        return;
      }

      if (shouldShowReservationInactivityModal({
        hasSelectedSlot: Boolean(clientSelectedSlot),
        inactivityModalOpen: reservationInactivityModalOpen,
        lastActivityAt: reservationLastActivityAt,
        now,
      })) {
        setReservationInactivityModalOpen(true);
        setReservationInactivityModalOpenedAt(now);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [
    clientSelectedSlot,
    reservationInactivityModalOpen,
    reservationInactivityModalOpenedAt,
    reservationLastActivityAt,
  ]);

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

  function releaseClientAppointmentReservation({ returnToStart = false } = {}) {
    clearActiveBookingHold();
    if (returnToStart) {
      setSelectedAreaId("");
      setAreaSelectionMessage("");
      setWaitlistFormOpen(false);
    }
    setClientSelectedSlot(null);
    setCheckoutAppointments([]);
    setCashPaymentReviewOpen(false);
    setSelectedSessionPreferenceIds([]);
    setSelectedSessionPreferenceIdsBySession({});
    setActiveSessionPreferenceKey("");
    setSessionPreferencesExpanded(false);
    setReservationInactivityModalOpen(false);
    setReservationInactivityModalOpenedAt(null);
    setReservationLastActivityAt(null);
    setBookingReference("");
    setPaymentHoldExpiresAt(null);
    setCheckoutError("");
    resetClientConfirmGuard();
    setClientStep(returnToStart ? "location" : "time");
    setClientBookingMessage(
      returnToStart
        ? "Your appointment has been released to keep the calendar fair. Please choose your area and a new available time."
        : "Your appointment has been released to keep the calendar fair. Please choose a new available time."
    );
  }

  function continueClientReservationAfterInactivity() {
    setReservationInactivityModalOpen(false);
    setReservationInactivityModalOpenedAt(null);
    setReservationLastActivityAt(Date.now());
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
        congestionFee: selectedAreaFees.congestionFee,
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
        price: bookingSubtotal,
        selectedAreaId: selectedArea.id,
        selectedAreaName: selectedArea.name,
        serviceId: primaryServiceId,
        serviceName: basketItems.map((item) => item.name).join(" + "),
        sessionNotes: addressDetails.additionalNotes.trim(),
        sessionPreferenceIds: selectedSessionPreferenceIds,
        sessionPreferenceLabels: selectedSessionPreferenceSnapshots,
        start: clientSelectedSlot.start,
        slot: clientSelectedSlot,
        total: bookingTotal,
        travelBuffer: DEFAULT_TRAVEL_BUFFER,
        travelFee: selectedAreaFees.travelSurcharge,
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

    setCheckoutAppointments([draft.appointment]);
    setActiveBookingHold(null);
    setCheckoutError("");
    setClientBookingMessage("");
    return draft.appointment;
  }

  function resetCurrentAppointmentDraft() {
    setClientServiceId("");
    setServiceDurations({});
    setDurationQuantitiesByService({});
    setSelectedEnhancements([]);
    setSelectedSessionPreferenceIds([]);
    setSelectedSessionPreferenceIdsBySession({});
    setActiveSessionPreferenceKey("");
    setSessionPreferencesExpanded(false);
    setClientSelectedSlot(null);
    setCheckoutError("");
    resetClientConfirmGuard();
  }

  function toggleSessionPreference(preferenceId) {
    if (!currentSessionPreferenceKey) return;

    setSelectedSessionPreferenceIdsBySession((current) => {
      const currentIds = current[currentSessionPreferenceKey] || [];
      const nextIds = toggleSessionPreferenceId(currentIds, preferenceId, sessionPreferences);
      const next = { ...current };

      if (nextIds.length > 0) {
        next[currentSessionPreferenceKey] = nextIds;
      } else {
        delete next[currentSessionPreferenceKey];
      }

      const aggregateIds = [...new Set(Object.values(next).flatMap((ids) => (Array.isArray(ids) ? ids : [])))];
      setSelectedSessionPreferenceIds(aggregateIds);
      return next;
    });
  }

  async function continueToCheckoutDetails() {
    if (!isMobilePreviewFrame && !await bookingAccess.refresh()) return;
    const appointment = addCurrentAppointmentToBasket();
    if (!appointment) return;
    setClientStep("details");
  }

  function continueFromDuration() {
    if (returnToReviewAfterDuration && clientSelectedSlot) {
      setReturnToReviewAfterDuration(false);
      setClientStep("review");
      return;
    }

    setClientStep("time");
  }

  function updateSelectedArea(areaId) {
    if (areaId !== selectedAreaId) {
      releaseCheckoutHolds();
      setCheckoutAppointments([]);
    }
    setSelectedAreaId(areaId);
    setAreaSelectionMessage("");
    setClientBookingMessage("");
  }

  function selectAreaAndContinue(areaId) {
    updateSelectedArea(areaId);
    if (returnToReviewAfterArea) {
      setReturnToReviewAfterArea(false);
      setClientStep("review");
      return;
    }
    setClientStep("treatment");
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

  function selectTreatmentAndContinue(serviceId) {
    if (serviceId !== clientServiceId) {
      clearActiveBookingHold();
      setServiceDurations({});
      setDurationQuantitiesByService({});
      setClientSelectedSlot(null);
    }
    updateService(serviceId);
    setClientStep("duration");
  }

  function selectDescriptionService(serviceId) {
    updateService(serviceId);
    setFullDescriptionServiceId(null);
  }

  function changeServiceDurationQuantity(durationMinutes, delta) {
    if (!selectedServiceId) return;

    clearActiveBookingHold();
    const currentQuantities = durationQuantitiesByService[selectedServiceId] ?? getDurationQuantitiesFromMinutes(Number(serviceDurations[selectedServiceId]) || 0);
    const nextQuantity = Math.max(0, (Number(currentQuantities[durationMinutes]) || 0) + delta);
    const nextQuantities = { ...currentQuantities, [durationMinutes]: nextQuantity };
    const nextTotal = CLIENT_DURATION_OPTIONS.reduce(
      (total, option) => total + option.minutes * (Number(nextQuantities[option.minutes]) || 0),
      0
    );
    setServiceDurations(nextTotal > 0 ? { [selectedServiceId]: nextTotal } : {});
    setDurationQuantitiesByService(nextTotal > 0 ? { [selectedServiceId]: nextQuantities } : {});
    setClientSelectedSlot(null);
    setCheckoutAppointments([]);
    setClientBookingMessage("");
    resetClientConfirmGuard();
  }

  function selectServiceDuration(durationMinutes) {
    changeServiceDurationQuantity(durationMinutes, 1);
  }

  function removeServiceDuration(durationMinutes) {
    changeServiceDurationQuantity(durationMinutes, -1);
  }

  function clearSelectedServiceDuration() {
    if (!selectedServiceId) return;

    clearActiveBookingHold();
    setServiceDurations({});
    setDurationQuantitiesByService({});
    setClientSelectedSlot(null);
    setCheckoutAppointments([]);
    setClientBookingMessage("");
    resetClientConfirmGuard();
  }

  function updateDay(index, dateValue = days[index]?.dateValue) {
    if (dateValue && dateValue < todayValue()) {
      const todayDateValue = todayValue();
      changeVisibleWeek(todayDateValue, 0);
      setClientBookingMessage("Past dates cannot be booked online. Please choose today or a future date.");
      return;
    }

    clearActiveBookingHold();
    const matchingIndex = days.findIndex((day) => day.dateValue === dateValue);
    if (matchingIndex >= 0) {
      setClientDayIndex(matchingIndex);
    } else if (dateValue) {
      const weekStart = weekStartDateValue(dateValue);
      const preferredIndex = Math.max(0, Math.min(6, daysBetweenDateValues(weekStart, dateValue)));
      onChangeClientWeek?.(weekStart, preferredIndex);
    } else {
      setClientDayIndex(index);
    }
    setClientSelectedSlot(null);
    setClientBookingMessage("");
    setWaitlistForm((current) => ({
      ...current,
      preferredDate: dateValue ?? current.preferredDate,
    }));
    resetClientConfirmGuard();
  }

  function scrollPremiumDateStrip(direction) {
    const strip = premiumDateStripRef.current;
    if (!strip) return;
    strip.scrollBy({ left: direction * Math.max(220, strip.clientWidth * 0.75), behavior: "smooth" });
  }

  useEffect(() => {
    if (days[clientDayIndex]?.dateValue >= todayValue()) return;
    const todayDateValue = todayValue();
    const matchingIndex = days.findIndex((day) => day.dateValue === todayDateValue);
    if (matchingIndex >= 0) {
      setClientDayIndex(matchingIndex);
    } else {
      onChangeClientWeek?.(todayDateValue, 0);
    }
    setClientSelectedSlot(null);
    setClientBookingMessage("");
    resetClientConfirmGuard();
  }, [clientDayIndex, days, onChangeClientWeek, resetClientConfirmGuard]);

  useEffect(() => {
    if (clientStep !== "time") return;
    window.requestAnimationFrame(() => {
      premiumDateStripRef.current
        ?.querySelector(`[data-client-date-value="${selectedDay.dateValue}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
  }, [clientStep, selectedDay.dateValue]);

  function editReviewArea() {
    setReturnToReviewAfterArea(true);
    setCheckoutAppointments([]);
    setClientStep("location");
  }

  function editReviewDuration() {
    setReturnToReviewAfterDuration(true);
    setCheckoutAppointments([]);
    setClientStep("duration");
  }

  function changeVisibleWeek(startDateValue, preferredIndex = 0) {
    clearActiveBookingHold();
    setClientSelectedSlot(null);
    setClientBookingMessage("");
    setWaitlistForm((current) => ({
      ...current,
      preferredDate: addDaysToDateValue(startDateValue, preferredIndex) || current.preferredDate,
    }));
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
      datePreferenceType: current.datePreferenceType || "single",
      duration: bookingDurationMinutes,
      preferredDate: selectedDay.dateValue,
      preferredDateEnd: current.preferredDateEnd || addDaysToDateValue(selectedDay.dateValue, 1),
      preferenceType: "exact",
      preferredWindow: current.preferredWindow || WAITLIST_NO_PREFERENCE,
      preferredWindowEnd: current.preferredWindowEnd || DEFAULT_WAITLIST_RANGE_END,
    }));
    setClientBookingMessage("");
    setWaitlistFormOpen(true);
  }

  function toggleEnhancement(id) {
    const selectedSlotBeforeToggle = clientSelectedSlot;
    setSelectedEnhancements((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
    if (selectedSlotBeforeToggle) {
      setClientSelectedSlot(selectedSlotBeforeToggle);
      setCheckoutError("");
      setClientBookingMessage("");
      setTimeReselectMessage("");
      window.setTimeout(() => {
        setClientSelectedSlot(selectedSlotBeforeToggle);
        setClientStep("review");
      }, 0);
    }
  }

  async function selectTimeSlot(slot) {
    setHoldIsCreating(true);
    setClientBookingMessage("");
    setTimeReselectMessage("");
    resetClientConfirmGuard();

    try {
      if (!isMobilePreviewFrame && !await bookingAccess.refresh()) return;
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
        setClientBookingMessage("");
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
      setClientBookingMessage("");
    } catch (error) {
      if (isSlotUnavailableError(error)) {
        setTemporaryUnavailableSlots((current) => {
          const slotKey = `${selectedDay.dateValue}-${slot.start}-${slot.duration}-${slot.travelBuffer ?? DEFAULT_TRAVEL_BUFFER}`;
          const nextSlot = {
            dateValue: selectedDay.dateValue,
            duration: slot.duration,
            expiresAt: Date.now() + 10 * 60 * 1000,
            id: `temporary-unavailable-${slotKey}`,
            start: slot.start,
            travelBuffer: slot.travelBuffer ?? DEFAULT_TRAVEL_BUFFER,
          };
          return [
            ...current.filter((item) =>
              item.expiresAt > Date.now() &&
              `${item.dateValue}-${item.start}-${item.duration}-${item.travelBuffer}` !== slotKey
            ),
            nextSlot,
          ];
        });
      }
      setClientSelectedSlot(null);
      setActiveBookingHold(null);
      setClientBookingMessage(bookingHoldErrorMessage(error));
    } finally {
      setHoldIsCreating(false);
    }
  }

  function updateContactDetail(field, value) {
    if (field === "address") setSelectedSavedAddressId("");
    setContactDetails((current) => ({ ...current, [field]: value }));
  }

  function updateContactFullName(value) {
    setContactNameInput(value);
    const normalizedValue = value.replace(/\s+/g, " ").trim();
    const [firstName = "", ...lastNameParts] = normalizedValue ? normalizedValue.split(" ") : [];
    setContactDetails((current) => ({
      ...current,
      firstName,
      lastName: lastNameParts.join(" "),
    }));
  }

  function formatAddressDetails(details) {
    return [
      details.streetAddress,
      details.apartment,
      details.city,
      details.postcode,
    ].map((part) => part.trim()).filter(Boolean).join(", ");
  }

  function formatAddressNotes(details) {
    return [
      details.entryInstructions.trim() ? `Entry instructions: ${details.entryInstructions.trim()}` : "",
      details.additionalNotes.trim() ? `Additional notes: ${details.additionalNotes.trim()}` : "",
    ].filter(Boolean).join("\n");
  }

  function parseAddressSnapshot(address = "") {
    const parts = String(address || "").split(",").map((part) => part.trim()).filter(Boolean);
    const postcodePattern = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
    const postcodeIndex = parts.findIndex((part) => postcodePattern.test(part));
    const postcode = postcodeIndex >= 0 ? parts[postcodeIndex] : "";
    const withoutPostcode = postcodeIndex >= 0
      ? parts.filter((_, index) => index !== postcodeIndex)
      : parts;
    const cityIndex = withoutPostcode.findIndex((part) => /^london$/i.test(part));
    const city = cityIndex >= 0
      ? withoutPostcode[cityIndex]
      : withoutPostcode.length > 1
        ? withoutPostcode[withoutPostcode.length - 1]
        : "London";
    const streetParts = withoutPostcode.filter((_, index) => index !== cityIndex);
    if (cityIndex < 0 && streetParts.length > 1) streetParts.pop();

    return {
      apartment: "",
      city: city || "London",
      postcode,
      streetAddress: streetParts.join(", ") || address,
    };
  }

  function updateAddressDetail(field, value) {
    setAddressDetails((current) => {
      const next = { ...current, [field]: value };
      setContactDetails((details) => ({
        ...details,
        address: formatAddressDetails(next),
        notes: formatAddressNotes(next),
      }));
      return next;
    });
  }

  async function fillTestClientDetails() {
    if (!import.meta.env.DEV) return;

    const { pickFakeClientForArea } = await import("./dev/fakeClients.js");
    const fakeClient = pickFakeClientForArea(selectedArea?.name);
    if (!fakeClient) return;

    const fullName = fakeClient.name.trim();
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts.shift() || "";
    const lastName = nameParts.join(" ");
    const nextAddressDetails = {
      additionalNotes: fakeClient.additionalNotes || "",
      apartment: fakeClient.apartment || "",
      city: fakeClient.city || "London",
      entryInstructions: fakeClient.entryInstructions || "",
      postcode: fakeClient.postcode || "",
      streetAddress: fakeClient.streetAddress || "",
    };

    setSelectedSavedAddressId("");
    setContactNameInput(fullName);
    setAddressDetails(nextAddressDetails);
    setContactDetails((current) => ({
      ...current,
      address: formatAddressDetails(nextAddressDetails),
      email: fakeClient.email || current.email,
      firstName,
      lastName,
      notes: formatAddressNotes(nextAddressDetails),
      phone: fakeClient.phone || current.phone,
    }));
  }

  function applyMyBookingsBookAgain(booking) {
    const prefill = buildBookAgainPrefill(booking);
    if (!prefill) {
      setClientBookingMessage("I can't repeat this booking automatically yet. Please start a new booking.");
      setClientStep("location");
      return;
    }

    clearActiveBookingHold();
    releaseCheckoutHolds();
    setCheckoutAppointments([]);
    setConfirmedAppointments([]);
    setClientSelectedSlot(null);
    setActiveBookingHold(null);
    setBookingReference("");
    setPaymentHoldExpiresAt(null);
    setCheckoutError("");
    setAreaSelectionMessage("");
    setPaymentMethod("cash");
    resetClientConfirmGuard();

    const area = activeServiceAreas.find((item) =>
      item.id === prefill.area
      || item.name.toLowerCase() === prefill.area.toLowerCase()
    );
    const service = visibleServices.find((item) =>
      item.id === prefill.serviceId
      || item.name.toLowerCase() === prefill.serviceName.toLowerCase()
    );
    const duration = Math.max(0, Math.round(Number(prefill.totalDuration) || 0));
    const parsedAddress = parseAddressSnapshot(prefill.address);
    const nameParts = prefill.clientName.split(/\s+/).filter(Boolean);
    const firstName = nameParts.shift() || "";
    const lastName = nameParts.join(" ");

    if (area) setSelectedAreaId(area.id);
    if (service) {
      setClientServiceId(service.id);
      setServiceDurations(duration > 0 ? { [service.id]: duration } : {});
      setDurationQuantitiesByService(duration > 0 ? { [service.id]: getDurationQuantitiesFromMinutes(duration) } : {});
    } else {
      setClientServiceId("");
      setServiceDurations({});
      setDurationQuantitiesByService({});
    }

    setSelectedEnhancements([]);
    setSelectedSessionPreferenceIds(
      (prefill.sessionPreferenceIds || []).filter((id) =>
        getVisibleSessionPreferences(sessionPreferences).some((preference) => preference.id === id)
      )
    );
    setSelectedSessionPreferenceIdsBySession({});
    setActiveSessionPreferenceKey("");
    setSessionPreferencesExpanded(false);
    setSelectedSavedAddressId(prefill.savedAddressId || "");
    setAddressDetails((current) => ({
      ...current,
      additionalNotes: prefill.sessionNotes || "",
      apartment: parsedAddress.apartment,
      city: parsedAddress.city,
      entryInstructions: "",
      postcode: parsedAddress.postcode,
      streetAddress: parsedAddress.streetAddress,
    }));
    setContactNameInput(prefill.clientName);
    setContactDetails((current) => ({
      ...current,
      address: prefill.address,
      email: prefill.customerEmail || current.email,
      firstName: firstName || current.firstName,
      lastName: lastName || current.lastName,
      notes: "",
      phone: prefill.customerPhone || current.phone,
    }));

    const message = "Using details from your previous booking. You can change anything before confirming.";
    setClientBookingMessage(message);

    if (!area) {
      setAreaSelectionMessage("Please choose an available appointment area before selecting a time.");
      setClientStep("location");
      return;
    }
    if (!service) {
      setClientBookingMessage("That treatment is no longer available. Please choose another treatment.");
      setClientStep("treatment");
      return;
    }
    if (!isValidDuration(duration)) {
      setClientBookingMessage("Please choose a session duration before selecting a time.");
      setClientStep("duration");
      return;
    }

    setClientStep("time");
  }

  async function copyPaymentText(value, key = "payment") {
    const text = String(value || "").trim();
    if (!text) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopiedPaymentKey(key);
      window.setTimeout(() => {
        setCopiedPaymentKey((current) => (current === key ? "" : current));
      }, 1800);
    } catch {
      setCheckoutError("Clipboard failed. Please select the detail manually.");
    }
  }

  function applyReturningClientSelection(selection) {
    if (!selection?.services?.length) return;

    clearActiveBookingHold();
    const treatmentDurations = {};
    const enhancementIds = [];

    selection.services.forEach((item) => {
      if (!Object.keys(treatmentDurations).length && services.some((service) => service.id === item.id) && Number(item.durationMinutes) > 0) {
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
    setDurationQuantitiesByService(
      Object.fromEntries(
        Object.entries(treatmentDurations).map(([serviceId, minutes]) => [serviceId, getDurationQuantitiesFromMinutes(minutes)])
      )
    );
    setSelectedEnhancements(enhancementIds);
    setSelectedSessionPreferenceIds(
      (selection.sessionPreferenceIds || []).filter((id) =>
        getVisibleSessionPreferences(sessionPreferences).some((preference) => preference.id === id)
      )
    );
    setSelectedSessionPreferenceIdsBySession({});
    setActiveSessionPreferenceKey("");
    setSessionPreferencesExpanded(false);
    setSelectedSavedAddressId(selection.savedAddressId || "");
    setAddressDetails((current) => ({
      ...current,
      additionalNotes: current.additionalNotes || selection.sessionNotes || selection.notes || "",
      streetAddress: current.streetAddress || selection.address || "",
    }));
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

  async function confirmPayment(selectedPaymentMethod = paymentMethod) {
    if (!isMobilePreviewFrame && !await bookingAccess.refresh()) return;
    setCheckoutError("");
    let appointmentsForConfirmation = checkoutAppointments;
    if (appointmentsForConfirmation.length === 0) {
      const draft = buildCurrentAppointmentDraft();
      if (draft.error) {
        setCheckoutError(draft.error || "Review your appointment before checkout.");
        setClientBookingMessage(draft.error || "Review your appointment before checkout.");
        return;
      }

      appointmentsForConfirmation = [draft.appointment];
      setCheckoutAppointments(appointmentsForConfirmation);
      setActiveBookingHold(null);
    }

    let confirmationViewOpened = false;

    try {
      const customerPayload = {
        email: contactDetails.email.trim(),
        name: `${contactDetails.firstName} ${contactDetails.lastName}`.trim(),
        phone: contactDetails.phone.trim(),
        telegramUpdates: contactDetails.telegramUpdates,
      };
      const emailPayload = {
        appointments: appointmentsForConfirmation.map((appointment) => ({
          date: appointment.dateLabel,
          durationMinutes: appointment.duration,
          items: appointment.items,
          location: appointment.selectedAreaName,
          manageUrl: `mailto:bookings@vadmassage.com?subject=${encodeURIComponent(`Manage booking ${appointment.dateValue} ${minutesToTime(appointment.start)}`)}`,
          price: appointment.total,
          serviceName: appointment.serviceName,
          time: `${minutesToTime(appointment.start)} - ${minutesToTime(appointment.end)}`,
        })),
        customer: customerPayload,
        address: contactDetails.address.trim(),
        notes: contactDetails.notes.trim(),
        sessionNotes: addressDetails.additionalNotes.trim(),
        sessionPreferenceIds: selectedSessionPreferenceIds,
        sessionPreferenceLabels: selectedSessionPreferenceSnapshots,
        sessionPreferences: selectedSessionPreferenceLabels,
        date: appointmentsForConfirmation[0]?.dateLabel ?? "",
        durationMinutes: appointmentsForConfirmation.reduce((total, appointment) => total + appointment.duration, 0),
        items: appointmentsForConfirmation.flatMap((appointment) => appointment.items),
        location: appointmentsForConfirmation.map((appointment) => appointment.selectedAreaName).filter(Boolean).join(", "),
        time: appointmentsForConfirmation.length === 1 ? `${minutesToTime(appointmentsForConfirmation[0].start)} - ${minutesToTime(appointmentsForConfirmation[0].end)}` : `${appointmentsForConfirmation.length} appointments`,
        total: appointmentsForConfirmation.reduce((total, appointment) => total + appointment.total, 0),
      };
      const confirmed = await onConfirmBooking({
        customer: customerPayload,
        emailPayload,
        appointments: appointmentsForConfirmation,
        paymentMethod: selectedPaymentMethod,
        bookingReference,
        paymentHoldExpiresAt: selectedPaymentMethod === "cash" ? null : paymentHoldExpiresAt,
        savedAddressId: selectedSavedAddressId,
      });

      if (!confirmed || confirmed.error) {
        const message = confirmed?.error || clientBookingMessage || "Your appointment could not be confirmed. Please try again.";
        setCheckoutError(message);
        return;
      }

      logBookingConfirmation("redirect attempted");
      const confirmedList = Array.isArray(confirmed.appointments) && confirmed.appointments.length > 0
        ? confirmed.appointments
        : appointmentsForConfirmation;
      if (clientSession?.user) {
        clearRecentGuestBookingContext();
      } else {
        storeRecentGuestBookingContext({
          appointments: confirmedList,
          bookingReference,
          customer: customerPayload,
          address: emailPayload.address,
          area: emailPayload.location,
          notes: emailPayload.sessionNotes || emailPayload.notes,
        });
      }
      releaseCheckoutHolds(appointmentsForConfirmation);
      setActiveBookingHold(null);
      setConfirmedAppointments(confirmedList);
      setCheckoutAppointments([]);
      resetCurrentAppointmentDraft();
      setPaymentMethod(selectedPaymentMethod);
      setClientStep("payment");
      setClientBookingMessage(
        selectedPaymentMethod === "cash"
          ? "I've received your cash payment request and I'll confirm shortly."
          : ""
      );
      confirmationViewOpened = true;
    } catch (error) {
      logBookingConfirmation("confirmation view failed", error);
      setCheckoutError(error?.message || "Your appointment could not be confirmed. Please try again.");
    } finally {
      if (!confirmationViewOpened) {
        resetClientConfirmGuard();
      }
    }
  }

  function handleConfirmedAppointmentAction(action, appointment) {
    const appointmentLabel = `${appointment.serviceName} on ${appointment.dateLabel} at ${minutesToTime(appointment.start)}`;
    if (action === "manage") {
      confirmationDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      confirmationDetailsRef.current?.focus({ preventScroll: true });
      setClientBookingMessage("");
      return;
    }

    const actionCopy = {
      cancel: "To cancel this appointment, please use the management link from your confirmation email or contact me directly.",
      edit: "To edit this appointment, please use the management link from your confirmation email or contact me directly.",
      reschedule: "To reschedule this appointment, please use the management link from your confirmation email or contact me directly.",
    };

    setClientBookingMessage(`${appointmentLabel}: ${actionCopy[action]}`);
  }

  async function cancelConfirmedBookingByMistake() {
    if (confirmationCancellationPending || confirmedAppointments.length === 0) return;

    const shouldCancel = window.confirm("Are you sure you want to cancel this booking?");
    if (!shouldCancel) return;

    setConfirmationCancellationPending(true);
    setClientBookingMessage("");

    try {
      if (isMobilePreviewFrame) {
        const cancelledAppointments = confirmedAppointments.map((appointment) => ({
          ...appointment,
          cancelledBy: "client",
          paymentStatus: "cancelled",
          status: "cancelled",
        }));
        setConfirmedAppointments(cancelledAppointments);
        setClientBookingMessage("Preview booking cancelled. You can start a new booking whenever you're ready.");
        return;
      }

      const cancelledAppointments = [];

      for (const appointment of confirmedAppointments) {
        if (isCancelledBooking(appointment)) {
          cancelledAppointments.push(appointment);
          continue;
        }

        const cancelledBooking = {
          ...appointment,
          ...(await cancelRecentBookingRequestInSupabase(appointment)),
          cancelledBy: "client",
          paymentStatus: "cancelled",
          status: "cancelled",
        };

        notifyAdminTelegram("booking_cancelled", {
          booking: cancelledBooking,
          cancellationStatus: "cancelled by client immediately after booking",
        });
        cancelledAppointments.push(cancelledBooking);
      }

      setConfirmedAppointments(cancelledAppointments);
      setDays((currentDays) =>
        currentDays.map((day) => ({
          ...day,
          bookings: day.bookings.map((booking) => {
            const cancelledMatch = cancelledAppointments.find((appointment) => appointment.id === booking.id);
            return cancelledMatch ? { ...booking, ...cancelledMatch } : booking;
          }),
        }))
      );
      setClientBookingMessage("Your booking has been cancelled. If this was a mistake, you can start a new booking whenever you're ready.");
    } catch (error) {
      console.warn("Immediate booking cancellation failed", error);
      setClientBookingMessage("I couldn't cancel this booking automatically just now. Please contact me directly and I'll sort it.");
    } finally {
      setConfirmationCancellationPending(false);
    }
  }

  function paymentStatusLabel(appointment = {}) {
    const status = appointment.paymentStatus || appointment.paymentMethod || paymentMethod;
    const statusText = String(status || "").toLowerCase();
    if (status === "cancelled" || statusText.includes("cancel")) return "Booking cancelled";
    if (status === "paid" || status === "payment_received" || status === "confirmed") return "Your appointment is confirmed";
    if (statusText.includes("awaiting") && statusText.includes("approval")) return "I've received your request and will confirm shortly";
    if (statusText.includes("awaiting") && statusText.includes("verification")) return "I'll confirm once I've checked your payment";
    if (status === "cash" || status === "cash_on_arrival" || appointment.paymentMethod === "cash") return "I've received your cash payment request";
    if (status === "alternative_requested" || appointment.paymentMethod === "alternative_requested") return "Alternative payment requested";
    if (status === "awaiting_verification" || status === "bank_transfer" || appointment.paymentMethod === "bank_transfer") return "I'll confirm once I've checked your payment";
    return status ? status.replace(/_/g, " ") : "I'll confirm shortly";
  }

  function confirmationHeadline() {
    const appointment = confirmedAppointments[0] || {};
    const status = appointment.paymentStatus || appointment.paymentMethod || paymentMethod;
    const statusText = String(status || "").toLowerCase();
    if (status === "cancelled" || statusText.includes("cancel")) return "Booking cancelled";
    if (status === "paid" || status === "payment_received" || status === "confirmed") return "Your appointment is confirmed";
    if (statusText.includes("awaiting") && statusText.includes("approval")) return "I've received your request";
    if (statusText.includes("awaiting") && statusText.includes("verification")) return "I've received your booking";
    if (status === "cash" || status === "cash_on_arrival" || appointment.paymentMethod === "cash") return "I've received your cash payment request";
    if (status === "awaiting_verification" || status === "bank_transfer" || appointment.paymentMethod === "bank_transfer") return "I've received your booking";
    return "Your appointment is confirmed";
  }

  if (!isMobilePreviewFrame && clientStep !== "my-bookings" && confirmedAppointments.length === 0 && !bookingAccess.allowed) {
    return <ClientOnboarding
      loading={bookingAccess.loading}
      message={bookingAccess.error}
      onRetry={bookingAccess.refresh}
      onSwitchAdmin={onSwitchAdmin}
      onEmailLogin={onEmailLogin}
      onGoogleLogin={onGoogleLogin}
      onMyBookings={openMyBookings}
      onSignOut={onClientSignOut}
      signingIn={clientAuthActionLoading}
      error={clientAuthError}
      notice={clientAuthNotice}
      profile={clientProfile}
      session={clientSession}
    />;
  }

  const premiumBookingDetailsPanel = bookingDetailsOpen ? (
    <section className="premium-booking-details-panel" id="premium-booking-details">
      <div>
        <span>Area</span>
        <strong>{selectedArea?.name || "Not selected"}</strong>
      </div>
      <div>
        <span>Treatment</span>
        <strong>{selectedTreatmentDetails.title}</strong>
      </div>
      <div>
        <span>Duration</span>
        <strong>{bookingDurationMinutes > 0 ? `${bookingDurationMinutes} mins` : "Not selected"}</strong>
      </div>
      <div className="premium-booking-details-note">
        <span>Session note</span>
        <strong>Longer times are for one guest. If you would like two guests or a combination of treatments, each session is arranged and priced separately.</strong>
      </div>
      <div>
        <span>Date</span>
        <strong>{chosenDayLabel}</strong>
      </div>
      <div>
        <span>Time</span>
        <strong>{clientSelectedSlot ? minutesToTime(clientSelectedSlot.start) : "Not selected"}</strong>
      </div>
      <div>
        <span>Estimated total</span>
        <strong>{bookingTotal > 0 ? `£${bookingTotal.toFixed(2)}` : "Pending"}</strong>
      </div>
    </section>
  ) : null;
  const clientLocationAreas = visibleServiceAreas.map((area) => {
    const congestionFee = Number(area.congestionFee) || 0;
    const travelSurcharge = Number(area.travelSurcharge) || 0;
    return {
      ...area,
      congestionFeeLabel: congestionFee > 0 ? formatMoney(congestionFee) : "",
      selected: selectedAreaId === area.id,
      travelSurchargeLabel: travelSurcharge > 0 ? formatMoney(travelSurcharge) : "",
    };
  });
  const clientTreatmentCards = treatmentOptions.map((service) => {
    const details = getClientTreatmentCardDetails(service);
    return {
      ...service,
      description: details.description,
      icon: details.icon,
      title: details.title,
    };
  });
  const clientDurationOptions = CLIENT_DURATION_OPTIONS.map((option) => {
    const quantity = Math.max(0, Number(selectedDurationQuantities[option.minutes]) || 0);
    return {
      ...option,
      addDisabled: !selectedServiceId,
      priceLabel: selectedBasketService ? `£${getServiceDurationPrice(selectedBasketService, option.minutes)}` : "",
      quantity,
    };
  });
  const clientDateCards = clientDateWindow
    .filter((day) => day.dateValue >= todayValue())
    .map((day) => {
      const dateParts = getClientDateCardParts(day);
      const matchingIndex = days.findIndex((item) => item.dateValue === day.dateValue);
      return {
        ...dateParts,
        dateValue: day.dateValue,
        day,
        dayIndex: matchingIndex >= 0 ? matchingIndex : clientDayIndex,
        selected: day.dateValue === selectedDay.dateValue,
      };
    });
  const clientTimeSlots = clientPreview.slots.map((slot) => ({
    evening: slot.start >= 18 * 60,
    key: `${slot.start}-${slot.bufferEnd}`,
    label: minutesToTime(slot.start),
    selected: clientSelectedSlot?.start === slot.start && clientSelectedSlot?.bufferEnd === slot.bufferEnd,
    slot,
  }));
  const clientDetailsAppointment = {
    areaLabel: selectedArea?.name || "Area not selected",
    durationMinutes: bookingDurationMinutes,
    timeLabel: clientSelectedSlot ? `${chosenDayLabel} at ${minutesToTime(clientSelectedSlot.start)}` : chosenDayLabel,
    treatmentTitle: getClientTreatmentCardDetails(treatmentOptions.find((service) => service.id === primaryServiceId) || {}).title,
  };
  return (
    <section className="booking-page" ref={bookingPageRef}>
      {!["location", "treatment", "duration", "time", "review", "details", "payment"].includes(clientStep) && (
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
      )}
      {showLocalPreviewControls && !isMobilePreviewFrame && ["location", "treatment", "duration", "time", "review", "details", "payment"].includes(clientStep) && (
        <button type="button" className="premium-admin-access-button" onClick={onSwitchAdmin}>
          Admin
        </button>
      )}

      {clientBookingMessage && confirmedAppointments.length === 0 && (
        <p className="booking-status"><span aria-hidden="true" className="booking-status-icon" />{clientBookingMessage}</p>
      )}

      {clientStep === "my-bookings" && (
        <MyBookingsPanel
          calendarDays={days}
          error={myBookingsError || clientAuthError}
          groupedBookings={myBookingsGrouped}
          loading={myBookingsLoading || (clientAuthLoading && Boolean(clientSession?.user))}
          onBackToBooking={returnFromMyBookings}
          onBookAgain={applyMyBookingsBookAgain}
          onBookMassage={() => setClientStep("location")}
          onEmailLogin={onEmailLogin}
          onGoogleLogin={onGoogleLogin}
          onRefreshBookings={refreshMyBookings}
          notice={clientAuthNotice}
          session={clientSession}
          signingIn={clientAuthActionLoading}
        />
      )}

      {clientStep === "location" && (
        <ClientLocationStep
          account={{
            error: clientAuthError,
            loading: clientAuthLoading,
            notice: clientAuthNotice,
            profile: clientProfile,
            session: clientSession,
            signingIn: clientAuthActionLoading,
          }}
          areaPickerRef={areaPickerRef}
          areaSelectionMessage={areaSelectionMessage || serviceAreasMessage}
          bookAgain={{
            show: Boolean(clientSession?.user),
            clientName: clientProfile?.fullName || "",
            favoriteSelection: clientBookingContext?.favoriteSelection || null,
            lastSelection: clientBookingContext?.lastSelection || null,
            loading: clientBookingContextLoading,
            onApply: applyReturningClientSelection,
            recentSelections: clientBookingContext?.recentBookingCombinations || [],
            usualSelection: clientBookingContext?.usualSelection || null,
          }}
          onBackToReview={() => {
            setReturnToReviewAfterArea(false);
            setClientStep("review");
          }}
          onEmailLogin={onEmailLogin}
          onGoogleLogin={onGoogleLogin}
          onMyBookings={openMyBookings}
          onSelectArea={selectAreaAndContinue}
          onSignOut={onClientSignOut}
          onToggleMoreAreas={() => setShowMoreAreas((isOpen) => !isOpen)}
          returnToReviewAfterArea={returnToReviewAfterArea}
          serviceAreas={clientLocationAreas}
          showMoreAreas={showMoreAreas}
          showMoreButton={secondaryServiceAreas.length > 0 && featuredServiceAreas.length > 0}
        />
      )}

      {clientStep === "treatment" && (
        <ClientTreatmentStep
          onBack={() => setClientStep("location")}
          onSelectTreatment={selectTreatmentAndContinue}
          progress={renderPremiumStepProgress()}
          treatments={clientTreatmentCards}
        />
      )}

      {clientStep === "duration" && (
        <ClientDurationStep
          continueReason={treatmentContinueReason}
          durationOptions={clientDurationOptions}
          onAddDuration={selectServiceDuration}
          onBack={() => setClientStep("treatment")}
          onNext={continueFromDuration}
          onRemoveDuration={removeServiceDuration}
          progress={renderPremiumStepProgress()}
          valid={orderDurationIsValid}
        />
      )}

      {clientStep === "time" && waitlistFormOpen && (
        <section className="booking-time-screen waitlist-request-screen">
          <div className="time-selection-panel waitlist-request-panel">
            <header className="premium-step-header">
              <span className="premium-header-spacer" aria-hidden="true" />
              <div className="premium-brand-lockup" aria-label="VadMassage">
                <span className="premium-brand-mark">VM</span>
                <strong>VadMassage</strong>
              </div>
            </header>
            {renderPremiumStepProgress("premium-time-progress")}
            <div className="time-copy">
              <p className="premium-section-label">Waiting list</p>
              <h1>Join the waiting list</h1>
              <p>Tell me what dates and start times could work. I will contact you if a suitable appointment opens.</p>
            </div>
            <form
              className="waitlist-request-form"
              onSubmit={(event) => onJoinWaitlist(event, {
                areaName: selectedArea?.name || "",
                email: contactDetails.email,
                phone: contactDetails.phone,
              })}
            >
              <section className="waitlist-request-card" aria-label="Date preference">
                <div className="waitlist-request-card-heading">
                  <p>Requested date</p>
                  <strong>
                    {waitlistForm.datePreferenceType === "any"
                      ? "Any suitable date"
                      : waitlistForm.datePreferenceType === "range"
                        ? `${formatWaitlistRequestDate(waitlistForm.preferredDate)} to ${formatWaitlistRequestDate(waitlistForm.preferredDateEnd)}`
                        : formatWaitlistRequestDate(waitlistForm.preferredDate)}
                  </strong>
                </div>
                <label className="waitlist-field">
                  <span>Date preference</span>
                  <select
                    value={waitlistForm.datePreferenceType}
                    onChange={(event) => {
                      const datePreferenceType = event.target.value;
                      setWaitlistForm((current) => ({
                        ...current,
                        datePreferenceType,
                        preferredDate: datePreferenceType === "any" ? selectedDay.dateValue : current.preferredDate || selectedDay.dateValue,
                        preferredDateEnd: current.preferredDateEnd || addDaysToDateValue(current.preferredDate || selectedDay.dateValue, 1),
                      }));
                    }}
                  >
                    {WAITLIST_DATE_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                {waitlistForm.datePreferenceType === "single" && (
                  <label className="waitlist-field">
                    <span>Preferred date</span>
                    <input
                      type="date"
                      min={todayValue()}
                      value={waitlistForm.preferredDate}
                      onChange={(event) => setWaitlistForm((current) => ({ ...current, preferredDate: event.target.value }))}
                    />
                  </label>
                )}
                {waitlistForm.datePreferenceType === "range" && (
                  <div className="waitlist-date-range-grid">
                    <label className="waitlist-field">
                      <span>Start date</span>
                      <input
                        type="date"
                        min={todayValue()}
                        value={waitlistForm.preferredDate}
                        onChange={(event) => {
                          const preferredDate = event.target.value;
                          setWaitlistForm((current) => ({
                            ...current,
                            preferredDate,
                            preferredDateEnd: current.preferredDateEnd && current.preferredDateEnd >= preferredDate
                              ? current.preferredDateEnd
                              : preferredDate,
                          }));
                        }}
                      />
                    </label>
                    <label className="waitlist-field">
                      <span>End date</span>
                      <input
                        type="date"
                        min={waitlistForm.preferredDate || todayValue()}
                        value={waitlistForm.preferredDateEnd}
                        onChange={(event) => setWaitlistForm((current) => ({ ...current, preferredDateEnd: event.target.value }))}
                      />
                    </label>
                  </div>
                )}
                {waitlistForm.datePreferenceType === "any" && (
                  <p className="waitlist-helper-copy">I can offer the nearest suitable appointment for this treatment.</p>
                )}
              </section>
              <section className="waitlist-request-card" aria-label="Start time preference">
                <div className="waitlist-request-card-heading">
                  <p>Start time</p>
                  <strong>
                    {waitlistForm.preferredWindow === WAITLIST_NO_PREFERENCE
                      ? WAITLIST_NO_PREFERENCE
                      : waitlistForm.preferenceType === "window"
                        ? `${waitlistForm.preferredWindow} to ${waitlistForm.preferredWindowEnd || nextWaitlistRangeEnd(waitlistForm.preferredWindow)}`
                        : waitlistForm.preferredWindow}
                  </strong>
                </div>
                <label className="waitlist-field">
                  <span>When would suit you?</span>
                  <select
                    value={waitlistForm.preferredWindow === WAITLIST_NO_PREFERENCE ? "none" : waitlistForm.preferenceType}
                    onChange={(event) => {
                      const mode = event.target.value;
                      setWaitlistForm((current) => ({
                        ...current,
                        preferenceType: mode === "window" ? "window" : "exact",
                        preferredWindow: mode === "none" ? WAITLIST_NO_PREFERENCE : DEFAULT_WAITLIST_TIME,
                        preferredWindowEnd: mode === "window" ? nextWaitlistRangeEnd(DEFAULT_WAITLIST_TIME) : current.preferredWindowEnd,
                      }));
                    }}
                  >
                    {WAITLIST_TIME_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <small>
                    {waitlistForm.preferredWindow === WAITLIST_NO_PREFERENCE
                      ? "You can leave the start time open."
                      : "Choose when you'd like the appointment to start."}
                  </small>
                </label>
                {waitlistForm.preferredWindow !== WAITLIST_NO_PREFERENCE && waitlistForm.preferenceType === "exact" && (
                  <label className="waitlist-field">
                    <span>Preferred start time</span>
                    <select
                      value={waitlistForm.preferredWindow}
                      onChange={(event) => setWaitlistForm((current) => ({ ...current, preferredWindow: event.target.value }))}
                    >
                      {WAITLIST_TIME_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                )}
                {waitlistForm.preferredWindow !== WAITLIST_NO_PREFERENCE && waitlistForm.preferenceType === "window" && (
                  <div className="waitlist-time-range-group">
                    <label className="waitlist-field">
                      <span>Earliest start</span>
                      <select
                        value={waitlistForm.preferredWindow}
                        onChange={(event) => {
                          const start = event.target.value;
                          setWaitlistForm((current) => {
                            const endOptions = waitlistRangeEndOptions(start);
                            const preferredWindowEnd = endOptions.includes(current.preferredWindowEnd)
                              ? current.preferredWindowEnd
                              : nextWaitlistRangeEnd(start);
                            return { ...current, preferredWindow: start, preferredWindowEnd };
                          });
                        }}
                      >
                        {WAITLIST_RANGE_FROM_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label className="waitlist-field">
                      <span>Latest start</span>
                      <select
                        value={waitlistForm.preferredWindowEnd || nextWaitlistRangeEnd(waitlistForm.preferredWindow)}
                        onChange={(event) => setWaitlistForm((current) => ({ ...current, preferredWindowEnd: event.target.value }))}
                      >
                        {waitlistRangeEndOptions(waitlistForm.preferredWindow).map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </section>
              <section className="waitlist-request-card" aria-label="Your details">
                <label className="waitlist-field">
                  <span>Name</span>
                  <input
                    type="text"
                    required
                    placeholder="Your name"
                    value={waitlistForm.clientName}
                    onChange={(event) => setWaitlistForm((current) => ({ ...current, clientName: event.target.value }))}
                  />
                </label>
                <div className="waitlist-contact-grid">
                  <label className="waitlist-field">
                    <span>Email address</span>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={waitlistForm.email}
                      onChange={(event) => setWaitlistForm((current) => ({ ...current, email: event.target.value }))}
                    />
                  </label>
                  <label className="waitlist-field">
                    <span>Phone number</span>
                    <input
                      type="tel"
                      placeholder="Mobile number"
                      value={waitlistForm.phone}
                      onChange={(event) => setWaitlistForm((current) => ({ ...current, phone: event.target.value }))}
                    />
                  </label>
                </div>
                <p className="waitlist-helper-copy">Add either email or phone. You can add both if you like.</p>
                <label className="waitlist-field">
                  <span>Notes</span>
                  <textarea
                    placeholder="Anything you would like me to know?"
                    value={waitlistForm.notes}
                    onChange={(event) => setWaitlistForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </label>
              </section>
              {clientBookingMessage && <p className="booking-validation-message">{clientBookingMessage}</p>}
              <footer className="premium-time-footer waitlist-request-footer">
                <button
                  type="button"
                  className="premium-footer-back-button"
                  onClick={() => setWaitlistFormOpen(false)}
                >
                  <ChevronLeft aria-hidden="true" size={26} strokeWidth={1.8} />
                  Back to times
                </button>
                <button type="submit" className="time-next-button">
                  Join waiting list
                  <ChevronRight aria-hidden="true" size={28} strokeWidth={1.8} />
                </button>
              </footer>
            </form>
          </div>
        </section>
      )}

      {clientStep === "time" && !waitlistFormOpen && (
        <ClientTimeStep
          bookingDetailsOpen={bookingDetailsOpen}
          bookingDetailsPanel={premiumBookingDetailsPanel}
          checkoutError={checkoutError}
          dateStripRef={premiumDateStripRef}
          dates={clientDateCards}
          holdIsCreating={holdIsCreating}
          message={clientBookingMessage || timeReselectMessage}
          noSlotMessage={clientNoSlotMessage}
          onBack={() => setClientStep("duration")}
          onNext={() => setClientStep("review")}
          onOpenWaitlist={openWaitlistPanel}
          onScrollDates={scrollPremiumDateStrip}
          onSelectDate={(day) => updateDay(day.dayIndex, day.dateValue)}
          onSelectSlot={selectTimeSlot}
          onToggleDetails={() => setBookingDetailsOpen((open) => !open)}
          progress={renderPremiumStepProgress("premium-time-progress")}
          canContinue={Boolean(clientSelectedSlot)}
          showFixedStartHint={showFixedStartHint}
          showPrimaryWaitlistCta={clientPreview.warnings.length === 0}
          slots={clientTimeSlots}
          timeContinueReason={timeContinueReason}
        />
      )}

      {clientStep === "review" && (
        <section className="booking-review-screen">
          <div className="review-selection-panel">
            <header className="premium-step-header">
              <span className="premium-header-spacer" aria-hidden="true" />
              <div className="premium-brand-lockup" aria-label="VadMassage">
                <span className="premium-brand-mark">VM</span>
                <strong>VadMassage</strong>
              </div>
            </header>
            {renderPremiumStepProgress("premium-review-progress")}
            <div className="review-copy">
              <p className="premium-section-label">Review</p>
              <h1>Review your booking</h1>
              <p>You can still change anything before confirming.</p>
            </div>

            <section className="review-card review-appointment-card">
              <h2>Your Appointment</h2>
              <div className="review-edit-list">
                {[
                  {
                    icon: MapPin,
                    label: "Area",
                    onClick: editReviewArea,
                    value: selectedArea?.name || "Choose an area",
                  },
                  {
                    icon: CalendarDays,
                    label: "Date",
                    onClick: () => setClientStep("time"),
                    value: formatReviewDate(selectedDay.dateValue, chosenDayLabel),
                  },
                  {
                    icon: Clock3,
                    label: "Time",
                    onClick: () => setClientStep("time"),
                    value: clientSelectedSlot ? formatReviewTime(clientSelectedSlot.start) : "Choose a time",
                  },
                  {
                    icon: Activity,
                    label: "Duration",
                    onClick: editReviewDuration,
                    value: `${bookingDurationMinutes || orderTotalMinutes} minutes`,
                  },
                ].map((row) => (
                  <button type="button" className="review-edit-row" key={row.label} onClick={row.onClick}>
                    <span className="review-row-icon" aria-hidden="true">
                      <row.icon size={30} strokeWidth={1.7} />
                    </span>
                    <span className="review-row-copy">
                      <small>{row.label}</small>
                      <strong>{row.value}</strong>
                    </span>
                    <ChevronRight aria-hidden="true" size={28} strokeWidth={1.8} />
                  </button>
                ))}
              </div>
            </section>

            <section className="review-card review-sessions-card">
              <div className="review-section-heading">
                <h2>{reviewSessionHeading}</h2>
                {reviewSessionSummaryLabel && <span>{reviewSessionSummaryLabel}</span>}
              </div>
              <div className="review-treatment-list">
                {reviewSessionItems.map((service, index) => {
                  const details = getClientTreatmentCardDetails(service);
                  const Icon = details.icon || Dumbbell;
                  const preferenceKey = service.minutes !== 30 ? (service.itemKey || `${service.id}-${service.minutes}-${index}`) : "";
                  const preferenceGroup = selectedSessionPreferenceGroups.find((group) => group.key === preferenceKey);
                  const preferenceLabels = preferenceGroup?.preferenceLabels || [];
                  const isPreferenceTarget = Boolean(preferenceKey);
                  const isActivePreferenceTarget = isPreferenceTarget && preferenceKey === currentSessionPreferenceKey;

                  return (
                    <button
                      type="button"
                      className={isActivePreferenceTarget ? "review-treatment-card selected-review-treatment-card" : "review-treatment-card"}
                      key={service.itemKey || `${service.id}-${service.minutes}`}
                      disabled={!isPreferenceTarget}
                      aria-pressed={isActivePreferenceTarget}
                      onClick={() => {
                        if (isPreferenceTarget) setActiveSessionPreferenceKey(preferenceKey);
                      }}
                    >
                      <span className="review-treatment-icon" aria-hidden="true">
                        <Icon size={30} strokeWidth={1.6} />
                      </span>
                      <span className="review-treatment-copy">
                        <strong>{service.reviewLabel || details.title}</strong>
                        <small>{service.reviewSubLabel || `${details.title} · ${service.minutes} minutes`}</small>
                        {preferenceLabels.length > 0 && <em>{preferenceLabels.join(", ")}</em>}
                      </span>
                      <b>{formatMoney(service.price)}</b>
                    </button>
                  );
                })}
              </div>
              <section className="review-session-preferences-card" aria-labelledby="session-preferences-title">
                <label className="review-session-notes-label" htmlFor="session-preferences-notes">
                  <strong id="session-preferences-title">Session preferences</strong>
                  <textarea
                    id="session-preferences-notes"
                    maxLength={1000}
                    rows={addressDetails.additionalNotes.trim().length > 120 ? 4 : 3}
                    placeholder="Add notes or preferences for your session"
                    value={addressDetails.additionalNotes}
                    onChange={(event) => updateAddressDetail("additionalNotes", event.target.value.slice(0, 1000))}
                  />
                </label>
                <div className="review-preference-chip-group" aria-label="Quick session preferences">
                  <span className="review-preference-chip-label">Tap to add for {currentSessionPreferenceLabel}</span>
                  <div className="review-preference-chips">
                    {visibleSessionPreferences.map((preference) => {
                      const selected = selectedCurrentSessionPreferenceIds.includes(preference.id);

                      return (
                        <button
                          type="button"
                          key={preference.id}
                          className={selected ? "review-preference-chip selected-review-preference-chip" : "review-preference-chip"}
                          aria-pressed={selected}
                          onClick={() => toggleSessionPreference(preference.id)}
                        >
                          <span aria-hidden="true">{selected ? <Check size={14} strokeWidth={2.2} /> : "+"}</span>
                          {preference.label}
                        </button>
                      );
                    })}
                    {showSessionPreferencesMoreButton && (
                      <button
                        type="button"
                        className="review-preference-chip review-preference-more-chip"
                        aria-expanded={sessionPreferencesExpanded}
                        aria-label={sessionPreferencesExpanded ? "Show fewer session preferences" : "Show more session preferences"}
                        onClick={() => setSessionPreferencesExpanded((expanded) => !expanded)}
                      >
                        <span aria-hidden="true">{sessionPreferencesExpanded ? "" : "+"}</span>
                        {sessionPreferencesExpanded ? "Show less" : "More preferences"}
                      </button>
                    )}
                  </div>
                </div>
                {selectedSessionPreferenceGroups.some((group) => group.preferenceLabels.length > 0) && (
                  <p className="review-preference-summary">
                    <strong>Added:</strong>{" "}
                    {selectedSessionPreferenceGroups
                      .filter((group) => group.preferenceLabels.length > 0)
                      .map((group) => `${group.label}: ${group.preferenceLabels.join(", ")}`)
                      .join("; ")}
                  </p>
                )}
              </section>
            </section>

            {activeEnhancements.length > 0 && (
              <section className="review-card review-enhancements-card" aria-labelledby="review-enhancements-title">
                <div className="review-section-heading">
                  <div>
                    <h2 id="review-enhancements-title">Enhance your session</h2>
                    <p>Optional additions for your appointment</p>
                  </div>
                  {selectedEnhancementItems.length > 0 && (
                    <span>{selectedEnhancementItems.length} added</span>
                  )}
                </div>
                <div className="review-enhancement-list">
                  {activeEnhancements.map((enhancement) => {
                    const selected = selectedEnhancements.includes(enhancement.id);
                    const priceLabel = Number(enhancement.price) > 0 ? `+${formatMoney(enhancement.price)}` : "Free";

                    return (
                      <article
                        className={selected ? "review-enhancement-row selected-review-enhancement-row" : "review-enhancement-row"}
                        key={enhancement.id}
                      >
                        <span className="review-enhancement-icon" aria-hidden="true">
                          <Sparkles size={22} strokeWidth={1.7} />
                        </span>
                        <div className="review-enhancement-copy">
                          <strong>{enhancement.name}</strong>
                          {enhancement.description && <small>{enhancement.description}</small>}
                        </div>
                        <strong className="review-enhancement-price">{priceLabel}</strong>
                        {selected ? (
                          <div className="review-enhancement-selected-actions">
                            <span className="review-enhancement-added">
                              <Check aria-hidden="true" size={16} strokeWidth={2} />
                              Added
                            </span>
                            <button
                              type="button"
                              className="review-enhancement-remove-button"
                              aria-label={`Remove ${enhancement.name} from appointment`}
                              onClick={() => toggleEnhancement(enhancement.id)}
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="review-enhancement-add-button"
                            aria-label={`Add ${enhancement.name}`}
                            onClick={() => toggleEnhancement(enhancement.id)}
                          >
                            + Add
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="review-card review-price-card">
              <h2>Price Summary</h2>
              <div className="review-price-list">
                {reviewPriceRows.map((row) => (
                  <div className="review-price-row" key={row.label}>
                    <span>{row.label}</span>
                    <strong>{row.valueLabel || formatMoney(row.value)}</strong>
                  </div>
                ))}
                <div className="review-price-total">
                  <span>Total</span>
                  <strong>{formatMoney(bookingTotal)}</strong>
                </div>
              </div>
            </section>

            {reviewContinueReason && (
              <p className="booking-validation-message">
                {reviewContinueReason}
              </p>
            )}

            <footer className="premium-review-footer">
              <button
                type="button"
                className="premium-footer-back-button"
                onClick={() => setClientStep("time")}
              >
                <ChevronLeft aria-hidden="true" size={26} strokeWidth={1.8} />
                Back
              </button>
              <button
                type="button"
                className="review-continue-button"
                disabled={Boolean(reviewContinueReason)}
                onClick={continueToCheckoutDetails}
              >
                Next
                <ChevronRight aria-hidden="true" size={30} strokeWidth={1.8} />
              </button>
              <p className="location-security-note review-security-note">
                <ShieldCheck aria-hidden="true" size={22} strokeWidth={1.8} />
                Your information is secure and encrypted
              </p>
            </footer>
          </div>
        </section>
      )}

      {clientStep === "details" && (
        <ClientDetailsStep
          appointment={clientDetailsAppointment}
          bookingDetailsOpen={bookingDetailsOpen}
          bookingDetailsPanel={premiumBookingDetailsPanel}
          canContinue={contactCanContinue && checkoutAppointments.length > 0}
          contact={{
            additionalNotes: addressDetails.additionalNotes,
            apartment: addressDetails.apartment,
            city: addressDetails.city,
            email: contactDetails.email,
            entryInstructions: addressDetails.entryInstructions,
            nameInput: contactNameInput || contactFullName,
            phone: contactDetails.phone,
            postcode: addressDetails.postcode,
            streetAddress: addressDetails.streetAddress,
          }}
          contactContinueReason={contactContinueReason}
          dev={import.meta.env.DEV}
          onBack={() => setClientStep("review")}
          onChangeAddress={updateAddressDetail}
          onChangeContact={updateContactDetail}
          onChangeFullName={updateContactFullName}
          onFillTestClient={fillTestClientDetails}
          onNext={() => setClientStep("payment")}
          onToggleDetails={() => setBookingDetailsOpen((open) => !open)}
          progress={renderPremiumStepProgress("premium-address-progress")}
          showCheckoutWarning={checkoutAppointments.length === 0}
        />
      )}

      {clientStep === "payment" && (
        <section className="booking-payment-screen">
          <div className="payment-selection-panel">
            {confirmedAppointments.length > 0 ? (
              <div className="payment-confirmation-panel premium-confirmation-panel">
                <header className="confirmation-hero">
                  <div className="premium-brand-lockup confirmation-brand-lockup" aria-label="VadMassage">
                    <span className="premium-brand-mark">VM</span>
                    <strong>VadMassage</strong>
                  </div>
                  <div className="confirmation-sparkles" aria-hidden="true">
                    <Sparkles size={18} strokeWidth={1.6} />
                    <Sparkles size={14} strokeWidth={1.7} />
                    <Sparkles size={16} strokeWidth={1.6} />
                  </div>
                  <span className="confirmation-success-mark" aria-hidden="true">
                    <Check size={54} strokeWidth={2.7} />
                  </span>
                  <h1>{confirmationHeadline()}</h1>
                  <p className="confirmation-statement">
                    Thank you. I look forward to seeing you. I tailor each session to what your body needs on the day, so your time feels well spent.
                  </p>
                  <span className="confirmation-reference-pill">
                    <ReceiptText aria-hidden="true" size={22} strokeWidth={1.8} />
                    Booking reference: <strong>{bookingReference || confirmedAppointments[0]?.bookingReference || "Pending"}</strong>
                  </span>
                </header>

                <section className="confirmation-card confirmation-appointment-card">
                  <div className="confirmation-appointment-list">
                    {confirmedAppointments.map((appointment, index) => {
                      const appointmentReference = appointment.bookingReference || bookingReference || "Pending";
                      const emailRecipient = appointment.customerEmail || contactEmail || "";
                      const confirmationPreferenceLabels = sessionPreferenceLabels(
                        appointment.sessionPreferenceIds,
                        sessionPreferences,
                        appointment.sessionPreferenceLabels
                      );
                      const confirmationSessionNotes = String(appointment.sessionNotes || "").trim();

                      return (
                        <article className="confirmation-appointment-item" key={appointment.id}>
                          <span className="confirmation-treatment-icon" aria-hidden="true">
                            <Activity size={34} strokeWidth={1.55} />
                          </span>
                          <div className="confirmation-appointment-main">
                            {confirmedAppointments.length > 1 && <small>Appointment {index + 1}</small>}
                            <h2>{appointment.serviceName}</h2>
                            <p><CalendarDays aria-hidden="true" size={21} strokeWidth={1.7} /> {formatReviewDate(appointment.dateValue, appointment.dateLabel)}</p>
                            <p><Clock3 aria-hidden="true" size={21} strokeWidth={1.7} /> {minutesToTime(appointment.start)} - {minutesToTime(appointment.end)} ({appointment.duration} minutes)</p>
                            <p><MapPin aria-hidden="true" size={21} strokeWidth={1.7} /> {appointment.selectedAreaName || appointment.location || "Area confirmed"}</p>
                            <p><ReceiptText aria-hidden="true" size={21} strokeWidth={1.7} /> {appointmentReference}</p>
                            {Number(appointment.congestionFee) > 0 && (
                              <p>Congestion Fee: {formatMoney(appointment.congestionFee)}</p>
                            )}
                            {Number(appointment.travelFee) > 0 && (
                              <p>Travel Fee: {formatMoney(appointment.travelFee)}</p>
                            )}
                            {(confirmationPreferenceLabels.length > 0 || confirmationSessionNotes) && (
                              <div className="confirmation-session-preferences">
                                {confirmationPreferenceLabels.length > 0 && (
                                  <p><strong>Session preferences:</strong> {confirmationPreferenceLabels.join(", ")}</p>
                                )}
                                {confirmationSessionNotes && (
                                  <p><strong>Client note:</strong> {confirmationSessionNotes}</p>
                                )}
                              </div>
                            )}
                          </div>
                          <aside className="confirmation-appointment-meta">
                            <div>
                              <Mail aria-hidden="true" size={22} strokeWidth={1.7} />
                              <span>Confirmation email</span>
                              <strong>{emailRecipient || "Email not provided"}</strong>
                            </div>
                            <div className="confirmation-payment-status">
                              <CheckCircle2 aria-hidden="true" size={22} strokeWidth={1.8} />
                              <span>Payment</span>
                              <strong>{paymentStatusLabel(appointment)}</strong>
                            </div>
                          </aside>
                          <div className="confirmation-appointment-actions">
                            <button type="button" onClick={() => handleConfirmedAppointmentAction("manage", appointment)}>
                              <ReceiptText aria-hidden="true" size={22} strokeWidth={1.8} />
                              View Details
                            </button>
                            <p className="confirmation-reschedule-note">
                              <CalendarDays aria-hidden="true" size={22} strokeWidth={1.8} />
                              To reschedule, please contact me directly.
                            </p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>

                <section className="confirmation-card confirmation-telegram-card">
                  <span className="confirmation-card-icon" aria-hidden="true">
                    <MessageCircle size={32} strokeWidth={1.7} />
                  </span>
                  <div>
                    <h2>Telegram updates</h2>
                    <p>Email remains the main place for your confirmation and reminder.</p>
                    {confirmationTelegramUrl && <p>
                      For Telegram updates,{" "}
                      <strong className="confirmation-telegram-start">open the chat bot and press Start</strong>.
                      {" "}Your booking reference is included so I can connect your request.
                    </p>}
                    {confirmationTelegramUrl ? (
                      <a className="confirmation-telegram-action" href={confirmationTelegramUrl} target="_blank" rel="noreferrer">
                        Open Telegram bot
                        <ChevronRight aria-hidden="true" size={22} strokeWidth={1.8} />
                      </a>
                    ) : (
                      <p className="confirmation-telegram-note">{clientTelegramConnected
                        ? "Telegram is already connected to your client account."
                        : "Telegram updates are currently unavailable. Your booking updates will arrive by email."}</p>
                    )}
                  </div>
                </section>

                {paymentMethod === "bank_transfer" && (
                  <section
                    className="confirmation-card confirmation-payment-details-card"
                    ref={confirmationDetailsRef}
                    tabIndex={-1}
                  >
                    <div className="confirmation-card-heading">
                      <Landmark aria-hidden="true" size={30} strokeWidth={1.8} />
                      <div>
                        <h2>Payment details</h2>
                        <p>Use these details if you still need to complete the bank transfer.</p>
                      </div>
                    </div>
                    <div className="confirmation-payment-summary">
                      <div>
                        <span>Amount to transfer</span>
                        <strong>{"\u00a3"}{confirmedPaymentTotal.toFixed(2)}</strong>
                      </div>
                    </div>
                    <div className="confirmation-bank-detail-list">
                      {BANK_TRANSFER_CONFIGURATION.isConfigured ? (
                        <>
                          {BANK_TRANSFER_DETAILS.map((detail) => (
                            <div className="confirmation-bank-detail-row" key={detail.label}>
                              <span className="payment-card-icon" aria-hidden="true">
                                <detail.icon size={22} strokeWidth={1.7} />
                              </span>
                              <div>
                                <span>{detail.label}</span>
                                <strong>{detail.value}</strong>
                              </div>
                              <button
                                type="button"
                                aria-label={`Save ${detail.label} to clipboard`}
                                title={`Save ${detail.label} to clipboard`}
                                className={copiedPaymentKey === `confirmed-bank-${detail.label}` ? "copied-payment-button" : ""}
                                onClick={() => copyPaymentText(detail.value, `confirmed-bank-${detail.label}`)}
                              >
                                {copiedPaymentKey === `confirmed-bank-${detail.label}` ? (
                                  <Check aria-hidden="true" size={18} strokeWidth={2} />
                                ) : (
                                  <Copy aria-hidden="true" size={18} strokeWidth={1.9} />
                                )}
                              </button>
                            </div>
                          ))}
                          <div className="confirmation-bank-detail-row">
                            <span className="payment-card-icon" aria-hidden="true">
                              <ReceiptText size={22} strokeWidth={1.7} />
                            </span>
                            <div>
                              <span>Payment Reference</span>
                              <strong>{confirmedPaymentReference}</strong>
                            </div>
                            <button
                              type="button"
                              aria-label="Save payment reference to clipboard"
                              title="Save payment reference to clipboard"
                              className={copiedPaymentKey === "confirmed-booking-reference" ? "copied-payment-button" : ""}
                              onClick={() => copyPaymentText(confirmedPaymentReference, "confirmed-booking-reference")}
                            >
                              {copiedPaymentKey === "confirmed-booking-reference" ? (
                                <Check aria-hidden="true" size={18} strokeWidth={2} />
                              ) : (
                                <Copy aria-hidden="true" size={18} strokeWidth={1.9} />
                              )}
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="bank-transfer-note">{BANK_TRANSFER_CONFIGURATION.message}</p>
                      )}
                    </div>
                  </section>
                )}

                <section className="confirmation-card confirmation-save-card">
                  <span className="confirmation-card-icon" aria-hidden="true">
                    <UserRound size={32} strokeWidth={1.7} />
                  </span>
                  {confirmationDetailsSaved ? (
                    <>
                      <div>
                        <h2>Book faster next time</h2>
                        <p>View your appointments anytime in My Bookings.</p>
                        <small><LockKeyhole aria-hidden="true" size={16} strokeWidth={1.8} /> Secure and private. I never share your data.</small>
                      </div>
                      <button type="button" onClick={openMyBookings}>
                        Go to My Bookings
                      </button>
                    </>
                  ) : (
                    <>
                      <div>
                        <h2>Book faster next time</h2>
                        <p>Sign in to view your appointments anytime in My Bookings.</p>
                        <small><LockKeyhole aria-hidden="true" size={16} strokeWidth={1.8} /> Secure and private. I never share your data.</small>
                      </div>
                      {showConfirmationGoogleSaveCta && (
                        <ClientEmailSignInForm onEmailLogin={onEmailLogin} signingIn={clientAuthActionLoading} />
                      )}
                      {showConfirmationGoogleSaveCta && (
                        <button type="button" onClick={onGoogleLogin} disabled={clientAuthLoading || clientAuthActionLoading}>
                          {clientAuthActionLoading ? "Connecting..." : "Continue with Google"}
                        </button>
                      )}
                      {showConfirmationGoogleSaveCta && clientAuthNotice && <p className="client-account-notice" role="status">{clientAuthNotice}</p>}
                      {showConfirmationGoogleSaveCta && clientAuthError && <p className="client-account-error" role="alert">{clientAuthError}</p>}
                    </>
                  )}
                </section>

                <section className="confirmation-card confirmation-next-card">
                  <span className="confirmation-card-icon" aria-hidden="true">
                    <Info size={32} strokeWidth={1.7} />
                  </span>
                  <div>
                    <h2>What happens next?</h2>
                    <p><CheckCircle2 aria-hidden="true" size={18} strokeWidth={2} /> I will verify your payment.</p>
                    <p><CheckCircle2 aria-hidden="true" size={18} strokeWidth={2} /> You'll receive your confirmation and reminder.</p>
                    <p><CheckCircle2 aria-hidden="true" size={18} strokeWidth={2} /> If anything changes, contact me directly until online rescheduling is available.</p>
                  </div>
                </section>

                {confirmationCanCancel && (
                  <section className="confirmation-card confirmation-cancel-card">
                    <span className="confirmation-card-icon" aria-hidden="true">
                      <X size={30} strokeWidth={1.8} />
                    </span>
                    <div>
                      <h2>Booked by mistake?</h2>
                      <p>You can cancel this request now before I review it.</p>
                    </div>
                    <button
                      type="button"
                      onClick={cancelConfirmedBookingByMistake}
                      disabled={confirmationCancellationPending}
                    >
                      {confirmationCancellationPending ? "Cancelling..." : "Cancel booking"}
                    </button>
                  </section>
                )}

                {clientBookingMessage && <p className="booking-status confirmation-status-message">{clientBookingMessage}</p>}

                <footer className="confirmation-footer">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmedAppointments([]);
                      setCheckoutAppointments([]);
                      setBookingReference("");
                      setPaymentHoldExpiresAt(null);
                      setPaymentMethod("cash");
                      setClientBookingMessage("");
                      resetCurrentAppointmentDraft();
                      setClientStep("location");
                    }}
                  >
                    Back to Appointments
                    <ChevronRight aria-hidden="true" size={28} strokeWidth={1.8} />
                  </button>
                  <p className="location-security-note payment-security-note">
                    <ShieldCheck aria-hidden="true" size={22} strokeWidth={1.8} />
                    Your information is secure and encrypted.
                  </p>
                </footer>
              </div>
            ) : (
              <>
                <header className="premium-step-header payment-step-header">
                  <span className="premium-header-spacer" aria-hidden="true" />
                  <div className="premium-brand-lockup" aria-label="VadMassage">
                    <span className="premium-brand-mark">VM</span>
                    <strong>VadMassage</strong>
                  </div>
                </header>
                {renderPremiumStepProgress("premium-payment-progress")}
                {cashPaymentReviewOpen ? (
                  <section className="cash-payment-review-screen">
                    <div className="payment-copy">
                      <p className="premium-section-label">Cash payment</p>
                      <h1>Thank you for choosing cash</h1>
                      <p>I appreciate it. I like keeping appointments simple, personal, and straightforward.</p>
                    </div>
                    <article className="payment-card cash-payment-review-card">
                      <span className="payment-card-icon" aria-hidden="true">
                        <WalletCards size={34} strokeWidth={1.7} />
                      </span>
                      <div>
                        <h2>A quick note before confirming</h2>
                        <p>
                          To keep things fair to both of us, please keep in mind that short-notice cancellations{" "}
                          <strong className="cash-policy-highlight">under 24 hours are subject to the full appointment fee.</strong>
                        </p>
                        <p>This helps me manage my calendar and stay available for everyone. Thanks a million for your understanding!</p>
                      </div>
                    </article>
                    {checkoutError && <p className="booking-validation-message payment-validation-message">{checkoutError}</p>}
                    <div className="cash-payment-review-actions">
                      <button
                        type="button"
                        className="cash-payment-back-button"
                        onClick={() => {
                          setCheckoutError("");
                          setCashPaymentReviewOpen(false);
                        }}
                      >
                        <ChevronLeft aria-hidden="true" size={24} strokeWidth={1.8} />
                        Back
                      </button>
                      <button
                        type="button"
                        className="payment-transfer-button cash-payment-acknowledge-button"
                        disabled={paymentActionsDisabled}
                        onClick={() => confirmPayment("cash")}
                      >
                        <CheckCircle2 aria-hidden="true" size={28} strokeWidth={1.8} />
                        {clientIsConfirming ? "Sending request..." : "Request cash payment"}
                        <ChevronRight aria-hidden="true" size={30} strokeWidth={1.8} />
                      </button>
                    </div>
                  </section>
                ) : (
                  <>
                    <div className="payment-copy">
                      <p className="premium-section-label">Payment</p>
                      <h1>One last step</h1>
                      <p className="payment-primary-instruction">Please complete your bank transfer so I can confirm your appointment.</p>
                      <p>I can only hold the time for a short while, so please send the transfer when you're ready to confirm.</p>
                      <p>As soon as I've checked your transfer, I'll personally confirm your appointment.</p>
                    </div>
                    <section className="payment-top-grid">
                      <article className="payment-card amount-due-card">
                        <span>Booking Total</span>
                        <strong>{"\u00a3"}{paymentDisplayTotal.toFixed(2)}</strong>
                        {reviewPriceRows.filter((row) => ["Travel Fee", "Congestion Fee"].includes(row.label)).map((row) => (
                          <p key={row.label}>{row.label}: {formatMoney(row.value)}</p>
                        ))}
                      </article>
                    </section>
                    <section className="payment-transfer-layout">
                      <div className="bank-transfer-column">
                        <h2><Landmark aria-hidden="true" size={30} strokeWidth={1.7} /> Bank Transfer Details</h2>
                        <p className="bank-transfer-note">You're almost done. Once the transfer is complete, I'll personally confirm your appointment.</p>
                        <div className="payment-card bank-detail-list">
                          {BANK_TRANSFER_CONFIGURATION.isConfigured ? (
                            BANK_TRANSFER_DETAILS.map((detail) => (
                              <div className="bank-detail-row" key={detail.label}>
                                <span className="payment-card-icon" aria-hidden="true">
                                  <detail.icon size={24} strokeWidth={1.7} />
                                </span>
                                <div>
                                  <span>{detail.label}</span>
                                  <strong>{detail.value}</strong>
                                </div>
                                <button
                                  type="button"
                                  aria-label={`Save ${detail.label} to clipboard`}
                                  title={`Save ${detail.label} to clipboard`}
                                  className={copiedPaymentKey === `bank-${detail.label}` ? "copied-payment-button" : ""}
                                  onClick={() => copyPaymentText(detail.value, `bank-${detail.label}`)}
                                >
                                  {copiedPaymentKey === `bank-${detail.label}` ? (
                                    <Check aria-hidden="true" size={18} strokeWidth={2} />
                                  ) : (
                                    <Copy aria-hidden="true" size={18} strokeWidth={1.9} />
                                  )}
                                </button>
                              </div>
                            ))
                          ) : (
                            <p className="bank-transfer-note">{BANK_TRANSFER_CONFIGURATION.message}</p>
                          )}
                          <div className="bank-detail-row payment-reference-bank-row">
                            <span className="payment-card-icon" aria-hidden="true">
                              <ReceiptText size={24} strokeWidth={1.7} />
                            </span>
                            <div>
                              <span>Payment Reference</span>
                              <strong>{bookingReference || "Generating..."}</strong>
                            </div>
                            <button
                              type="button"
                              aria-label="Save payment reference to clipboard"
                              title="Save payment reference to clipboard"
                              className={copiedPaymentKey === "bank-payment-reference" ? "copied-payment-button" : ""}
                              onClick={() => copyPaymentText(bookingReference, "bank-payment-reference")}
                            >
                              {copiedPaymentKey === "bank-payment-reference" ? (
                                <Check aria-hidden="true" size={18} strokeWidth={2} />
                              ) : (
                                <Copy aria-hidden="true" size={18} strokeWidth={1.9} />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                      <article className="payment-card payment-next-steps">
                        <h2>What Happens Next</h2>
                        {[
                          "Make your bank transfer",
                          "Press \"I've made the bank transfer\"",
                          "I'll check your payment",
                          "Your appointment will be confirmed",
                        ].map((step, index) => (
                          <div className="payment-process-step" key={step}>
                            <span>{index + 1}</span>
                            <p>{step}</p>
                          </div>
                        ))}
                      </article>
                    </section>
                    <section className="payment-secondary-grid">
                      <article className="payment-card cancellation-policy-card">
                        <span className="payment-card-icon" aria-hidden="true">
                          <ShieldCheck size={34} strokeWidth={1.7} />
                        </span>
                        <div>
                          <h2>Cancellation Policy</h2>
                          <p><CheckCircle2 aria-hidden="true" size={18} strokeWidth={2} /> Free cancellation within 1 hour of booking</p>
                          <p><CheckCircle2 aria-hidden="true" size={18} strokeWidth={2} /> Free cancellation up to 24 hours before your appointment</p>
                          <p><CheckCircle2 aria-hidden="true" size={18} strokeWidth={2} /> Within 24 hours, the full session fee applies because the time is reserved for you and hard to replace</p>
                        </div>
                      </article>
                    </section>
                    {checkoutError && <p className="booking-validation-message payment-validation-message">{checkoutError}</p>}
                    <section className="payment-action-stack">
                      <div className="payment-primary-action-row">
                        <button
                          type="button"
                          className="premium-footer-back-button payment-back-button"
                          onClick={() => setClientStep("details")}
                        >
                          <ChevronLeft aria-hidden="true" size={26} strokeWidth={1.8} />
                          Back
                        </button>
                        <button
                          type="button"
                          className="payment-transfer-button"
                          disabled={paymentActionsDisabled}
                          onClick={() => confirmPayment("bank_transfer")}
                        >
                          <LockKeyhole aria-hidden="true" size={28} strokeWidth={1.8} />
                          {clientIsConfirming ? "Submitting transfer..." : "I've made the bank transfer"}
                          <ChevronRight aria-hidden="true" size={30} strokeWidth={1.8} />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="payment-card cash-payment-card"
                        disabled={paymentActionsDisabled}
                        onClick={() => {
                          setCheckoutError("");
                          setCashPaymentReviewOpen(true);
                        }}
                      >
                        <span className="payment-card-icon" aria-hidden="true">
                          <WalletCards size={34} strokeWidth={1.7} />
                        </span>
                        <span>
                          <strong>I'd like to pay cash.</strong>
                        </span>
                        <ChevronRight aria-hidden="true" size={28} strokeWidth={1.8} />
                      </button>
                    </section>
                    <div className="payment-assurance-row">
                      <span><CheckCircle2 aria-hidden="true" size={18} strokeWidth={2} /> I will check the payment</span>
                      <span><CheckCircle2 aria-hidden="true" size={18} strokeWidth={2} /> You'll receive confirmation by email</span>
                      <span><CheckCircle2 aria-hidden="true" size={18} strokeWidth={2} /> I'll personally confirm your booking</span>
                    </div>
                    <section className="payment-help-card">
                      <h2>Need help?</h2>
                      <p><Phone aria-hidden="true" size={22} strokeWidth={1.7} /> 07494 047985</p>
                      <p><Mail aria-hidden="true" size={22} strokeWidth={1.7} /> massagevadim@outlook.com</p>
                    </section>
                    <p className="location-security-note payment-security-note">
                      <ShieldCheck aria-hidden="true" size={22} strokeWidth={1.8} />
                      Your information is secure and private.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {reservationInactivityModalOpen && (
        <div className="booking-modal-backdrop reservation-inactivity-backdrop" role="presentation">
          <div className="booking-modal reservation-inactivity-modal" role="dialog" aria-modal="true" aria-labelledby="reservation-inactivity-title">
            <span className="confirmation-card-icon" aria-hidden="true">
              <Clock3 size={32} strokeWidth={1.7} />
            </span>
            <h2 id="reservation-inactivity-title">Still there?</h2>
            <p>Your appointment is being held while you complete your booking.</p>
            <p>Would you like to continue?</p>
            <div className="reservation-inactivity-actions">
              <button type="button" onClick={continueClientReservationAfterInactivity}>
                Continue booking
              </button>
              <button type="button" className="secondary-button" onClick={releaseClientAppointmentReservation}>
                Release appointment
              </button>
            </div>
          </div>
        </div>
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
  { id: "calendar", label: "Calendar", Icon: CalendarDays },
  { id: "customers", label: "Clients", Icon: UserRound },
  { id: "pending", label: "Pending", Icon: ReceiptText },
  { id: "waitlist", label: "Waitlist", Icon: Clock3 },
  { id: "analytics", label: "Analytics", Icon: Activity },
  { id: "settings", label: "Settings", Icon: SettingsIcon },
];

const BANK_TRANSFER_CONFIGURATION = getFrontendBankTransferDetails(undefined, { labelStyle: "title" });
const BANK_TRANSFER_ICON_BY_KEY = {
  "account-name": UserRound,
  "bank-name": Landmark,
  "sort-code": Landmark,
  "account-number": WalletCards,
};
const BANK_TRANSFER_DETAILS = BANK_TRANSFER_CONFIGURATION.rows.map((detail) => ({
  ...detail,
  icon: BANK_TRANSFER_ICON_BY_KEY[detail.key] || Landmark,
}));

const PRIMARY_CLIENT_AREA_IDS = [
  "chelsea",
  "kensington",
  "fulham",
  "hammersmith",
  "chiswick",
  "belgravia",
  "ealing",
  "acton",
  "mayfair",
];

const CLIENT_DURATION_OPTIONS = [
  { minutes: 60, label: "60 mins" },
  { minutes: 90, label: "90 mins", badge: "Popular" },
  { minutes: 120, label: "120 mins" },
];

function getDurationQuantitiesFromMinutes(totalMinutes) {
  const target = Number(totalMinutes) || 0;
  const empty = Object.fromEntries(CLIENT_DURATION_OPTIONS.map((option) => [option.minutes, 0]));
  if (target <= 0) return empty;

  for (let count120 = Math.floor(target / 120); count120 >= 0; count120 -= 1) {
    for (let count90 = Math.floor((target - count120 * 120) / 90); count90 >= 0; count90 -= 1) {
      const remainder = target - count120 * 120 - count90 * 90;
      if (remainder >= 0 && remainder % 60 === 0) {
        return {
          ...empty,
          60: remainder / 60,
          90: count90,
          120: count120,
        };
      }
    }
  }

  return empty;
}

function getClientDateCardParts(day) {
  const date = new Date(`${day.dateValue}T00:00:00`);
  const isValidDate = !Number.isNaN(date.getTime());

  return {
    dayName: day.label,
    month: isValidDate ? date.toLocaleString("en-GB", { month: "short" }) : "",
    number: isValidDate ? String(date.getDate()) : day.dateValue.slice(8),
  };
}

const SERVICE_COLORS = ["#6ea8fe", "#8fd6b3", "#f4bf75", "#d6a3f5", "#f09393"];

const LEGACY_DEFAULT_SERVICE_IDS = new Set(["deep-tissue", "sports", "head-massage", "prenatal", "zero-gravity"]);
const LEGACY_DEFAULT_SERVICE_NAMES = new Set([
  "cloud nine head massage",
  "deep tissue recovery",
  "performance sports massage",
  "prenatal wellness",
  "the zero-gravity melt",
]);

const NEW_SERVICE_COPY = {
  massage: {
    longDescription: "A bespoke mobile massage session adapted to your body on the day, with pressure and focus tailored to what you need most.",
    shortDescription: "Bespoke mobile massage tailored to your body.",
  },
  "assisted-stretching": {
    longDescription: "A guided assisted stretching session designed to improve mobility, release restriction, and help your body feel easier to move.",
    shortDescription: "Guided stretching for mobility and ease.",
  },
  "soft-tissue-therapy": {
    longDescription: "Focused soft tissue work for recovery, muscular tension, and movement quality, shaped around the areas that need attention.",
    shortDescription: "Targeted soft tissue work for recovery.",
  },
  "body-exam": {
    longDescription: "A practical body assessment to understand posture, movement, tension patterns, and the best treatment plan for your needs.",
    shortDescription: "Focused assessment before treatment planning.",
  },
};

function buildInitialServiceDetails(services) {
  return Object.fromEntries(
    services.map((service, index) => [
      service.id,
      {
        buffer: DEFAULT_TRAVEL_BUFFER,
        duration: 90,
        durationPrices: { 60: 90, 90: 120 + index * 10, 120: 150 + index * 15 },
        imageUrl: massageTreatmentImage,
        longDescription: NEW_SERVICE_COPY[service.id]?.longDescription ?? "A professional mobile bodywork service tailored to the client's needs.",
        price: 120 + index * 10,
        shortDescription: NEW_SERVICE_COPY[service.id]?.shortDescription ?? "Professional mobile bodywork service.",
      },
    ])
  );
}

function clientNameForBooking(booking) {
  if (isPersonalEvent(booking)) return booking.clientName || "Personal event";
  return booking.clientName || "Walk-in client";
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

function paymentMethodLabel(paymentMethod) {
  if (paymentMethod === "cash") return "Payment on arrival";
  if (paymentMethod === "card") return "Stripe";
  if (paymentMethod === "bank_transfer") return "Bank transfer";
  if (paymentMethod === "alternative_requested") return "Alternative payment requested";
  return paymentMethod || "Not selected";
}

function paymentStatusLabel(paymentStatus, bookingStatus) {
  if (paymentStatus === "cash_on_arrival") {
    return bookingStatus === "confirmed" ? "Approved - due on arrival" : "Awaiting admin approval";
  }
  if (paymentStatus === "awaiting_verification") return "Awaiting verification";
  if (paymentStatus === "alternative_requested") return "Alternative requested";
  if (paymentStatus === "paid") return "Paid";
  if (paymentStatus === "cancelled") return "Rejected / cancelled";
  if (paymentStatus === "pending") return "Pending";
  return paymentStatus || "Not selected";
}

function adminVerificationInfo(booking = {}) {
  if (!booking || isPersonalEvent(booking) || isCancelledBooking(booking)) return null;
  const paymentStatus = String(booking.paymentStatus || "").trim();
  const bookingStatus = String(booking.status || "").trim();
  const paymentMethod = String(booking.paymentMethod || "").trim();

  if (paymentStatus === "paid" || (bookingStatus === "confirmed" && paymentMethod !== "bank_transfer" && paymentStatus !== "awaiting_verification")) {
    return null;
  }

  if (paymentStatus === "awaiting_verification" || bookingStatus === "pending_payment_verification") {
    return {
      actionLabel: "Mark transfer received",
      badge: "Payment verification",
      reason: "Waiting for bank transfer verification",
      tone: "bank",
      updatePatch: { paymentStatus: "paid", status: "confirmed" },
    };
  }

  if (paymentMethod === "cash" || paymentStatus === "cash_on_arrival") {
    if (bookingStatus === "confirmed") return null;
    return {
      actionLabel: "Approve cash request",
      badge: "Cash approval",
      reason: "Waiting for cash payment approval",
      tone: "cash",
      updatePatch: { paymentStatus: "cash_on_arrival", status: "confirmed" },
    };
  }

  if (paymentStatus === "alternative_requested" || bookingStatus === "payment_method_review" || paymentStatus === "pending") {
    return {
      actionLabel: "Review booking",
      badge: "Payment review",
      reason: "Waiting for payment method review",
      tone: "review",
      updatePatch: null,
    };
  }

  return null;
}

function bookingNeedsAdminVerification(booking) {
  return Boolean(adminVerificationInfo(booking));
}

function bookingTotalDue(booking) {
  return (
    Number(booking?.price || 0)
    + Number(booking?.congestionFee || 0)
    + Number(booking?.travelFee || 0)
  );
}

function normalizeDurationPrices(saved = {}, fallbackPrice = 120, fallbackDuration = 90) {
  return Object.fromEntries(
    CLIENT_DURATION_OPTIONS.map((option) => {
      const explicit = Number(saved?.[option.minutes]);
      if (Number.isFinite(explicit) && explicit >= 0) return [option.minutes, explicit];
      const scaled = Math.round((Math.max(0, Number(fallbackPrice) || 0) * option.minutes) / Math.max(1, Number(fallbackDuration) || 90));
      return [option.minutes, scaled];
    })
  );
}

function getServiceDurationPrice(service, minutes) {
  const durationPrices = normalizeDurationPrices(service?.durationPrices, service?.price, service?.duration);
  const explicit = Number(durationPrices[minutes]);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  return Math.max(0, Number(service?.price) || 0);
}

function serviceEditorDraftFromService(service) {
  const durationPrices = normalizeDurationPrices(service?.durationPrices, service?.price, service?.duration);
  const sortedPrices = Object.fromEntries(
    [...CLIENT_DURATION_OPTIONS]
      .sort((first, second) => first.minutes - second.minutes)
      .map((option) => [option.minutes, String(durationPrices[option.minutes] ?? "")])
  );

  return {
    durationPrices: sortedPrices,
    imageUrl: service?.imageUrl || "",
    longDescription: service?.longDescription || "",
    name: service?.name || "",
    shortDescription: service?.shortDescription || "",
  };
}

function serviceEditorDraftChanged(service, draft) {
  if (!service || !draft) return false;
  const savedDraft = serviceEditorDraftFromService(service);
  return JSON.stringify(savedDraft) !== JSON.stringify(draft);
}

function validateServiceEditorDraft(draft) {
  if (!draft?.name?.trim()) return "Service title is required.";
  const seenDurations = new Set();

  for (const option of CLIENT_DURATION_OPTIONS) {
    if (seenDurations.has(option.minutes)) return "Duplicate durations are not allowed.";
    seenDurations.add(option.minutes);

    const rawValue = String(draft.durationPrices?.[option.minutes] ?? "").trim();
    if (!rawValue) return `${option.minutes} minute price is required.`;
    const price = Number(rawValue);
    if (!Number.isFinite(price) || price < 0) return `${option.minutes} minute price must be zero or more.`;
  }

  return "";
}

function ServiceImagePreview({ src = "", title = "" }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);

  if (!src || broken) {
    return (
      <div className="admin-service-image-placeholder">
        <span>{src ? "Image unavailable" : "No image selected"}</span>
      </div>
    );
  }

  return (
    <img
      alt=""
      className="admin-service-image-preview"
      src={src}
      onError={() => setBroken(true)}
    />
  );
}

function sanitizeStoredServices(value) {
  if (!Array.isArray(value)) return DEFAULT_SERVICES;
  const seen = new Set();
  const services = value
    .map((service) => ({
      id: String(service?.id || "").trim(),
      name: String(service?.name || "").trim(),
      visible: service?.visible !== false,
    }))
    .filter((service) => {
      if (!service.id || !service.name || seen.has(service.id)) return false;
      seen.add(service.id);
      return true;
    });
  return services.length ? services : DEFAULT_SERVICES;
}

function sanitizeStoredServiceDetails(value, services) {
  const defaults = buildInitialServiceDetails(services);
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  return Object.fromEntries(
    services.map((service) => {
      const saved = value[service.id] ?? {};
      return [
        service.id,
        {
          ...defaults[service.id],
          ...saved,
          buffer: Math.max(0, Number(saved.buffer ?? defaults[service.id]?.buffer ?? DEFAULT_TRAVEL_BUFFER)),
          duration: Math.max(0, Number(saved.duration ?? defaults[service.id]?.duration ?? 90)),
          price: Math.max(0, Number(saved.price ?? defaults[service.id]?.price ?? 120)),
          durationPrices: normalizeDurationPrices(
            saved.durationPrices ?? defaults[service.id]?.durationPrices,
            saved.price ?? defaults[service.id]?.price ?? 120,
            saved.duration ?? defaults[service.id]?.duration ?? 90
          ),
          imageUrl: String(saved.imageUrl ?? defaults[service.id]?.imageUrl ?? ""),
          longDescription: String(saved.longDescription ?? defaults[service.id]?.longDescription ?? ""),
          shortDescription: String(saved.shortDescription ?? defaults[service.id]?.shortDescription ?? ""),
        },
      ];
    })
  );
}

function isLegacyDefaultService(service) {
  const id = String(service?.id || "").trim();
  const name = String(service?.name || "").trim().toLowerCase();
  return LEGACY_DEFAULT_SERVICE_IDS.has(id) || LEGACY_DEFAULT_SERVICE_NAMES.has(name);
}

function hasCurrentDefaultServices(services) {
  const ids = new Set(services.map((service) => service.id));
  return DEFAULT_SERVICES.every((service) => ids.has(service.id));
}

function cloneServiceDetailWithCopy(detail, copy, fallback) {
  const source = detail && typeof detail === "object" ? detail : fallback;
  return {
    ...fallback,
    ...source,
    buffer: Math.max(0, Number(source.buffer ?? fallback.buffer ?? DEFAULT_TRAVEL_BUFFER)),
    duration: Math.max(0, Number(source.duration ?? fallback.duration ?? 90)),
    durationPrices: normalizeDurationPrices(
      source.durationPrices ?? fallback.durationPrices,
      source.price ?? fallback.price ?? 120,
      source.duration ?? fallback.duration ?? 90
    ),
    imageUrl: String(source.imageUrl ?? fallback.imageUrl ?? massageTreatmentImage),
    longDescription: copy.longDescription,
    price: Math.max(0, Number(source.price ?? fallback.price ?? 120)),
    shortDescription: copy.shortDescription,
  };
}

function migrateServiceCatalogueIfNeeded(rawServices, rawDetails) {
  const storedServices = sanitizeStoredServices(rawServices);
  const storedDetails = sanitizeStoredServiceDetails(rawDetails, storedServices);
  const migrationVersion = readStoredJson(SERVICE_CATALOGUE_MIGRATION_KEY, "");

  if (migrationVersion === CURRENT_SERVICE_CATALOGUE_VERSION && hasCurrentDefaultServices(storedServices)) {
    return { serviceDetails: storedDetails, services: storedServices };
  }

  const shouldMigrateLegacyDefaults = storedServices.some(isLegacyDefaultService) || !hasCurrentDefaultServices(storedServices);
  if (!shouldMigrateLegacyDefaults) {
    return { serviceDetails: storedDetails, services: storedServices };
  }

  const primaryLegacyService = storedServices.find((service) => service.id === "deep-tissue")
    ?? storedServices.find((service) => LEGACY_DEFAULT_SERVICE_IDS.has(service.id))
    ?? storedServices[0];
  const primaryLegacyDetail = storedDetails[primaryLegacyService?.id];
  const defaultDetails = buildInitialServiceDetails(DEFAULT_SERVICES);
  const legacyVisibility = new Map(storedServices.map((service) => [service.id, service.visible !== false]));

  const nextServices = DEFAULT_SERVICES.map((service) => ({
    ...service,
    visible: legacyVisibility.get(service.id)
      ?? legacyVisibility.get("deep-tissue")
      ?? legacyVisibility.get("sports")
      ?? service.visible,
  }));
  const nextDetails = Object.fromEntries(
    DEFAULT_SERVICES.map((service) => [
      service.id,
      cloneServiceDetailWithCopy(
        storedDetails[service.id] ?? primaryLegacyDetail,
        NEW_SERVICE_COPY[service.id],
        defaultDetails[service.id]
      ),
    ])
  );

  storedServices
    .filter((service) => !isLegacyDefaultService(service) && !nextServices.some((item) => item.id === service.id))
    .forEach((service) => {
      nextServices.push(service);
      nextDetails[service.id] = storedDetails[service.id] ?? buildInitialServiceDetails([service])[service.id];
    });

  return {
    serviceDetails: sanitizeStoredServiceDetails(nextDetails, nextServices),
    services: sanitizeStoredServices(nextServices),
  };
}

function readInitialServiceCatalogue() {
  return migrateServiceCatalogueIfNeeded(
    readStoredJson(SERVICES_STORAGE_KEY, DEFAULT_SERVICES),
    readStoredJson(SERVICE_DETAILS_STORAGE_KEY, null)
  );
}

const ADMIN_MONEY_FORMATTER = new Intl.NumberFormat("en-GB", {
  currency: "GBP",
  maximumFractionDigits: 0,
  style: "currency",
});
const MAX_BOOKING_DURATION_MINUTES = Math.max(...VALID_DURATIONS);

function formatAdminMoney(value) {
  return ADMIN_MONEY_FORMATTER.format(Math.max(0, Number(value) || 0));
}

function bookingStartMinutes(booking) {
  const start = Number(booking?.start);
  return Number.isFinite(start) ? start : null;
}

function bookingDurationMinutes(booking) {
  const duration = Number(booking?.duration ?? booking?.minutes);
  if (Number.isFinite(duration) && duration > 0) return duration;
  const start = Number(booking?.start);
  const end = Number(booking?.sessionEnd);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0;
}

function bookingTravelMinutes(booking) {
  const buffer = Number(booking?.travelBuffer ?? booking?.buffer ?? booking?.bufferMinutes);
  return Number.isFinite(buffer) && buffer > 0 ? buffer : 0;
}

function bookingServiceRevenue(booking, serviceDetails = {}) {
  const directTotal = bookingTotalDue(booking);
  if (directTotal > 0) return directTotal;

  const itemTotal = itemsForBooking(booking).reduce((total, item) => {
    const itemPrice = Number(item.linePrice ?? item.price);
    return Number.isFinite(itemPrice) && itemPrice > 0 ? total + itemPrice : total;
  }, 0);
  if (itemTotal > 0) return itemTotal + Number(booking?.congestionFee || 0) + Number(booking?.travelFee || 0);

  const serviceDetail = serviceDetails?.[booking?.serviceId];
  const exactServicePrice = getServiceDurationPrice(serviceDetail, bookingDurationMinutes(booking));
  const servicePrice = Number.isFinite(exactServicePrice) ? exactServicePrice : Number(serviceDetail?.price);
  const serviceDuration = Number(serviceDetails?.[booking?.serviceId]?.duration || booking?.duration || 0);
  const bookingDuration = bookingDurationMinutes(booking);
  const scaledPrice = Number.isFinite(exactServicePrice) && exactServicePrice > 0
    ? exactServicePrice
    : Number.isFinite(servicePrice) && servicePrice > 0
    ? servicePrice * (serviceDuration > 0 && bookingDuration > 0 ? bookingDuration / serviceDuration : 1)
    : 0;

  return scaledPrice + Number(booking?.congestionFee || 0) + Number(booking?.travelFee || 0);
}

function sortedDayBookings(bookings = []) {
  return [...bookings]
    .filter((booking) => bookingStartMinutes(booking) !== null)
    .sort((first, second) => bookingStartMinutes(first) - bookingStartMinutes(second));
}

function getDayWorkMinutes(bookings = []) {
  return bookings.reduce((total, booking) => total + bookingDurationMinutes(booking), 0);
}

function getDayTravelMinutes(bookings = []) {
  const sortedBookings = sortedDayBookings(bookings);
  if (sortedBookings.length === 0) return 0;
  return bookingTravelMinutes(sortedBookings[0])
    + sortedBookings.reduce((total, booking) => total + bookingTravelMinutes(booking), 0);
}

function getDayRevenue(bookings = [], serviceDetails = {}) {
  return bookings.reduce((total, booking) => total + bookingServiceRevenue(booking, serviceDetails), 0);
}

function getDayLeaveTime(bookings = []) {
  const [firstBooking] = sortedDayBookings(bookings);
  if (!firstBooking) return null;
  return Math.max(0, bookingStartMinutes(firstBooking) - bookingTravelMinutes(firstBooking));
}

function getDayHomeTime(bookings = []) {
  const sortedBookings = sortedDayBookings(bookings);
  const lastBooking = sortedBookings[sortedBookings.length - 1];
  if (!lastBooking) return null;
  const start = bookingStartMinutes(lastBooking);
  const sessionEnd = Number(lastBooking.sessionEnd);
  const end = Number.isFinite(sessionEnd) && sessionEnd > start
    ? sessionEnd
    : start + bookingDurationMinutes(lastBooking);
  return end + bookingTravelMinutes(lastBooking);
}

function formatAgendaDuration(minutes) {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  if (hours && remainder) return `${hours}h ${remainder}m`;
  if (hours) return `${hours}h`;
  return `${remainder}m`;
}

function customerLastAppointment(customer) {
  return [...(customer?.appointments || [])]
    .filter((appointment) => appointment.date)
    .sort((first, second) => second.date.localeCompare(first.date))[0] || null;
}

function bookingEmailPayload(booking) {
  return {
    address: booking.address || "",
    bookingReference: booking.bookingReference || booking.id || "",
    customer: { name: booking.clientName || "there" },
    date: booking.dateValue || "",
    durationMinutes: booking.duration || 0,
    items: itemsForBooking(booking),
    location: booking.location || "",
    paymentMethod: booking.paymentMethod || "",
    paymentReceivedAt: booking.paymentReceivedAt || null,
    paymentReference: booking.paymentReference || booking.bookingReference || booking.id || "",
    paymentExpiry: booking.paymentExpiry || booking.paymentHoldExpiresAt || null,
    paymentStatus: booking.paymentStatus || "",
    status: booking.status || "",
    time: `${minutesToTime(booking.start)} - ${minutesToTime(booking.sessionEnd ?? (Number(booking.start) + Number(booking.duration || 0)))}`,
    total: bookingTotalDue(booking),
  };
}

function App() {
  const initialSearchParams = authRedirectParamsFromWindow();
  const initialPasswordRecovery = isPasswordRecoveryRedirect();
  const isMobilePreviewFrame = initialSearchParams.get("mobilePreviewFrame") === "1";
  const showLocalPreviewControls = import.meta.env.DEV;
  const initialView = initialSearchParams.get("view") === "admin" || initialPasswordRecovery ? "admin" : "client";
  const [services, setServices] = useState(() => readInitialServiceCatalogue().services);
  const [serviceDetails, setServiceDetails] = useState(() => readInitialServiceCatalogue().serviceDetails);
  const [enhancements, setEnhancements] = useState(() => readCachedEnhancements().enhancements);
  const [coverageZones, setCoverageZones] = useState(() =>
    sanitizeCoverageZones(readStoredJson(COVERAGE_ZONES_STORAGE_KEY, DEFAULT_COVERAGE_ZONES))
  );
  const [sessionPreferences, setSessionPreferences] = useState(() =>
    sanitizeSessionPreferences(
      import.meta.env.DEV
        ? readStoredJson(SESSION_PREFERENCES_STORAGE_KEY, SESSION_PREFERENCES)
        : []
    )
  );
  const [financialSettings, setFinancialSettings] = useState(() =>
    normalizeFinancialSettings(readStoredJson(FINANCIAL_SETTINGS_STORAGE_KEY, DEFAULT_FINANCIAL_SETTINGS))
  );
  const [expenses, setExpenses] = useState(() =>
    sanitizeExpenses(readStoredJson(EXPENSES_STORAGE_KEY, []))
  );
  const [clientNoteOverrides, setClientNoteOverrides] = useState(() =>
    sanitizeClientNotes(readStoredJson(CLIENT_NOTES_STORAGE_KEY, {}))
  );
  const [clientProfileOverrides, setClientProfileOverrides] = useState(() =>
    sanitizeClientProfiles(readStoredJson(CLIENT_PROFILES_STORAGE_KEY, {}))
  );
  const [documentSettings, setDocumentSettings] = useState(() =>
    sanitizeDocumentSettings(readStoredJson(DOCUMENT_SETTINGS_STORAGE_KEY, DEFAULT_DOCUMENT_SETTINGS))
  );
  const [weeklyWorkingSchedule, setWeeklyWorkingSchedule] = useState(readCachedWeeklyWorkingSchedule);
  const [workingHoursOverridesByDate, setWorkingHoursOverridesByDate] = useState({});
  const [days, setDays] = useState(buildInitialDays);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const desiredAdminDateValueRef = useRef(todayValue());
  const workingHoursOverridesByDateRef = useRef({});
  const loadedWorkingHoursOverrideRangeRef = useRef("");
  const confirmedEnhancementsRef = useRef(enhancements);
  const enhancementSaveRevisionRef = useRef(0);
  const enhancementSaveQueueRef = useRef(Promise.resolve());
  const [selectedServiceId, setSelectedServiceId] = useState(DEFAULT_SERVICES[0].id);
  const [requestedDuration, setRequestedDuration] = useState(90);
  const [requestedTravelBuffer, setRequestedTravelBuffer] = useState(DEFAULT_TRAVEL_BUFFER);
  const [manualStart, setManualStart] = useState("14:15");
  const [showInvalidSlots, setShowInvalidSlots] = useState(false);
  const [activeView, setActiveView] = useState(initialView);
  const [runtimeDiagnostic, setRuntimeDiagnostic] = useState(null);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [mobilePreviewClientStep, setMobilePreviewClientStep] = useState("location");
  const [authSession, setAuthSession] = useState(null);
  const [clientProfile, setClientProfile] = useState(null);
  const [clientBookingContext, setClientBookingContext] = useState(null);
  const [clientBookingContextLoading, setClientBookingContextLoading] = useState(false);
  const [clientAuthError, setClientAuthError] = useState("");
  const [clientAuthNotice, setClientAuthNotice] = useState("");
  const [clientAuthActionLoading, setClientAuthActionLoading] = useState(false);
  const [adminSession, setAdminSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [adminAuthError, setAdminAuthError] = useState("");
  const [adminSystemMessage, setAdminSystemMessage] = useState("");
  const areaSettings = useServiceAreaSettings(activeView === "admin" && Boolean(adminSession));
  const serviceAreas = areaSettings.areas;
  const setServiceAreas = areaSettings.setDraft;
  const [enhancementSaveStatus, setEnhancementSaveStatus] = useState({ message: "", saving: false, type: "" });
  const [adminBookingsLoaded, setAdminBookingsLoaded] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(initialPasswordRecovery);
  const [clientDayIndex, setClientDayIndex] = useState(0);
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
    datePreferenceType: "single",
    email: "",
    phone: "",
    notes: "",
    preferredDate: dateValueForOffset(0),
    preferredDateEnd: dateValueForOffset(1),
    preferenceType: "exact",
    preferredWindow: WAITLIST_NO_PREFERENCE,
    preferredWindowEnd: DEFAULT_WAITLIST_RANGE_END,
    duration: 60,
    flexibility: 0,
  });

  const selectedDay = days[selectedDayIndex] ?? days.find((day) => day.dateValue === desiredAdminDateValueRef.current) ?? days[0];
  const settings = selectedDay.settings;
  const bookings = selectedDay.bookings;
  const visibleServices = services.filter((service) => service.visible);
  const publicClientEnhancements = getClientEnhancements(enhancements);
  const preview = useMemo(
    () => getSchedulingPreview({ settings, bookings: activeBookingsForDay(bookings), requestedDuration, requestedTravelBuffer }),
    [settings, bookings, requestedDuration, requestedTravelBuffer]
  );
  const invalidSlots = useMemo(
    () => buildDebugSlots({ settings, bookings: activeBookingsForDay(bookings), requestedDuration, requestedTravelBuffer }),
    [settings, bookings, requestedDuration, requestedTravelBuffer]
  );
  const visibleWorkingHoursDateRange = useMemo(() => dateRangeForDays(days), [days]);
  const visibleWorkingHoursDateRangeKey = visibleWorkingHoursDateRange
    ? `${visibleWorkingHoursDateRange.startDate}:${visibleWorkingHoursDateRange.endDate}`
    : "";

  useEffect(() => {
    workingHoursOverridesByDateRef.current = workingHoursOverridesByDate;
  }, [workingHoursOverridesByDate]);

  function setAdminSelectedDayIndex(index, dateValue = "") {
    const targetDateValue = isValidDateValue(dateValue) ? dateValue : days[index]?.dateValue;
    if (targetDateValue) {
      desiredAdminDateValueRef.current = targetDateValue;
    }

    const existingIndex = targetDateValue
      ? days.findIndex((day) => day.dateValue === targetDateValue)
      : index;
    if (existingIndex >= 0) {
      setSelectedDayIndex(existingIndex);
      return;
    }

    if (targetDateValue) {
      const weekStart = weekStartDateValue(targetDateValue);
      setDays((current) => buildDaysStarting(weekStart, current));
      setSelectedDayIndex(Math.max(0, Math.min(6, daysBetweenDateValues(weekStart, targetDateValue))));
      return;
    }

    setSelectedDayIndex(index);
  }

  function resolveDaysWithLoadedWorkingHours(dayList, schedule = weeklyWorkingSchedule) {
    return applyWorkingHoursOverridesToDays(dayList, schedule, workingHoursOverridesByDateRef.current);
  }

  useEffect(() => {
    if (activeView !== "admin") return;
    const desiredDateValue = desiredAdminDateValueRef.current;
    const desiredIndex = days.findIndex((day) => day.dateValue === desiredDateValue);
    if (desiredIndex >= 0 && desiredIndex !== selectedDayIndex) {
      setSelectedDayIndex(desiredIndex);
    }
  }, [activeView, days, selectedDayIndex]);

  useEffect(() => {
    function captureRuntimeError(event) {
      const error = event.error;
      console.error(error || event.message, event);
      setRuntimeDiagnostic({
        location: event.filename ? `${event.filename}:${event.lineno || ""}:${event.colno || ""}` : "",
        message: error?.message || event.message || "Unknown runtime error",
        stack: error?.stack || "",
      });
    }

    function captureUnhandledRejection(event) {
      const reason = event.reason;
      console.error(reason, event);
      setRuntimeDiagnostic({
        location: "",
        message: reason?.message || String(reason || "Unhandled promise rejection"),
        stack: reason?.stack || "",
      });
    }

    window.addEventListener("error", captureRuntimeError);
    window.addEventListener("unhandledrejection", captureUnhandledRejection);
    return () => {
      window.removeEventListener("error", captureRuntimeError);
      window.removeEventListener("unhandledrejection", captureUnhandledRejection);
    };
  }, []);

  const sortedBookings = getActiveBookingBlocks(bookings);
  const totalRequestedBlock = Number(requestedDuration) + Math.max(0, Number(requestedTravelBuffer));
  const anchorIsActive = settings.startMode === "fixed" && !preview.flow.hasBookings;
  const anchorState = settings.startMode !== "fixed"
    ? "inactive"
    : anchorIsActive
      ? "active"
      : "released";
  const mobilePreviewUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams({
      mobilePreviewFrame: "1",
      view: activeView,
    });
    if (activeView === "client" && mobilePreviewClientStep) {
      params.set("clientStep", mobilePreviewClientStep);
    }
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }, [activeView, mobilePreviewClientStep]);

  useEffect(() => {
    let cancelled = false;
    let subscription;

    async function applySession(session) {
      if (cancelled) return;
      setAuthSession(session);
      setClientAuthError("");
      if (session?.user) setClientAuthNotice("");

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
        const bookingContext = await loadCurrentClientBookingContext();
        if (!cancelled) {
          setClientProfile(existingProfile);
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
    if (authLoading || adminSession || activeView === "admin") return;

    let cancelled = false;
    const clientAvailabilityDays = buildDaysStarting(todayValue(), days);
    setDays(resolveDaysWithLoadedWorkingHours(clientAvailabilityDays));
    setClientDayIndex(0);

    loadPublicAvailabilityFromSupabase(clientAvailabilityDays)
      .then((availabilityDays) => {
        if (cancelled) return;
        setDays(resolveDaysWithLoadedWorkingHours(availabilityDays));
        setClientDayIndex(0);
      })
      .catch((error) => {
        console.warn("Supabase public availability load failed. Falling back to localStorage cache.", error);
      });

    return () => {
      cancelled = true;
    };
  }, [activeView, adminSession, authLoading]);

  useEffect(() => {
    if (!adminSession) return;

    let cancelled = false;
    const initialAdminDateValue = todayValue();
    desiredAdminDateValueRef.current = initialAdminDateValue;
    const adminLoadDays = buildAdminBookingLoadDays(days, initialAdminDateValue);

    setAdminBookingsLoaded(false);

    loadBookingsFromSupabase(adminLoadDays)
      .then((supabaseDays) => {
        if (cancelled) return;
        const todayIndex = supabaseDays.findIndex((day) => day.dateValue === initialAdminDateValue);
        setDays(resolveDaysWithLoadedWorkingHours(supabaseDays));
        setSelectedDayIndex(Math.max(0, todayIndex));
        setAdminBookingsLoaded(true);
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
    if (!adminSession || !adminBookingsLoaded || activeView !== "admin") return;

    let cancelled = false;
    const selectedDateValue = desiredAdminDateValueRef.current || selectedDay?.dateValue || todayValue();
    const adminLoadDays = buildAdminBookingLoadDays(days, selectedDateValue);

    loadBookingsFromSupabase(adminLoadDays)
      .then((supabaseDays) => {
        if (cancelled) return;
        const selectedDateIndex = supabaseDays.findIndex((day) => day.dateValue === selectedDateValue);
        setDays(resolveDaysWithLoadedWorkingHours(supabaseDays));
        if (selectedDateIndex >= 0) setSelectedDayIndex(selectedDateIndex);
        writeBookingsCacheFromDays(supabaseDays);
      })
      .catch((error) => {
        console.warn("Supabase booking refresh failed. Keeping current admin calendar.", error);
        setAdminAuthError(error.message || "Could not refresh admin bookings.");
      });

    return () => {
      cancelled = true;
    };
  }, [activeView, adminBookingsLoaded, adminSession, selectedDay?.dateValue]);

  useEffect(() => {
    if (!adminSession || !adminBookingsLoaded) return;
    writeBookingsCacheFromDays(days);
  }, [adminBookingsLoaded, adminSession, days]);

  useEffect(() => {
    writeStoredJson(SERVICES_STORAGE_KEY, sanitizeStoredServices(services));
  }, [services]);

  useEffect(() => {
    writeStoredJson(SERVICE_DETAILS_STORAGE_KEY, sanitizeStoredServiceDetails(serviceDetails, services));
  }, [serviceDetails, services]);

  useEffect(() => {
    if (!hasCurrentDefaultServices(services)) return;
    writeStoredJson(SERVICE_CATALOGUE_MIGRATION_KEY, CURRENT_SERVICE_CATALOGUE_VERSION);
  }, [services]);

  useEffect(() => {
    writeStoredJson(WAITLIST_STORAGE_KEY, sanitizeStoredWaitlistEntries(waitlistEntries));
  }, [waitlistEntries]);

  useEffect(() => {
    writeStoredJson(ENHANCEMENTS_STORAGE_KEY, sanitizeStoredEnhancements(enhancements));
  }, [enhancements]);

  useEffect(() => {
    let cancelled = false;

    async function loadAuthoritativeEnhancements() {
      try {
        const result = await loadAndCacheEnhancementsFromSupabase({
          includeHidden: activeView === "admin" && Boolean(adminSession),
        });
        if (cancelled) return;

        if (result.status === "found") {
          confirmedEnhancementsRef.current = result.enhancements;
          setEnhancements(result.enhancements);
          setEnhancementSaveStatus((current) =>
            current.type === "error"
              ? { message: "", saving: false, type: "" }
              : current
          );
          return;
        }

        if (adminSession) {
          const seed = enhancementSeedForUninitializedSupabase();
          const saved = await saveEnhancementsToSupabase(seed.enhancements);
          if (cancelled) return;
          confirmedEnhancementsRef.current = saved.enhancements;
          setEnhancements(saved.enhancements);
          setEnhancementSaveStatus({
            message: seed.source === "localStorage"
              ? "Enhancements moved to secure storage."
              : "Enhancements saved to secure storage.",
            saving: false,
            type: "success",
          });
        }
      } catch (error) {
        console.warn("Enhancements will use local cache because Supabase could not be reached.", error);
        if (!cancelled && activeView === "admin" && adminSession) {
          setEnhancementSaveStatus({
            message: error?.message || "Enhancements could not be loaded from secure storage.",
            saving: false,
            type: "error",
          });
        }
      }
    }

    loadAuthoritativeEnhancements();

    return () => {
      cancelled = true;
    };
  }, [activeView, adminSession]);

  useEffect(() => {
    writeStoredJson(COVERAGE_ZONES_STORAGE_KEY, sanitizeCoverageZones(coverageZones));
  }, [coverageZones]);

  useEffect(() => {
    cacheWeeklyWorkingSchedule(weeklyWorkingSchedule);
  }, [weeklyWorkingSchedule]);

  useEffect(() => {
    let cancelled = false;

    async function loadAuthoritativeWeeklyWorkingSchedule() {
      try {
        const result = await loadAndCacheWeeklyWorkingScheduleFromSupabase();
        if (cancelled || result.status !== "found") return;

        setWeeklyWorkingSchedule(result.schedule);
        setDays((current) => applyWorkingHoursOverridesToDays(current, result.schedule, workingHoursOverridesByDateRef.current));
      } catch (error) {
        console.warn("Working Hours will use local cache because Supabase could not be reached.", error);
      }
    }

    loadAuthoritativeWeeklyWorkingSchedule();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!visibleWorkingHoursDateRange || loadedWorkingHoursOverrideRangeRef.current === visibleWorkingHoursDateRangeKey) return;

    let cancelled = false;

    async function loadVisibleWorkingHoursOverrides() {
      try {
        const loadedOverrides = await loadWorkingHoursOverridesFromSupabase(
          visibleWorkingHoursDateRange.startDate,
          visibleWorkingHoursDateRange.endDate,
          weeklyWorkingSchedule
        );
        if (cancelled) return;

        const mergedOverrides = mergeLoadedWorkingHoursOverrides(
          workingHoursOverridesByDateRef.current,
          loadedOverrides,
          visibleWorkingHoursDateRange
        );
        workingHoursOverridesByDateRef.current = mergedOverrides;
        setWorkingHoursOverridesByDate(mergedOverrides);
        setDays((currentDays) => applyWorkingHoursOverridesToDays(currentDays, weeklyWorkingSchedule, mergedOverrides));
        loadedWorkingHoursOverrideRangeRef.current = visibleWorkingHoursDateRangeKey;
      } catch (error) {
        console.warn("Working Hours date overrides could not be loaded. Showing inherited weekly settings for unloaded dates.", error);
      }
    }

    loadVisibleWorkingHoursOverrides();

    return () => {
      cancelled = true;
    };
  }, [visibleWorkingHoursDateRange, visibleWorkingHoursDateRangeKey, weeklyWorkingSchedule]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      writeStoredJson(SESSION_PREFERENCES_STORAGE_KEY, sanitizeSessionPreferences(sessionPreferences));
    }
  }, [sessionPreferences]);

  useEffect(() => {
    let cancelled = false;

    async function loadSessionPreferences() {
      try {
        const preferences = await loadSessionPreferencesFromSupabase({
          includeHidden: activeView === "admin" && Boolean(adminSession),
        });
        if (!cancelled) {
          setSessionPreferences(preferences);
          setAdminSystemMessage((message) =>
            message === "Session preferences table is unavailable. Please apply the latest Supabase migration."
              ? ""
              : message
          );
        }
      } catch (error) {
        const message = error?.message || "Session preferences could not be loaded.";
        if (import.meta.env.DEV) {
          console.warn("Using development fallback session preferences.", error);
          return;
        }
        if (!cancelled) {
          setAdminSystemMessage(message);
          setClientBookingMessage("Session preferences are temporarily unavailable. You can still add notes for your appointment.");
        }
      }
    }

    loadSessionPreferences();
    return () => {
      cancelled = true;
    };
  }, [activeView, adminSession]);

  useEffect(() => {
    writeStoredJson(FINANCIAL_SETTINGS_STORAGE_KEY, normalizeFinancialSettings(financialSettings));
  }, [financialSettings]);

  useEffect(() => {
    writeStoredJson(EXPENSES_STORAGE_KEY, sanitizeExpenses(expenses));
  }, [expenses]);

  useEffect(() => {
    writeStoredJson(CLIENT_NOTES_STORAGE_KEY, sanitizeClientNotes(clientNoteOverrides));
  }, [clientNoteOverrides]);

  useEffect(() => {
    writeStoredJson(CLIENT_PROFILES_STORAGE_KEY, sanitizeClientProfiles(clientProfileOverrides));
  }, [clientProfileOverrides]);

  useEffect(() => {
    writeStoredJson(DOCUMENT_SETTINGS_STORAGE_KEY, sanitizeDocumentSettings(documentSettings));
  }, [documentSettings]);

  function updateFinancialSetting(field, value) {
    setFinancialSettings((current) => updateFinancialSettings(current, { [field]: value }));
  }

  function updateDocumentSetting(field, value) {
    setDocumentSettings((current) => sanitizeDocumentSettings({ ...current, [field]: value }));
  }

  function createExpense(expenseInput) {
    setExpenses((current) => addExpense(current, expenseInput));
  }

  function editExpense(expenseId, patch) {
    setExpenses((current) => updateExpense(current, expenseId, patch));
  }

  function removeExpense(expenseId) {
    setExpenses((current) => deleteExpense(current, expenseId));
  }

  function updateClientNote(clientId, text) {
    const trimmedText = String(text || "").trim();
    if (!trimmedText) return;

    setClientNoteOverrides((current) => ({
      ...current,
      [clientId]: {
        notes: [
          {
            createdAt: new Date().toISOString(),
            id: `${clientId}-${Date.now()}`,
            text: trimmedText,
          },
          ...(current[clientId]?.notes || []),
        ],
      },
    }));
  }

  function deleteClientNote(clientId, noteId) {
    setClientNoteOverrides((current) => ({
      ...current,
      [clientId]: {
        notes: (current[clientId]?.notes || []).filter((note) => note.id !== noteId),
      },
    }));
  }

  function updateClientProfile(clientId, profile) {
    setClientProfileOverrides((current) => ({
      deletedIds: (current.deletedIds || []).filter((id) => id !== clientId),
      overrides: {
        ...(current.overrides || {}),
        [clientId]: {
          address: String(profile.address || "").trim(),
          email: String(profile.email || "").trim(),
          name: String(profile.name || "").trim(),
          phone: String(profile.phone || "").trim(),
          updates: String(profile.updates || "").trim(),
        },
      },
    }));
  }

  function deleteClientProfile(clientId) {
    setClientProfileOverrides((current) => {
      const deletedIds = [...new Set([...(current.deletedIds || []), clientId])];
      const overrides = { ...(current.overrides || {}) };
      delete overrides[clientId];
      return { deletedIds, overrides };
    });
    setClientNoteOverrides((current) => {
      const next = { ...current };
      delete next[clientId];
      return next;
    });
  }

  function commitEnhancementChanges(updater, successMessage = "Enhancements saved.") {
    const previousEnhancements = enhancements;
    const nextEnhancements = sanitizeStoredEnhancements(
      typeof updater === "function" ? updater(previousEnhancements) : updater
    );
    const revision = enhancementSaveRevisionRef.current + 1;
    enhancementSaveRevisionRef.current = revision;
    setEnhancements(nextEnhancements);
    setEnhancementSaveStatus({ message: "Saving enhancements...", saving: true, type: "pending" });

    const saveOperation = enhancementSaveQueueRef.current
      .catch(() => null)
      .then(() => saveEnhancementsToSupabase(nextEnhancements));
    enhancementSaveQueueRef.current = saveOperation;

    saveOperation
      .then((result) => {
        confirmedEnhancementsRef.current = result.enhancements;
        if (enhancementSaveRevisionRef.current !== revision) return;
        setEnhancements(result.enhancements);
        setEnhancementSaveStatus({ message: successMessage, saving: false, type: "success" });
      })
      .catch((error) => {
        if (enhancementSaveRevisionRef.current !== revision) return;
        setEnhancements(confirmedEnhancementsRef.current);
        setEnhancementSaveStatus({
          message: error?.message || "Enhancements could not be saved.",
          saving: false,
          type: "error",
        });
      });
  }

  function updateEnhancement(id, patch) {
    commitEnhancementChanges((current) =>
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
    commitEnhancementChanges((current) => [
      ...current,
      {
        active: true,
        description: "Describe this enhancement.",
        durationMinutes: 0,
        id,
        name: "New enhancement",
        price: 0,
      },
    ], "Enhancement added.");
  }

  function deleteEnhancement(id) {
    const confirmed = window.confirm("Delete this enhancement?");
    if (!confirmed) return;
    commitEnhancementChanges((current) => current.filter((item) => item.id !== id), "Enhancement deleted.");
  }

  function updateCoverageZone(zone, value) {
    setCoverageZones((current) => sanitizeCoverageZones({ ...current, [zone]: normalizePostcodeAreaList(value) }));
  }

  function updateServiceArea(areaId, patch) {
    setServiceAreas((current) =>
      current.map((area) =>
        area.id === areaId ? { ...area, ...patch } : area
      )
    );
  }

  function addService() {
    const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `service-${Date.now()}`;
    const newService = {
      id,
      name: "New service",
      visible: true,
    };

    setServices((current) => sanitizeStoredServices([...current, newService]));
    setServiceDetails((current) => ({
      ...current,
      [id]: {
        buffer: DEFAULT_TRAVEL_BUFFER,
        duration: 60,
        durationPrices: { 60: 90, 90: 125, 120: 160 },
        imageUrl: massageTreatmentImage,
        longDescription: "A professional mobile massage treatment tailored to the client's needs.",
        price: 90,
        shortDescription: "Professional mobile massage treatment.",
      },
    }));
    return id;
  }

  function deleteService(serviceId) {
    const service = services.find((item) => item.id === serviceId);
    if (!service) return;
    const confirmed = window.confirm(`Delete ${service.name}? This removes it from client booking choices.`);
    if (!confirmed) return;

    setServices((current) => current.filter((item) => item.id !== serviceId));
    setServiceDetails((current) => {
      const next = { ...current };
      delete next[serviceId];
      return next;
    });
    setSelectedServiceId((current) => {
      if (current !== serviceId) return current;
      return services.find((item) => item.id !== serviceId)?.id ?? "";
    });
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

      return [
        ...current,
        { active: true, congestionFee: 0, custom: true, id, name: trimmedName, travelSurcharge: 0 },
      ];
    });
  }

  function deleteServiceArea(areaId) {
    const area = areaSettings.draft.find((item) => item.id === areaId);
    if (!area?.custom) return;
    const confirmed = window.confirm(`Delete ${area.name}?`);
    if (!confirmed) return;
    setServiceAreas((current) => current.filter((item) => item.id !== areaId));
  }

  async function handleClientGoogleLogin() {
    setClientAuthError("");
    setClientAuthNotice("");
    setClientAuthActionLoading(true);
    try {
      const { signInClientWithGoogle } = await import("./supabaseClient.js");
      const redirectTo = buildClientAuthRedirectUrl();
      await signInClientWithGoogle(redirectTo);
    } catch (error) {
      const message = friendlyClientAuthError(error, "Google sign-in is not enabled yet. Please use email sign-in.");
      setClientAuthError(message);
    } finally {
      setClientAuthActionLoading(false);
    }
  }

  async function handleClientEmailLogin(email) {
    setClientAuthError("");
    setClientAuthNotice("");
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setClientAuthError("Please enter a valid email address.");
      return;
    }

    setClientAuthActionLoading(true);
    try {
      const { signInClientWithEmail } = await import("./supabaseClient.js");
      const redirectTo = buildClientAuthRedirectUrl();
      await signInClientWithEmail(normalizedEmail, redirectTo);
      setClientAuthNotice("Check your email for a secure sign-in link.");
    } catch (error) {
      const message = friendlyClientAuthError(error, "I couldn't send the sign-in email just now. Please try again.");
      setClientAuthError(message);
    } finally {
      setClientAuthActionLoading(false);
    }
  }

  async function handleClientSignOut() {
    setClientAuthError("");
    setClientAuthNotice("");
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
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", `${window.location.pathname}?view=admin`);
      }
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

  function applyDateOverrideResult(dateValue, result) {
    const safeDateValue = normalizePlainDateValue(dateValue);
    if (!safeDateValue) return;

    const next = { ...workingHoursOverridesByDateRef.current };
    if (result.hasDateOverride) {
      next[safeDateValue] = dateWorkingHoursOverridePayload(safeDateValue, result.settings, weeklyWorkingSchedule);
    } else {
      delete next[safeDateValue];
    }
    workingHoursOverridesByDateRef.current = next;
    setWorkingHoursOverridesByDate(next);
    setDays((currentDays) => applyWorkingHoursOverridesToDays(currentDays, weeklyWorkingSchedule, next));
  }

  async function updateDaySettingsByDate(dateValue, patch) {
    const safeDateValue = normalizePlainDateValue(dateValue);
    if (!safeDateValue) throw new Error("A valid date is required to save this date override.");
    const sourceDay = days.find((day) => day.dateValue === safeDateValue);
    const baseSettings = sourceDay?.settings
      || resolveWorkingHoursSettingsForDate(safeDateValue, weeklyWorkingSchedule, workingHoursOverridesByDate[safeDateValue]).settings;
    const nextSettings = { ...baseSettings, ...patch };
    const result = await saveWorkingHoursOverrideToSupabase(safeDateValue, nextSettings, weeklyWorkingSchedule);
    applyDateOverrideResult(safeDateValue, result);
    setAdminSystemMessage(result.hasDateOverride ? "Date override saved." : "This date now uses the weekly schedule.");
    return result;
  }

  async function useWeeklyScheduleForDate(dateValue) {
    const safeDateValue = normalizePlainDateValue(dateValue);
    if (!safeDateValue) throw new Error("A valid date is required to use the weekly schedule.");
    const result = await deleteWorkingHoursOverrideFromSupabase(safeDateValue);
    applyDateOverrideResult(safeDateValue, {
      ...result,
      settings: weeklySettingsForDateValue(safeDateValue, weeklyWorkingSchedule),
    });
    setAdminSystemMessage("This date now uses the weekly schedule.");
    return result;
  }

  async function updateWeeklyWorkingSchedule(nextSchedule) {
    const normalizedSchedule = normalizeWeeklyWorkingSchedule(nextSchedule);
    const validationMessage = validateWeeklyWorkingSchedule(normalizedSchedule);
    if (validationMessage) {
      setAdminSystemMessage(validationMessage);
      return { error: validationMessage };
    }

    try {
      setAdminSystemMessage("Saving working hours...");
      const result = await saveWeeklyWorkingScheduleToSupabase(normalizedSchedule);
      setWeeklyWorkingSchedule(result.schedule);
      setDays((current) => applyWorkingHoursOverridesToDays(current, result.schedule, workingHoursOverridesByDateRef.current));
      setAdminSystemMessage("Working hours saved.");
      return { schedule: result.schedule };
    } catch (error) {
      const message = error?.message || "Working hours could not be saved.";
      setAdminSystemMessage(message);
      return { error: message };
    }
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
      setAdminSystemMessage(error?.message || "Could not add this appointment.");
    }
  }

  async function addBookingToDay(dayIndex, { address = "", clientName = "", congestionFee = 0, customerEmail = "", customerPhone = "", hold = null, isNewClient = false, items = [], kind = "booking", location = "", orderId = "", paymentId = "", price = 0, savedAddressId = "", serviceId, serviceName: providedServiceName = "", sessionNotes = "", sessionPreferenceIds = [], sessionPreferenceLabels = [], start, duration, telegramUpdates = false, travelBuffer, travelFee = 0, userId = "", paymentMethod = "", paymentStatus = "", bookingReference = "", paymentHoldExpiresAt = null, paymentReceivedAt = null, status = "confirmed" }, sourceDays = days) {
    const targetDay = sourceDays[dayIndex];
    if (!targetDay) throw new Error("This appointment date is not available.");
    const serviceName = providedServiceName || serviceNameFor(services, serviceId);
    const linkedRequestId = buildLinkedRequestId({
      serviceId,
      dayLabel: targetDay.dateValue ?? targetDay.label,
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
      dateValue: targetDay.dateValue,
      hold,
      isNewClient: Boolean(isNewClient),
      items,
      kind,
      location,
      orderId,
      paymentId,
      paymentMethod,
      paymentStatus,
      bookingReference,
      paymentReference: bookingReference,
      paymentExpiry: paymentHoldExpiresAt,
      paymentHoldExpiresAt,
      paymentReceivedAt,
      cashOnArrivalRequest: paymentMethod === "cash",
      price,
      savedAddressId,
      status,
      sessionNotes,
      sessionPreferenceIds,
      sessionPreferenceLabels,
      start: minutesToTime(start),
      telegramUpdates,
      travelFee,
      userId,
    };
    const dayKey = targetDay?.dateValue ?? targetDay?.id ?? "";
    const bookingSignature = bookingDuplicateSignature(booking, dayKey);
    const alreadyExists = targetDay?.bookings.some((existingBooking) =>
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

    setDays((current) => {
      const currentTargetIndex = current.findIndex((day) => day.dateValue === targetDay.dateValue);
      const baseDays = currentTargetIndex >= 0 ? current : sourceDays;
      const targetIndex = currentTargetIndex >= 0 ? currentTargetIndex : dayIndex;

      return baseDays.map((day, index) => {
        if (index !== targetIndex) return day;
        const currentDayKey = day.dateValue ?? day.id;
        const currentSignature = bookingDuplicateSignature(savedBooking, currentDayKey);
        const currentAlreadyHasBooking = day.bookings.some((existingBooking) =>
          bookingDuplicateSignature(existingBooking, currentDayKey) === currentSignature
        );

        return {
          ...day,
          bookings: currentAlreadyHasBooking ? day.bookings : [...day.bookings, savedBooking],
        };
      });
    });
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
    if (isValidDateValue(appointment.dateValue)) {
      const sourceDays = days.some((day) => day.dateValue === appointment.dateValue)
        ? days
        : buildDaysStarting(weekStartDateValue(appointment.dateValue), days);
      const dayIndex = sourceDays.findIndex((day) => day.dateValue === appointment.dateValue);
      await addBookingToDay(dayIndex, appointment, sourceDays);
      setSelectedDayIndex(Math.max(0, dayIndex));
      return;
    }

    await addBookingToDay(appointment.dayIndex, appointment);
    setSelectedDayIndex(appointment.dayIndex);
  }

  async function createAdminPersonalEvents(events) {
    const datedEvents = events.filter((event) => isValidDateValue(event?.dateValue));
    if (!datedEvents.length) return null;

    const firstDateValue = datedEvents[0].dateValue;
    const lastDateValue = datedEvents.reduce(
      (latest, event) => (event.dateValue > latest ? event.dateValue : latest),
      firstDateValue
    );
    const calendarWindowStart = addDaysToDateValue(weekStartDateValue(firstDateValue), -7);
    const calendarWindowEnd = addDaysToDateValue(lastDateValue, 21);
    const seedDays = buildDaysForDateRange(calendarWindowStart, calendarWindowEnd, days);
    const loader = adminSession ? loadBookingsFromSupabase : loadPublicAvailabilityFromSupabase;
    let workingDays = seedDays;

    try {
      workingDays = await loader(seedDays);
    } catch (error) {
      console.warn("Could not load the selected personal-event dates from Supabase. Using local calendar data.", error);
    }

    for (const event of datedEvents) {
      const dayIndex = workingDays.findIndex((day) => day.dateValue === event.dateValue);
      if (dayIndex < 0) continue;

      const day = workingDays[dayIndex];
      const serviceName = event.serviceName || serviceNameFor(services, event.serviceId);
      const booking = {
        ...createBooking({
          serviceId: event.serviceId,
          serviceName,
          start: event.start,
          duration: event.duration,
          travelBuffer: event.travelBuffer,
        }),
        address: event.address ?? "",
        clientName: event.clientName ?? "",
        congestionFee: event.congestionFee ?? 0,
        customerEmail: event.customerEmail ?? "",
        customerPhone: event.customerPhone ?? "",
        dateValue: day.dateValue,
        eventColor: event.eventColor ?? DEFAULT_PERSONAL_EVENT_COLOR,
        items: event.items ?? [],
        kind: event.kind ?? "personal",
        location: event.location ?? "",
        orderId: event.orderId ?? "",
        paymentId: event.paymentId ?? "",
        paymentMethod: event.paymentMethod ?? "",
        paymentStatus: event.paymentStatus ?? "",
        bookingReference: event.bookingReference ?? "",
        paymentReference: event.bookingReference ?? "",
        paymentExpiry: event.paymentHoldExpiresAt ?? null,
        paymentHoldExpiresAt: event.paymentHoldExpiresAt ?? null,
        paymentReceivedAt: event.paymentReceivedAt ?? null,
        cashOnArrivalRequest: event.paymentMethod === "cash",
        price: event.price ?? 0,
        savedAddressId: event.savedAddressId ?? "",
        status: event.status ?? "confirmed",
        start: minutesToTime(event.start),
        telegramUpdates: event.telegramUpdates ?? false,
        travelFee: event.travelFee ?? 0,
        userId: event.userId ?? "",
      };
      const dayKey = day.dateValue ?? day.id ?? "";
      const bookingSignature = bookingDuplicateSignature(booking, dayKey);
      const alreadyExists = day.bookings.some((existingBooking) =>
        bookingDuplicateSignature(existingBooking, dayKey) === bookingSignature
      );

      if (alreadyExists || pendingBookingSignatures.has(bookingSignature)) continue;

      pendingBookingSignatures.add(bookingSignature);
      let savedBooking;
      try {
        const insertedRow = await saveAdminPersonalEventToSupabase(booking);
        savedBooking = { ...booking, id: String(insertedRow?.id ?? booking.id) };
      } catch (error) {
        console.warn("Personal event was saved locally because Supabase admin personal-event RPC is unavailable.", error);
        savedBooking = booking;
      } finally {
        pendingBookingSignatures.delete(bookingSignature);
      }

      workingDays = workingDays.map((currentDay, index) => {
        if (index !== dayIndex) return currentDay;
        const currentDayKey = currentDay.dateValue ?? currentDay.id;
        const currentSignature = bookingDuplicateSignature(savedBooking, currentDayKey);
        const currentAlreadyHasBooking = currentDay.bookings.some((existingBooking) =>
          bookingDuplicateSignature(existingBooking, currentDayKey) === currentSignature
        );

        return {
          ...currentDay,
          bookings: currentAlreadyHasBooking ? currentDay.bookings : [...currentDay.bookings, savedBooking],
        };
      });
    }

    setDays(workingDays);
    writeBookingsCacheFromDays(workingDays);
    const nextIndex = workingDays.findIndex((day) => day.dateValue === firstDateValue);
    if (nextIndex >= 0) setSelectedDayIndex(nextIndex);
    return nextIndex;
  }

  function resetClientConfirmGuard() {
    clientConfirmingRef.current = false;
    setClientIsConfirming(false);
  }

  function changeClientVisibleWeek(startDateValue, preferredIndex = 0) {
    const visibleWeek = buildDaysStarting(startDateValue, days);
    const nextIndex = Math.min(Math.max(0, preferredIndex), visibleWeek.length - 1);

    setDays(resolveDaysWithLoadedWorkingHours(visibleWeek));
    setSelectedDayIndex(nextIndex);
    setClientDayIndex(nextIndex);

    const loader = adminSession ? loadBookingsFromSupabase : loadPublicAvailabilityFromSupabase;
    loader(visibleWeek)
      .then((loadedDays) => {
        setDays(resolveDaysWithLoadedWorkingHours(loadedDays));
        if (adminSession) writeBookingsCacheFromDays(loadedDays);
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
      if (!isMobilePreviewFrame) await requireClientBookingAccess(await getSupabaseClient());
      // Always create an order for client-originated bookings so payment metadata is tracked.
      const orderId = crypto.randomUUID ? crypto.randomUUID() : `order-${Date.now()}`;
      const paymentId = `pay_${orderId}`;
      const totalAmount = appointments.length > 0
        ? appointments.reduce((total, appointment) => total + appointment.total, 0)
        : Number(emailPayload?.total) || 0;
      const paymentStatus = paymentMethodToPaymentStatus(paymentMethod);
      const bookingStatus = paymentMethodToBookingStatus(paymentMethod);
      if (isMobilePreviewFrame) {
        const previewReference = bookingReference || generateBookingReference();
        const previewAppointments = appointments.length > 0
          ? appointments.map((appointment, index) => ({
              ...appointment,
              bookingReference: appointment.bookingReference || previewReference,
              id: appointment.id || `mobile-preview-booking-${index + 1}`,
              paymentHoldExpiresAt: paymentMethod === "cash" ? null : paymentHoldExpiresAt,
              paymentMethod,
              paymentStatus,
              previewOnly: true,
              status: bookingStatus,
            }))
          : [{
              bookingReference: previewReference,
              dateLabel: days[dayIndex]?.label || emailPayload?.date || "",
              dateValue: days[dayIndex]?.dateValue || "",
              duration: clientDuration,
              end: slot?.end,
              id: "mobile-preview-booking",
              items: emailPayload?.items ?? [],
              paymentHoldExpiresAt: paymentMethod === "cash" ? null : paymentHoldExpiresAt,
              paymentMethod,
              paymentStatus,
              previewOnly: true,
              selectedAreaName: emailPayload?.location ?? "",
              serviceId,
              serviceName: emailPayload?.serviceName || emailPayload?.items?.[0]?.name || "Massage",
              start: slot?.start,
              status: bookingStatus,
              total: totalAmount,
            }];

        setClientSelectedSlot(null);
        if (paymentMethod === "bank_transfer") {
          setClientBookingMessage("I'll confirm your appointment as soon as I've checked your payment.");
        } else if (paymentMethod === "cash") {
          setClientBookingMessage("I've received your cash payment request and I'll confirm shortly.");
        } else if (paymentMethod === "alternative_requested") {
          setClientBookingMessage("I've received your payment request and I'll be in touch.");
        } else {
          setClientBookingMessage("Your appointment is confirmed.");
        }
        return { appointments: previewAppointments, previewOnly: true };
      }

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
        if (appointments.length > 1) {
          logBookingConfirmation("slot revalidation failed");
          throw new Error("Please book one appointment at a time.");
        }
        const appointmentToValidate = appointments[0];
        const activeAreaIds = new Set(serviceAreas.filter((area) => area.active !== false).map((area) => area.id));
        const appointmentDay = days.find((day) => day.dateValue === appointmentToValidate.dateValue);
        if (!activeAreaIds.has(appointmentToValidate.selectedAreaId)) {
          logBookingConfirmation("slot revalidation failed");
          throw new Error(`${appointmentToValidate.selectedAreaName || "This area"} is no longer available for online booking.`);
        }
        if (!appointmentDay) {
          logBookingConfirmation("slot revalidation failed");
          throw new Error("This appointment date is no longer available. Please choose another date.");
        }
        const appointmentPreview = getClientBookablePreviewForDay({
          day: appointmentDay,
          bookings: activeBookingsExcludingMatchingHold(appointmentDay.bookings, appointmentToValidate),
          requestedDuration: appointmentToValidate.duration,
          requestedTravelBuffer: appointmentToValidate.travelBuffer ?? DEFAULT_TRAVEL_BUFFER,
        });
        const expectedEnd = appointmentToValidate.end ?? appointmentToValidate.start + appointmentToValidate.duration;
        const expectedBufferEnd = expectedEnd + (appointmentToValidate.travelBuffer ?? DEFAULT_TRAVEL_BUFFER);
        const appointmentMatchesSelectedSlot = (slot) => (
          slot.start === appointmentToValidate.start &&
          slot.end === expectedEnd &&
          slot.bufferEnd === expectedBufferEnd
        );
        const appointmentRawStillAvailable = (appointmentPreview.unfilteredSlots || appointmentPreview.slots).some(appointmentMatchesSelectedSlot);
        const appointmentStillAvailable = appointmentPreview.slots.some(appointmentMatchesSelectedSlot);
        if (!appointmentStillAvailable) {
          logBookingConfirmation("slot revalidation failed");
          if (appointmentRawStillAvailable) {
            throw new Error("Online appointments need at least 2 hours notice. Please choose a later time.");
          }
          throw new Error(`${appointmentToValidate.dateLabel || appointmentToValidate.dateValue} at ${minutesToTime(appointmentToValidate.start)} is no longer available.`);
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
            hold: appointment.hold,
            isNewClient: false,
            items: appointment.items,
            location: appointment.selectedAreaName,
            orderId,
            paymentId,
            paymentMethod,
            paymentStatus,
            bookingReference: bookingReference || undefined,
            paymentHoldExpiresAt: paymentMethod === "cash" ? null : paymentHoldExpiresAt,
            status: bookingStatus,
            price: appointment.price,
            savedAddressId,
            serviceId: appointment.serviceId,
            serviceName: appointment.serviceName,
            sessionNotes: appointment.sessionNotes,
            sessionPreferenceIds: appointment.sessionPreferenceIds,
            sessionPreferenceLabels: appointment.sessionPreferenceLabels,
            start: appointment.start,
            telegramUpdates: Boolean(customer?.telegramUpdates),
            travelBuffer: appointment.travelBuffer,
            travelFee: appointment.travelFee,
            userId: authSession?.user?.id || "",
          });
          if (!savedAppointment) {
            throw new Error("An appointment could not be added because it is already in the calendar.");
          }
          savedBookings.push({
            ...appointment,
            ...savedAppointment,
            dateLabel: appointment.dateLabel,
            dateValue: appointment.dateValue,
            end: appointment.end,
            selectedAreaId: appointment.selectedAreaId,
            selectedAreaName: appointment.selectedAreaName,
            start: appointment.start,
            total: appointment.total,
          });
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
          setClientBookingMessage("I'll confirm your appointment as soon as I've checked your payment.");
        } else if (paymentMethod === "cash") {
          setClientBookingMessage("I've received your cash payment request and I'll confirm shortly.");
        } else if (paymentMethod === "alternative_requested") {
          setClientBookingMessage("I've received your payment request and I'll be in touch.");
        } else {
          setClientBookingMessage("Your appointment is confirmed.");
        }

        logBookingConfirmation("notification started");
        const emailTask = postTransactionalEmail({
          payload: {
            ...emailPayload,
            bookingReference,
            orderId,
            paymentId,
            paymentMethod,
            paymentStatus,
            paymentHoldExpiresAt: paymentMethod === "cash" ? null : paymentHoldExpiresAt,
            status: bookingStatus,
            total: totalAmount,
          },
          to: customer?.email,
          type: "bookingConfirmation",
        });
        logBookingConfirmation("notification backgrounded");
        void emailTask.catch(() => {
          logBookingConfirmation("notification failed");
        });
        return { appointments: savedBookings };
      }

      logBookingConfirmation("slot revalidation started");
      const day = days[dayIndex];
      if (!day || !slot) {
        logBookingConfirmation("slot revalidation failed");
        throw new Error("The selected appointment time is missing. Please choose it again.");
      }
      const latestPreview = getClientBookablePreviewForDay({
        day,
        bookings: activeBookingsForDay(day.bookings),
        requestedDuration: clientDuration,
        requestedTravelBuffer: DEFAULT_TRAVEL_BUFFER,
      });
      const selectedSlotMatches = (availableSlot) => {
        return (
          availableSlot.start === slot.start &&
          availableSlot.end === slot.end &&
          availableSlot.bufferEnd === slot.bufferEnd
        );
      };
      const rawStillAvailable = (latestPreview.unfilteredSlots || latestPreview.slots).some(selectedSlotMatches);
      const stillAvailable = latestPreview.slots.some(selectedSlotMatches);
      if (!stillAvailable) {
        logBookingConfirmation("slot revalidation failed");
        setClientSelectedSlot(null);
        if (rawStillAvailable) {
          throw new Error("Online appointments need at least 2 hours notice. Please choose a later time.");
        }
        throw new Error("This time is no longer available. Please choose another.");
      }
      logBookingConfirmation("slot revalidation succeeded");

      const savedBooking = await addBookingToDay(dayIndex, {
        address: emailPayload?.address ?? "",
        clientName: customer?.name ?? "",
        customerEmail: customer?.email ?? "",
        customerPhone: customer?.phone ?? "",
        isNewClient: false,
        items: emailPayload?.items ?? [],
        location: emailPayload?.location ?? "",
        savedAddressId,
        serviceId,
        sessionNotes: emailPayload?.sessionNotes ?? "",
        sessionPreferenceIds: emailPayload?.sessionPreferenceIds ?? [],
        sessionPreferenceLabels: emailPayload?.sessionPreferenceLabels ?? [],
        start: slot.start,
        duration: clientDuration,
        hold,
        telegramUpdates: Boolean(customer?.telegramUpdates),
        travelBuffer: DEFAULT_TRAVEL_BUFFER,
        userId: authSession?.user?.id || "",
        orderId,
        paymentId,
        paymentMethod,
        paymentStatus,
        bookingReference: bookingReference || undefined,
        paymentHoldExpiresAt: paymentMethod === "cash" ? null : paymentHoldExpiresAt,
        status: bookingStatus,
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
        setClientBookingMessage("I'll confirm your appointment as soon as I've checked your payment.");
      } else if (paymentMethod === "cash") {
        setClientBookingMessage("I've received your cash payment request and I'll confirm shortly.");
      } else if (paymentMethod === "alternative_requested") {
        setClientBookingMessage("I've received your payment request and I'll be in touch.");
      } else {
        setClientBookingMessage("Your appointment is confirmed.");
      }
      setSelectedDayIndex(dayIndex);

      logBookingConfirmation("notification started");
      const emailTask = postTransactionalEmail({
        payload: {
          ...emailPayload,
          bookingReference,
          orderId,
          paymentId,
          paymentMethod,
          paymentStatus,
          paymentHoldExpiresAt: paymentMethod === "cash" ? null : paymentHoldExpiresAt,
          status: bookingStatus,
          total: totalAmount,
        },
        to: customer?.email,
        type: "bookingConfirmation",
      });
      logBookingConfirmation("notification backgrounded");
      void emailTask.catch(() => {
        logBookingConfirmation("notification failed");
      });
      return {
        appointments: [{
          ...savedBooking,
          dateLabel: day.label,
          dateValue: day.dateValue,
          end: slot.end,
          selectedAreaName: emailPayload?.location ?? savedBooking.location,
          start: slot.start,
          total: totalAmount,
        }],
      };
    } catch (error) {
      logBookingConfirmation("confirm failed", error);
      const message = bookingHoldErrorMessage(error) || "Your appointment could not be confirmed. Please try again.";
      setClientBookingMessage(message);
      return { error: message };
    } finally {
      setClientIsConfirming(false);
      clientConfirmingRef.current = false;
    }
  }

  function joinWaitlist(event, contact = {}) {
    event.preventDefault();

    const contactValidationMessage = waitlistContactValidationMessage(waitlistForm);
    if (contactValidationMessage) {
      setClientBookingMessage(contactValidationMessage);
      return;
    }

    const dateValidationMessage = waitlistDateValidationMessage(waitlistForm);
    if (dateValidationMessage) {
      setClientBookingMessage(dateValidationMessage);
      return;
    }

    const rangeValidationMessage = waitlistRangeValidationMessage(waitlistForm);
    if (rangeValidationMessage) {
      setClientBookingMessage(rangeValidationMessage);
      return;
    }

    const preferredWindow = buildWaitlistPreferredWindow(waitlistForm);
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      linkedRequestId: buildLinkedRequestId({
        serviceId: clientServiceId,
        dayLabel: waitlistForm.preferredDate,
        duration: Number(waitlistForm.duration),
      }),
      serviceId: clientServiceId,
      clientName: waitlistForm.clientName.trim(),
      email: waitlistForm.email.trim() || contact.email || "",
      phone: waitlistForm.phone.trim() || contact.phone || "",
      notes: waitlistForm.notes.trim(),
      datePreferenceType: waitlistForm.datePreferenceType,
      preferredDate: waitlistForm.preferredDate,
      preferredDateEnd: waitlistForm.datePreferenceType === "range" ? waitlistForm.preferredDateEnd : "",
      preferenceType: waitlistForm.preferenceType,
      preferredWindow,
      preferredWindowEnd: waitlistForm.preferenceType === "window" ? waitlistForm.preferredWindowEnd : "",
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
      area: contact.areaName || "",
      email: entry.email,
      phone: entry.phone,
    });
    setWaitlistForm((current) => ({
      ...current,
      clientName: "",
      email: "",
      phone: "",
      notes: "",
      datePreferenceType: "single",
      preferredWindow: WAITLIST_NO_PREFERENCE,
      preferredWindowEnd: DEFAULT_WAITLIST_RANGE_END,
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
    const confirmed = window.confirm("Close this waitlist request?");
    if (!confirmed) return;
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
      bookings: activeBookingsForDay(offeredDay.bookings),
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

    let offerHold = null;
    try {
      await requireClientBookingAccess(await getSupabaseClient());
      offerHold = await createBookingHoldInSupabase({ dateValue: offeredDay.dateValue,
        slot: { ...entry.offeredSlot, duration: entry.duration, travelBuffer: DEFAULT_TRAVEL_BUFFER } });
      const saved = await addBookingToDay(entry.offeredDayIndex, {
        clientName: clientProfile?.fullName || entry.clientName,
        customerEmail: authSession?.user?.email || "",
        customerPhone: clientProfile?.phone || "",
        hold: offerHold,
        serviceId: entry.offeredServiceId,
        start: entry.offeredSlot.start,
        duration: entry.duration,
        travelBuffer: DEFAULT_TRAVEL_BUFFER,
        userId: authSession?.user?.id || "",
      });
      if (!saved) {
        await releaseBookingHoldInSupabase(offerHold);
        return;
      }
    } catch (error) {
      if (offerHold) await releaseBookingHoldInSupabase(offerHold).catch(() => {});
      console.error(error);
      setClientBookingMessage(clientAccessErrorMessage(error) || "I couldn't accept this offer. Please try again.");
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
      setAdminSystemMessage(error?.message || "Could not update this appointment.");
      return null;
    }
  }

  async function removeBooking(id) {
    const confirmed = window.confirm("Delete this appointment?");
    if (!confirmed) return;
    const bookingToDelete = bookings.find((item) => item.id === id);

    try {
      await deleteBookingFromSupabase(id);
      setSelectedDayBookings((current) => current.filter((booking) => booking.id !== id));
      if (bookingToDelete) {
        notifyAdminTelegram("booking_cancelled", { booking: { ...bookingToDelete, dateValue: selectedDay.dateValue }, cancellationStatus: "deleted by admin" });
      }
    } catch (error) {
      setAdminSystemMessage(error?.message || "Could not delete this appointment.");
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

    const isPersonal = isPersonalEvent(nextBooking);
    const normalizedPatch = isPersonal ? { ...patch } : normalizeAdminBookingApprovalPatch(patch, nextBooking);
    if (
      !isPersonal
      && (normalizedPatch.status === "cancelled" || normalizedPatch.paymentStatus === "cancelled")
      && !normalizedPatch.cancelledBy
      && !nextBooking.cancelledBy
    ) {
      normalizedPatch.cancelledAt = new Date().toISOString();
      normalizedPatch.cancelledBy = "admin";
    }
    nextBooking = { ...nextBooking, ...normalizedPatch };

    try {
      if (isPersonal) {
        try {
          await updateAdminPersonalEventInSupabase(nextBooking);
        } catch (error) {
          console.warn("Personal event was updated locally because Supabase personal-event update failed.", error);
        }
      } else {
        await updateBookingInSupabase(nextBooking);
      }
      const paymentChanged = (
        Object.prototype.hasOwnProperty.call(normalizedPatch, "paymentMethod")
        || Object.prototype.hasOwnProperty.call(normalizedPatch, "paymentStatus")
      );

      if (paymentChanged && !isPersonal) {
        notifyAdminTelegram("payment_status", {
          amount: bookingTotalDue(nextBooking),
          booking: nextBooking,
          bookingStatus: nextBooking.status,
          paymentMethod: nextBooking.paymentMethod,
          status: nextBooking.paymentStatus,
        });

        if (nextBooking.customerEmail) {
          const paymentWasMarkedPaid = nextBooking.paymentStatus === "paid" && oldBooking?.paymentStatus !== "paid";
          const paymentWasRejected = nextBooking.status === "cancelled" || nextBooking.paymentStatus === "cancelled";
          const emailRequest = paymentWasRejected
            ? {
                payload: bookingEmailPayload(nextBooking),
                to: nextBooking.customerEmail,
                type: "cancellationConfirmation",
              }
            : paymentWasMarkedPaid
              ? {
                  payload: bookingEmailPayload(nextBooking),
                  to: nextBooking.customerEmail,
                  type: "receipt",
                }
            : nextBooking.paymentMethod === "cash"
              ? {
                  payload: bookingEmailPayload(nextBooking),
                  to: nextBooking.customerEmail,
                  type: "bookingConfirmation",
                }
              : null;

          if (emailRequest) {
            void postTransactionalEmail(emailRequest).catch((error) => {
              console.warn("Payment status email could not be sent", {
                name: error?.name || "Error",
              });
            });
          }
        }
      } else if (!isPersonal) {
        notifyAdminTelegram("booking_modified", { bookingId: id, newBooking: nextBooking, oldBooking });
      }
      setDays((current) =>
        current.map((day) => ({
          ...day,
          bookings: day.bookings.map((booking) => (booking.id === id ? { ...booking, ...normalizedPatch } : booking)),
        }))
      );
      return nextBooking;
    } catch (error) {
      setAdminSystemMessage(error?.message || "Could not update this appointment.");
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
      setAdminSystemMessage(error?.message || "Could not duplicate this appointment.");
      return null;
    }
  }

  async function deleteBookingAcrossDays(id, options = {}) {
    let deletedBooking = null;
    let deletedBookingDay = null;

    for (const day of days) {
      const booking = day.bookings.find((item) => item.id === id);
      if (booking) {
        deletedBooking = { ...booking, dateValue: day.dateValue };
        deletedBookingDay = day;
        break;
      }
    }

    if (!deletedBooking) return;

    const forceDelete = Boolean(options.forceDelete || isPersonalEvent(deletedBooking));

    if (forceDelete) {
      const confirmed = options.confirmed || window.confirm(
        isCancelledBooking(deletedBooking)
          ? "Delete this cancelled booking from the calendar?"
          : "Delete this appointment?"
      );
      if (!confirmed) return;

      try {
        await deleteBookingFromSupabase(id);
      } catch (error) {
        if (isPersonalEvent(deletedBooking)) {
          console.warn("Personal event was removed locally because Supabase delete failed.", error);
        } else {
          setAdminSystemMessage(error?.message || "Could not delete this appointment.");
          return;
        }
      }

      if (deletedBooking && !isPersonalEvent(deletedBooking)) {
        notifyAdminTelegram("booking_cancelled", { booking: deletedBooking, cancellationStatus: "deleted by admin" });
      }
      setAdminSystemMessage("");
      setDays((current) =>
        current.map((day) => ({
          ...day,
          bookings: day.bookings.filter((booking) => booking.id !== id),
        }))
      );
      return;
    }

    const confirmed = options.confirmed || window.confirm("Cancel this booking?");
    if (!confirmed) return;

    const cancelledBooking = {
      ...deletedBooking,
      cancelledAt: new Date().toISOString(),
      cancelledBy: "admin",
      dateValue: deletedBookingDay?.dateValue || deletedBooking.dateValue,
      paymentStatus: "cancelled",
      status: "cancelled",
    };

    try {
      await updateBookingInSupabase(cancelledBooking);
    } catch (error) {
      setAdminSystemMessage(error?.message || "Could not cancel this appointment.");
      return;
    }

    notifyAdminTelegram("booking_cancelled", { booking: cancelledBooking, cancellationStatus: "cancelled by admin" });
    setAdminSystemMessage("");
    setDays((current) =>
      current.map((day) => ({
        ...day,
        bookings: day.bookings.map((booking) => (booking.id === id ? { ...booking, ...cancelledBooking } : booking)),
      }))
    );
  }

  function resetCurrentDay() {
    const confirmed = window.confirm("Reset the current day and remove its appointments?");
    if (!confirmed) return;
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
    removeStoredValue(CLIENT_NOTES_STORAGE_KEY);
    removeStoredValue(CLIENT_PROFILES_STORAGE_KEY);
    removeStoredValue(DOCUMENT_SETTINGS_STORAGE_KEY);
    setDays(emptyInitialDays());
    setWaitlistEntries([]);
    setClientProfileOverrides({ deletedIds: [], overrides: {} });
    setDocumentSettings({ ...DEFAULT_DOCUMENT_SETTINGS });
    setClientSelectedSlot(null);
    setClientBookingMessage("");
    resetClientConfirmGuard();
  }

  async function clearCalendarBookings() {
    const bookingIds = Array.from(
      new Set(
        days
          .flatMap((day) => day.bookings ?? [])
          .map((booking) => booking?.id ? String(booking.id) : "")
          .filter(Boolean)
      )
    );

    if (!bookingIds.length) {
      setAdminSystemMessage("Calendar is already clear.");
      return;
    }

    const confirmed = window.confirm(
      `Clear ${bookingIds.length} calendar item${bookingIds.length === 1 ? "" : "s"}? This temporary dev helper will delete loaded Supabase bookings where possible and clear the local calendar view.`
    );
    if (!confirmed) return;

    const failedDeletes = [];
    for (const bookingId of bookingIds) {
      try {
        await deleteBookingFromSupabase(bookingId);
      } catch (error) {
        failedDeletes.push({ bookingId, error });
      }
    }

    const deletedIdSet = new Set(bookingIds);
    removeStoredValue(BOOKINGS_STORAGE_KEY);
    setDays((current) =>
      current.map((day) => ({
        ...day,
        bookings: (day.bookings ?? []).filter((booking) => !deletedIdSet.has(String(booking.id))),
      }))
    );
    setClientSelectedSlot(null);
    setClientBookingMessage("");
    resetClientConfirmGuard();

    setAdminSystemMessage(
      failedDeletes.length
        ? `Calendar cleared locally. ${failedDeletes.length} live delete${failedDeletes.length === 1 ? "" : "s"} failed, so a refresh may bring those bookings back.`
        : `Calendar cleared. Removed ${bookingIds.length} item${bookingIds.length === 1 ? "" : "s"}.`
    );
  }

  return (
    <>
    <RuntimeDiagnosticOverlay diagnostic={runtimeDiagnostic} onClear={() => setRuntimeDiagnostic(null)} />
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
          serviceAreas={areaSettings.ready ? serviceAreas : []}
          serviceAreasMessage={areaSettings.loading ? "Loading appointment areas..." : !areaSettings.ready || !serviceAreas.length ? "Appointment areas are temporarily unavailable. Please try again later." : ""}
          services={services}
          serviceDetails={serviceDetails}
          enhancements={publicClientEnhancements}
          sessionPreferences={sessionPreferences}
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
          clientAuthActionLoading={clientAuthActionLoading}
          clientAuthError={clientAuthError}
          clientAuthNotice={clientAuthNotice}
          onEmailLogin={handleClientEmailLogin}
          onGoogleLogin={handleClientGoogleLogin}
          onClientSignOut={handleClientSignOut}
          isMobilePreviewFrame={isMobilePreviewFrame}
          onSwitchAdmin={() => setActiveView("admin")}
          onClientStepChange={setMobilePreviewClientStep}
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
              <AdminPanelErrorBoundary resetKey={`admin-workspace-${activeView}`}>
                <React.Suspense fallback={null}>
                  <LiveAdminWorkspace
                  adminSession={adminSession}
                  adminSystemMessage={adminSystemMessage}
                  bookings={bookings}
                  coverageZones={coverageZones}
                  days={days}
                  enhancements={enhancements}
                  enhancementSaveStatus={enhancementSaveStatus}
                  expenseCategories={EXPENSE_CATEGORIES}
                  expenses={expenses}
                  financialSettings={financialSettings}
                  documentSettings={documentSettings}
                  clientNoteOverrides={clientNoteOverrides}
                  clientProfileOverrides={clientProfileOverrides}
                  serviceAreas={serviceAreas}
                  areaSettings={areaSettings}
                  sessionPreferences={sessionPreferences}
                  onUpdateSessionPreferences={setSessionPreferences}
                  onCloseWaitlistRequest={closeWaitlistRequest}
                  onCreateAppointment={createAdminAppointment}
                  onCreatePersonalEvent={createAdminPersonalEvents}
                onDeleteBooking={deleteBookingAcrossDays}
                onDuplicateBooking={duplicateBookingAcrossDays}
                onAddEnhancement={addEnhancement}
                onDeleteService={deleteService}
                onAddExpense={createExpense}
                onDeleteEnhancement={deleteEnhancement}
                onDeleteExpense={removeExpense}
                onUpdateEnhancement={updateEnhancement}
                onUpdateExpense={editExpense}
                  onUpdateCoverageZone={updateCoverageZone}
                  onAdminLogout={handleAdminLogout}
                  onClearCalendarBookings={clearCalendarBookings}
                  onAddService={addService}
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
                  onSetSelectedDayIndex={setAdminSelectedDayIndex}
                  onDeleteClientProfile={deleteClientProfile}
                  onDeleteClientNote={deleteClientNote}
                  onUpdateClientProfile={updateClientProfile}
                  onUpdateClientNote={updateClientNote}
                  onUpdateBooking={updateBookingAcrossDays}
                  onUpdateDaySettings={updateDaySettingsByDate}
                  onUpdateSetting={updateSetting}
                  onUseWeeklyScheduleForDate={useWeeklyScheduleForDate}
                  onUpdateFinancialSetting={updateFinancialSetting}
                  onUpdateDocumentSetting={updateDocumentSetting}
                  onUpdateWeeklyWorkingSchedule={updateWeeklyWorkingSchedule}
                  preview={preview}
                  requestedDuration={requestedDuration}
                  requestedTravelBuffer={requestedTravelBuffer}
                  selectedDay={selectedDay}
                  selectedDayIndex={selectedDayIndex}
                  services={services}
                  serviceDetails={serviceDetails}
                  settings={settings}
                  waitlistEntries={waitlistEntries}
                  weeklyWorkingSchedule={weeklyWorkingSchedule}
                  />
                </React.Suspense>
              </AdminPanelErrorBoundary>
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
                bookings: activeBookingsForDay(day.bookings),
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

        <section className="panel request-panel" id="admin-travel-buffer">
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
    <footer className="privacy-footer"><a href="/privacy">Privacy Notice</a><span aria-hidden="true"> · </span><a href="/terms">Terms of Service</a></footer>
    {showLocalPreviewControls && !isMobilePreviewFrame && (
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
