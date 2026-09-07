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
} from "../../schedulingEngine.js";
import { getServiceAreaFees, sanitizeServiceAreas, serviceAreas as DEFAULT_SERVICE_AREAS } from "../../lib/serviceAreas.js";
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
} from "../../lib/clientData.js";
import {
  bookingToSupabasePayload,
  bookingToLegacySupabasePayload,
  generateBookingReference,
  normalizeStoredBooking,
  paymentMethodToBookingStatus,
  paymentMethodToPaymentStatus,
  normalizeAdminBookingApprovalPatch,
  supabaseRowToStorageBooking,
} from "../../lib/bookingPersistence.js";
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
} from "../../lib/bookingSupabase.js";
import {
  addExpense,
  deleteExpense,
  DEFAULT_FINANCIAL_SETTINGS,
  EXPENSE_CATEGORIES,
  normalizeFinancialSettings,
  sanitizeExpenses,
  updateExpense,
  updateFinancialSettings,
} from "../../lib/financialAnalytics.js";
import {
  shouldAutoReleaseReservation,
  shouldShowReservationInactivityModal,
} from "../../lib/clientReservationInactivity.js";
import {
  DEFAULT_COVERAGE_ZONES,
  getPostcodeArea,
  getPostcodeCoverage,
  normalizePostcodeAreaList,
  sanitizeCoverageZones,
} from "../../lib/coverageZones.js";
import {
  CLIENT_TREATMENT_CARD_DETAILS,
  getClientTreatmentCardDetails,
  getServiceIconFromText,
} from "../../lib/clientTreatmentCards.js";
import {
  customerInitials,
  serviceAbbreviation,
} from "../../lib/customerDisplay.js";
import { bookingHoldErrorMessage } from "../../lib/bookingHoldErrors.js";
import { getFrontendBankTransferDetails } from "../../lib/bankTransferDetails.js";
import {
  SESSION_PREFERENCE_CATEGORIES,
  SESSION_PREFERENCES,
  sanitizeSessionPreferences,
  sessionPreferenceSnapshots,
  sessionPreferenceLabels,
  toggleSessionPreferenceId,
  visibleSessionPreferences as getVisibleSessionPreferences,
} from "../../lib/sessionPreferences.js";
import {
  WEEKLY_WORKING_DAY_KEYS,
  WEEKLY_WORKING_DAY_LABELS,
  applyHoursToWorkingDays,
  copyWeeklyDaySettings,
  defaultWeeklyWorkingSchedule,
  normalizeWeeklyWorkingSchedule,
  resetWeeklyWorkingDay,
  validateWeeklyWorkingSchedule,
  weeklySettingsForDateValue,
} from "../../lib/weeklyWorkingSchedule.js";
import { readCachedWeeklyWorkingSchedule } from "../../lib/workingHoursSupabase.js";
import { buildTelegramStartUrl, normalizeTelegramBotUrl } from "../../lib/telegramLinks.js";
import { ClientEmailSignInForm } from "../Client/ClientAccountPanel.jsx";
import { MyBookingsPanel } from "../Client/MyBookingsPanel.jsx";
import { buildAdminCustomers } from "./adminCustomers.js";
import { BusinessAnalyticsDashboard } from "./BusinessAnalyticsDashboard.jsx";
import { AdminLogin } from "./AdminLogin.jsx";
import {
  AdminAgendaBookingCard,
  AdminCompactBookingCard,
  AdminTimelineBookingCard,
} from "./AdminCalendarCards.jsx";
import { AdminCalendarOverview } from "./AdminCalendarOverview.jsx";
import { AdminCalendarDateNavigation } from "./AdminCalendarDateNavigation.jsx";
import {
  AdminAgendaView,
  AdminCalendarTimeGrid,
} from "./AdminCalendarPrimaryViews.jsx";
import {
  AdminDaySettingsSheet,
  AdminDeleteConfirmationDialog,
  AdminPersonalEventModal,
} from "./AdminCalendarAuxiliaryOverlays.jsx";
import { AdminAppointmentWizard } from "./AdminAppointmentWizard.jsx";
import { AdminAppointmentOverviewModal } from "./AdminAppointmentOverviewModal.jsx";
import { AdminPendingVerificationPanel } from "./AdminPendingVerificationPanel.jsx";
import { AdminClientDirectoryPanel } from "./AdminClientDirectoryPanel.jsx";
import { AdminClientAccessPanel } from "./AdminClientAccessPanel.jsx";
import { AdminClientProfilePanel } from "./AdminClientProfilePanel.jsx";
import { AdminServiceEditorPanel } from "./AdminServiceEditorPanel.jsx";
import { AdminServicesPanel } from "./AdminServicesPanel.jsx";
import { AdminTopbar } from "./AdminTopbar.jsx";
import { DocumentSettingsPanel } from "./DocumentSettingsPanel.jsx";
import { EnhancementsSettingsPanel } from "./EnhancementsSettingsPanel.jsx";
import { FinancialSettingsPanel } from "./FinancialSettingsPanel.jsx";
import { SettingsFolderNavigator } from "./SettingsFolderNavigator.jsx";
import { SettingsRoutingDetailPanels } from "./SettingsRoutingDetailPanels.jsx";
import { SettingsDetailPanel } from "./SettingsDetailPanel.jsx";
import { ServiceAreasSettingsPanel } from "./ServiceAreasSettingsPanel.jsx";
import {
  ClientDetailsStep,
  ClientDurationStep,
  ClientLocationStep,
  ClientTimeStep,
  ClientTreatmentStep,
} from "../Booking/ClientBookingFlowScreens.jsx";
import { BookingTopbar } from "../Booking/BookingTopbar.jsx";
import { Timeline } from "../Calendar/Timeline.jsx";
import { WaitlistPanel } from "../Waitlist/WaitlistPanel.jsx";
import { AdminPanelErrorBoundary } from "../system/AdminPanelErrorBoundary.jsx";
import { RuntimeDiagnosticOverlay } from "../system/RuntimeDiagnosticOverlay.jsx";
import { SETTINGS_NAVIGATION } from "../../config/adminSettingsNavigation.js";
import { DEFAULT_DOCUMENT_SETTINGS } from "../../config/documentSettings.js";
import {
  DEFAULT_PERSONAL_EVENT_COLOR,
  PERSONAL_EVENT_COLORS,
  personalEventColorClass,
} from "../../config/personalEventColors.js";
import {
  BOOKING_HOLD_CLIENT_KEY_STORAGE_KEY,
  BOOKINGS_STORAGE_KEY,
  CLIENT_NOTES_STORAGE_KEY,
  CLIENT_PROFILES_STORAGE_KEY,
  COVERAGE_ZONES_STORAGE_KEY,
  DOCUMENT_SETTINGS_STORAGE_KEY,
  EXPENSES_STORAGE_KEY,
  FINANCIAL_SETTINGS_STORAGE_KEY,
  SERVICE_AREAS_STORAGE_KEY,
  SERVICE_CATALOGUE_MIGRATION_KEY,
  SERVICE_DETAILS_STORAGE_KEY,
  SERVICES_STORAGE_KEY,
  SESSION_PREFERENCES_STORAGE_KEY,
  WAITLIST_STORAGE_KEY,
} from "../../config/storageKeys.js";
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
} from "../../lib/dateTime.js";
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
} from "../../lib/localStorage.js";
import {
  notifyAdminTelegram,
  postTelegramTest,
  postTransactionalEmail,
  telegramTestErrorMessage,
} from "../../lib/notifications.js";
import massageTreatmentImage from "../../assets/massage-treatment-optimized.jpg";

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
    return "Google sign-in is not enabled yet. Please use email sign-in or continue as a guest.";
  }

  if (lowerMessage.includes("email") && lowerMessage.includes("not enabled")) {
    return "Email sign-in is not enabled yet. You can still continue as a guest.";
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

    throw new Error(`Could not hold this time: ${error.message}`);
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
      hasDateOverride: Boolean(existingDay?.hasDateOverride),
      settings: existingDay?.settings
        ? cloneValue(existingDay.settings)
        : {
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
      hasDateOverride: Boolean(existingDay?.hasDateOverride),
      settings: existingDay?.settings
        ? cloneValue(existingDay.settings)
        : {
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
  const confirmationTelegramUrl = buildTelegramStartUrl(CLIENT_TELEGRAM_BOT_URL, confirmedPaymentReference);
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

  function continueToCheckoutDetails() {
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

    const { pickFakeClientForArea } = await import("../../dev/fakeClients.js");
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
          areaSelectionMessage={areaSelectionMessage}
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
                    <p>
                      For Telegram updates,{" "}
                      <strong className="confirmation-telegram-start">open the chat bot and press Start</strong>.
                      {" "}Your booking reference is included so I can connect your request.
                    </p>
                    {confirmationTelegramUrl ? (
                      <a className="confirmation-telegram-action" href={confirmationTelegramUrl} target="_blank" rel="noreferrer">
                        Open Telegram chat bot
                        <ChevronRight aria-hidden="true" size={22} strokeWidth={1.8} />
                      </a>
                    ) : (
                      <p className="confirmation-telegram-note">If you prefer Telegram, contact me directly and I will send you the bot link.</p>
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
  const directStart = Number(booking?.startMinutes ?? booking?.start_minutes);
  if (Number.isFinite(directStart)) return directStart;

  if (typeof booking?.start === "string") {
    const parsedStart = timeToMinutes(booking.start);
    return Number.isFinite(parsedStart) ? parsedStart : null;
  }

  const start = Number(booking?.start);
  return Number.isFinite(start) ? start : null;
}

function bookingDurationMinutes(booking) {
  const duration = Number(booking?.duration ?? booking?.minutes);
  if (Number.isFinite(duration) && duration > 0) return duration;
  const start = bookingStartMinutes(booking);
  const end = Number(booking?.sessionEnd ?? booking?.endMinutes ?? booking?.end_minutes);
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

export function LiveAdminWorkspace({
  adminSession,
  adminSystemMessage = "",
  bookings,
  coverageZones,
  days,
  expenseCategories,
  expenses,
  financialSettings,
  enhancementSaveStatus = { message: "", saving: false, type: "" },
  documentSettings,
  clientNoteOverrides,
  clientProfileOverrides,
  onCloseWaitlistRequest,
  onCreateAppointment,
  onCreatePersonalEvent,
  onDeleteBooking,
  onDuplicateBooking,
  onAddEnhancement,
  onDeleteService,
  onAddExpense,
  onDeleteEnhancement,
  onDeleteExpense,
  onUpdateEnhancement,
  onUpdateExpense,
  onAdminLogout,
  onClearCalendarBookings,
  onResetCurrentDay,
  onResetStoredData,
  onSendWaitlistOffer,
  onServiceDetailChange,
  onServiceNameChange,
  onServiceVisibilityChange,
  onSetActiveView,
  onSetSelectedDayIndex,
  onDeleteClientProfile,
  onDeleteClientNote,
  onUpdateClientProfile,
  onUpdateClientNote,
  onUpdateBooking,
  onUpdateCoverageZone,
  onUpdateDaySettings,
  onUpdateFinancialSetting,
  onUpdateDocumentSetting,
  onAddService,
  onAddServiceArea,
  onDeleteServiceArea,
  onUpdateServiceArea,
  onUpdateSessionPreferences,
  onUpdateSetting,
  onUpdateWeeklyWorkingSchedule,
  onUseWeeklyScheduleForDate,
  preview,
  requestedDuration,
  requestedTravelBuffer,
  selectedDay,
  selectedDayIndex,
  serviceAreas,
  services,
  serviceDetails,
  enhancements,
  sessionPreferences,
  settings,
  waitlistEntries,
  weeklyWorkingSchedule,
}) {
  const [activeTab, setActiveTab] = useState("calendar");
  const [clientDirectoryView, setClientDirectoryView] = useState('history');
  const [calendarMode, setCalendarMode] = useState("agenda");
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [selectedSettingsCategory, setSelectedSettingsCategory] = useState(null);
  const [selectedSettingsSubsection, setSelectedSettingsSubsection] = useState(null);
  const [settingsReturnCategory, setSettingsReturnCategory] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [adminLogoutPending, setAdminLogoutPending] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [clientProfileOpen, setClientProfileOpen] = useState(false);
  const [clientProfileTab, setClientProfileTab] = useState("notes");
  const [clientNoteDraft, setClientNoteDraft] = useState("");
  const [clientNoteSavedMessage, setClientNoteSavedMessage] = useState("");
  const [clientProfileEditOpen, setClientProfileEditOpen] = useState(false);
  const [clientProfileDraft, setClientProfileDraft] = useState({ address: "", email: "", name: "", phone: "", updates: "" });
  const [pendingDeleteClient, setPendingDeleteClient] = useState(null);
  const [calendarConnections, setCalendarConnections] = useState({ google: false, microsoft: false });
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [serviceEditorDraft, setServiceEditorDraft] = useState(null);
  const [serviceEditorError, setServiceEditorError] = useState("");
  const [serviceEditorSaving, setServiceEditorSaving] = useState(false);
  const [editingSessionPreferenceId, setEditingSessionPreferenceId] = useState(null);
  const [sessionPreferenceDraft, setSessionPreferenceDraft] = useState(null);
  const [sessionPreferenceError, setSessionPreferenceError] = useState("");
  const [sessionPreferenceSaving, setSessionPreferenceSaving] = useState(false);
  const [draggingSessionPreferenceId, setDraggingSessionPreferenceId] = useState("");
  const [overviewBooking, setOverviewBooking] = useState(null);
  const [overviewEditing, setOverviewEditing] = useState(false);
  const [overviewMoreOpen, setOverviewMoreOpen] = useState(false);
  const [overviewTab, setOverviewTab] = useState("details");
  const [expandedAgendaBookingId, setExpandedAgendaBookingId] = useState(null);
  const [pendingDeleteBooking, setPendingDeleteBooking] = useState(null);
  const [pendingDeleteScope, setPendingDeleteScope] = useState("single");
  const [overviewUpdatePending, setOverviewUpdatePending] = useState(false);
  const [daySettingsSheet, setDaySettingsSheet] = useState(null);
  const [dayWorkingHoursDraft, setDayWorkingHoursDraft] = useState({
    endTime: DEFAULT_DAY_SETTINGS.workingEnd,
    markUnavailable: false,
    mode: "default",
    startTime: DEFAULT_DAY_SETTINGS.workingStart,
  });
  const [dayScheduleModeDraft, setDayScheduleModeDraft] = useState({
    anchorEnabled: false,
    anchorStart: DEFAULT_DAY_SETTINGS.fixedStart,
    mode: DEFAULT_DAY_SETTINGS.mode,
  });
  const [daySettingsSaving, setDaySettingsSaving] = useState(false);
  const [daySettingsError, setDaySettingsError] = useState("");
  const [expandedWorkingDayKey, setExpandedWorkingDayKey] = useState("Mon");
  const [weeklyWorkingDraft, setWeeklyWorkingDraft] = useState(() => normalizeWeeklyWorkingSchedule(weeklyWorkingSchedule));
  const [weeklyWorkingError, setWeeklyWorkingError] = useState("");
  const [weeklyWorkingSavedMessage, setWeeklyWorkingSavedMessage] = useState("");
  const [weeklyWorkingSaving, setWeeklyWorkingSaving] = useState(false);
  const [copyWorkingDayTargets, setCopyWorkingDayTargets] = useState([]);
  const [financialSettingsDraft, setFinancialSettingsDraft] = useState(() => normalizeFinancialSettings(financialSettings));
  const [appointmentWizardOpen, setAppointmentWizardOpen] = useState(false);
  const [appointmentStep, setAppointmentStep] = useState("services");
  const [appointmentDayIndex, setAppointmentDayIndex] = useState(selectedDayIndex);
  const [appointmentDateValue, setAppointmentDateValue] = useState(selectedDay.dateValue);
  const [appointmentAgendaDay, setAppointmentAgendaDay] = useState(null);
  const [appointmentSlot, setAppointmentSlot] = useState(null);
  const [appointmentCustomerId, setAppointmentCustomerId] = useState("");
  const [appointmentCustomerSearch, setAppointmentCustomerSearch] = useState("");
  const [appointmentAddCustomerOpen, setAppointmentAddCustomerOpen] = useState(false);
  const [appointmentNewCustomer, setAppointmentNewCustomer] = useState({ address: "", email: "", name: "", notes: "", phone: "" });
  const [customAppointmentCustomers, setCustomAppointmentCustomers] = useState([]);
  const [appointmentServiceMinutes, setAppointmentServiceMinutes] = useState({});
  const [activeAppointmentServiceId, setActiveAppointmentServiceId] = useState(null);
  const [appointmentLeavePromptOpen, setAppointmentLeavePromptOpen] = useState(false);
  const [personalEventOpen, setPersonalEventOpen] = useState(false);
  const [personalEventTitle, setPersonalEventTitle] = useState("Personal event");
  const [personalEventStartDate, setPersonalEventStartDate] = useState(selectedDay.dateValue);
  const [personalEventEndDate, setPersonalEventEndDate] = useState(selectedDay.dateValue);
  const [personalEventStartTime, setPersonalEventStartTime] = useState("15:00");
  const [personalEventEndTime, setPersonalEventEndTime] = useState("20:00");
  const [personalEventColor, setPersonalEventColor] = useState(DEFAULT_PERSONAL_EVENT_COLOR);
  const [personalEventError, setPersonalEventError] = useState("");
  const [adminActionMessage, setAdminActionMessage] = useState("");
  const [telegramTestStatus, setTelegramTestStatus] = useState({ message: "", sending: false, type: "" });
  const [compactDateNavVisible, setCompactDateNavVisible] = useState(false);
  const [coverageZoneDraft, setCoverageZoneDraft] = useState(() => ({
    preapproval: coverageZones.preapproval.join(", "),
    usual: coverageZones.usual.join(", "),
  }));
  const agendaDayRefs = useRef({});
  const agendaListRef = useRef(null);
  const adminDateStripRef = useRef(null);
  const agendaScrollSyncingRef = useRef(false);
  const initialCalendarTodayAnchorRef = useRef(false);
  const threeDayGridRef = useRef(null);
  const [pendingAgendaScrollDate, setPendingAgendaScrollDate] = useState(null);

  const selectedDayBookings = getActiveBookingBlocks(bookings);
  const baseCustomers = buildAdminCustomers(days, waitlistEntries, getEffectiveWaitlistStatus);
  const deletedClientIds = new Set(clientProfileOverrides.deletedIds || []);
  const allCustomers = [
    ...customAppointmentCustomers,
    ...baseCustomers.filter((customer) => !customAppointmentCustomers.some((custom) => custom.id === customer.id)),
  ].filter((customer) => !deletedClientIds.has(customer.id)).map((customer) => {
    const savedProfile = clientProfileOverrides.overrides?.[customer.id];
    const savedNote = clientNoteOverrides[customer.id];
    const mergedCustomer = savedProfile
      ? {
          ...customer,
          address: savedProfile.address || customer.address,
          email: savedProfile.email,
          name: savedProfile.name || customer.name,
          phone: savedProfile.phone,
          updates: savedProfile.updates,
        }
      : customer;
    if (!savedNote?.notes?.length) return { ...mergedCustomer, noteEntries: [] };
    const sortedNotes = [...savedNote.notes].sort((first, second) => String(second.createdAt).localeCompare(String(first.createdAt)));

    return {
      ...mergedCustomer,
      noteEntries: sortedNotes,
      notes: sortedNotes[0]?.text || mergedCustomer.notes,
      notesUpdatedAt: sortedNotes[0]?.createdAt || "",
    };
  });

  function isFirstBookingForClient(customer = {}) {
    const email = String(customer.email || "").trim().toLowerCase();
    const phoneDigits = String(customer.phone || "").replace(/\D/g, "");
    const name = String(customer.name || "").trim().toLowerCase();

    if (!email && !phoneDigits && !name) return false;

    return !allCustomers.some((customerRecord) => {
      const recordEmail = String(customerRecord.email || "").trim().toLowerCase();
      const recordPhoneDigits = String(customerRecord.phone || "").replace(/\D/g, "");
      const recordName = String(customerRecord.name || "").trim().toLowerCase();

      if (email && recordEmail && email === recordEmail) return true;
      if (phoneDigits && recordPhoneDigits && phoneDigits === recordPhoneDigits) return true;
      if (!email && !phoneDigits && name && recordName && name === recordName) return true;
      return false;
    });
  }

  const selectedCustomer = allCustomers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const profileCustomer = selectedCustomer ?? allCustomers[0] ?? null;
  const activeClientProfileTab = clientProfileTab === "notes" ? "notes" : "appointments";
  const filteredCustomers = allCustomers.filter((customer) =>
    customer.name.toLowerCase().includes(customerSearch.trim().toLowerCase())
      && (customerFilter === "all" || customer.appointments.length > 1)
  );
  const customerStats = {
    total: allCustomers.length,
    thisMonthBookings: allCustomers.reduce((total, customer) => (
      total + customer.appointments.filter((appointment) => appointment.date?.slice(0, 7) === todayValue().slice(0, 7)).length
    ), 0),
    returningRate: allCustomers.length
      ? Math.round((allCustomers.filter((customer) => customer.appointments.length > 1).length / allCustomers.length) * 100)
      : 0,
  };
  const serviceCards = services.map((service, index) => ({
    ...service,
    color: SERVICE_COLORS[index % SERVICE_COLORS.length],
    ...(serviceDetails[service.id] ?? {
      buffer: DEFAULT_TRAVEL_BUFFER,
      duration: 90,
      price: 120 + index * 10,
    }),
  }));
  const filteredServices = serviceCards.filter((service) =>
    [
      service.name,
      service.shortDescription,
      service.longDescription,
    ].filter(Boolean).join(" ").toLowerCase().includes(serviceSearch.trim().toLowerCase())
  );
  const sessionPreferenceRows = sanitizeSessionPreferences(sessionPreferences).filter((preference) => !preference.deletedAt);
  const editingService = serviceCards.find((service) => service.id === editingServiceId) ?? null;
  const serviceEditorDirty = serviceEditorDraftChanged(editingService, serviceEditorDraft);
  const appointmentItems = serviceCards
    .filter((service) => Number(appointmentServiceMinutes[service.id]) > 0)
    .map((service) => {
      const minutes = Number(appointmentServiceMinutes[service.id]);
      const exactPrice = getServiceDurationPrice(service, minutes);
      const baseDuration = Math.max(1, Number(service.duration) || 60);
      const price = Number.isFinite(exactPrice)
        ? exactPrice
        : Math.round((Number(service.price) || 0) * (minutes / baseDuration));
      return { ...service, minutes, linePrice: price };
    });
  const appointmentDuration = appointmentItems.reduce((total, item) => total + item.minutes, 0);
  const appointmentTravelBuffer = appointmentItems.length === 0
    ? DEFAULT_TRAVEL_BUFFER
    : Math.max(...appointmentItems.map((item) => Number(item.buffer) || DEFAULT_TRAVEL_BUFFER));
  const appointmentTotal = appointmentItems.reduce((total, item) => total + item.linePrice, 0);
  const appointmentDay = days.find((day) => day.dateValue === appointmentDateValue) ?? appointmentAgendaDay ?? days[appointmentDayIndex] ?? selectedDay;
  const appointmentDateLocked = Boolean(appointmentAgendaDay);
  const appointmentWeekStart = weekStartDateValue(appointmentDay.dateValue);
  const appointmentWeekDays = buildDaysForDateRange(appointmentWeekStart, addDaysToDateValue(appointmentWeekStart, 6), days);
  const appointmentWeekSelectedIndex = Math.max(
    0,
    appointmentWeekDays.findIndex((day) => day.dateValue === appointmentDay.dateValue)
  );
  const currentDateValue = todayValue();
  const adminDateStripWeekStart = weekStartDateValue(selectedDay.dateValue);
  const adminDateStripDays = buildDaysForDateRange(adminDateStripWeekStart, addDaysToDateValue(adminDateStripWeekStart, 6), days);
  const adminDateStripSelectedIndex = Math.max(
    0,
    adminDateStripDays.findIndex((day) => day.dateValue === selectedDay.dateValue)
  );
  const adminDateStripMonthLabel = monthRangeLabel(adminDateStripDays, adminDateStripSelectedIndex);
  const adminDatePillItems = adminDateStripDays.map((day) => {
    const sourceIndex = days.findIndex((item) => item.dateValue === day.dateValue);
    const isSelected = day.dateValue === selectedDay.dateValue;
    return {
      dateValue: day.dateValue,
      dayNumberLabel: dayNumberLabel(day.dateValue),
      id: day.id,
      isSelected,
      isToday: day.dateValue === currentDateValue,
      label: day.label,
      monthShortLabel: monthShortLabel(day.dateValue),
      resolvedIndex: sourceIndex >= 0 ? sourceIndex : selectedDayIndex,
      shortWeekdayLabel: day.label.slice(0, 1),
      yearShortLabel: yearShortLabel(day.dateValue),
    };
  });
  const adminWeekSummary = adminDateStripDays.reduce((summary, day) => {
    const blocks = activeBookingsForDay(day.bookings);
    return {
      bookings: summary.bookings + blocks.length,
      revenue: summary.revenue + getDayRevenue(blocks, serviceDetails),
      travelMinutes: summary.travelMinutes + getDayTravelMinutes(blocks),
      workMinutes: summary.workMinutes + getDayWorkMinutes(blocks),
    };
  }, { bookings: 0, revenue: 0, travelMinutes: 0, workMinutes: 0 });
  const pendingVerificationBookings = days
    .flatMap((day, dayIndex) =>
      (Array.isArray(day.bookings) ? day.bookings : [])
        .map((booking) => ({
          ...booking,
          dayId: day.id,
          dayIndex,
          dateValue: booking.dateValue || day.dateValue,
          verificationInfo: adminVerificationInfo(booking),
        }))
    )
    .filter((booking) => Boolean(booking.verificationInfo))
    .sort((first, second) => {
      const dateComparison = String(first.dateValue || "").localeCompare(String(second.dateValue || ""));
      if (dateComparison !== 0) return dateComparison;
      return bookingStartMinutes(first) - bookingStartMinutes(second);
    });
  const pendingVerificationCards = pendingVerificationBookings.map((booking) => {
    const info = booking.verificationInfo;
    const start = bookingStartMinutes(booking);
    const timeLabel = start === null
      ? "Time not set"
      : `${minutesToTime(start)} - ${minutesToTime(start + bookingDurationMinutes(booking))}`;
    const items = itemsForBooking(booking);
    const serviceLabel = items.map((item) => item.name).filter(Boolean).join(", ") || booking.serviceName || "Massage";
    const total = bookingTotalDue(booking);

    return {
      actionLabel: info.actionLabel,
      booking,
      clientName: clientNameForBooking(booking),
      dateLabel: fullDateLabel(booking.dateValue),
      id: booking.id,
      reason: info.reason,
      referenceLabel: booking.bookingReference || booking.paymentReference || "No reference assigned",
      serviceLabel,
      timeLabel,
      tone: info.tone,
      totalLabel: total > 0 ? formatAdminMoney(total) : "",
    };
  });
  const appointmentPreview = appointmentDuration > 0 && isValidDuration(appointmentDuration)
    ? getSchedulingPreview({
        settings: appointmentDay.settings,
        bookings: activeBookingsForDay(appointmentDay.bookings),
        requestedDuration: appointmentDuration,
        requestedTravelBuffer: appointmentTravelBuffer,
      })
    : { slots: [], warnings: [] };
  const suggestedAppointmentSlotStarts = new Set(appointmentPreview.slots.map((slot) => slot.start));
  const adminAppointmentSlots = appointmentDuration > 0 && isValidDuration(appointmentDuration)
    ? Array.from(
        { length: Math.floor((24 * 60 - appointmentDuration) / ADMIN_APPOINTMENT_SLOT_INCREMENT) + 1 },
        (_, index) => {
          const start = index * ADMIN_APPOINTMENT_SLOT_INCREMENT;
          const end = start + appointmentDuration;
          return {
            bufferEnd: end + appointmentTravelBuffer,
            duration: appointmentDuration,
            end,
            isSuggested: suggestedAppointmentSlotStarts.has(start),
            label: suggestedAppointmentSlotStarts.has(start) ? "Chain slot" : "Manual override",
            start,
            travelBuffer: appointmentTravelBuffer,
          };
        }
      )
    : [];
  const appointmentCustomerResults = allCustomers.filter((customer) =>
    customer.name.toLowerCase().includes(appointmentCustomerSearch.trim().toLowerCase())
  );
  const appointmentCustomer = allCustomers.find((customer) => customer.id === appointmentCustomerId) ?? null;
  const appointmentCanCreate = Boolean(appointmentSlot && appointmentCustomer && appointmentItems.length > 0 && isValidDuration(appointmentDuration));
  const appointmentHasUnsavedWork = appointmentItems.length > 0 || Boolean(appointmentSlot) || Boolean(appointmentCustomerId);
  const normalizedWeeklyWorkingSchedule = normalizeWeeklyWorkingSchedule(weeklyWorkingSchedule);
  const normalizedWeeklyWorkingDraft = normalizeWeeklyWorkingSchedule(weeklyWorkingDraft);
  const workingRulesDirty = JSON.stringify(normalizedWeeklyWorkingDraft) !== JSON.stringify(normalizedWeeklyWorkingSchedule);
  const normalizedFinancialSettings = normalizeFinancialSettings(financialSettings);
  const normalizedFinancialSettingsDraft = normalizeFinancialSettings(financialSettingsDraft);

  function agendaScrollOffset() {
    const compactNavHeight = document.querySelector(".admin-compact-date-nav")?.getBoundingClientRect().height || 0;
    return Math.max(18, compactNavHeight + 18);
  }

  function scrollAgendaDayIntoView(dayNode, behavior = "smooth") {
    if (!dayNode) return;
    const targetTop = dayNode.getBoundingClientRect().top + window.scrollY - agendaScrollOffset();
    window.scrollTo({ top: Math.max(0, targetTop), behavior });
  }
  const financialSettingsDirty = JSON.stringify(normalizedFinancialSettingsDraft) !== JSON.stringify(normalizedFinancialSettings);
  const activeSettingsCategory = SETTINGS_NAVIGATION.find((category) => category.id === selectedSettingsCategory) ?? null;
  const visibleAdminActionMessage = adminActionMessage || adminSystemMessage;
  const personalEventModalModel = {
    colorOptions: PERSONAL_EVENT_COLORS.map((color) => ({
      id: color.id,
      label: color.label,
      selected: personalEventColor === color.id,
      className: [
        "personal-event-color-option",
        personalEventColorClass(color.id),
        personalEventColor === color.id ? "selected-personal-event-color" : "",
      ].filter(Boolean).join(" "),
    })),
    endDate: personalEventEndDate,
    endTime: personalEventEndTime,
    error: personalEventError,
    ariaLabel: "Add personal event",
    heading: "Add personal event",
    startDate: personalEventStartDate,
    startTime: personalEventStartTime,
    title: personalEventTitle,
  };
  const deleteConfirmationModel = pendingDeleteBooking ? {
    confirmLabel: pendingDeleteScope === "series" ? "Delete all days" : "Delete",
    message: pendingDeleteScope === "series"
      ? `${getRelatedPersonalEventBookings(pendingDeleteBooking).length} day(s) of ${clientNameForBooking(pendingDeleteBooking)} will be removed from the calendar.`
      : `${clientNameForBooking(pendingDeleteBooking)} at ${formatRange(pendingDeleteBooking.start, pendingDeleteBooking.sessionEnd)} will be removed from the calendar.`,
    title: pendingDeleteScope === "series" ? "Delete all days of this event?" : isPersonalEvent(pendingDeleteBooking) ? "Delete this day?" : "Delete this appointment?",
  } : null;
  const daySettingsSheetModel = daySettingsSheet ? {
    ariaLabel: daySettingsSheet.type === "working-hours" ? "Working hours" : "Schedule mode",
    dateLabel: fullDateLabel(daySettingsSheet.day.dateValue),
    error: daySettingsError,
    hasDateOverride: Boolean(daySettingsSheet.day.hasDateOverride),
    saving: daySettingsSaving,
    timeOptions: DAY_SETTINGS_TIME_OPTIONS,
    title: daySettingsSheet.type === "working-hours" ? "Working hours" : "Schedule mode",
    type: daySettingsSheet.type,
  } : null;
  const appointmentWizardModel = {
    client: {
      addCustomerOpen: appointmentAddCustomerOpen,
      customers: appointmentCustomerResults.map((customer) => ({
        customer,
        initials: customerInitials(customer.name),
        selected: customer.id === appointmentCustomerId,
      })),
      newCustomerFields: [
        {
          autoFocus: true,
          label: "Name",
          name: "name",
          placeholder: "Client name",
          required: true,
          type: "text",
          value: appointmentNewCustomer.name,
        },
        {
          label: "Phone",
          name: "phone",
          placeholder: "07...",
          type: "tel",
          value: appointmentNewCustomer.phone,
        },
        {
          label: "Email",
          name: "email",
          placeholder: "client@example.com",
          type: "email",
          value: appointmentNewCustomer.email,
        },
        {
          label: "Address",
          name: "address",
          placeholder: "Street and house number",
          type: "text",
          value: appointmentNewCustomer.address,
        },
        {
          label: "Notes",
          name: "notes",
          placeholder: "Treatment preferences, health notes, aftercare, or reminders",
          rows: 3,
          type: "textarea",
          value: appointmentNewCustomer.notes,
        },
      ],
    },
    headings: {
      client: "Select guest(s)",
      review: "Appointment",
      services: "Select service(s)",
      time: "Select date and time",
    },
    review: {
      duration: appointmentDuration,
      gridItems: [
        { label: "Cost", value: `\u00a3${appointmentTotal}` },
        { label: "Duration", value: `${appointmentDuration} minutes` },
        { label: "Buffer", value: `${appointmentTravelBuffer} minutes` },
      ],
      primaryServiceId: appointmentItems[0]?.id,
      rows: [
        {
          icon: "Clock",
          label: "Date",
          serviceId: null,
          step: "time",
          value: `${fullDateLabel(appointmentDay.dateValue)} / ${appointmentSlot ? `${formatClock(appointmentSlot.start)} - ${formatClock(appointmentSlot.end)}` : "No time selected"}`,
        },
        {
          icon: "Person",
          label: "Select guest(s)",
          serviceId: null,
          step: "client",
          value: appointmentCustomer?.name ?? "No client selected",
        },
        {
          icon: "Map",
          label: "Select location",
          serviceId: null,
          step: "client",
          value: appointmentCustomer?.address ?? "No address captured",
        },
        {
          icon: "Notes",
          label: "Session notes and treatment preferences",
          serviceId: appointmentItems[0]?.id,
          step: "services",
          value: appointmentItems.map((item) => `${item.name} (${item.minutes} min)`).join(", "),
        },
      ],
      serviceAccent: appointmentItems[0]?.color ?? SERVICE_COLORS[0],
      serviceLabel: appointmentItems.length === 1 ? appointmentItems[0].name : `${appointmentItems.length} services`,
    },
    service: {
      duration: appointmentDuration,
      durationOptions: [60, 90, 30, 120],
      services: serviceCards.filter((service) => service.visible).map((service) => {
        const minutes = Number(appointmentServiceMinutes[service.id]) || 0;
        const selected = minutes > 0;
        const active = activeAppointmentServiceId === service.id || selected;

        return {
          active,
          priceLabel: selected ? `${minutes} min / \u00a3${appointmentItems.find((item) => item.id === service.id)?.linePrice ?? 0}` : `from \u00a3${getServiceDurationPrice(service, 30)}`,
          selected,
          service,
        };
      }),
      showDurationWarning: !isValidDuration(appointmentDuration) && appointmentItems.length > 0,
      summaryItems: appointmentItems,
      total: appointmentTotal,
    },
    time: {
      dateLocked: appointmentDateLocked,
      dayId: appointmentDay.id,
      days: appointmentWeekDays.map((day) => ({
        day,
        dayNumber: new Date(`${day.dateValue}T00:00:00`).getDate(),
        selected: day.dateValue === appointmentDay.dateValue,
        shortLabel: day.label.slice(0, 1),
      })),
      duration: appointmentDuration,
      lockedDateLabel: fullDateLabel(appointmentDay.dateValue),
      monthLabel: appointmentDateLocked ? fullDateLabel(appointmentDay.dateValue) : monthRangeLabel(appointmentWeekDays, appointmentWeekSelectedIndex),
      slots: adminAppointmentSlots.map((slot) => ({
        className: [
          "appointment-slot",
          slot.isSuggested ? "suggested-appointment-slot" : "manual-appointment-slot",
          appointmentSlot?.start === slot.start ? "active" : "",
        ].filter(Boolean).join(" "),
        slot,
        startLabel: formatClock(slot.start),
      })),
      travelBuffer: appointmentTravelBuffer,
    },
  };
  const appointmentWizardValues = {
    canCreate: appointmentCanCreate,
    customerSearch: appointmentCustomerSearch,
    nextDisabled: (
      (appointmentStep === "services" && (!isValidDuration(appointmentDuration) || appointmentItems.length === 0)) ||
      (appointmentStep === "time" && !appointmentSlot) ||
      (appointmentStep === "client" && !appointmentCustomer)
    ),
  };

  function showAdminError(error, fallback = "Something went wrong. Please try again.") {
    setAdminActionMessage(error?.message || fallback);
  }

  function goBackFromAppointmentWizard() {
    if (appointmentStep === "services" || appointmentStep === "review") requestCloseAppointmentWizard();
    if (appointmentStep === "time") setAppointmentStep("services");
    if (appointmentStep === "client") setAppointmentStep("time");
  }

  function goNextFromAppointmentWizard() {
    if (appointmentStep === "services") setAppointmentStep("time");
    if (appointmentStep === "time") setAppointmentStep("client");
    if (appointmentStep === "client") setAppointmentStep("review");
  }

  function toggleAppointmentWizardService(service, selected) {
    setActiveAppointmentServiceId((current) => current === service.id && !selected ? null : service.id);
  }

  function addAppointmentWizardServiceDuration(service, amount) {
    changeAppointmentServiceMinutes(service.id, amount);
  }

  function removeAppointmentWizardService(item) {
    removeAppointmentService(item.id);
  }

  function selectAppointmentWizardDay(day) {
    selectAppointmentWizardDate(day.dateValue);
  }

  function unlockAppointmentWizardDate() {
    setAppointmentAgendaDay(null);
    setAppointmentSlot(null);
  }

  function selectAppointmentWizardCustomer(customer) {
    setAppointmentCustomerId(customer.id);
  }

  function changePersonalEventStartDate(nextDate) {
    setPersonalEventStartDate(nextDate);
    if (personalEventEndDate < nextDate) setPersonalEventEndDate(nextDate);
  }

  function changeDayWorkingHoursDraft(patch) {
    setDayWorkingHoursDraft((current) => ({
      ...current,
      ...patch,
    }));
  }

  function changeDayScheduleModeDraft(patch) {
    setDayScheduleModeDraft((current) => ({
      ...current,
      ...patch,
    }));
  }

  function toggleDayUnavailable(checked) {
    setDayWorkingHoursDraft((current) => ({
      ...current,
      markUnavailable: checked,
      mode: checked ? "custom" : current.mode,
    }));
  }

  function cancelDeleteConfirmation() {
    setPendingDeleteBooking(null);
    setPendingDeleteScope("single");
  }

  function openCustomerContact(method, customer) {
    if (!customer) return;
    const phone = (customer.phone || "").replace(/\s+/g, "");
    const email = customer.email || "";

    if (method === "message") {
      if (!phone) {
        setAdminActionMessage("No phone number is saved for this client yet.");
        return;
      }
      window.location.href = `sms:${phone}`;
      return;
    }

    if (method === "email") {
      if (!email) {
        setAdminActionMessage("No email address is saved for this client yet.");
        return;
      }
      window.location.href = `mailto:${email}`;
      return;
    }

    if (!phone) {
      setAdminActionMessage("No phone number is saved for this client yet.");
      return;
    }
    window.location.href = `tel:${phone}`;
  }

  function openCustomerProfile(customer) {
    setSelectedCustomerId(customer.id);
    setClientProfileTab("notes");
    setClientProfileOpen(true);
  }

  function updateClientProfileDraft(field, value) {
    setClientProfileDraft((current) => ({ ...current, [field]: value }));
  }

  function saveClientProfileDetails(event) {
    event.preventDefault();
    if (!profileCustomer || !clientProfileDraft.name.trim()) return;
    onUpdateClientProfile(profileCustomer.id, clientProfileDraft);
    setClientProfileEditOpen(false);
  }

  function confirmDeleteClientProfile() {
    if (!pendingDeleteClient) return;
    onDeleteClientProfile(pendingDeleteClient.id);
    setPendingDeleteClient(null);
    setClientProfileEditOpen(false);
    setClientProfileOpen(false);
    setSelectedCustomerId(null);
  }

  function saveClientProfileNote() {
    if (!profileCustomer || !clientNoteDraft.trim()) return;
    onUpdateClientNote(profileCustomer.id, clientNoteDraft);
    setClientNoteDraft("");
    setClientNoteSavedMessage("Note saved.");
  }

  function deleteClientProfileNote(noteId) {
    if (!profileCustomer) return;
    onDeleteClientNote(profileCustomer.id, noteId);
    setClientNoteSavedMessage("Note deleted.");
  }

  function startAppointmentNoteDraft(appointment) {
    if (!appointment) return;
    const prefix = `${fullDateLabel(appointment.date)} - ${appointment.serviceName}: `;
    setClientNoteDraft(prefix);
    setClientProfileTab("notes");
    setClientNoteSavedMessage("");
  }

  function bookAppointmentForCustomer(customer) {
    if (!customer) return;
    openAppointmentWizard();
    setAppointmentCustomerId(customer.id);
    setAppointmentCustomerSearch(customer.name);
  }

  async function copyServiceBookingLink(service) {
    const url = `${window.location.origin}${window.location.pathname}?service=${encodeURIComponent(service.id)}`;
    setAdminActionMessage(`${service.name} booking link: ${url}`);

    try {
      await navigator.clipboard.writeText(url);
      setAdminActionMessage(`${service.name} booking link saved to clipboard.`);
    } catch (error) {
      setAdminActionMessage(`${service.name} booking link: ${url}`);
    }
  }

  async function sendTelegramTestFromSettings() {
    setTelegramTestStatus({ message: "Sending Telegram test message...", sending: true, type: "info" });

    try {
      await postTelegramTest();
      setTelegramTestStatus({
        message: "Telegram test sent. Check your Telegram chat.",
        sending: false,
        type: "success",
      });
    } catch (error) {
      setTelegramTestStatus({
        message: `Telegram test failed: ${telegramTestErrorMessage(error)}`,
        sending: false,
        type: "error",
      });
    }
  }

  useEffect(() => {
    setWeeklyWorkingDraft(normalizeWeeklyWorkingSchedule(weeklyWorkingSchedule));
    setWeeklyWorkingError("");
    setWeeklyWorkingSavedMessage("");
    setWeeklyWorkingSaving(false);
  }, [weeklyWorkingSchedule]);

  useEffect(() => {
    setCopyWorkingDayTargets([]);
  }, [expandedWorkingDayKey]);

  useEffect(() => {
    setFinancialSettingsDraft(normalizeFinancialSettings(financialSettings));
  }, [financialSettings]);

  useEffect(() => {
    setCoverageZoneDraft({
      preapproval: coverageZones.preapproval.join(", "),
      usual: coverageZones.usual.join(", "),
    });
  }, [coverageZones]);

  useEffect(() => {
    if (personalEventOpen) return;
    setPersonalEventStartDate(selectedDay.dateValue);
    setPersonalEventEndDate(selectedDay.dateValue);
  }, [personalEventOpen, selectedDay.dateValue]);

  useEffect(() => {
    if (!profileCustomer) return;
    setClientNoteDraft("");
    setClientNoteSavedMessage("");
  }, [profileCustomer?.id]);

  useEffect(() => {
    if (!profileCustomer) return;
    setClientProfileDraft({
      address: profileCustomer.address || "",
      email: profileCustomer.email || "",
      name: profileCustomer.name || "",
      phone: profileCustomer.phone || "",
      updates: profileCustomer.updates || "",
    });
    setClientProfileEditOpen(false);
    setPendingDeleteClient(null);
  }, [profileCustomer?.id]);

  useEffect(() => {
    if (initialCalendarTodayAnchorRef.current || activeTab !== "calendar") return;
    initialCalendarTodayAnchorRef.current = true;
    selectTodayInAdminCalendar();
  }, [activeTab, days]);

  useEffect(() => {
    if (activeTab !== "calendar" || calendarMode !== "agenda" || pendingAgendaScrollDate !== selectedDay.dateValue) return;

    const agendaList = agendaListRef.current;
    const selectedAgendaDay = agendaDayRefs.current[pendingAgendaScrollDate];
    if (!agendaList || !selectedAgendaDay) return;

    window.requestAnimationFrame(() => {
      scrollAgendaDayIntoView(selectedAgendaDay, "smooth");
      setPendingAgendaScrollDate(null);
    });
  }, [activeTab, calendarMode, pendingAgendaScrollDate, selectedDay.dateValue]);

  useEffect(() => {
    if (activeTab !== "calendar" || calendarMode !== "agenda" || pendingAgendaScrollDate) return;

    const agendaList = agendaListRef.current;
    const selectedAgendaDay = agendaDayRefs.current[selectedDay.dateValue];
    if (!agendaList || !selectedAgendaDay) return;

    if (agendaScrollSyncingRef.current) {
      agendaScrollSyncingRef.current = false;
      return;
    }

    window.requestAnimationFrame(() => {
      scrollAgendaDayIntoView(selectedAgendaDay, "auto");
    });
  }, [activeTab, calendarMode, pendingAgendaScrollDate, selectedDay.dateValue]);

  useEffect(() => {
    if (activeTab !== "calendar") {
      setCompactDateNavVisible(false);
      return undefined;
    }

    let frameId = 0;
    const updateCompactDateNav = () => {
      frameId = 0;
      const stripBottom = adminDateStripRef.current?.getBoundingClientRect().bottom ?? 0;
      setCompactDateNavVisible(window.scrollY > 120 && stripBottom < 8);
    };

    const handleScroll = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateCompactDateNav);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    updateCompactDateNav();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "calendar" || calendarMode !== "agenda" || pendingAgendaScrollDate) return undefined;
    const agendaList = agendaListRef.current;
    if (!agendaList) return undefined;

    let frameId = 0;
    const syncVisibleAgendaDay = () => {
      frameId = 0;
      const listRect = agendaList.getBoundingClientRect();
      const probeTop = Math.max(listRect.top + 28, agendaScrollOffset() + 12);
      const dayNodes = Array.from(agendaList.querySelectorAll("[data-agenda-date-value]"));
      const visibleDay = dayNodes.find((node) => {
        const rect = node.getBoundingClientRect();
        return rect.top <= probeTop && rect.bottom > probeTop;
      }) || dayNodes.find((node) => node.getBoundingClientRect().top > probeTop);
      const nextDateValue = visibleDay?.getAttribute("data-agenda-date-value");
      if (!nextDateValue || nextDateValue === selectedDay.dateValue) return;
      const matchingIndex = days.findIndex((day) => day.dateValue === nextDateValue);
      if (matchingIndex < 0) return;
      agendaScrollSyncingRef.current = true;
      onSetSelectedDayIndex(matchingIndex);
    };

    const handleAgendaScroll = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(syncVisibleAgendaDay);
    };

    window.addEventListener("scroll", handleAgendaScroll, { passive: true });
    handleAgendaScroll();

    return () => {
      window.removeEventListener("scroll", handleAgendaScroll);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [activeTab, calendarMode, days, onSetSelectedDayIndex, pendingAgendaScrollDate, selectedDay.dateValue]);

  useEffect(() => {
    if (activeTab !== "calendar" || calendarMode !== "three-day") return;
    const grid = threeDayGridRef.current;
    if (!grid) return;

    window.requestAnimationFrame(() => {
      const selectedColumn = grid.querySelector(`[data-date-value="${selectedDay.dateValue}"]`);
      if (!selectedColumn) return;
      const gridRect = grid.getBoundingClientRect();
      const columnRect = selectedColumn.getBoundingClientRect();
      const nextScrollLeft = grid.scrollLeft + columnRect.left - gridRect.left - 72;
      grid.scrollTo({ left: Math.max(0, nextScrollLeft), behavior: "auto" });
    });
  }, [activeTab, calendarMode, selectedDay.dateValue]);

  function updateWorkingDayDraft(dayKey, patch) {
    setWeeklyWorkingError("");
    setWeeklyWorkingSavedMessage("");
    setWeeklyWorkingDraft((current) => {
      const normalized = normalizeWeeklyWorkingSchedule(current);
      return {
        ...normalized,
        [dayKey]: {
          ...normalized[dayKey],
          ...patch,
          dateLabel: dayKey,
        },
      };
    });
  }

  function openWorkingTimePicker(event) {
    const input = event.currentTarget;
    if (typeof input.showPicker !== "function") return;
    try {
      input.showPicker();
    } catch {
      // Some browsers only allow the native picker during direct pointer interaction.
    }
  }

  async function saveWorkingRules() {
    if (weeklyWorkingSaving) return;

    const error = validateWeeklyWorkingSchedule(weeklyWorkingDraft);
    if (error) {
      setWeeklyWorkingError(error);
      return;
    }

    setWeeklyWorkingError("");
    setWeeklyWorkingSavedMessage("Saving working schedule...");
    setWeeklyWorkingSaving(true);
    try {
      const result = await onUpdateWeeklyWorkingSchedule?.(weeklyWorkingDraft);
      if (!onUpdateWeeklyWorkingSchedule || result?.error) {
        setWeeklyWorkingError(result?.error || "Working schedule could not be saved.");
        setWeeklyWorkingSavedMessage("");
        return;
      }
      setWeeklyWorkingError("");
      setWeeklyWorkingSavedMessage("Working schedule saved.");
    } finally {
      setWeeklyWorkingSaving(false);
    }
  }

  function workingScheduleSaveLabel() {
    if (weeklyWorkingSaving) return "Saving...";
    if (workingRulesDirty) return "Save working schedule";
    if (weeklyWorkingSavedMessage === "Working schedule saved.") return "Saved";
    return "Save working schedule";
  }

  function workingScheduleStatusMessage() {
    if (weeklyWorkingSaving) return "Saving to Supabase...";
    if (workingRulesDirty) return "Unsaved changes";
    return weeklyWorkingSavedMessage || "All changes saved";
  }

  function workingScheduleStatusClassName() {
    if (workingRulesDirty && !weeklyWorkingSaving) {
      return "weekly-working-message unsaved";
    }
    return "weekly-working-message";
  }

  function toggleCopyWorkingDayTarget(dayKey) {
    setCopyWorkingDayTargets((current) =>
      current.includes(dayKey)
        ? current.filter((item) => item !== dayKey)
        : [...current, dayKey]
    );
  }

  function copyExpandedWorkingDayToTargets() {
    if (!copyWorkingDayTargets.length) {
      setWeeklyWorkingError("Choose at least one day to copy to.");
      return;
    }
    setWeeklyWorkingDraft((current) => copyWeeklyDaySettings(current, expandedWorkingDayKey, copyWorkingDayTargets));
    setWeeklyWorkingError("");
    setWeeklyWorkingSavedMessage("");
    setCopyWorkingDayTargets([]);
  }

  function applyExpandedHoursToWorkingDays() {
    setWeeklyWorkingDraft((current) => applyHoursToWorkingDays(current, expandedWorkingDayKey));
    setWeeklyWorkingError("");
    setWeeklyWorkingSavedMessage("");
  }

  function resetExpandedWorkingDay() {
    setWeeklyWorkingDraft((current) => resetWeeklyWorkingDay(current, expandedWorkingDayKey));
    setWeeklyWorkingError("");
    setWeeklyWorkingSavedMessage("");
  }

  function resetEntireWorkingSchedule() {
    const confirmed = window.confirm("Reset the entire weekly working schedule to the app defaults?");
    if (!confirmed) return;
    setWeeklyWorkingDraft(defaultWeeklyWorkingSchedule());
    setWeeklyWorkingError("");
    setWeeklyWorkingSavedMessage("");
    setCopyWorkingDayTargets([]);
  }

  function updateFinancialSettingsDraft(field, value) {
    setFinancialSettingsDraft((current) => updateFinancialSettings(current, { [field]: value }));
  }

  function saveFinancialSettings() {
    Object.entries(normalizedFinancialSettingsDraft).forEach(([field, value]) => {
      if (normalizedFinancialSettings[field] !== value) {
        onUpdateFinancialSetting(field, value);
      }
    });
    setFinancialSettingsDraft(normalizedFinancialSettingsDraft);
    setAdminActionMessage("Financial settings saved.");
  }

  function openSettingsSection(sectionId, returnCategory = null) {
    setActiveTab("settings");
    setSelectedSettingsCategory("current");
    setSelectedSettingsSubsection(null);
    setSettingsReturnCategory(returnCategory);
    setSideMenuOpen(false);
    window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function returnToSettingsCategory() {
    setActiveTab("settings");
    setSelectedSettingsCategory(settingsReturnCategory);
    setSelectedSettingsSubsection(null);
    setSettingsReturnCategory(null);
  }

  function handleDatePillClick(index, dateValue) {
    onSetSelectedDayIndex(index, dateValue);

    if (activeTab === "calendar" && calendarMode === "agenda") {
      setPendingAgendaScrollDate(dateValue);
    }
  }

  function shiftAdminDateStripWeek(dayOffset) {
    const nextDateValue = addDaysToDateValue(adminDateStripWeekStart, dayOffset);
    const matchingIndex = days.findIndex((day) => day.dateValue === nextDateValue);
    handleDatePillClick(matchingIndex >= 0 ? matchingIndex : selectedDayIndex, nextDateValue);
  }

  function goToToday() {
    const todayDateValue = todayValue();
    const matchingIndex = days.findIndex((day) => day.dateValue === todayDateValue);
    handleDatePillClick(matchingIndex >= 0 ? matchingIndex : selectedDayIndex, todayDateValue);
  }

  function openDayWorkingHoursSheet(day) {
    const daySettings = day.settings || DEFAULT_DAY_SETTINGS;
    const isUnavailable = Boolean(daySettings.unavailable);
    setDayWorkingHoursDraft({
      endTime: daySettings.workingEnd || DEFAULT_DAY_SETTINGS.workingEnd,
      markUnavailable: isUnavailable,
      mode: day.hasDateOverride || isUnavailable ? "custom" : "default",
      startTime: daySettings.workingStart || DEFAULT_DAY_SETTINGS.workingStart,
    });
    setDaySettingsError("");
    setDaySettingsSheet({ day, type: "working-hours" });
  }

  function openDayScheduleModeSheet(day) {
    const daySettings = day.settings || DEFAULT_DAY_SETTINGS;
    setDayScheduleModeDraft({
      anchorEnabled: daySettings.startMode === "fixed",
      anchorStart: daySettings.fixedStart || DEFAULT_DAY_SETTINGS.fixedStart,
      mode: daySettings.mode || DEFAULT_DAY_SETTINGS.mode,
    });
    setDaySettingsError("");
    setDaySettingsSheet({ day, type: "schedule-mode" });
  }

  function closeDaySettingsSheet() {
    if (daySettingsSaving) return;
    setDaySettingsError("");
    setDaySettingsSheet(null);
  }

  async function saveDayWorkingHoursSheet() {
    if (!daySettingsSheet?.day?.dateValue) return;
    if (daySettingsSaving) return;
    const useCustom = dayWorkingHoursDraft.mode === "custom";
    if (!dayWorkingHoursDraft.markUnavailable && !useCustom) {
      await useWeeklyScheduleForOpenDay();
      return;
    }
    const nextSettings = dayWorkingHoursDraft.markUnavailable
      ? {
          unavailable: true,
          workingEnd: dayWorkingHoursDraft.endTime,
          workingStart: dayWorkingHoursDraft.startTime,
        }
      : useCustom
        ? {
            unavailable: false,
            workingEnd: dayWorkingHoursDraft.endTime,
            workingStart: dayWorkingHoursDraft.startTime,
          }
        : {
            unavailable: false,
          };

    setDaySettingsSaving(true);
    setDaySettingsError("");
    try {
      await onUpdateDaySettings(daySettingsSheet.day.dateValue, nextSettings);
      setDaySettingsSheet(null);
    } catch (error) {
      setDaySettingsError(error?.message || "This date override could not be saved.");
    } finally {
      setDaySettingsSaving(false);
    }
  }

  async function saveDayScheduleModeSheet() {
    if (!daySettingsSheet?.day?.dateValue) return;
    if (daySettingsSaving) return;
    setDaySettingsSaving(true);
    setDaySettingsError("");
    try {
      await onUpdateDaySettings(daySettingsSheet.day.dateValue, {
        fixedStart: dayScheduleModeDraft.anchorStart,
        mode: dayScheduleModeDraft.mode,
        startMode: dayScheduleModeDraft.anchorEnabled ? "fixed" : "flexible",
      });
      setDaySettingsSheet(null);
    } catch (error) {
      setDaySettingsError(error?.message || "This date override could not be saved.");
    } finally {
      setDaySettingsSaving(false);
    }
  }

  async function useWeeklyScheduleForOpenDay() {
    if (!daySettingsSheet?.day?.dateValue || daySettingsSaving) return;
    setDaySettingsSaving(true);
    setDaySettingsError("");
    try {
      await onUseWeeklyScheduleForDate?.(daySettingsSheet.day.dateValue);
      setDaySettingsSheet(null);
    } catch (error) {
      setDaySettingsError(error?.message || "This date could not be reset to the weekly schedule.");
    } finally {
      setDaySettingsSaving(false);
    }
  }

  function openSettingsSubsection(section) {
    const categoryId = activeSettingsCategory?.id;

    if (categoryId === "scheduling") {
      if (section === "Working Hours" || section === "Chain Mode / Availability Rules") {
        openSettingsSection("admin-working-rules", categoryId);
        return;
      }
      if (section === "Travel Buffer") {
        openSettingsSection("admin-travel-buffer", categoryId);
        return;
      }
    }

    if (categoryId === "coverage" && section === "Service Areas") {
      openSettingsSection("admin-service-areas", categoryId);
      return;
    }

    if (categoryId === "services") {
      if (section === "Enhancements") {
        openSettingsSection("admin-enhancements", categoryId);
        return;
      }
      setSettingsReturnCategory(categoryId);
      setActiveTab("services");
      return;
    }

    if (categoryId === "waitlist" && (section === "Client Requests" || section === "Offer Settings")) {
      setSettingsReturnCategory(categoryId);
      setActiveTab("waitlist");
      return;
    }

    setSettingsReturnCategory(null);
    setSelectedSettingsSubsection(section);
  }

  function renderSessionPreferencesSettingsPanel() {
    const draftConflictId = sessionPreferenceDraft?.conflictIds?.[0] || "";
    const conflictOptions = sessionPreferenceRows.filter((preference) => preference.id !== sessionPreferenceDraft?.id);

    return (
      <div className="settings-placeholder session-preferences-admin-panel">
        <div className="session-preferences-admin-heading">
          <div>
            <h3>Session Preferences</h3>
            <p>Control the quick preferences clients can tap on the Review step.</p>
          </div>
          <button type="button" className="admin-primary-action" onClick={() => openSessionPreferenceEditor(null)}>
            <Plus size={16} aria-hidden="true" />
            Add preference
          </button>
        </div>

        <div className="session-preference-admin-list">
          {sessionPreferenceRows.length === 0 ? (
            <p className="admin-muted-note">No preferences are available. Add one to show quick options to clients.</p>
          ) : (
            sessionPreferenceRows.map((preference, index) => (
              <article
                className="session-preference-admin-row"
                draggable
                key={preference.id}
                onDragStart={() => setDraggingSessionPreferenceId(preference.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  moveSessionPreferenceTo(draggingSessionPreferenceId, preference.id);
                  setDraggingSessionPreferenceId("");
                }}
              >
                <span className="session-preference-drag-handle" aria-label={`Drag ${preference.label}`} role="img">☰</span>
                <div className="session-preference-admin-main">
                  <strong>{preference.label}</strong>
                  <small>{preference.category || "Other"}{preference.conflictIds?.length ? ` / Conflicts with ${sessionPreferenceLabels(preference.conflictIds, sessionPreferenceRows).join(", ")}` : ""}</small>
                </div>
                <button
                  type="button"
                  className={preference.visible ? "admin-visibility-toggle visible-admin-visibility-toggle" : "admin-visibility-toggle"}
                  disabled={sessionPreferenceSaving}
                  aria-label={`${preference.visible ? "Hide" : "Show"} ${preference.label}`}
                  onClick={() => toggleSessionPreferenceVisibility(preference.id)}
                >
                  {preference.visible ? "Visible" : "Hidden"}
                </button>
                <div className="session-preference-order-actions" aria-label={`Move ${preference.label}`}>
                  <button type="button" disabled={sessionPreferenceSaving || index === 0} onClick={() => reorderSessionPreference(preference.id, -1)}>Up</button>
                  <button type="button" disabled={sessionPreferenceSaving || index === sessionPreferenceRows.length - 1} onClick={() => reorderSessionPreference(preference.id, 1)}>Down</button>
                </div>
                <button type="button" className="admin-secondary-action" disabled={sessionPreferenceSaving} onClick={() => openSessionPreferenceEditor(preference)}>Edit</button>
                <button type="button" className="admin-danger-option" disabled={sessionPreferenceSaving} onClick={() => deleteSessionPreference(preference)}>Delete</button>

                {editingSessionPreferenceId === preference.id && sessionPreferenceDraft && (
                  <div className="session-preference-editor">
                    <label>
                      <span>Client-facing label</span>
                      <input value={sessionPreferenceDraft.label} onChange={(event) => updateSessionPreferenceDraft("label", event.target.value)} />
                    </label>
                    <label>
                      <span>Category</span>
                      <select value={sessionPreferenceDraft.category} onChange={(event) => updateSessionPreferenceDraft("category", event.target.value)}>
                        {SESSION_PREFERENCE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Conflict</span>
                      <select value={draftConflictId} onChange={(event) => updateSessionPreferenceDraft("conflictIds", event.target.value ? [event.target.value] : [])}>
                        <option value="">No conflict</option>
                        {conflictOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Display order</span>
                      <input type="number" min="1" value={sessionPreferenceDraft.sortOrder} onChange={(event) => updateSessionPreferenceDraft("sortOrder", event.target.value)} />
                    </label>
                    <label className="admin-toggle-row">
                      <input type="checkbox" checked={sessionPreferenceDraft.visible !== false} onChange={(event) => updateSessionPreferenceDraft("visible", event.target.checked)} />
                      <span>{sessionPreferenceDraft.visible !== false ? "Visible to clients" : "Hidden from clients"}</span>
                    </label>
                    {sessionPreferenceError && <p className="admin-inline-error" role="alert">{sessionPreferenceError}</p>}
                    <div className="session-preference-editor-actions">
                      <button type="button" className="admin-primary-action" disabled={sessionPreferenceSaving} onClick={saveSessionPreferenceEditor}>
                        {sessionPreferenceSaving ? "Saving..." : "Save changes"}
                      </button>
                      <button type="button" className="admin-secondary-action" disabled={sessionPreferenceSaving} onClick={cancelSessionPreferenceEditor}>Cancel</button>
                    </div>
                  </div>
                )}
              </article>
            ))
          )}
        </div>

        {editingSessionPreferenceId === "new" && sessionPreferenceDraft && (
          <div className="session-preference-editor new-session-preference-editor">
            <h4>Add preference</h4>
            <label>
              <span>Client-facing label</span>
              <input autoFocus value={sessionPreferenceDraft.label} onChange={(event) => updateSessionPreferenceDraft("label", event.target.value)} />
            </label>
            <label>
              <span>Category</span>
              <select value={sessionPreferenceDraft.category} onChange={(event) => updateSessionPreferenceDraft("category", event.target.value)}>
                {SESSION_PREFERENCE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label>
              <span>Conflict</span>
              <select value={draftConflictId} onChange={(event) => updateSessionPreferenceDraft("conflictIds", event.target.value ? [event.target.value] : [])}>
                <option value="">No conflict</option>
                {conflictOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>Display order</span>
              <input type="number" min="1" value={sessionPreferenceDraft.sortOrder} onChange={(event) => updateSessionPreferenceDraft("sortOrder", event.target.value)} />
            </label>
            <label className="admin-toggle-row">
              <input type="checkbox" checked={sessionPreferenceDraft.visible !== false} onChange={(event) => updateSessionPreferenceDraft("visible", event.target.checked)} />
              <span>{sessionPreferenceDraft.visible !== false ? "Visible to clients" : "Hidden from clients"}</span>
            </label>
            {sessionPreferenceError && <p className="admin-inline-error" role="alert">{sessionPreferenceError}</p>}
            <div className="session-preference-editor-actions">
              <button type="button" className="admin-primary-action" disabled={sessionPreferenceSaving} onClick={saveSessionPreferenceEditor}>
                {sessionPreferenceSaving ? "Saving..." : "Save changes"}
              </button>
              <button type="button" className="admin-secondary-action" disabled={sessionPreferenceSaving} onClick={cancelSessionPreferenceEditor}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderSettingsSubsectionContent() {
    if (activeSettingsCategory?.id === "services" && selectedSettingsSubsection === "Session Preferences") {
      return renderSessionPreferencesSettingsPanel();
    }

    if (activeSettingsCategory?.id === "financial" && selectedSettingsSubsection === "Financial Settings") {
      return (
        <FinancialSettingsPanel
          expenseCategories={expenseCategories}
          expenses={expenses}
          financialSettingsDirty={financialSettingsDirty}
          financialSettingsDraft={financialSettingsDraft}
          onSaveFinancialSettings={saveFinancialSettings}
          onUpdateFinancialSettingsDraft={updateFinancialSettingsDraft}
        />
      );
    }

    const routingDetailPanelSelected = (
      (activeSettingsCategory?.id === "scheduling" && selectedSettingsSubsection === "Blocked Time")
      || (activeSettingsCategory?.id === "coverage" && ["Coverage Rules", "Travel Charges", "Congestion Zone Fee"].includes(selectedSettingsSubsection))
      || (activeSettingsCategory?.id === "waitlist" && ["Waitlist Rules", "Client Requests", "Offer Settings"].includes(selectedSettingsSubsection))
      || (activeSettingsCategory?.id === "payments" && ["Payment Methods", "Payment Statuses", "Pay Later"].includes(selectedSettingsSubsection))
      || (activeSettingsCategory?.id === "notifications" && ["Email", "Booking Alerts"].includes(selectedSettingsSubsection))
      || (activeSettingsCategory?.id === "clients" && ["Client Details", "Returning Clients", "Rebooking Preferences"].includes(selectedSettingsSubsection))
      || (activeSettingsCategory?.id === "security" && ["Client Privacy", "API Protection"].includes(selectedSettingsSubsection))
      || (activeSettingsCategory?.id === "system" && ["Integrations", "Application Information"].includes(selectedSettingsSubsection))
    );
    if (routingDetailPanelSelected) {
      return (
        <SettingsRoutingDetailPanels
          activeCategoryId={activeSettingsCategory?.id}
          selectedSection={selectedSettingsSubsection}
          allCustomers={allCustomers}
          bankDetailCount={BANK_TRANSFER_DETAILS.length}
          days={days}
          getWaitlistStatus={getEffectiveWaitlistStatus}
          isDevelopmentMode={import.meta.env.DEV}
          onOpenAdminTab={(tabId, returnCategory) => {
            if (returnCategory === null) {
              setActiveTab(tabId);
              setSettingsReturnCategory(null);
              return;
            }
            setSettingsReturnCategory(returnCategory);
            setActiveTab(tabId);
          }}
          onOpenBlockedTime={() => { setActiveTab("calendar"); setSettingsReturnCategory(null); setPersonalEventOpen(true); }}
          onOpenSettingsSection={openSettingsSection}
          onOpenSettingsSubsection={(categoryId, subsection) => {
            if (categoryId === activeSettingsCategory?.id) {
              setSettingsReturnCategory(null);
            }
            setSelectedSettingsCategory(categoryId);
            setSelectedSettingsSubsection(subsection);
          }}
          serviceAreas={serviceAreas}
          waitlistEntries={waitlistEntries}
        />
      );
    }

    if (activeSettingsCategory?.id === "documents") {
      return (
        <DocumentSettingsPanel
          selectedSection={selectedSettingsSubsection}
          documentSettings={documentSettings}
          onUpdateDocumentSetting={onUpdateDocumentSetting}
        />
      );
    }

    if (activeSettingsCategory?.id === "notifications") {
      if (selectedSettingsSubsection === "Telegram") {
        return (
          <div className="settings-placeholder settings-detail-panel">
            <div>
              <h3>Telegram</h3>
              <p>Send yourself a private test message to confirm the Telegram bot is connected.</p>
            </div>
            <div className="settings-detail-grid">
              <article className="settings-detail-item">
                <strong>Current use</strong>
                <p>Telegram is used for admin-side notifications and test delivery during development.</p>
              </article>
              <article className="settings-detail-item">
                <strong>Client requirement</strong>
                <p>The recipient must start the bot before Telegram can send messages to that chat.</p>
              </article>
            </div>
            <div className="settings-detail-actions">
              <button type="button" className="admin-primary-action" disabled={telegramTestStatus.sending} onClick={sendTelegramTestFromSettings}>
                {telegramTestStatus.sending ? "Sending..." : "Send Telegram test"}
              </button>
              {telegramTestStatus.message && <span role="status">{telegramTestStatus.message}</span>}
            </div>
          </div>
        );
      }
    }

    if (activeSettingsCategory?.id === "security") {
      if (selectedSettingsSubsection === "Admin Access") {
        return (
          <SettingsDetailPanel
            title="Admin Access"
            description="Admin access is protected by Supabase authentication and database security rules."
            items={[
            { title: "Signed in as", body: adminSession?.user?.email || "Admin session active." },
            { title: "Security boundary", body: "RLS, admin checks, and protected RPC functions are the real security layer." },
            { title: "Development controls", body: "Client/Admin switching may appear in development, but it is not production security." },
            ]}
            actions={(
            <button type="button" className="admin-secondary-action" onClick={handleMenuLogout} disabled={adminLogoutPending}>
              {adminLogoutPending ? "Signing out..." : "Logout"}
            </button>
            )}
          />
        );
      }
    }

    if (activeSettingsCategory?.id === "system") {
      if (selectedSettingsSubsection === "Stored Data") {
        return (
          <SettingsDetailPanel
            title="Stored Data"
            description="Use reset controls carefully. They are development/admin tools and should not be used to remove real production records casually."
            items={[
            { title: "Bookings loaded", body: `${days.reduce((count, day) => count + day.bookings.length, 0)} calendar item${days.reduce((count, day) => count + day.bookings.length, 0) === 1 ? "" : "s"} currently loaded.` },
            { title: "Waitlist records", body: `${waitlistEntries.length} waitlist record${waitlistEntries.length === 1 ? "" : "s"} currently stored.` },
            { title: "Services", body: `${services.length} service${services.length === 1 ? "" : "s"} configured.` },
            ]}
            actions={(
            <button type="button" className="admin-danger-option" onClick={onResetStoredData}>
              Reset stored data
            </button>
            )}
          />
        );
      }
    }

    return (
      <div className="settings-placeholder">
        <h3>{selectedSettingsSubsection}</h3>
        <p>This section is ready to be connected to a dedicated editor when the underlying setting exists.</p>
      </div>
    );
  }

  function openAppointmentWizard() {
    setAppointmentServiceMinutes({});
    setActiveAppointmentServiceId(null);
    setAppointmentStep("services");
    setAppointmentDayIndex(selectedDayIndex);
    setAppointmentDateValue(selectedDay.dateValue);
    setAppointmentAgendaDay(null);
    setAppointmentSlot(null);
    setAppointmentCustomerId("");
    setAppointmentCustomerSearch("");
    setAppointmentAddCustomerOpen(false);
    setAppointmentNewCustomer({ address: "", email: "", name: "", notes: "", phone: "" });
    setAppointmentWizardOpen(true);
  }

  function openAppointmentWizardForAgendaDay(day) {
    const matchingIndex = days.findIndex((item) => item.dateValue === day.dateValue);
    setAppointmentServiceMinutes({});
    setActiveAppointmentServiceId(null);
    setAppointmentStep("services");
    setAppointmentDayIndex(matchingIndex >= 0 ? matchingIndex : selectedDayIndex);
    setAppointmentDateValue(day.dateValue);
    setAppointmentAgendaDay(day);
    setAppointmentSlot(null);
    setAppointmentCustomerId("");
    setAppointmentCustomerSearch("");
    setAppointmentAddCustomerOpen(false);
    setAppointmentNewCustomer({ address: "", email: "", name: "", notes: "", phone: "" });
    setAppointmentWizardOpen(true);
  }

  function selectAppointmentWizardDate(dateValue) {
    const matchingIndex = days.findIndex((item) => item.dateValue === dateValue);
    setAppointmentDayIndex(matchingIndex >= 0 ? matchingIndex : appointmentDayIndex);
    setAppointmentDateValue(dateValue);
    setAppointmentAgendaDay(null);
    setAppointmentSlot(null);
  }

  function selectAppointmentWizardSlot(slot) {
    setAppointmentSlot(slot);
    setAppointmentStep("client");
  }

  function shiftAppointmentWizardWeek(dayOffset) {
    selectAppointmentWizardDate(addDaysToDateValue(appointmentWeekStart, dayOffset));
  }

  function openClientCreateWizard() {
    openAppointmentWizard();
    setAppointmentStep("client");
    setAppointmentAddCustomerOpen(true);
  }

  function openPersonalEventModal(dateValue = selectedDay.dateValue) {
    setPersonalEventTitle("Personal event");
    setPersonalEventStartDate(dateValue);
    setPersonalEventEndDate(dateValue);
    setPersonalEventStartTime("15:00");
    setPersonalEventEndTime("20:00");
    setPersonalEventColor(DEFAULT_PERSONAL_EVENT_COLOR);
    setPersonalEventError("");
    setPersonalEventOpen(true);
  }

  function openPersonalEventFromAppointmentWizard() {
    setAppointmentWizardOpen(false);
    setAppointmentLeavePromptOpen(false);
    setAppointmentAddCustomerOpen(false);
    openPersonalEventModal(appointmentDay.dateValue);
  }

  function closeAppointmentWizard() {
    setAppointmentWizardOpen(false);
    setAppointmentLeavePromptOpen(false);
    setAppointmentAddCustomerOpen(false);
  }

  function updateAppointmentNewCustomer(field, value) {
    setAppointmentNewCustomer((current) => ({ ...current, [field]: value }));
  }

  function saveAppointmentNewCustomer(event) {
    event.preventDefault();
    const name = appointmentNewCustomer.name.trim();
    if (!name) return;

    const baseId = name
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "new-customer";
    const existingIds = new Set(allCustomers.map((customer) => customer.id));
    let id = baseId;
    let suffix = 2;
    while (existingIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    const initialNote = appointmentNewCustomer.notes.trim();
    const customer = {
      address: appointmentNewCustomer.address.trim() || "Address not captured yet",
      appointments: [],
      email: appointmentNewCustomer.email.trim(),
      id,
      name,
      notes: initialNote,
      phone: appointmentNewCustomer.phone.trim(),
      updates: "New client profile.",
    };

    setCustomAppointmentCustomers((current) => [customer, ...current]);
    if (initialNote) {
      setClientNoteOverrides((current) => ({
        ...current,
        [id]: {
          notes: [{
            createdAt: new Date().toISOString(),
            id: `${id}-${Date.now()}`,
            text: initialNote,
          }],
        },
      }));
    }
    setAppointmentCustomerId(id);
    setAppointmentCustomerSearch("");
    setAppointmentNewCustomer({ address: "", email: "", name: "", notes: "", phone: "" });
    setAppointmentAddCustomerOpen(false);
  }

  function requestCloseAppointmentWizard() {
    if (appointmentHasUnsavedWork) {
      setAppointmentLeavePromptOpen(true);
      return;
    }

    closeAppointmentWizard();
  }

  function editAppointmentReviewSection(step, serviceId = null) {
    if (step === "services" && serviceId) {
      setActiveAppointmentServiceId(serviceId);
    }
    setAppointmentStep(step);
  }

  async function saveAndCloseAppointmentWizard() {
    if (!appointmentCanCreate) return;
    await createAppointmentFromWizard();
  }

  function changeAppointmentServiceMinutes(serviceId, minutesToAdd) {
    setAppointmentServiceMinutes((current) => {
      const currentMinutes = Number(current[serviceId]) || 0;
      const nextMinutes = Math.max(0, currentMinutes + minutesToAdd);
      const next = { ...current, [serviceId]: nextMinutes };
      if (nextMinutes === 0) delete next[serviceId];
      return next;
    });
    setAppointmentSlot(null);
  }

  function removeAppointmentService(serviceId) {
    setAppointmentServiceMinutes((current) => {
      const next = { ...current };
      delete next[serviceId];
      return next;
    });
    setAppointmentSlot(null);
  }

  async function createAppointmentFromWizard() {
    if (!appointmentCanCreate) return;

    try {
      await onCreateAppointment({
        address: appointmentCustomer.address,
        clientName: appointmentCustomer.name,
        customerEmail: appointmentCustomer.email,
        customerPhone: appointmentCustomer.phone,
        dayIndex: appointmentDayIndex,
        dateValue: appointmentDay.dateValue,
        duration: appointmentDuration,
        items: appointmentItems.map((item) => ({
          minutes: item.minutes,
          name: item.name,
          price: item.linePrice,
        })),
        location: appointmentCustomer.address,
        serviceId: appointmentItems[0].id,
        start: appointmentSlot.start,
        travelBuffer: appointmentTravelBuffer,
      });
      setAppointmentWizardOpen(false);
      setAppointmentLeavePromptOpen(false);
      setActiveTab("calendar");
    } catch (error) {
      showAdminError(error, "Could not create this appointment.");
    }
  }

  async function createPersonalEventFromModal(event) {
    event.preventDefault();
    setPersonalEventError("");

    const startMinutes = timeToMinutes(personalEventStartTime);
    const endMinutes = timeToMinutes(personalEventEndTime);

    if (!personalEventTitle.trim()) {
      setPersonalEventError("Add a short title for the personal event.");
      return;
    }

    if (!isValidDateValue(personalEventStartDate) || !isValidDateValue(personalEventEndDate)) {
      setPersonalEventError("Choose valid start and end dates.");
      return;
    }

    if (personalEventEndDate < personalEventStartDate) {
      setPersonalEventError("End date must be the same day or after the start date.");
      return;
    }

    const rangeDays = daysBetweenDateValues(personalEventStartDate, personalEventEndDate) + 1;
    if (rangeDays > 31) {
      setPersonalEventError("Personal events can cover up to 31 days at a time.");
      return;
    }

    if (personalEventStartDate === personalEventEndDate && endMinutes <= startMinutes) {
      setPersonalEventError("End time must be after start time for a same-day event.");
      return;
    }

    const eventDays = buildDaysForDateRange(personalEventStartDate, personalEventEndDate, days).filter(
      (day) => day.dateValue >= personalEventStartDate && day.dateValue <= personalEventEndDate
    );

    if (!eventDays.length) {
      setPersonalEventError("Choose a valid date range.");
      return;
    }

    const personalEvents = eventDays
      .map((day) => {
        const dayStart = day.dateValue === personalEventStartDate ? startMinutes : 0;
        const dayEnd = day.dateValue === personalEventEndDate ? endMinutes : 1440;
        const duration = dayEnd - dayStart;
        if (duration <= 0) return null;

        return {
          clientName: personalEventTitle.trim(),
          dateValue: day.dateValue,
          dayIndex: eventDays.findIndex((item) => item.id === day.id),
          duration,
          eventColor: personalEventColor,
          items: [{ minutes: duration, name: "Personal event", price: 0 }],
          kind: "personal",
          serviceId: "personal-event",
          start: dayStart,
          travelBuffer: 0,
        };
      })
      .filter(Boolean);

    if (!personalEvents.length) {
      setPersonalEventError("Choose a time range that creates at least one calendar block.");
      return;
    }

    const overlap = personalEvents.find((eventBlock) => {
      const day = eventDays.find((item) => item.dateValue === eventBlock.dateValue);
      if (!day) return false;
      const eventStart = Number(eventBlock.start);
      const eventEnd = eventStart + Number(eventBlock.duration);
      return getActiveBookingBlocks(day.bookings).some((booking) =>
        rangesOverlap(eventStart, eventEnd, booking.start, booking.bufferEnd)
      );
    });

    if (overlap) {
      const approved = window.confirm(
        "This personal event overlaps an existing booking or event. Do you want to create it anyway?"
      );

      if (!approved) {
        setPersonalEventError("Personal event was not created because it overlaps an existing booking or event.");
        return;
      }
    }

    try {
      const firstDayIndex = await onCreatePersonalEvent(personalEvents);
      setPersonalEventOpen(false);
      setActiveTab("calendar");
      if (Number.isFinite(firstDayIndex)) onSetSelectedDayIndex(firstDayIndex);
    } catch (error) {
      setPersonalEventError(error.message || "Could not create personal event.");
    }
  }

  function updateServiceDetail(serviceId, key, value) {
    const numericKeys = new Set(["buffer", "duration", "price"]);
    onServiceDetailChange(serviceId, {
      [key]: numericKeys.has(key) ? Math.max(0, Number(value) || 0) : value,
    });
  }

  function copyServicePricesToAll(service) {
    const confirmed = window.confirm(
      "Apply pricing to all services?\n\nThis will replace the duration and price settings for every service. Titles, descriptions, images and visibility will not be changed."
    );
    if (!confirmed) return;
    const durationPrices = normalizeDurationPrices(service.durationPrices, service.price, service.duration);
    services.forEach((item) => {
      updateServiceDetail(item.id, "durationPrices", durationPrices);
    });
    setAdminActionMessage("Pricing applied to all services");
  }

  function confirmDiscardServiceChanges() {
    if (!serviceEditorDirty) return true;
    return window.confirm("Discard unsaved changes?\n\nKeep editing to return to your changes, or discard them to continue.");
  }

  function openServiceEditor(service) {
    if (editingServiceId === service.id) {
      if (!confirmDiscardServiceChanges()) return;
      setEditingServiceId(null);
      setServiceEditorDraft(null);
      setServiceEditorError("");
      return;
    }

    if (!confirmDiscardServiceChanges()) return;
    setEditingServiceId(service.id);
    setServiceEditorDraft(serviceEditorDraftFromService(service));
    setServiceEditorError("");
  }

  function updateServiceEditorDraft(key, value) {
    setServiceEditorDraft((current) => ({ ...(current ?? {}), [key]: value }));
    setServiceEditorError("");
  }

  function updateServiceEditorPrice(minutes, value) {
    setServiceEditorDraft((current) => ({
      ...(current ?? {}),
      durationPrices: {
        ...(current?.durationPrices ?? {}),
        [minutes]: value,
      },
    }));
    setServiceEditorError("");
  }

  function cancelServiceEditor() {
    if (!confirmDiscardServiceChanges()) return;
    setEditingServiceId(null);
    setServiceEditorDraft(null);
    setServiceEditorError("");
  }

  function saveServiceEditor(service) {
    if (!service || serviceEditorSaving) return;
    const validationError = validateServiceEditorDraft(serviceEditorDraft);
    if (validationError) {
      setServiceEditorError(validationError);
      return;
    }

    try {
      setServiceEditorSaving(true);
      setServiceEditorError("");
      const durationPrices = Object.fromEntries(
        [...CLIENT_DURATION_OPTIONS]
          .sort((first, second) => first.minutes - second.minutes)
          .map((option) => [option.minutes, Math.max(0, Number(serviceEditorDraft.durationPrices[option.minutes]) || 0)])
      );

      onServiceNameChange(service.id, serviceEditorDraft.name.trim());
      onServiceDetailChange(service.id, {
        durationPrices,
        imageUrl: serviceEditorDraft.imageUrl,
        longDescription: serviceEditorDraft.longDescription,
        shortDescription: serviceEditorDraft.shortDescription,
      });

      setAdminActionMessage("Changes saved");
      setEditingServiceId(null);
      setServiceEditorDraft(null);
    } catch (error) {
      setServiceEditorError(error?.message || "Could not save this service.");
    } finally {
      setServiceEditorSaving(false);
    }
  }

  function applyServiceDraftPricingToAll(service) {
    if (!service) return;
    const validationError = validateServiceEditorDraft(serviceEditorDraft);
    if (validationError) {
      setServiceEditorError(validationError);
      return;
    }

    const durationPrices = Object.fromEntries(
      [...CLIENT_DURATION_OPTIONS]
        .sort((first, second) => first.minutes - second.minutes)
        .map((option) => [option.minutes, Math.max(0, Number(serviceEditorDraft.durationPrices[option.minutes]) || 0)])
    );

    copyServicePricesToAll({ ...service, durationPrices });
  }

  function createServiceOffering() {
    if (!confirmDiscardServiceChanges()) return;
    if (!onAddService) return;
    const serviceId = onAddService();
    setServiceSearch("");
    const nextService = {
      id: serviceId,
      imageUrl: massageTreatmentImage,
      longDescription: "A professional mobile massage treatment tailored to the client's needs.",
      name: "New service",
      price: 90,
      shortDescription: "Professional mobile massage treatment.",
      visible: true,
      duration: 60,
      durationPrices: { 60: 90, 90: 125, 120: 160 },
    };
    setEditingServiceId(serviceId);
    setServiceEditorDraft(serviceEditorDraftFromService(nextService));
    setServiceEditorError("");
  }

  function sessionPreferenceDraftFrom(preference = {}) {
    return {
      ...DEFAULT_SESSION_PREFERENCE_DRAFT,
      ...preference,
      conflictIds: Array.isArray(preference.conflictIds) ? preference.conflictIds : [],
      id: preference.id || `session-preference-${Date.now()}`,
      label: preference.label || "",
      sortOrder: Number(preference.sortOrder) || sessionPreferenceRows.length + 1,
      visible: preference.visible !== false,
    };
  }

  function createSessionPreferenceId() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : `00000000-0000-4000-8000-${String(Date.now()).slice(-12).padStart(12, "0")}`;
  }

  function openSessionPreferenceEditor(preference = null) {
    setSessionPreferenceError("");
    if (!preference) {
      setEditingSessionPreferenceId("new");
      setSessionPreferenceDraft(sessionPreferenceDraftFrom({
        id: createSessionPreferenceId(),
        sortOrder: sessionPreferenceRows.length + 1,
      }));
      return;
    }

    setEditingSessionPreferenceId(preference.id);
    setSessionPreferenceDraft(sessionPreferenceDraftFrom(preference));
  }

  function cancelSessionPreferenceEditor() {
    setEditingSessionPreferenceId(null);
    setSessionPreferenceDraft(null);
    setSessionPreferenceError("");
  }

  function updateSessionPreferenceDraft(key, value) {
    setSessionPreferenceDraft((current) => ({ ...(current || DEFAULT_SESSION_PREFERENCE_DRAFT), [key]: value }));
    setSessionPreferenceError("");
  }

  async function saveSessionPreferenceEditor() {
    if (sessionPreferenceSaving) return;
    const draft = sessionPreferenceDraftFrom(sessionPreferenceDraft);
    const label = String(draft.label || "").trim();
    if (!label) {
      setSessionPreferenceError("Add the client-facing label.");
      return;
    }

    const existingRows = sanitizeSessionPreferences(sessionPreferences);
    const isNew = editingSessionPreferenceId === "new";
    const rowId = isNew ? draft.id : editingSessionPreferenceId;
    const duplicateLabel = existingRows.some((item) =>
      !item.deletedAt
      && item.id !== rowId
      && item.label.trim().toLowerCase() === label.toLowerCase()
    );
    if (duplicateLabel) {
      setSessionPreferenceError("A preference with this label already exists.");
      return;
    }

    const nextRow = {
      ...draft,
      id: rowId,
      label,
      sortOrder: Math.max(1, Math.round(Number(draft.sortOrder) || sessionPreferenceRows.length + 1)),
    };
    const withoutCurrent = existingRows.filter((item) => item.id !== rowId);
    const deletedRows = withoutCurrent.filter((item) => item.deletedAt);
    const editableRows = withoutCurrent.filter((item) => !item.deletedAt);
    const desiredIndex = Math.max(0, Math.min(editableRows.length, nextRow.sortOrder - 1));
    editableRows.splice(desiredIndex, 0, nextRow);
    const optimisticRows = sanitizeSessionPreferences([
      ...editableRows.map((item, index) => ({ ...item, sortOrder: index + 1 })),
      ...deletedRows,
    ]);
    onUpdateSessionPreferences?.(optimisticRows);

    try {
      setSessionPreferenceSaving(true);
      const oldSortOrder = existingRows.find((item) => item.id === rowId)?.sortOrder
        || Math.max(1, ...existingRows.map((item) => Number(item.sortOrder) || 1)) + 1000;
      const savedPreference = await saveSessionPreferenceToSupabase({ ...nextRow, sortOrder: oldSortOrder });
      const withSavedRow = optimisticRows.map((item) => (item.id === savedPreference.id ? { ...item, ...savedPreference, sortOrder: item.sortOrder } : item));
      const savedRows = await saveSessionPreferencesOrderToSupabase(withSavedRow);
      onUpdateSessionPreferences?.(savedRows);
      setAdminActionMessage(isNew ? "Session preference added." : "Session preference saved.");
      cancelSessionPreferenceEditor();
    } catch (error) {
      onUpdateSessionPreferences?.(existingRows);
      setSessionPreferenceError(error?.message || "Session preference could not be saved.");
    } finally {
      setSessionPreferenceSaving(false);
    }
  }

  async function toggleSessionPreferenceVisibility(preferenceId) {
    if (sessionPreferenceSaving) return;
    const previousRows = sanitizeSessionPreferences(sessionPreferences);
    const nextRows = previousRows.map((preference) =>
      preference.id === preferenceId ? { ...preference, visible: !preference.visible } : preference
    );
    const changed = nextRows.find((preference) => preference.id === preferenceId);
    if (!changed) return;
    onUpdateSessionPreferences?.(nextRows);
    try {
      setSessionPreferenceSaving(true);
      await saveSessionPreferenceToSupabase(changed);
      setAdminActionMessage(`${changed.label} is now ${changed.visible ? "visible" : "hidden"}.`);
    } catch (error) {
      onUpdateSessionPreferences?.(previousRows);
      setSessionPreferenceError(error?.message || "Visibility could not be saved.");
    } finally {
      setSessionPreferenceSaving(false);
    }
  }

  async function deleteSessionPreference(preference) {
    if (!preference) return;
    const confirmed = window.confirm(
      `Delete "${preference.label}"? It will no longer be available for future bookings. Historic bookings will not be changed.`
    );
    if (!confirmed) return;

    const previousRows = sanitizeSessionPreferences(sessionPreferences);
    const nextRows = previousRows.map((item) => {
        if (item.id === preference.id) {
          return { ...item, deletedAt: new Date().toISOString(), visible: false, conflictIds: [] };
        }
        return { ...item, conflictIds: (item.conflictIds || []).filter((conflictId) => conflictId !== preference.id) };
      });

    onUpdateSessionPreferences?.(nextRows);
    try {
      setSessionPreferenceSaving(true);
      for (const row of nextRows.filter((item) => item.id === preference.id || previousRows.find((previous) => previous.id === item.id)?.conflictIds?.includes(preference.id))) {
        await saveSessionPreferenceToSupabase(row);
      }
      if (editingSessionPreferenceId === preference.id) cancelSessionPreferenceEditor();
      setAdminActionMessage(`Deleted ${preference.label}.`);
    } catch (error) {
      onUpdateSessionPreferences?.(previousRows);
      setSessionPreferenceError(error?.message || "Session preference could not be deleted.");
    } finally {
      setSessionPreferenceSaving(false);
    }
  }

  async function reorderSessionPreference(preferenceId, direction) {
    if (sessionPreferenceSaving) return;
    const rows = sessionPreferenceRows;
    const currentIndex = rows.findIndex((preference) => preference.id === preferenceId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= rows.length) return;
    const reordered = [...rows];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);
    const deletedRows = sanitizeSessionPreferences(sessionPreferences).filter((preference) => preference.deletedAt);
    const previousRows = sanitizeSessionPreferences(sessionPreferences);
    const nextRows = sanitizeSessionPreferences([...reordered.map((preference, index) => ({ ...preference, sortOrder: index + 1 })), ...deletedRows]);
    onUpdateSessionPreferences?.(nextRows);
    try {
      setSessionPreferenceSaving(true);
      const savedRows = await saveSessionPreferencesOrderToSupabase(nextRows);
      onUpdateSessionPreferences?.(savedRows);
    } catch (error) {
      onUpdateSessionPreferences?.(previousRows);
      setSessionPreferenceError(error?.message || "Preference order could not be saved.");
    } finally {
      setSessionPreferenceSaving(false);
    }
  }

  async function moveSessionPreferenceTo(preferenceId, targetId) {
    if (sessionPreferenceSaving) return;
    if (!preferenceId || !targetId || preferenceId === targetId) return;
    const rows = [...sessionPreferenceRows];
    const fromIndex = rows.findIndex((preference) => preference.id === preferenceId);
    const toIndex = rows.findIndex((preference) => preference.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = rows.splice(fromIndex, 1);
    rows.splice(toIndex, 0, moved);
    const deletedRows = sanitizeSessionPreferences(sessionPreferences).filter((preference) => preference.deletedAt);
    const previousRows = sanitizeSessionPreferences(sessionPreferences);
    const nextRows = sanitizeSessionPreferences([...rows.map((preference, index) => ({ ...preference, sortOrder: index + 1 })), ...deletedRows]);
    onUpdateSessionPreferences?.(nextRows);
    try {
      setSessionPreferenceSaving(true);
      const savedRows = await saveSessionPreferencesOrderToSupabase(nextRows);
      onUpdateSessionPreferences?.(savedRows);
    } catch (error) {
      onUpdateSessionPreferences?.(previousRows);
      setSessionPreferenceError(error?.message || "Preference order could not be saved.");
    } finally {
      setSessionPreferenceSaving(false);
    }
  }

  async function updateOverviewBooking(patch) {
    if (!overviewBooking) return;
    const nextPatch = { ...patch };
    if ("start" in nextPatch && typeof nextPatch.start === "string") {
      nextPatch.start = timeToMinutes(nextPatch.start);
    }
    if ("travelBuffer" in nextPatch) {
      nextPatch.travelBuffer = Math.max(0, Number(nextPatch.travelBuffer) || 0);
    }
    if ("duration" in nextPatch) {
      nextPatch.duration = Math.max(1, Math.min(1440, Number(nextPatch.duration) || 1));
    }

    try {
      setOverviewUpdatePending(true);
      setAdminActionMessage("");
      const normalizedPatch = isPersonalEvent(overviewBooking)
        ? nextPatch
        : normalizeAdminBookingApprovalPatch(nextPatch, overviewBooking);
      const updatedBooking = await onUpdateBooking(overviewBooking.id, normalizedPatch);
      if (updatedBooking) {
        setOverviewBooking((current) => current ? { ...current, ...updatedBooking } : current);
        if (normalizedPatch.paymentStatus === "paid" && !isPersonalEvent(overviewBooking)) {
          setAdminActionMessage("Payment marked received.");
        }
      }
    } catch (error) {
      showAdminError(error, "Could not update this appointment.");
    } finally {
      setOverviewUpdatePending(false);
    }
  }

  function openBookingDetailsFromAdminList(booking, tab = "details") {
    setOverviewBooking(booking);
    setOverviewEditing(true);
    setOverviewMoreOpen(false);
    setOverviewTab(tab);
  }

  async function completePendingVerification(booking) {
    const info = adminVerificationInfo(booking);
    if (!info?.updatePatch) {
      openBookingDetailsFromAdminList(booking, "details");
      return;
    }

    try {
      setOverviewUpdatePending(true);
      setAdminActionMessage("");
      const updatedBooking = await onUpdateBooking(booking.id, info.updatePatch);
      setAdminActionMessage(
        info.tone === "cash"
          ? "Cash request approved."
          : "Payment marked received."
      );
      if (overviewBooking?.id === booking.id && updatedBooking) {
        setOverviewBooking((current) => current ? { ...current, ...updatedBooking } : current);
      }
    } catch (error) {
      showAdminError(error, "Could not update this booking.");
    } finally {
      setOverviewUpdatePending(false);
    }
  }

  function shareOverviewBooking() {
    if (!overviewBooking) return;
    const details = [
      `Client: ${clientNameForBooking(overviewBooking)}`,
      `Time: ${formatRange(overviewBooking.start, overviewBooking.sessionEnd)}`,
      `Buffer: ${overviewBooking.travelBuffer} minutes`,
      `Location: ${overviewBooking.address || overviewBooking.location || "Not captured"}`,
      `Services: ${itemsForBooking(overviewBooking).map((item) => item.name).join(", ")}`,
    ].join("\n");

    if (navigator.share) {
      navigator.share({ text: details, title: "Appointment details" }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(details).catch(() => {});
    }
    setOverviewMoreOpen(false);
  }

  function personalEventSeriesKey(booking) {
    if (!isPersonalEvent(booking)) return "";
    return [
      String(booking.clientName || "").trim().toLowerCase(),
      String(booking.serviceId || "personal-event").trim().toLowerCase(),
      String(booking.eventColor || DEFAULT_PERSONAL_EVENT_COLOR).trim().toLowerCase(),
    ].join("|");
  }

  function getRelatedPersonalEventBookings(booking) {
    if (!isPersonalEvent(booking)) return booking ? [booking] : [];
    const selectedDate = booking.dateValue;
    const key = personalEventSeriesKey(booking);
    const matching = days
      .flatMap((day) =>
        day.bookings
          .filter((item) => personalEventSeriesKey(item) === key)
          .map((item) => ({ ...item, dateValue: day.dateValue, dayId: day.id }))
      )
      .sort((first, second) => first.dateValue.localeCompare(second.dateValue));
    const selectedIndex = matching.findIndex((item) => item.id === booking.id || item.dateValue === selectedDate);

    if (selectedIndex < 0) return [booking];

    let startIndex = selectedIndex;
    let endIndex = selectedIndex;

    while (
      startIndex > 0
      && matching[startIndex].dateValue === addDaysToDateValue(matching[startIndex - 1].dateValue, 1)
    ) {
      startIndex -= 1;
    }

    while (
      endIndex < matching.length - 1
      && matching[endIndex + 1].dateValue === addDaysToDateValue(matching[endIndex].dateValue, 1)
    ) {
      endIndex += 1;
    }

    return matching.slice(startIndex, endIndex + 1);
  }

  async function confirmDeleteBooking() {
    if (!pendingDeleteBooking) return;
    try {
      const bookingsToDelete = pendingDeleteScope === "series"
        ? getRelatedPersonalEventBookings(pendingDeleteBooking)
        : [pendingDeleteBooking];
      const idsToDelete = [...new Set(bookingsToDelete.map((booking) => booking.id).filter(Boolean))];

      for (const bookingId of idsToDelete) {
        await onDeleteBooking(bookingId, { confirmed: true, forceDelete: true });
      }

      if (overviewBooking && idsToDelete.includes(overviewBooking.id)) {
        setOverviewBooking(null);
      }
      setPendingDeleteBooking(null);
      setPendingDeleteScope("single");
      setOverviewMoreOpen(false);
    } catch (error) {
      showAdminError(error, "Could not delete this appointment.");
    }
  }

  function renderBookingBox(booking, compact = false) {
    const personal = isPersonalEvent(booking);
    const items = itemsForBooking(booking);
    const mapDisabled = !booking.address && !booking.location;
    const displayReference = booking.bookingReference || booking.paymentReference || (booking.id ? `Booking ${String(booking.id).slice(0, 8)}` : "");

    if (personal) {
      const colorClass = personalEventColorClass(booking.eventColor);
      const isAllDay = Number(booking.duration) >= 1440 && Number(booking.start) === 0;

      return (
        <AdminCompactBookingCard
          key={booking.id}
          card={{
            booking,
            colorClass,
            id: booking.id,
            kind: "personal",
            subtitle: isAllDay ? "Personal - all day" : `Personal - ${formatRange(booking.start, booking.sessionEnd)}`,
            title: clientNameForBooking(booking),
          }}
          compact={compact}
          onOpenOverview={openOverviewBookingDetails}
          onRequestDelete={setPendingDeleteBooking}
        />
      );
    }

    return (
      <AdminCompactBookingCard
        key={booking.id}
        card={{
          booking,
          bufferLabel: `Buffer ${booking.travelBuffer} min`,
          clientName: clientNameForBooking(booking),
          displayReference,
          durationLabel: `${booking.duration} min`,
          id: booking.id,
          kind: "booking",
          mapDisabled,
          mapUrl: mapDisabled ? undefined : mapUrlForBooking(booking),
          serviceRows: items.map((item, index) => ({
            key: `${booking.id}-${item.name}-${index}`,
            label: `${item.name}${item.minutes ? ` / ${item.minutes} min` : ""}`,
          })),
          timeRange: formatRange(booking.start, booking.sessionEnd),
        }}
        compact={compact}
        onOpenOverview={openOverviewBookingDetails}
        onRequestDelete={setPendingDeleteBooking}
      />
    );
  }

  function renderTimelineBookingBox(booking) {
    const personal = isPersonalEvent(booking);
    const items = itemsForBooking(booking);
    const mapDisabled = !booking.address && !booking.location;
    const serviceCodes = items
      .map((item) => `${item.minutes || booking.duration} ${serviceAbbreviation(item.name)}`)
      .join(" + ");
    const totalReserved = Math.max(1, booking.duration + booking.travelBuffer);
    let bandOffset = 0;
    const serviceBands = items.map((item, index) => {
      const minutes = Math.max(0, Number(item.minutes || booking.duration));
      const height = Math.min(100, (minutes / totalReserved) * 100);
      const band = {
        className: `day-timeline-service-band service-band-${index % 5}`,
        height,
        offset: bandOffset,
      };
      bandOffset += height;
      return band;
    });
    const bufferPercent = Math.min(100, Math.max(0, (booking.travelBuffer / totalReserved) * 100));

    return (
      <AdminTimelineBookingCard
        key={booking.id}
        card={{
          booking,
          className: personal ? "day-timeline-booking-box personal-timeline-booking-box" : "day-timeline-booking-box",
          clientName: clientNameForBooking(booking),
          id: booking.id,
          mapDisabled,
          mapUrl: mapDisabled ? undefined : mapUrlForBooking(booking),
          metaSuffix: personal ? " / unavailable" : ` / buffer ${booking.travelBuffer} min`,
          personal,
          serviceBands: serviceBands.map((band, index) => ({
            className: band.className,
            key: `${booking.id}-service-band-${index}`,
            style: { height: `${band.height}%`, top: `${band.offset}%` },
          })),
          serviceLabel: personal ? "Personal event" : serviceCodes,
          style: { "--buffer-percent": `${bufferPercent}%` },
          timeRange: formatRange(booking.start, booking.bufferEnd),
        }}
        onOpenOverview={openOverviewBookingDetails}
        onRequestDelete={setPendingDeleteBooking}
      />
    );
  }

  function scheduleModeLabel(settingsForDay) {
    return settingsForDay?.mode === "optimized" ? "CHAIN" : "FLEX";
  }

  function buildDaySummaryModel(blocks) {
    if (!blocks.length) return null;
    const leaveTime = getDayLeaveTime(blocks);
    const homeTime = getDayHomeTime(blocks);
    return {
      items: [
        ...(leaveTime !== null ? [{ id: "leave", label: `🏠 Leave ${minutesToTime(leaveTime)}` }] : []),
        { id: "work", label: `⏱ ${formatAgendaDuration(getDayWorkMinutes(blocks))} work` },
        { id: "travel", label: `🚗 ${formatAgendaDuration(getDayTravelMinutes(blocks))} travel` },
        { id: "revenue", label: formatAdminMoney(getDayRevenue(blocks, serviceDetails)) },
        ...(homeTime !== null ? [{ id: "home", label: `🏠 ${minutesToTime(homeTime)}` }] : []),
      ],
    };
  }

  function cancellationSourceLabel(booking = {}) {
    const cancelledBy = String(booking.cancelledBy || booking.cancelled_by || "").trim().toLowerCase();
    if (cancelledBy === "client") return "by client";
    if (cancelledBy === "admin") return "by admin";
    return "source unknown";
  }

  function restorePatchForCancelledBooking(booking = {}) {
    const paymentMethod = String(booking.paymentMethod || "").trim();
    const wasPaid = booking.paymentReceivedAt || booking.paymentStatus === "paid";
    return {
      cancelledAt: null,
      cancelledBy: "",
      cancellationWindow: "",
      paymentStatus: wasPaid ? "paid" : paymentMethodToPaymentStatus(paymentMethod),
      status: wasPaid ? "confirmed" : paymentMethodToBookingStatus(paymentMethod),
    };
  }

  async function restoreCancelledBooking(booking) {
    if (!booking?.id) return;
    const confirmed = window.confirm(`Restore cancelled booking for ${clientNameForBooking(booking)}?`);
    if (!confirmed) return;

    try {
      setAdminActionMessage("");
      const restoredBooking = await onUpdateBooking(booking.id, restorePatchForCancelledBooking(booking));
      if (restoredBooking) {
        setAdminActionMessage(`Restored booking for ${clientNameForBooking(restoredBooking)}.`);
      }
    } catch (error) {
      showAdminError(error, "Could not restore this booking.");
    }
  }

  function toggleAgendaBookingExpanded(booking) {
    setExpandedAgendaBookingId((current) => current === booking.id ? null : booking.id);
  }

  function openAgendaBookingEdit(booking) {
    setOverviewBooking(booking);
    setOverviewEditing(true);
    setOverviewMoreOpen(false);
    setOverviewTab("details");
  }

  function deleteCancelledAgendaBooking(booking) {
    onDeleteBooking(booking.id, { forceDelete: true });
  }

  async function cancelAgendaBooking(booking) {
    await onDeleteBooking(booking.id);
    setExpandedAgendaBookingId((current) => current === booking.id ? null : current);
  }

  function buildAgendaDayHeaderModel(day, isToday) {
    const settingsForDay = day.settings || DEFAULT_DAY_SETTINGS;
    const unavailable = Boolean(settingsForDay.unavailable);
    const modeLabel = scheduleModeLabel(settingsForDay);
    const modeClass = modeLabel === "CHAIN" ? "chain" : "flex";
    const anchorActive = settingsForDay.startMode === "fixed" || settingsForDay.anchorReleaseEnabled;
    const fixedStart = settingsForDay.fixedStart || DEFAULT_DAY_SETTINGS.fixedStart;
    const hasDateOverride = Boolean(day.hasDateOverride);
    const customBadgeLabel = hasDateOverride ? unavailable ? "OFF/CUSTOM" : "CUSTOM" : "";

    return {
      anchorActive,
      anchorAriaLabel: `Anchor start ${fixedStart}`,
      anchorText: `⚓ ${fixedStart}`,
      controlsAriaLabel: `Settings for ${fullDateLabel(day.dateValue)}`,
      customBadgeAriaLabel: unavailable ? "Date-specific closed-day override" : "Date-specific working hours override",
      customBadgeLabel,
      dateLabel: fullDateLabel(day.dateValue),
      day,
      hoursButtonClassName: `agenda-day-hours-button${hasDateOverride ? " modified" : ""}`,
      hoursLabel: unavailable ? "Unavailable" : `${settingsForDay.workingStart} – ${settingsForDay.workingEnd}`,
      isToday,
      modeBadgeClassName: `agenda-mode-badge ${modeClass}`,
      modeLabel,
    };
  }

  function renderAgendaBookingCard(booking) {
    if (isPersonalEvent(booking)) return renderBookingBox(booking);

    if (isCancelledBooking(booking)) {
      const cancelledStart = bookingStartMinutes(booking);
      const cancelledDuration = bookingDurationMinutes(booking);
      const cancelledTimeLabel = cancelledStart === null ? "" : minutesToTime(cancelledStart);
      const cancelledByLabel = cancellationSourceLabel(booking);

      return (
        <AdminAgendaBookingCard
          key={booking.id}
          card={{
            booking,
            cancelledByLabel,
            clientName: clientNameForBooking(booking),
            durationMinutes: cancelledDuration,
            id: booking.id,
            kind: "cancelled",
            timeLabel: cancelledTimeLabel,
          }}
          onCancelBooking={cancelAgendaBooking}
          onDeleteCancelled={deleteCancelledAgendaBooking}
          onOpenEdit={openAgendaBookingEdit}
          onRestoreCancelled={restoreCancelledBooking}
          onToggleExpanded={toggleAgendaBookingExpanded}
        />
      );
    }

    const items = itemsForBooking(booking);
    const primaryService = items[0]?.name || booking.serviceName || "Massage treatment";
    const mapDisabled = !booking.address && !booking.location;
    const displayReference = booking.bookingReference || booking.paymentReference || (booking.id ? `Booking ${String(booking.id).slice(0, 8)}` : "Not assigned");
    const notes = String(booking.sessionNotes || booking.notes || booking.note || booking.clientNotes || "").trim();
    const preferenceLabels = sessionPreferenceLabels(booking.sessionPreferenceIds, sessionPreferences, booking.sessionPreferenceLabels);
    const isExpanded = expandedAgendaBookingId === booking.id;
    const serviceIndex = Math.max(0, services.findIndex((service) => service.id === booking.serviceId || service.name === primaryService));
    const accentColors = ["#7b4cf4", "#f65cb6", "#ff7a1a", "#1685ff", "#10b996"];
    const accent = accentColors[serviceIndex % accentColors.length];
    const verificationInfo = adminVerificationInfo(booking);

    return (
      <AdminAgendaBookingCard
        key={booking.id}
        card={{
          addressLabel: booking.address || booking.location || "",
          booking,
          bufferLabel: `Buffer ${bookingTravelMinutes(booking)}m`,
          className: `agenda-booking-card${isExpanded ? " expanded" : ""}${verificationInfo ? " needs-admin-verification" : ""}`,
          clientName: clientNameForBooking(booking),
          displayReference,
          durationLabel: `${bookingDurationMinutes(booking)}m`,
          expanded: isExpanded,
          id: booking.id,
          isNewClient: booking.isNewClient,
          kind: "booking",
          mapDisabled,
          mapUrl: mapDisabled ? undefined : mapUrlForBooking(booking),
          notesLabel: notes || "No notes added",
          preferenceLabels,
          primaryService,
          style: { "--agenda-booking-accent": accent },
          timeLabel: minutesToTime(booking.start),
          verificationInfo,
        }}
        onCancelBooking={cancelAgendaBooking}
        onDeleteCancelled={deleteCancelledAgendaBooking}
        onOpenEdit={openAgendaBookingEdit}
        onRestoreCancelled={restoreCancelledBooking}
        onToggleExpanded={toggleAgendaBookingExpanded}
      />
    );
  }

  function showPendingBookingInAgenda(booking) {
    setActiveTab("calendar");
    openCalendarMode("agenda");
    if (Number.isFinite(booking.dayIndex) && booking.dayIndex >= 0) {
      onSetSelectedDayIndex(booking.dayIndex);
    }
    if (booking.dateValue) {
      setPendingAgendaScrollDate(booking.dateValue);
    }
    setExpandedAgendaBookingId(booking.id);
  }

  function renderPendingVerificationView() {
    return (
      <AdminPendingVerificationPanel
        actionDisabled={overviewUpdatePending}
        bookings={pendingVerificationCards}
        onCompleteVerification={completePendingVerification}
        onOpenAgenda={showPendingBookingInAgenda}
        onOpenDetails={openBookingDetailsFromAdminList}
      />
    );
  }

  function buildAgendaVisibleDays(currentDateValue) {
    const hasAgendaEntry = (day) => Array.isArray(day.bookings) && day.bookings.length > 0;
    const loadedEntryDays = days
      .filter((day) => isValidDateValue(day.dateValue) && hasAgendaEntry(day))
      .sort((first, second) => first.dateValue.localeCompare(second.dateValue));
    const firstEntryDate = loadedEntryDays[0]?.dateValue;
    const historyStartDate = firstEntryDate && firstEntryDate < currentDateValue
      ? firstEntryDate
      : currentDateValue;
    const emptyFutureEndDate = addDaysToDateValue(currentDateValue, AGENDA_EMPTY_FUTURE_DAYS);
    const baseDays = buildDaysForDateRange(historyStartDate, emptyFutureEndDate, days);
    const baseDateValues = new Set(baseDays.map((day) => day.dateValue));
    const futureEntryDays = loadedEntryDays.filter((day) => day.dateValue > emptyFutureEndDate && !baseDateValues.has(day.dateValue));
    const selectedOutOfRangeDay = !baseDateValues.has(selectedDay.dateValue)
      ? buildDaysForDateRange(selectedDay.dateValue, selectedDay.dateValue, days)
      : [];

    return [...baseDays, ...futureEntryDays, ...selectedOutOfRangeDay]
      .filter((day) => day.dateValue === selectedDay.dateValue || shouldShowCalendarHistoryDay(day, currentDateValue))
      .filter((day, index, allDays) => allDays.findIndex((item) => item.dateValue === day.dateValue) === index)
      .sort((first, second) => first.dateValue.localeCompare(second.dateValue));
  }

  function renderAgendaView() {
    const currentDateValue = todayValue();
    const agendaDays = buildAgendaVisibleDays(currentDateValue);
    const agendaDayIndexById = new Map(agendaDays.map((day, index) => [day.id, index]));
    const agenda = {
      days: agendaDays.map((day) => {
        const activeBlocks = getActiveBookingBlocks(day.bookings);
        const cancelledBlocks = getCancelledBookingBlocks(day.bookings);
        const blocks = [...activeBlocks, ...cancelledBlocks]
          .sort((first, second) => bookingStartMinutes(first) - bookingStartMinutes(second));
        const isToday = day.dateValue === currentDateValue;

        return {
          bookings: blocks.map((booking) => ({ ...booking, dayId: day.id, dayIndex: agendaDayIndexById.get(day.id) ?? -1, dateValue: day.dateValue })),
          className: [
            "admin-agenda-day",
            blocks.length === 0 ? "empty-admin-agenda-day" : "",
            activeBlocks.length === 0 && cancelledBlocks.length > 0 ? "cancelled-only-admin-agenda-day" : "",
            isToday ? "admin-agenda-today" : "",
            day.dateValue === selectedDay.dateValue ? "selected-admin-agenda-day" : "",
          ].filter(Boolean).join(" "),
          dateValue: day.dateValue,
          header: buildAgendaDayHeaderModel(day, isToday),
          id: day.id,
          summary: buildDaySummaryModel(activeBlocks),
        };
      }),
    };

    return (
      <AdminAgendaView
        agenda={agenda}
        agendaListRef={agendaListRef}
        onBindDayRef={(dateValue, node) => {
          if (node) {
            agendaDayRefs.current[dateValue] = node;
          } else {
            delete agendaDayRefs.current[dateValue];
          }
        }}
        onOpenAppointment={openAppointmentWizardForAgendaDay}
        onOpenScheduleMode={openDayScheduleModeSheet}
        onOpenWorkingHours={openDayWorkingHoursSheet}
        renderBookingCard={renderAgendaBookingCard}
      />
    );
  }

  function renderTimeGrid(dayList, { scrollable = false } = {}) {
    if (dayList.length === 0) {
      return (
        <AdminCalendarTimeGrid
          grid={{ empty: true }}
          gridRef={scrollable ? threeDayGridRef : undefined}
          renderCompactCard={renderBookingBox}
          renderTimelineCard={renderTimelineBookingBox}
        />
      );
    }

    const compact = dayList.length > 1;
    const firstBookingStart = Math.min(
      ...dayList.flatMap((day) => getCalendarEntryBlocks(day.bookings).map((booking) => booking.start))
    );
    const fallbackStart = Math.min(
      ...dayList.map((day) => timeToMinutes(day.settings?.workingStart ?? DEFAULT_DAY_SETTINGS.workingStart))
    );
    const startHour = Number.isFinite(firstBookingStart)
      ? Math.max(0, Math.floor(firstBookingStart / 60))
      : Math.max(0, Math.floor(fallbackStart / 60));
    const hours = Array.from({ length: 24 - startHour }, (_, index) => startHour + index);
    const rangeStart = startHour * 60;
    const rangeEnd = 1440;
    const rangeMinutes = rangeEnd - rangeStart;
    const gridHeight = hours.length * 72;

    const gridClassName = dayList.length === 1 ? "admin-day-grid" : "admin-three-day-grid";
    const gridStyle = dayList.length > 1
      ? { gridTemplateColumns: `72px repeat(${dayList.length}, minmax(220px, 1fr))` }
      : undefined;

    const grid = {
      className: `${gridClassName}${scrollable ? " scrollable-three-day-grid" : ""}`,
      days: dayList.map((day) => ({
        blocks: getCalendarEntryBlocks(day.bookings).map((booking) => {
          const top = (Math.max(rangeStart, booking.start) - rangeStart) / rangeMinutes * 100;
          const height = ((booking.bufferEnd - booking.start) / rangeMinutes) * 100;

          return {
            booking: { ...booking, dayId: day.id, dayIndex: days.findIndex((item) => item.id === day.id), dateValue: day.dateValue },
            className: [
              compact ? "admin-grid-event" : "admin-grid-event full-admin-grid-event",
              isCancelledBooking(booking) ? "cancelled-admin-grid-event" : "",
            ].filter(Boolean).join(" "),
            compact,
            id: booking.id,
            style: { height: `${height}%`, top: `${top}%` },
          };
        }),
        columnStyle: { minHeight: `${gridHeight}px` },
        dateValue: day.dateValue,
        hourLines: hours,
        id: day.id,
        label: fullDateLabel(day.dateValue),
      })),
      empty: false,
      hours: hours.map((hour) => ({ label: `${String(hour).padStart(2, "0")}:00`, value: hour })),
      style: gridStyle,
      timeColumnStyle: { gridTemplateRows: `repeat(${hours.length}, 72px)` },
    };

    return (
      <AdminCalendarTimeGrid
        grid={grid}
        gridRef={scrollable ? threeDayGridRef : undefined}
        renderCompactCard={renderBookingBox}
        renderTimelineCard={renderTimelineBookingBox}
      />
    );
  }

  function findLoadedDay(dateValue) {
    return days.find((day) => day.dateValue === dateValue) || null;
  }

  function selectCalendarDate(dateValue) {
    const matchingIndex = days.findIndex((day) => day.dateValue === dateValue);
    if (matchingIndex >= 0) {
      onSetSelectedDayIndex(matchingIndex);
    }
    setPendingAgendaScrollDate(dateValue);
  }

  function buildCalendarOverviewDayModel(day, { compact = false, expandable = false } = {}) {
    const blocks = getCalendarEntryBlocks(day.bookings);
    const isToday = day.dateValue === todayValue();
    const isSelected = day.dateValue === selectedDay.dateValue;
    const isExpanded = expandable && isSelected;
    const dayIndex = days.findIndex((item) => item.dateValue === day.dateValue);
    const enhancedBlocks = blocks.map((booking) => ({
      ...booking,
      dateValue: day.dateValue,
      dayId: day.id,
      dayIndex,
    }));
    const expandedBookings = isExpanded
      ? enhancedBlocks.map((booking) => {
          const primaryService = itemsForBooking(booking)[0]?.name || booking.serviceName || "Massage treatment";
          const mapDisabled = !booking.address && !booking.location;
          return {
            addressLabel: booking.address || booking.location || "",
            booking,
            clientName: clientNameForBooking(booking),
            durationMinutes: bookingDurationMinutes(booking),
            id: booking.id,
            mapDisabled,
            mapUrl: mapDisabled ? undefined : mapUrlForBooking(booking),
            primaryService,
            timeLabel: minutesToTime(booking.start),
            travelMinutes: bookingTravelMinutes(booking),
          };
        })
      : [];

    return {
      bookingCount: blocks.length,
      compact,
      dateValue: day.dateValue,
      dayNumberLabel: dayNumberLabel(day.dateValue),
      expandable,
      expanded: isExpanded,
      expandedBookings,
      isSelected,
      isToday,
      label: day.label,
      previewBookings: blocks.slice(0, compact ? 2 : 3).map((booking) => ({
        cancelled: isCancelledBooking(booking),
        clientName: clientNameForBooking(booking),
        id: booking.id,
        timeLabel: minutesToTime(booking.start),
      })),
    };
  }

  function buildWeekOverview() {
    const weekStart = weekStartDateValue(selectedDay.dateValue);
    const currentDateValue = todayValue();
    const weekDays = buildDaysForDateRange(weekStart, addDaysToDateValue(weekStart, 6), days)
      .filter((day) => shouldShowCalendarHistoryDay(day, currentDateValue));
    const weekSummary = weekDays.reduce((summary, day) => {
      const blocks = getCalendarEntryBlocks(day.bookings);
      const activeBlocks = getActiveBookingBlocks(day.bookings);
      return {
        bookings: summary.bookings + blocks.length,
        revenue: summary.revenue + getDayRevenue(activeBlocks, serviceDetails),
        travelMinutes: summary.travelMinutes + getDayTravelMinutes(activeBlocks),
        workMinutes: summary.workMinutes + getDayWorkMinutes(activeBlocks),
      };
    }, { bookings: 0, revenue: 0, travelMinutes: 0, workMinutes: 0 });

    return {
      days: weekDays.map((day) => buildCalendarOverviewDayModel(day, { expandable: true })),
      heading: `Week of ${fullDateLabel(weekStart)}`,
      summaryItems: [
        { id: "earnings", label: `${formatAdminMoney(weekSummary.revenue)} earnings` },
        { id: "bookings", label: `${weekSummary.bookings} booking${weekSummary.bookings === 1 ? "" : "s"}` },
        { id: "work", label: `${formatAgendaDuration(weekSummary.workMinutes)} work` },
        { id: "travel", label: `${formatAgendaDuration(weekSummary.travelMinutes)} travel` },
      ],
    };
  }

  function buildMonthOverview() {
    const monthStart = `${monthValueForDate(selectedDay.dateValue)}-01`;
    const monthEnd = addDaysToDateValue(addDaysToDateValue(monthValueForDate(addDaysToDateValue(monthStart, 35)) + "-01", -1), 0);
    const gridStart = weekStartDateValue(monthStart);
    const gridEnd = addDaysToDateValue(weekStartDateValue(monthEnd), 6);
    const currentDateValue = todayValue();
    const monthDays = buildDaysForDateRange(gridStart, gridEnd, days)
      .filter((day) => shouldShowCalendarHistoryDay(day, currentDateValue));
    const monthLabel = new Date(`${monthStart}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

    return {
      ariaLabel: `${monthLabel} month view`,
      bookingCountLabel: `${monthDays.reduce((count, day) => count + getCalendarEntryBlocks(day.bookings).length, 0)} bookings`,
      days: monthDays.map((day) => buildCalendarOverviewDayModel(day, { compact: true })),
      heading: monthLabel,
      weekdays: WEEK_DAYS,
    };
  }

  function buildYearOverview() {
    const year = selectedDay.dateValue.slice(0, 4);
    const selectedMonthValue = monthValueForDate(selectedDay.dateValue);
    const selectedMonthStart = `${selectedMonthValue}-01`;
    const selectedMonthLabel = new Date(`${selectedMonthStart}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    const selectedMonthDays = days.filter((day) => day.dateValue.startsWith(selectedMonthValue));
    const selectedMonthBookingDays = selectedMonthDays
      .map((day) => {
        const dayIndex = days.findIndex((item) => item.dateValue === day.dateValue);
        const bookings = getCalendarEntryBlocks(day.bookings).map((booking) => ({
          ...booking,
          dateValue: day.dateValue,
          dayId: day.id,
          dayIndex,
        }));
        return { ...day, bookings };
      })
      .filter((day) => day.bookings.length > 0);
    const selectedMonthBookingCount = selectedMonthBookingDays.reduce((count, day) => count + day.bookings.length, 0);
    const months = Array.from({ length: 12 }, (_, index) => {
      const monthValue = `${year}-${String(index + 1).padStart(2, "0")}`;
      const firstDay = `${monthValue}-01`;
      const monthName = new Date(`${firstDay}T00:00:00`).toLocaleDateString("en-GB", { month: "short" });
      const monthCount = days
        .filter((day) => day.dateValue.startsWith(monthValue))
        .reduce((count, day) => count + getCalendarEntryBlocks(day.bookings).length, 0);
      return { firstDay, monthName, monthCount, selected: firstDay.startsWith(selectedMonthValue) };
    });

    return {
      heading: year,
      loadedBookingCountLabel: `${days.reduce((count, day) => count + getCalendarEntryBlocks(day.bookings).length, 0)} loaded bookings`,
      months,
      selectedMonth: {
        ariaLabel: `${selectedMonthLabel} bookings`,
        bookingCount: selectedMonthBookingCount,
        bookingCountLabel: `${selectedMonthBookingCount} booking${selectedMonthBookingCount === 1 ? "" : "s"}`,
        bookingDays: selectedMonthBookingDays.map((day) => ({
          bookings: day.bookings,
          dateValue: day.dateValue,
          label: fullDateLabel(day.dateValue),
        })),
        label: selectedMonthLabel,
      },
    };
  }

  function openOverviewBookingDetails(booking) {
    setOverviewBooking(booking);
    setOverviewEditing(false);
    setOverviewMoreOpen(false);
    setOverviewTab("details");
  }

  function renderCalendarOverview() {
    return (
      <AdminCalendarOverview
        mode={calendarMode}
        monthOverview={calendarMode === "month" ? buildMonthOverview() : null}
        onOpenBookingDetails={openOverviewBookingDetails}
        onSelectDate={selectCalendarDate}
        onSelectMonth={selectCalendarDate}
        renderMonthBookingCard={renderAgendaBookingCard}
        weekOverview={calendarMode === "week" ? buildWeekOverview() : null}
        yearOverview={calendarMode === "year" ? buildYearOverview() : null}
      />
    );
  }

  function renderCalendarContent() {
    if (calendarMode === "day") {
      return renderTimeGrid(shouldShowCalendarHistoryDay(selectedDay, todayValue()) ? [selectedDay] : []);
    }
    if (calendarMode === "three-day") {
      const stripStart = addDaysToDateValue(selectedDay.dateValue, -THREE_DAY_SCROLL_PAST_DAYS);
      const stripEnd = addDaysToDateValue(selectedDay.dateValue, THREE_DAY_SCROLL_FUTURE_DAYS);
      const visibleStripDays = buildDaysForDateRange(stripStart, stripEnd, days)
        .filter((day) => shouldShowCalendarHistoryDay(day, todayValue()));
      return renderTimeGrid(visibleStripDays, { scrollable: true });
    }
    if (calendarMode === "week" || calendarMode === "month" || calendarMode === "year") return renderCalendarOverview();
    return renderAgendaView();
  }

  const overviewIsPersonalEvent = isPersonalEvent(overviewBooking);
  const overviewPersonalSeries = overviewIsPersonalEvent ? getRelatedPersonalEventBookings(overviewBooking) : [];
  const overviewPersonalEndTime = overviewBooking
    ? minutesToTime(Number(overviewBooking.start) + Number(overviewBooking.duration || 0))
    : "00:00";
  const overviewModel = overviewBooking
    ? {
        headingTitle: clientNameForBooking(overviewBooking),
        historyRows: [
          { id: "created", label: `Booking created for ${formatRange(overviewBooking.start, overviewBooking.sessionEnd)}.` },
          { id: "buffer", label: `Travel buffer reserved for ${overviewBooking.travelBuffer} minutes.` },
          { id: "services", label: `${itemsForBooking(overviewBooking).length} service line(s) included in this appointment.` },
        ],
        isPersonalEvent: overviewIsPersonalEvent,
        normal: {
          clientInputValue: overviewBooking.clientName || "",
          clientLabel: clientNameForBooking(overviewBooking),
          contactLabel: overviewBooking.customerPhone || overviewBooking.customerEmail || "Not captured",
          detailRows: [
            { id: "reference", label: "Reference", value: overviewBooking.bookingReference || overviewBooking.paymentReference || "-" },
            { id: "reservation-expiry", label: "Reservation expiry", value: overviewBooking.paymentHoldExpiresAt || overviewBooking.paymentExpiry ? (new Date(overviewBooking.paymentHoldExpiresAt || overviewBooking.paymentExpiry)).toLocaleString() : "-" },
            { id: "payment-received", label: "Payment received", value: overviewBooking.paymentReceivedAt ? (new Date(overviewBooking.paymentReceivedAt)).toLocaleString() : "-" },
            { id: "base-price", label: "Base price", value: `£${Number(overviewBooking.price || 0).toFixed(2)}` },
            { id: "congestion-fee", label: "Congestion fee", value: `£${Number(overviewBooking.congestionFee || 0).toFixed(2)}` },
            { id: "travel-surcharge", label: "Travel surcharge", value: `£${Number(overviewBooking.travelFee || 0).toFixed(2)}` },
            { id: "total-due", label: "Total due", value: `£${bookingTotalDue(overviewBooking).toFixed(2)}` },
          ],
          locationInputValue: overviewBooking.address || overviewBooking.location || "",
          locationLabel: overviewBooking.address || overviewBooking.location || "Not captured",
          markPaymentReceivedDisabled: overviewUpdatePending || overviewBooking.paymentStatus === "paid" || overviewBooking.status === "cancelled",
          markPaymentReceivedLabel: overviewUpdatePending ? "Saving..." : "Mark Payment Received",
          paymentMethodInputValue: overviewBooking.paymentMethod || "",
          paymentMethodFieldLabel: "Payment method",
          paymentMethodLabel: paymentMethodLabel(overviewBooking.paymentMethod),
          paymentStatusInputValue: overviewBooking.paymentStatus || "awaiting_verification",
          paymentStatusFieldLabel: "Payment status",
          paymentStatusLabel: paymentStatusLabel(overviewBooking.paymentStatus, overviewBooking.status),
          serviceRows: itemsForBooking(overviewBooking).map((item, index) => ({
            id: `${item.name}-${index}`,
            label: `${item.name}${item.minutes ? ` / ${item.minutes} minutes` : ""}`,
          })),
          showCashApprovalActions: overviewBooking.paymentMethod === "cash"
            && overviewBooking.paymentStatus === "cash_on_arrival"
            && overviewBooking.status === "payment_method_review",
          startTimeInputValue: minutesToTime(overviewBooking.start),
          timeRangeLabel: formatRange(overviewBooking.start, overviewBooking.sessionEnd),
          travelBufferInputValue: overviewBooking.travelBuffer,
          travelBufferLabel: `${overviewBooking.travelBuffer} minutes`,
        },
        personal: {
          colorLabel: PERSONAL_EVENT_COLORS.find((color) => color.id === overviewBooking.eventColor)?.label || "Orange",
          dateLabel: fullDateLabel(overviewBooking.dateValue),
          endTimeInputValue: overviewPersonalEndTime,
          endTimeLabel: Number(overviewBooking.duration) >= 1440 ? "All day" : overviewPersonalEndTime,
          eventColorInputValue: overviewBooking.eventColor || DEFAULT_PERSONAL_EVENT_COLOR,
          seriesLabel: overviewPersonalSeries.length > 1 ? `${overviewPersonalSeries.length} days in this event` : "This day only",
          startTimeInputValue: minutesToTime(overviewBooking.start),
          startTimeLabel: minutesToTime(overviewBooking.start),
          titleInputValue: overviewBooking.clientName || "",
          titleLabel: clientNameForBooking(overviewBooking),
        },
        showSeriesDelete: overviewIsPersonalEvent && overviewPersonalSeries.length > 1,
      }
    : null;

  async function duplicateOverviewBooking() {
    if (!overviewBooking) return;
    try {
      await onDuplicateBooking(overviewBooking.id);
      setOverviewMoreOpen(false);
    } catch (error) {
      showAdminError(error, "Could not duplicate this appointment.");
    }
  }

  function requestOverviewDelete(scope, closeMoreMenu = false) {
    if (!overviewBooking) return;
    setPendingDeleteBooking(overviewBooking);
    setPendingDeleteScope(scope);
    if (closeMoreMenu) {
      setOverviewMoreOpen(false);
    }
  }

  function changeOverviewPersonalEndTime(value) {
    if (!overviewBooking) return;
    const start = Number(overviewBooking.start);
    const end = timeToMinutes(value);
    const duration = end <= start ? 1440 - start + end : end - start;
    updateOverviewBooking({ duration });
  }

  function selectTodayInAdminCalendar() {
    const todayDateValue = todayValue();
    const todayIndex = days.findIndex((day) => day.dateValue === todayDateValue);
    if (todayIndex >= 0) {
      onSetSelectedDayIndex(todayIndex);
    }
    setPendingAgendaScrollDate(todayDateValue);
  }

  function openCalendarMode(mode) {
    setCalendarMode(mode);
    setActiveTab("calendar");
    selectTodayInAdminCalendar();
  }

  async function handleMenuLogout() {
    if (!onAdminLogout) return;
    setAdminLogoutPending(true);
    try {
      await onAdminLogout();
      setSideMenuOpen(false);
    } catch (error) {
      showAdminError(error, "Admin logout failed.");
    } finally {
      setAdminLogoutPending(false);
    }
  }

  return (
    <section className={`admin-app-shell admin-tab-${activeTab}`}>
      <AdminTopbar
        activeTab={activeTab}
        calendarMode={calendarMode}
        tabs={ADMIN_TABS}
        onOpenMenu={() => setSideMenuOpen(true)}
        onSwitchClient={() => onSetActiveView("client")}
      />

      {activeTab === "calendar" && (
        <AdminCalendarDateNavigation
          compactDateNavVisible={compactDateNavVisible}
          datePillItems={adminDatePillItems}
          dateStripRef={adminDateStripRef}
          formatAdminMoney={formatAdminMoney}
          formatAgendaDuration={formatAgendaDuration}
          isTodaySelected={selectedDay.dateValue === currentDateValue}
          monthLabel={adminDateStripMonthLabel}
          onDatePillClick={handleDatePillClick}
          onGoToToday={goToToday}
          onShiftWeek={shiftAdminDateStripWeek}
          weekSummary={adminWeekSummary}
        />
      )}

      {sideMenuOpen && (
        <div className="admin-menu-backdrop" role="presentation" onClick={() => setSideMenuOpen(false)}>
          <aside className="admin-side-menu" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="admin-menu-heading">
              <h2>Menu</h2>
              <button type="button" onClick={() => setSideMenuOpen(false)}>Close</button>
            </div>
            <section className="admin-menu-account">
              <p>Admin account</p>
              <strong>{adminSession?.user?.email || "Signed in"}</strong>
              <button type="button" onClick={handleMenuLogout} disabled={adminLogoutPending}>
                {adminLogoutPending ? "Signing out..." : "Logout"}
              </button>
            </section>
            <section>
              <h3>View Mode</h3>
              {[
                ["agenda", "Agenda View"],
                ["day", "Day View"],
                ["three-day", "3-Day View"],
                ["week", "Week View"],
                ["month", "Month View"],
                ["year", "Year View"],
              ].map(([id, label]) => (
                <button
                  type="button"
                  className={calendarMode === id ? "admin-menu-row active-menu-row" : "admin-menu-row"}
                  key={id}
                  onClick={() => {
                    openCalendarMode(id);
                    setSideMenuOpen(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </section>
            <section>
              <h3>My Calendars</h3>
              <label className="admin-toggle-row">
                <input
                  type="checkbox"
                  checked={calendarConnections.google}
                  onChange={(event) => setCalendarConnections((current) => ({ ...current, google: event.target.checked }))}
                />
                <span>Google Calendar</span>
              </label>
              <label className="admin-toggle-row">
                <input
                  type="checkbox"
                  checked={calendarConnections.microsoft}
                  onChange={(event) => setCalendarConnections((current) => ({ ...current, microsoft: event.target.checked }))}
                />
                <span>Microsoft Calendar</span>
              </label>
            </section>
            <section>
              <h3>Services</h3>
              <button type="button" className="admin-menu-row" onClick={() => { setActiveTab("services"); setSideMenuOpen(false); }}>
                Service list and booking links
              </button>
            </section>
            <section>
              <h3>Business</h3>
              <button type="button" className="admin-menu-row" onClick={() => { setActiveTab("analytics"); setSideMenuOpen(false); }}>
                Business Analytics
              </button>
            </section>
            <section>
              <h3>Settings</h3>
              <button type="button" className="admin-menu-row" onClick={() => openSettingsSection("admin-working-rules")}>
                Working rules
              </button>
              <button type="button" className="admin-menu-row" onClick={() => openSettingsSection("admin-service-areas")}>
                Service areas
              </button>
            </section>
            {import.meta.env.DEV && (
              <section>
                <h3>Development</h3>
                <button type="button" className="admin-menu-row danger-menu-row" onClick={onClearCalendarBookings}>
                  Clear calendar
                </button>
                <small className="admin-menu-note">Temporary helper for clearing test appointments.</small>
              </section>
            )}
          </aside>
        </div>
      )}

      <main className="admin-main-surface">
        {visibleAdminActionMessage && (
          <p className="admin-action-message" role="status">
            {visibleAdminActionMessage}
          </p>
        )}
        {activeTab === "calendar" && (
          <section className="admin-screen">
            {renderCalendarContent()}
          </section>
        )}

        {activeTab === "pending" && renderPendingVerificationView()}

        {activeTab === "customers" && (
          <section className={`admin-screen clients-screen ${clientProfileOpen ? "clients-profile-mode" : "clients-list-mode"}`}>
            <nav className="client-access-tabs" aria-label="Client management">
              {[['history', 'Booking history'], ['invitations', 'Invitations'], ['access', 'Client Access']].map(([id, label]) => (
                <button type="button" aria-current={clientDirectoryView === id ? 'page' : undefined} key={id} onClick={() => setClientDirectoryView(id)}>{label}</button>
              ))}
            </nav>
            {clientDirectoryView !== 'history' && <AdminClientAccessPanel key={clientDirectoryView} mode={clientDirectoryView} />}
            {clientDirectoryView === 'history' && !clientProfileOpen && (
              <AdminClientDirectoryPanel
                customerFilter={customerFilter}
                customerSearch={customerSearch}
                customerStats={customerStats}
                customers={filteredCustomers}
                onChangeFilter={setCustomerFilter}
                onChangeSearch={setCustomerSearch}
                onOpenCustomer={openCustomerProfile}
              />
            )}

            {clientDirectoryView === 'history' && clientProfileOpen && profileCustomer && (
              <AdminClientProfilePanel
                activeSection={activeClientProfileTab}
                customer={profileCustomer}
                deleteConfirmationDialog={pendingDeleteClient && (
                  <div className="appointment-leave-backdrop" role="presentation">
                    <section className="appointment-leave-dialog client-delete-confirm-dialog" role="alertdialog" aria-modal="true" aria-label="Confirm client deletion">
                      <h3>Delete this client?</h3>
                      <p>{pendingDeleteClient.name} will be removed from the client list.</p>
                      <div>
                        <button type="button" className="admin-danger-option" onClick={confirmDeleteClientProfile}>
                          Yes, delete
                        </button>
                        <button type="button" onClick={() => setPendingDeleteClient(null)}>
                          Cancel
                        </button>
                      </div>
                    </section>
                  </div>
                )}
                editDraft={clientProfileDraft}
                editOpen={clientProfileEditOpen}
                formatMoney={formatAdminMoney}
                noteSavedMessage={clientNoteSavedMessage}
                notesDraft={clientNoteDraft}
                onBack={() => setClientProfileOpen(false)}
                onBookCustomer={bookAppointmentForCustomer}
                onCancelEdit={() => setClientProfileEditOpen(false)}
                onChangeNotes={(value) => {
                  setClientNoteDraft(value);
                  setClientNoteSavedMessage("");
                }}
                onChangeProfileDraft={updateClientProfileDraft}
                onChangeSection={setClientProfileTab}
                onContactCustomer={openCustomerContact}
                onDeleteCustomer={setPendingDeleteClient}
                onDeleteNote={deleteClientProfileNote}
                onSaveNotes={saveClientProfileNote}
                onSaveProfile={saveClientProfileDetails}
                onStartAppointmentNote={startAppointmentNoteDraft}
                onToggleEdit={() => setClientProfileEditOpen((open) => !open)}
              />
            )}
          </section>
        )}

        {activeTab === "waitlist" && (
          <section className="admin-screen">
            {settingsReturnCategory && (
              <button type="button" className="settings-folder-back" onClick={returnToSettingsCategory}>
                <span aria-hidden="true">&lt;</span>
                Back to Settings
              </button>
            )}
            <WaitlistPanel
              waitlistEntries={waitlistEntries}
              days={days}
              services={services}
              displayDayName={displayDayName}
              getEffectiveWaitlistStatus={getEffectiveWaitlistStatus}
              slotMatchesWaitlistRequest={slotMatchesWaitlistRequest}
              onSendOffer={onSendWaitlistOffer}
              onCloseRequest={onCloseWaitlistRequest}
            />
          </section>
        )}

        {activeTab === "analytics" && (
          <AdminPanelErrorBoundary resetKey={`${activeTab}-${settingsReturnCategory || "root"}`}>
            {settingsReturnCategory && (
              <button type="button" className="settings-folder-back" onClick={returnToSettingsCategory}>
                <span aria-hidden="true">&lt;</span>
                Back to Settings
              </button>
            )}
            <BusinessAnalyticsDashboard
              days={days}
              expenseCategories={EXPENSE_CATEGORIES}
              expenses={expenses}
              financialSettings={financialSettings}
              onAddExpense={onAddExpense}
              onDeleteExpense={onDeleteExpense}
              onUpdateExpense={onUpdateExpense}
              serviceDetails={serviceDetails}
              services={services}
              settings={settings}
            />
          </AdminPanelErrorBoundary>
        )}

        {activeTab === "settings" && (
          <SettingsFolderNavigator
            activeCategory={activeSettingsCategory}
            categories={SETTINGS_NAVIGATION}
            renderCurrentSettingsContent={() => (
              <>
            <div className="admin-settings-section weekly-working-schedule" id="admin-working-rules">
              <div className="admin-screen-heading compact-settings-heading">
                <div>
                  <p>Working Hours</p>
                  <h2>Weekly working schedule</h2>
                  <small>Set your availability and scheduling rules for each day.</small>
                </div>
                <div className="weekly-working-heading-actions">
                  <button
                    type="button"
                    className="admin-primary-action"
                    disabled={!workingRulesDirty || weeklyWorkingSaving}
                    onClick={saveWorkingRules}
                  >
                    {workingScheduleSaveLabel()}
                  </button>
                </div>
              </div>

              <div className="weekly-working-list">
                {WEEKLY_WORKING_DAY_KEYS.map((dayKey) => {
                  const daySettings = normalizedWeeklyWorkingDraft[dayKey];
                  const isExpanded = expandedWorkingDayKey === dayKey;
                  const isWorking = !daySettings.unavailable;
                  const dayName = WEEKLY_WORKING_DAY_LABELS[dayKey];
                  const hoursLabel = isWorking ? `${daySettings.workingStart}-${daySettings.workingEnd}` : "Not working";
                  return (
                    <article className={isExpanded ? "weekly-working-day expanded" : "weekly-working-day"} key={dayKey}>
                      <div
                        className="weekly-working-summary"
                        aria-expanded={isExpanded}
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpandedWorkingDayKey((currentDayKey) => (currentDayKey === dayKey ? "" : dayKey))}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          setExpandedWorkingDayKey((currentDayKey) => (currentDayKey === dayKey ? "" : dayKey));
                        }}
                      >
                        <strong>{dayName}</strong>
                        <label
                          className="weekly-working-toggle-control"
                          aria-label={`${isWorking ? "Turn off" : "Turn on"} ${dayName}`}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isWorking}
                            onChange={(event) => updateWorkingDayDraft(dayKey, { unavailable: !event.target.checked })}
                          />
                          <span className={isWorking ? "weekly-working-toggle is-on" : "weekly-working-toggle"} aria-hidden="true" />
                        </label>
                        <span className={isWorking ? "weekly-working-status is-on" : "weekly-working-status"}>{isWorking ? "On" : "Off"}</span>
                        <span className="weekly-working-hours">{hoursLabel}</span>
                        <span className="weekly-working-chevron" aria-hidden="true">{isExpanded ? "^" : ">"}</span>
                      </div>

                      {isExpanded && (
                        <div className="weekly-working-details">
                          <label className="weekly-working-switch-row">
                            <span>Working this day</span>
                            <input
                              type="checkbox"
                              checked={isWorking}
                              onChange={(event) => updateWorkingDayDraft(dayKey, { unavailable: !event.target.checked })}
                            />
                          </label>

                          <div className="weekly-working-field-row">
                            <span>Working hours</span>
                            <label>
                              <span>Start</span>
                              <input
                                type="time"
                                disabled={!isWorking}
                                value={daySettings.workingStart}
                                onClick={openWorkingTimePicker}
                                onChange={(event) => updateWorkingDayDraft(dayKey, { workingStart: event.target.value })}
                              />
                            </label>
                            <label>
                              <span>End</span>
                              <input
                                type="time"
                                disabled={!isWorking}
                                value={daySettings.workingEnd}
                                onClick={openWorkingTimePicker}
                                onChange={(event) => updateWorkingDayDraft(dayKey, { workingEnd: event.target.value })}
                              />
                            </label>
                          </div>

                          {isWorking && (
                            <>
                              <label className="weekly-working-select-row">
                                <span>Scheduling mode</span>
                                <select value={daySettings.mode} onChange={(event) => updateWorkingDayDraft(dayKey, { mode: event.target.value })}>
                                  <option value="optimized">Optimized</option>
                                  <option value="flexible">Flexible</option>
                                </select>
                              </label>

                              <label className="weekly-working-select-row">
                                <span>Start-of-day rule</span>
                                <select value={daySettings.startMode} onChange={(event) => updateWorkingDayDraft(dayKey, { startMode: event.target.value })}>
                                  <option value="flexible">Flexible start</option>
                                  <option value="fixed">Preferred first appointment</option>
                                </select>
                              </label>

                              {daySettings.startMode === "fixed" && (
                                <label className="weekly-working-select-row">
                                  <span>Preferred first appointment</span>
                                  <input
                                    type="time"
                                    value={daySettings.fixedStart}
                                    onClick={openWorkingTimePicker}
                                    onChange={(event) => updateWorkingDayDraft(dayKey, { fixedStart: event.target.value })}
                                  />
                                </label>
                              )}

                              <label className="weekly-working-switch-row">
                                <span>Open more times automatically</span>
                                <input
                                  type="checkbox"
                                  checked={Boolean(daySettings.anchorReleaseEnabled)}
                                  onChange={(event) => updateWorkingDayDraft(dayKey, { anchorReleaseEnabled: event.target.checked })}
                                />
                              </label>

                              {daySettings.anchorReleaseEnabled && (
                                <label className="weekly-working-select-row">
                                  <span>Open more times at</span>
                                  <input
                                    type="time"
                                    value={daySettings.releaseTime}
                                    onClick={openWorkingTimePicker}
                                    onChange={(event) => updateWorkingDayDraft(dayKey, { releaseTime: event.target.value })}
                                  />
                                  <small>If the preferred start remains unbooked, additional valid appointment times become available at this time.</small>
                                </label>
                              )}
                            </>
                          )}

                          <div className="weekly-working-copy-panel">
                            <p>Copy {dayName} to...</p>
                            <div className="weekly-working-copy-options">
                              {WEEKLY_WORKING_DAY_KEYS.filter((targetKey) => targetKey !== dayKey).map((targetKey) => (
                                <label key={targetKey}>
                                  <input
                                    type="checkbox"
                                    checked={copyWorkingDayTargets.includes(targetKey)}
                                    onChange={() => toggleCopyWorkingDayTarget(targetKey)}
                                  />
                                  <span>{WEEKLY_WORKING_DAY_LABELS[targetKey]}</span>
                                </label>
                              ))}
                            </div>
                            <button type="button" className="admin-secondary-action" onClick={copyExpandedWorkingDayToTargets}>
                              Copy settings
                            </button>
                          </div>

                          <div className="weekly-working-day-actions">
                            <button type="button" className="admin-secondary-action" onClick={applyExpandedHoursToWorkingDays}>
                              Apply {dayName}'s hours to all working days
                            </button>
                            <button type="button" className="admin-danger-option" onClick={resetExpandedWorkingDay}>
                              Reset {dayName}
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>

              {weeklyWorkingError && <p className="weekly-working-message error" role="alert">{weeklyWorkingError}</p>}
              {!weeklyWorkingError && (
                <p className={workingScheduleStatusClassName()} role="status">
                  {workingScheduleStatusMessage()}
                </p>
              )}

              <div className="weekly-working-footer">
                <button
                  type="button"
                  className="admin-primary-action"
                  disabled={!workingRulesDirty || weeklyWorkingSaving}
                  onClick={saveWorkingRules}
                >
                  {workingScheduleSaveLabel()}
                </button>
                <button type="button" className="admin-danger-option" onClick={resetEntireWorkingSchedule}>
                  Reset entire weekly schedule
                </button>
              </div>
            </div>
            <EnhancementsSettingsPanel
              enhancements={enhancements}
              saveStatus={enhancementSaveStatus}
              onAddEnhancement={onAddEnhancement}
              onDeleteEnhancement={onDeleteEnhancement}
              onUpdateEnhancement={onUpdateEnhancement}
            />
            <ServiceAreasSettingsPanel
              serviceAreas={serviceAreas}
              onAddServiceArea={onAddServiceArea}
              onDeleteServiceArea={onDeleteServiceArea}
              onUpdateServiceArea={onUpdateServiceArea}
            />
            <div className="admin-settings-section telegram-settings-section" id="admin-telegram-settings">
              <div className="admin-screen-heading compact-settings-heading">
                <div>
                  <p>Client updates</p>
                  <h2>Telegram notifications</h2>
                </div>
                <button
                  type="button"
                  className="admin-primary-action"
                  disabled={telegramTestStatus.sending}
                  onClick={sendTelegramTestFromSettings}
                >
                  {telegramTestStatus.sending ? "Sending..." : "Send test"}
                </button>
              </div>
              <p className="admin-muted-note">
                Send a private test message to the Telegram chat saved in Vercel. The client must start the bot before it can message them.
              </p>
              {telegramTestStatus.message && (
                <p className={`telegram-test-status ${telegramTestStatus.type || "info"}`} role="status">
                  {telegramTestStatus.message}
                </p>
              )}
            </div>
              </>
            )}
            renderSubsectionContent={renderSettingsSubsectionContent}
            selectedCategoryId={selectedSettingsCategory}
            selectedSubsection={selectedSettingsSubsection}
            settingsReturnCategory={settingsReturnCategory}
            onBackFromCategory={() => setSelectedSettingsCategory(null)}
            onBackFromCurrentSettings={() => {
              if (settingsReturnCategory) {
                returnToSettingsCategory();
                return;
              }
              setSelectedSettingsCategory(null);
            }}
            onBackFromSubsection={() => setSelectedSettingsSubsection(null)}
            onOpenCategory={(categoryId) => {
              setSettingsReturnCategory(null);
              setSelectedSettingsCategory(categoryId);
              setSelectedSettingsSubsection(null);
            }}
            onOpenCurrentSettings={() => {
              setSettingsReturnCategory(null);
              setSelectedSettingsCategory("current");
              setSelectedSettingsSubsection(null);
            }}
            onOpenSessionPreferences={() => {
              setSettingsReturnCategory(null);
              setSelectedSettingsCategory("services");
              setSelectedSettingsSubsection("Session Preferences");
            }}
            onOpenSubsection={(section) => openSettingsSubsection(section)}
          />
        )}

        {activeTab === "services" && (
          <AdminServicesPanel
            editingServiceId={editingServiceId}
            renderServiceEditor={(service) => serviceEditorDraft && (
              <AdminServiceEditorPanel
                durationOptions={CLIENT_DURATION_OPTIONS}
                imagePreviewComponent={ServiceImagePreview}
                service={service}
                serviceEditorDirty={serviceEditorDirty}
                serviceEditorDraft={serviceEditorDraft}
                serviceEditorError={serviceEditorError}
                serviceEditorSaving={serviceEditorSaving}
                onApplyPricingToAll={applyServiceDraftPricingToAll}
                onCancel={cancelServiceEditor}
                onChangeDraft={updateServiceEditorDraft}
                onChangePrice={updateServiceEditorPrice}
                onCopyBookingLink={copyServiceBookingLink}
                onDelete={(serviceToDelete) => {
                  onDeleteService(serviceToDelete.id);
                  setEditingServiceId(null);
                  setServiceEditorDraft(null);
                }}
                onSave={saveServiceEditor}
                onToggleVisibility={onServiceVisibilityChange}
              />
            )}
            serviceSearch={serviceSearch}
            services={filteredServices}
            settingsReturnCategory={settingsReturnCategory}
            onAddService={createServiceOffering}
            onBackToSettings={() => {
              if (!confirmDiscardServiceChanges()) return;
              returnToSettingsCategory();
            }}
            onChangeSearch={setServiceSearch}
            onToggleEditor={openServiceEditor}
            onToggleVisibility={onServiceVisibilityChange}
          />
        )}
      </main>

      {activeTab !== "analytics" && activeTab !== "waitlist" && activeTab !== "pending" && (
        <button
          type="button"
          aria-label={activeTab === "customers" ? "Add client" : "Add appointment"}
          className="admin-fab"
          title={activeTab === "customers" ? "Add client" : "Add appointment"}
          onClick={activeTab === "customers" ? openClientCreateWizard : openAppointmentWizard}
        >
          +
        </button>
      )}

      <AdminPersonalEventModal
        model={personalEventModalModel}
        open={personalEventOpen}
        onCancel={() => setPersonalEventOpen(false)}
        onChangeColor={setPersonalEventColor}
        onChangeEndDate={setPersonalEventEndDate}
        onChangeEndTime={setPersonalEventEndTime}
        onChangeStartDate={changePersonalEventStartDate}
        onChangeStartTime={setPersonalEventStartTime}
        onChangeTitle={setPersonalEventTitle}
        onSubmit={createPersonalEventFromModal}
      />

      <AdminAppointmentWizard
        error=""
        leaveConfirmationOpen={appointmentLeavePromptOpen}
        model={appointmentWizardModel}
        open={appointmentWizardOpen}
        step={appointmentStep}
        submitting={false}
        values={appointmentWizardValues}
        onBack={goBackFromAppointmentWizard}
        onCancelLeave={saveAndCloseAppointmentWizard}
        onChangeCustomerSearch={setAppointmentCustomerSearch}
        onChangeNewCustomerField={updateAppointmentNewCustomer}
        onChangeServiceDuration={addAppointmentWizardServiceDuration}
        onConfirmLeave={closeAppointmentWizard}
        onEditReviewSection={editAppointmentReviewSection}
        onNext={goNextFromAppointmentWizard}
        onOpenPersonalEvent={openPersonalEventFromAppointmentWizard}
        onRemoveService={removeAppointmentWizardService}
        onSelectCustomer={selectAppointmentWizardCustomer}
        onSelectDate={selectAppointmentWizardDay}
        onSelectSlot={selectAppointmentWizardSlot}
        onShiftWeek={shiftAppointmentWizardWeek}
        onSubmit={createAppointmentFromWizard}
        onSubmitNewCustomer={saveAppointmentNewCustomer}
        onToggleNewCustomer={() => setAppointmentAddCustomerOpen((open) => !open)}
        onToggleService={toggleAppointmentWizardService}
        onUnlockDate={unlockAppointmentWizardDate}
      />

      <AdminDeleteConfirmationDialog
        model={deleteConfirmationModel}
        target={pendingDeleteBooking}
        onCancel={cancelDeleteConfirmation}
        onConfirm={confirmDeleteBooking}
      />

      <AdminAppointmentOverviewModal
        activeTab={overviewTab}
        booking={overviewBooking}
        defaultPersonalEventColor={DEFAULT_PERSONAL_EVENT_COLOR}
        editing={overviewEditing}
        model={overviewModel}
        moreOpen={overviewMoreOpen}
        personalEventColors={PERSONAL_EVENT_COLORS}
        updatePending={overviewUpdatePending}
        visibleMessage={visibleAdminActionMessage}
        onApproveCashRequest={() => updateOverviewBooking({ paymentStatus: "cash_on_arrival", status: "confirmed" })}
        onChangeClientName={(value) => updateOverviewBooking({ clientName: value })}
        onChangeEventColor={(value) => updateOverviewBooking({ eventColor: value })}
        onChangeLocation={(value) => updateOverviewBooking({ address: value })}
        onChangePaymentMethod={(value) => updateOverviewBooking({ paymentMethod: value })}
        onChangePaymentStatus={(value) => updateOverviewBooking({ paymentStatus: value })}
        onChangePersonalEndTime={changeOverviewPersonalEndTime}
        onChangeStartTime={(value) => updateOverviewBooking({ start: value })}
        onChangeTravelBuffer={(value) => updateOverviewBooking({ travelBuffer: value })}
        onClose={() => setOverviewBooking(null)}
        onDuplicate={duplicateOverviewBooking}
        onMarkPaymentReceived={() => updateOverviewBooking({ paymentStatus: "paid", status: "confirmed" })}
        onRejectCashRequest={() => updateOverviewBooking({ paymentStatus: "cancelled", status: "cancelled" })}
        onRequestDelete={requestOverviewDelete}
        onSetTab={setOverviewTab}
        onShare={shareOverviewBooking}
        onToggleEditing={() => setOverviewEditing((current) => !current)}
        onToggleMoreOpen={() => setOverviewMoreOpen((current) => !current)}
      />

      <AdminDaySettingsSheet
        model={daySettingsSheetModel}
        open={Boolean(daySettingsSheet)}
        scheduleModeDraft={dayScheduleModeDraft}
        workingHoursDraft={dayWorkingHoursDraft}
        onChangeScheduleMode={changeDayScheduleModeDraft}
        onChangeWorkingHours={changeDayWorkingHoursDraft}
        onClose={closeDaySettingsSheet}
        onSaveScheduleMode={saveDayScheduleModeSheet}
        onSaveWorkingHours={saveDayWorkingHoursSheet}
        onToggleUnavailable={toggleDayUnavailable}
        onUseWeeklySchedule={useWeeklyScheduleForOpenDay}
      />

      <nav className="admin-bottom-nav" aria-label="Primary admin navigation">
        {ADMIN_TABS.map((tab) => {
          const TabIcon = tab.Icon;
          const pendingCount = tab.id === "pending" ? pendingVerificationBookings.length : 0;

          return (
            <button
              type="button"
              className={activeTab === tab.id ? "active-admin-tab" : ""}
              key={tab.id}
              onClick={() => {
                if (tab.id === "calendar") {
                  openCalendarMode(calendarMode);
                } else {
                  setActiveTab(tab.id);
                }
                setSettingsReturnCategory(null);
                if (tab.id === "settings") {
                  setSelectedSettingsCategory(null);
                  setSelectedSettingsSubsection(null);
                }
              }}
            >
              <TabIcon aria-hidden="true" size={22} strokeWidth={2.2} />
              <span>{tab.label}</span>
              {pendingCount > 0 && (
                <em className="admin-nav-count" aria-label={`${pendingCount} pending booking${pendingCount === 1 ? "" : "s"}`}>
                  {pendingCount > 99 ? "99+" : pendingCount}
                </em>
              )}
            </button>
          );
        })}
      </nav>
    </section>
  );
}
