const TELEGRAM_API_BASE = "https://api.telegram.org";

export const TELEGRAM_EVENT_TYPES = new Set([
  "booking_created",
  "booking_cancelled",
  "booking_modified",
  "payment_status",
  "waitlist_request",
  "test",
]);

function getTelegramConfig() {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    testChatId: process.env.TELEGRAM_TEST_CHAT_ID,
  };
}

function compact(value, fallback = "Not provided") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return `£${amount.toFixed(2)}`;
}

function friendlyPaymentStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "awaiting_verification" || s === "bank transfer pending" || s === "pending") return "Awaiting Payment Verification";
  if (s === "pending_payment_verification") return "Awaiting Payment Verification";
  if (s === "alternative_requested" || s === "payment_method_review") return "Alternative payment request under review";
  if (s === "cash_on_arrival") return "Cash on arrival pending approval";
  if (s === "paid") return "Paid";
  if (s === "cancelled") return "Cancelled";
  return String(status || "Not provided");
}

function formatDateTime(value) {
  if (!value) return "-";
  try {
    const d = new Date(value);
    return isNaN(d.getTime()) ? String(value) : d.toLocaleString();
  } catch {
    return String(value);
  }
}

function formatLine(label, value) {
  return `${label}: ${compact(value)}`;
}

function formatFee(label, value) {
  const amount = Number(value || 0);
  if (!amount) return null;
  return `${label}: ${formatMoney(amount)}`;
}

function joinLines(lines) {
  return lines.filter(Boolean).join("\n");
}

function bookingTime(booking = {}) {
  const start = compact(booking.start || booking.startTime || booking.timeStart, "Time not set");
  const end = compact(booking.end || booking.endTime || booking.timeEnd, "End not set");
  return `${start}-${end}`;
}

function bookingTitle(booking = {}) {
  return compact(booking.serviceName || booking.service || booking.items?.[0]?.name, "Treatment");
}

function adminChatId() {
  return getTelegramConfig().testChatId;
}

export function isAllowedTelegramEventType(type) {
  return TELEGRAM_EVENT_TYPES.has(String(type || ""));
}

