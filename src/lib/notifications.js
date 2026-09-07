export async function postTransactionalEmail(emailRequest) {
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

export async function postTelegramNotification(type, payload = {}) {
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

export function notifyAdminTelegram(type, payload = {}) {
  postTelegramNotification(type, payload).catch((error) => {
    console.warn(`Telegram notification failed for ${type}`, error);
  });
}

export async function postTelegramTest() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
  const endpoints = apiBaseUrl
    ? [`${apiBaseUrl.replace(/\/$/, "")}/api/telegram-test`]
    : ["/api/telegram-test", "http://127.0.0.1:8787/api/telegram-test"];

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

export function telegramTestErrorMessage(error) {
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
