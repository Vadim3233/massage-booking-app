import { createClient } from "@supabase/supabase-js";
import { telegramStartPayloadFromMessageText } from "../src/lib/telegramLinks.js";
import { sendTelegramMessage } from "./telegramProvider.js";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getSupabaseServerClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing for Telegram linking.");
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export function hasValidTelegramWebhookSecret(request) {
  const expectedSecret = cleanText(process.env.TELEGRAM_WEBHOOK_SECRET);
  if (!expectedSecret) return process.env.NODE_ENV !== "production";
  return request.headers["x-telegram-bot-api-secret-token"] === expectedSecret;
}

export function parseTelegramStartUpdate(update = {}) {
  const message = update.message || update.edited_message || {};
  const chat = message.chat || {};
  const from = message.from || {};
  const startPayload = telegramStartPayloadFromMessageText(message.text);

  if (!startPayload || !chat.id) {
    return null;
  }

  return {
    startPayload,
    kind: /^acct_[A-Za-z0-9_-]{43}$/.test(startPayload) ? "account_activation" : "booking_reference",
    chatId: String(chat.id),
    chatType: cleanText(chat.type),
    firstName: cleanText(from.first_name || chat.first_name),
    lastName: cleanText(from.last_name || chat.last_name),
    telegramUserId: from.id ? String(from.id) : "",
    username: cleanText(from.username || chat.username),
  };
}

export async function linkTelegramStartUpdate(update, { supabase = null, sendMessage = sendTelegramMessage } = {}) {
  const parsed = parseTelegramStartUpdate(update);
  if (!parsed) {
    return { ignored: true, linked: false, reason: "not_a_booking_start" };
  }

  const client = supabase || getSupabaseServerClient();
  const accountActivation = parsed.kind === "account_activation";
  const { data, error } = await client.rpc(accountActivation ? "consume_client_telegram_activation" : "link_telegram_chat_to_booking", {
    [accountActivation ? "activation_payload" : "link_payload"]: {
      ...(accountActivation ? { token: parsed.startPayload } : { booking_reference: parsed.startPayload }),
      chat_id: parsed.chatId,
      chat_type: parsed.chatType,
      first_name: parsed.firstName,
      last_name: parsed.lastName,
      telegram_user_id: parsed.telegramUserId,
      username: parsed.username,
    },
  });

  if (error || (accountActivation && data?.linked !== true)) {
    await sendMessage({ chatId: parsed.chatId, text: "This activation link is no longer available. Please ask for a new link." });
    return { linked: false, reason: "invalid_or_expired_start" };
  }

  await sendMessage({
    chatId: parsed.chatId,
    text: [
      accountActivation ? "Telegram is now connected to your client account." : "Telegram updates are connected.",
      accountActivation ? null : `Booking reference: ${parsed.startPayload}`,
      "I will still use email as the main confirmation and reminder channel.",
    ].filter(Boolean).join("\n"),
  });

  return {
    bookingId: data?.booking_id || "",
    bookingReference: accountActivation ? "" : parsed.startPayload,
    chatId: parsed.chatId,
    linked: true,
  };
}
