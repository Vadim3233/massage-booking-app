import { hasValidTelegramWebhookSecret, linkTelegramStartUpdate } from "../server/telegramWebhook.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed", linked: false });
    return;
  }

  if (!hasValidTelegramWebhookSecret(request)) {
    response.status(403).json({ error: "Forbidden", linked: false });
    return;
  }

  try {
    const result = await linkTelegramStartUpdate(request.body || {});
    response.status(200).json(result);
  } catch (error) {
    console.error("Telegram webhook failed", {
      name: error instanceof Error ? error.name : "Error",
    });
    response.status(200).json({ linked: false, reason: "start_unavailable" });
  }
}