export async function sendTelegramMessage({ chatId, text }) {
  const { botToken } = getTelegramConfig();
  const safeText = String(text ?? "").trim();
  const safeChatId = String(chatId ?? "").trim();

  if (!botToken) {
    return { reason: "missing_telegram_bot_token", sent: false, skipped: true };
  }

  if (!safeChatId) {
    return { reason: "missing_telegram_chat_id", sent: false, skipped: true };
  }

  if (!safeText) {
    throw new Error("Telegram message text is required.");
  }

  const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`, {
    body: JSON.stringify({
      chat_id: safeChatId,
      disable_web_page_preview: true,
      text: safeText,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    const detail = payload.description || `Telegram send failed with status ${response.status}`;
    console.error("Telegram API error", {
      description: payload.description,
      errorCode: payload.error_code,
      status: response.status,
    });
    throw new Error(detail);
  }

  console.info("Telegram message sent", {
    chatId: safeChatId,
    messageId: payload.result?.message_id,
  });

  return {
    chatId: safeChatId,
    messageId: payload.result?.message_id,
    sent: true,
  };
}

export function buildAdminTelegramMessage(type, payload = {}) {
  const booking = payload.booking || payload;

  if (type === "booking_created") {
    return joinLines([
      "🔔 New Booking Request",
      "",
      formatLine("Reference", booking.bookingReference || payload.bookingReference || booking.id || payload.bookingId),
      formatLine("Client", booking.clientName || payload.clientName),
      formatLine("Service", bookingTitle(booking)),
      formatLine("Duration", `${Number(booking.duration || booking.durationMinutes || 0)} min`),
      formatLine("Date", booking.dateValue || booking.date || payload.date),
      formatLine("Time", bookingTime(booking)),
      formatLine("Amount Due", formatMoney(booking.price || booking.total || payload.total)),
      formatLine("Payment Method", (booking.paymentMethod || payload.paymentMethod || "Bank Transfer")),
      formatLine("Payment Status", friendlyPaymentStatus(booking.paymentStatus || payload.paymentStatus)),
      formatLine("Reservation Expires", formatDateTime(booking.paymentHoldExpiresAt || payload.paymentHoldExpiresAt)),
      formatLine("Booking ID", booking.id || payload.bookingId),
      booking.orderId ? formatLine("Order ID", booking.orderId) : null,
    ]);
  }

  if (type === "booking_cancelled") {
    return joinLines([
      "❌ Booking Cancelled",
      "",
      formatLine("Client", booking.clientName || payload.clientName),
      formatLine("Original date", booking.dateValue || booking.date || payload.date),
      formatLine("Original time", bookingTime(booking)),
      formatLine("Service", bookingTitle(booking)),
      formatLine("Cancellation", payload.cancellationStatus || booking.status || "cancelled"),
      formatLine("Refund", payload.refundStatus || "Not processed"),
      formatLine("Booking ID", booking.id || payload.bookingId),
    ]);
  }

  if (type === "booking_modified") {
    return joinLines([
      "✏️ Booking Modified",
      "",
      formatLine("Client", payload.clientName || payload.newBooking?.clientName || payload.oldBooking?.clientName),
      "",
      "Old:",
      formatLine("Service", bookingTitle(payload.oldBooking)),
      formatLine("Date", payload.oldBooking?.dateValue || payload.oldBooking?.date),
      formatLine("Time", bookingTime(payload.oldBooking)),
      formatLine("Address", payload.oldBooking?.address),
      "",
      "New:",
      formatLine("Service", bookingTitle(payload.newBooking)),
      formatLine("Date", payload.newBooking?.dateValue || payload.newBooking?.date),
      formatLine("Time", bookingTime(payload.newBooking)),
      formatLine("Address", payload.newBooking?.address),
      formatLine("Booking ID", payload.bookingId || payload.newBooking?.id || payload.oldBooking?.id),
    ]);
  }

  if (type === "payment_status") {
    return joinLines([
      "💳 Payment Update",
      "",
      formatLine("Reference", booking.bookingReference || payload.bookingReference || booking.id || payload.bookingId),
      formatLine("Client", booking.clientName || payload.clientName),
      formatLine("Amount", formatMoney(payload.amount || booking.price || booking.total)),
      formatLine("Payment Status", friendlyPaymentStatus(payload.status || booking.paymentStatus)),
      formatLine("Method", (payload.paymentMethod || booking.paymentMethod || "Not provided")),
      formatLine("Reservation Expires", formatDateTime(booking.paymentHoldExpiresAt || payload.paymentHoldExpiresAt)),
    ]);
  }

  if (type === "waitlist_request") {
    return joinLines([
      "🕒 Waitlist Request",
      "",
      formatLine("Client", payload.clientName),
      formatLine("Preferred date", payload.preferredDate),
      formatLine("Preferred window", payload.preferredWindow),
      formatLine("Duration", `${Number(payload.duration || 0)} min`),
      formatLine("Area", payload.area || payload.location),
      formatLine("Flexibility", `${Number(payload.flexibility || 0)} min`),
      formatLine("Phone", payload.phone),
      formatLine("Email", payload.email),
      formatLine("Request ID", payload.id || payload.requestId),
    ]);
  }

  if (type === "test") {
    return "✅ Telegram notification test successful";
  }

  return joinLines([
    "ℹ️ Booking App Notification",
    "",
    formatLine("Type", type),
    formatLine("Details", JSON.stringify(payload)),
  ]);
}

export async function sendAdminTelegramNotification({ type, payload = {} }) {
  if (!isAllowedTelegramEventType(type)) {
    throw new Error(`Unsupported Telegram notification type: ${type}`);
  }

  const text = buildAdminTelegramMessage(type, payload);
  return sendTelegramMessage({
    chatId: adminChatId(),
    text,
  });
}

export { friendlyPaymentStatus, formatDateTime };

export async function sendTelegramTestMessage() {
  return sendAdminTelegramNotification({ type: "test" });
}
