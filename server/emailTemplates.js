const currencyFormatter = new Intl.NumberFormat("en-GB", {
  currency: "GBP",
  style: "currency",
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function renderLineItems(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return "<li>No line items supplied.</li>";
  }

  return items
    .map((item) => {
      const detail = item.minutes ? `${item.minutes} minutes` : formatMoney(item.price);
      return `<li><strong>${escapeHtml(item.name)}</strong> <span>${escapeHtml(detail)}</span></li>`;
    })
    .join("");
}

function buildChangeRequestUrl(payload = {}) {
  const customerName = payload.customer?.name || "";
  const subject = encodeURIComponent(`Change or cancel booking - ${payload.date || ""} ${payload.time || ""}`.trim());
  const body = encodeURIComponent(
    [
      "Hello,",
      "",
      "I would like to change or cancel my booking.",
      "",
      `Name: ${customerName}`,
      `Date: ${payload.date || ""}`,
      `Time: ${payload.time || ""}`,
      `Location: ${payload.location || ""}`,
      "",
      "Requested change:",
    ].join("\n"),
  );

  return `mailto:bookings@vadmassage.com?subject=${subject}&body=${body}`;
}

function renderAppointments(appointments = []) {
  if (!Array.isArray(appointments) || appointments.length === 0) return "";

  return appointments
    .map((appointment, index) => {
      const manageUrl = appointment.manageUrl || buildChangeRequestUrl({
        date: appointment.date,
        location: appointment.location,
        time: appointment.time,
      });

      return `
        <tr>
          <td style="padding:14px 0;border-top:1px solid #e1e7ef;">
            <p style="margin:0 0 6px;"><strong>Appointment ${index + 1}</strong></p>
            <ul style="margin:0 0 10px;padding-left:20px;">
              <li><strong>Date:</strong> ${escapeHtml(appointment.date)}</li>
              <li><strong>Time:</strong> ${escapeHtml(appointment.time)}</li>
              <li><strong>Service:</strong> ${escapeHtml(appointment.serviceName)}</li>
              <li><strong>Duration:</strong> ${escapeHtml(appointment.durationMinutes)} minutes</li>
              <li><strong>Area:</strong> ${escapeHtml(appointment.location)}</li>
              <li><strong>Price:</strong> ${formatMoney(appointment.price)}</li>
            </ul>
            <a href="${manageUrl}" style="color:#0d77d8;font-weight:bold;">Manage this booking</a>
          </td>
        </tr>
      `;
    })
    .join("");
}

function layout(title, body) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f8fb;color:#172033;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:620px;background:#ffffff;border:1px solid #e1e7ef;">
            <tr>
              <td style="padding:28px 28px 10px;">
                <h1 style="margin:0;color:#0d77d8;font-size:24px;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px;font-size:15px;line-height:1.6;">
                ${body}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export const emailTemplates = {
  bookingConfirmation(payload = {}) {
    const customerName = payload.customer?.name || "there";
    const changeRequestUrl = buildChangeRequestUrl(payload);
    const appointments = Array.isArray(payload.appointments) ? payload.appointments : [];
    const appointmentsBody = appointments.length > 0
      ? `
        <h2 style="font-size:18px;">Your appointments</h2>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          ${renderAppointments(appointments)}
        </table>
      `
      : `
        <ul>
          <li><strong>Date:</strong> ${escapeHtml(payload.date)}</li>
          <li><strong>Time:</strong> ${escapeHtml(payload.time)}</li>
          <li><strong>Location:</strong> ${escapeHtml(payload.location)}</li>
          <li><strong>Address:</strong> ${escapeHtml(payload.address || "Not supplied")}</li>
          <li><strong>Total duration:</strong> ${escapeHtml(payload.durationMinutes)} minutes</li>
        </ul>
        <h2 style="font-size:18px;">Services booked</h2>
        <ul>${renderLineItems(payload.items)}</ul>
      `;
    const isPending = (
      payload.status === "pending_payment_verification" ||
      payload.status === "payment_method_review" ||
      payload.paymentStatus === "awaiting_verification" ||
      payload.paymentStatus === "bank transfer pending" ||
      payload.paymentStatus === "cash_on_arrival" ||
      payload.paymentStatus === "alternative_requested"
    );
    const isAlternative = (
      payload.paymentMethod === "alternative_requested" ||
      payload.paymentStatus === "alternative_requested" ||
      (payload.status === "payment_method_review" && payload.paymentMethod === "alternative_requested")
    );

    const paymentInstructions = `
      <h2 style="font-size:18px;">Payment details</h2>
      <ul>
        <li><strong>Reference:</strong> ${escapeHtml(payload.bookingReference || payload.bookingReference || payload.orderId || payload.id || "-")}</li>
        <li><strong>Amount due:</strong> ${formatMoney(payload.total)}</li>
        <li><strong>Bank:</strong> VAD Massage — Account: 12345678 — Sort: 12-34-56</li>
        <li><strong>Wise:</strong> Payment link placeholder</li>
      </ul>
    `;

    const body = `
      <p>Hi ${escapeHtml(customerName)},</p>
      <p>${isPending ? "We have received your booking request. Your appointment is reserved while payment is being completed." : isAlternative ? "We have received your request for an alternative payment method. Our team will review it and be in touch." : (appointments.length > 1 ? "Your appointments are confirmed." : "Your booking is confirmed.")}</p>
      ${appointmentsBody}
      <p><strong>Total:</strong> ${formatMoney(payload.total)}</p>
      ${isPending ? paymentInstructions : isAlternative ? `<p>We will contact you regarding alternative payment arrangements.</p>${paymentInstructions}` : ""}
      <p style="margin:24px 0;">
        <a href="${changeRequestUrl}" style="background:#0d77d8;color:#ffffff;display:inline-block;padding:12px 18px;text-decoration:none;">
          Request change or cancellation
        </a>
      </p>
      <h2 style="font-size:18px;">Before your appointment</h2>
      <ul>
        <li>Please make sure there is enough space for the massage table.</li>
        <li>If parking or access instructions are needed, reply to this email.</li>
        <li>To change or cancel, use the button above or reply to this email.</li>
      </ul>
      <p style="color:#5b6678;font-size:13px;">
        Replies go to bookings@vadmassage.com.
      </p>
    `;

    const subject = isPending ? "Booking request received — awaiting payment verification" : isAlternative ? "Alternative payment request received" : (appointments.length > 1 ? "Your appointments are confirmed" : "Your booking is confirmed");

    const text = isPending
      ? `Your booking request has been received for ${payload.date} at ${payload.time}. Reference: ${payload.bookingReference || "-"}. Amount due: ${formatMoney(payload.total)}. Your appointment will be confirmed once payment has been received and verified.`
      : isAlternative
        ? `Your alternative payment request has been received for ${payload.date} at ${payload.time}. Reference: ${payload.bookingReference || "-"}. We'll review and be in touch.`
        : (appointments.length > 1
          ? `Your appointments are confirmed. Total: ${formatMoney(payload.total)}.`
          : `Your booking is confirmed for ${payload.date} at ${payload.time}. Total: ${formatMoney(payload.total)}.`);

    return {
      html: layout(subject, body),
      subject,
      text,
    };
  },

  cancellationConfirmation(payload = {}) {
    const body = `
      <p>Your booking cancellation has been confirmed.</p>
      <ul>
        <li><strong>Date:</strong> ${escapeHtml(payload.date)}</li>
        <li><strong>Time:</strong> ${escapeHtml(payload.time)}</li>
      </ul>
    `;

    return {
      html: layout("Booking cancelled", body),
      subject: "Your booking has been cancelled",
      text: `Your booking cancellation has been confirmed for ${payload.date} at ${payload.time}.`,
    };
  },

  waitlistOffer(payload = {}) {
    const body = `
      <p>A new appointment time is available from your waitlist request.</p>
      <ul>
        <li><strong>Date:</strong> ${escapeHtml(payload.date)}</li>
        <li><strong>Time:</strong> ${escapeHtml(payload.time)}</li>
        <li><strong>Service:</strong> ${escapeHtml(payload.serviceName)}</li>
      </ul>
      <p>Please open the booking page to accept the offer.</p>
    `;

    return {
      html: layout("Waitlist offer", body),
      subject: "A booking time is available",
      text: `A waitlist time is available: ${payload.date} at ${payload.time} for ${payload.serviceName}.`,
    };
  },

  receipt(payload = {}) {
    const body = `
      <p>Thanks for your payment. Here is your receipt.</p>
      <ul>${renderLineItems(payload.items)}</ul>
      <p><strong>Total paid:</strong> ${formatMoney(payload.total)}</p>
    `;

    return {
      html: layout("Receipt", body),
      subject: "Your booking receipt",
      text: `Receipt total: ${formatMoney(payload.total)}.`,
    };
  },
};
