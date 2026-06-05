const TELEGRAM_API_BASE = "https://api.telegram.org";

function getTelegramConfig() {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    testChatId: process.env.TELEGRAM_TEST_CHAT_ID,
  };
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
    throw new Error(payload.description || `Telegram send failed with status ${response.status}`);
  }

  return {
    chatId: safeChatId,
    messageId: payload.result?.message_id,
    sent: true,
  };
}

export async function sendTelegramTestMessage() {
  const { testChatId } = getTelegramConfig();
  return sendTelegramMessage({
    chatId: testChatId,
    text: "Test message from Vad Massage booking app.",
  });
}
