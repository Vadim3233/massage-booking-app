export default function handler(_request, response) {
  response.status(200).json({
    ok: true,
    provider: process.env.EMAIL_PROVIDER || "resend",
    replyToEmail: process.env.REPLY_TO_EMAIL || process.env.SENDER_REPLY_TO || "bookings@vadmassage.com",
    senderEmail: process.env.SENDER_EMAIL || "bookings@mydomain.com",
  });
}
