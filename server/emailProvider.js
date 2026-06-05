import { emailTemplates } from "./emailTemplates.js";

const PROVIDERS = new Set(["resend", "sendgrid"]);

function readEmailConfig() {
  const provider = (process.env.EMAIL_PROVIDER || "resend").toLowerCase();

  return {
    provider: PROVIDERS.has(provider) ? provider : "resend",
    replyToEmail: process.env.REPLY_TO_EMAIL || process.env.SENDER_REPLY_TO || "bookings@vadmassage.com",
    resendApiKey: process.env.RESEND_API_KEY,
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    senderEmail: process.env.SENDER_EMAIL || "bookings@mydomain.com",
  };
}

function templateFor(type) {
  const template = emailTemplates[type];
  if (!template) {
    throw new Error(`Unknown email template: ${type}`);
  }

  return template;
}

async function sendWithResend({ apiKey, from, html, replyTo, subject, text, to }) {
  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({ from, html, reply_to: replyTo, subject, text, to }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `Resend email failed with status ${response.status}`);
  }

  return payload;
}

async function sendWithSendGrid({ apiKey, from, html, replyTo, subject, text, to }) {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    body: JSON.stringify({
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html },
      ],
      from: { email: from },
      personalizations: [{ to: [{ email: to }] }],
      reply_to: replyTo ? { email: replyTo } : undefined,
      subject,
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `SendGrid email failed with status ${response.status}`);
  }

  return { id: response.headers.get("x-message-id") };
}

export async function sendTransactionalEmail({ payload = {}, to, type }) {
  const config = readEmailConfig();
  const template = templateFor(type)(payload);

  if (!to || !String(to).includes("@")) {
    return { sent: false, skipped: true, reason: "missing_recipient", template: type };
  }

  if (config.provider === "sendgrid") {
    if (!config.sendgridApiKey) {
      return { sent: false, skipped: true, reason: "missing_sendgrid_api_key", template: type };
    }

    const result = await sendWithSendGrid({
      apiKey: config.sendgridApiKey,
      from: config.senderEmail,
      replyTo: config.replyToEmail,
      to,
      ...template,
    });

    return { provider: "sendgrid", result, sent: true, template: type };
  }

  if (!config.resendApiKey) {
    return { sent: false, skipped: true, reason: "missing_resend_api_key", template: type };
  }

  const result = await sendWithResend({
    apiKey: config.resendApiKey,
    from: config.senderEmail,
    replyTo: config.replyToEmail,
    to,
    ...template,
  });

  return { provider: "resend", result, sent: true, template: type };
}
