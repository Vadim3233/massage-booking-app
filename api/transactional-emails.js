import { sendTransactionalEmail } from "../server/emailProvider.js";

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
}

function normalizeBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

export default async function handler(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed", sent: false });
    return;
  }

  try {
    const result = await sendTransactionalEmail(normalizeBody(request.body));
    response.status(200).json(result);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to send transactional email",
      sent: false,
    });
  }
}
