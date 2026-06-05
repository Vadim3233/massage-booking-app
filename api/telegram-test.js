import { sendTelegramTestMessage } from "../server/telegramProvider.js";

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Origin", "*");
}

export default async function handler(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (!["GET", "POST"].includes(request.method)) {
    response.status(405).json({ error: "Method not allowed", sent: false });
    return;
  }

  try {
    const result = await sendTelegramTestMessage();
    response.status(200).json(result);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to send Telegram test message",
      sent: false,
    });
  }
}
