function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeTelegramBotUrl(value) {
  const rawValue = cleanText(value);
  if (!rawValue) return "";

  try {
    const url = new URL(rawValue);
    const host = url.hostname.toLowerCase();
    if (!["t.me", "telegram.me", "telegram.dog"].includes(host)) return rawValue;
    url.pathname = url.pathname.replace(/^\/@/, "/");
    return url.toString();
  } catch {
    return rawValue;
  }
}

export function telegramStartPayloadFromBookingReference(bookingReference) {
  return cleanText(bookingReference)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 64);
}

export function buildTelegramStartUrl(botUrl, bookingReference) {
  const normalizedBotUrl = normalizeTelegramBotUrl(botUrl);
  const startPayload = telegramStartPayloadFromBookingReference(bookingReference);
  if (!normalizedBotUrl || !startPayload) return normalizedBotUrl;

  try {
    const url = new URL(normalizedBotUrl);
    url.searchParams.set("start", startPayload);
    return url.toString();
  } catch {
    return normalizedBotUrl;
  }
}

export function telegramStartPayloadFromMessageText(text) {
  const match = cleanText(text).match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{1,64}))?$/);
  return match?.[1] || "";
}
