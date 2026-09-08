function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeTelegramBotUrl(value) {
  const rawValue = cleanText(value);
  if (!rawValue) return "";

  try {
    const url = new URL(rawValue);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !["t.me", "telegram.me", "telegram.dog"].includes(host) || url.username || url.password || url.port) return "";
    url.pathname = url.pathname.replace(/^\/@/, "/");
    if (!/^\/[A-Za-z0-9_]{5,32}\/?$/.test(url.pathname)) return "";
    return url.toString();
  } catch {
    return "";
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

export function buildTelegramActivationUrl(botUrl, token) {
  const normalizedBotUrl = normalizeTelegramBotUrl(botUrl);
  const activationToken = cleanText(token);
  if (!normalizedBotUrl || !/^acct_[A-Za-z0-9_-]{43}$/.test(activationToken)) return "";
  const url = new URL(normalizedBotUrl);
  url.searchParams.set("start", activationToken);
  return url.toString();
}

export function telegramStartPayloadFromMessageText(text) {
  const match = cleanText(text).match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{1,64}))?$/);
  return match?.[1] || "";
}
