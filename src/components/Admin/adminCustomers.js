import { getBookingBlocks, minutesToTime } from "../../schedulingEngine.js";

const SAMPLE_CUSTOMERS = [
  {
    address: "14 Oak Avenue, London",
    email: "amelia@example.com",
    id: "amelia-hart",
    name: "Amelia Hart",
    notes: "Prefers evenings and medium pressure.",
    phone: "07123 456789",
    updates: "Requested reminders by email.",
  },
  {
    address: "22 Brook Street, Uxbridge",
    email: "daniel@example.com",
    id: "daniel-reed",
    name: "Daniel Reed",
    notes: "Sports recovery after weekend training.",
    phone: "07987 654321",
    updates: "Interested in monthly appointments.",
  },
  {
    address: "8 Maple Close, Hayes",
    email: "maya@example.com",
    id: "maya-shah",
    name: "Maya Shah",
    notes: "Avoid scented oils.",
    phone: "07444 111222",
    updates: "Joined waitlist for Friday afternoons.",
  },
];

function isPersonalEvent(booking) {
  return booking?.type === "personal" || booking?.serviceId === "personal-event";
}

function formatRange(start, end) {
  return `${minutesToTime(start)} - ${minutesToTime(end)}`;
}

function slugForCustomer(value, fallback) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function bookingCustomerId(booking, day, index) {
  const email = String(booking.customerEmail || "").trim().toLowerCase();
  if (email) return `email-${email}`;
  const phone = String(booking.customerPhone || "").replace(/\D+/g, "");
  if (phone) return `phone-${phone}`;
  return slugForCustomer(booking.clientName, `guest-${day.id}-${booking.id || index}`);
}

function bookingTotal(booking) {
  return (
    Number(booking.price || 0)
    + Number(booking.congestionFee || 0)
    + Number(booking.travelFee || 0)
  );
}

export function buildAdminCustomers(days, waitlistEntries, getEffectiveWaitlistStatus) {
  const customerMap = new Map();

  days.forEach((day) => {
    getBookingBlocks(day.bookings).forEach((booking, index) => {
      if (isPersonalEvent(booking)) return;
      const id = bookingCustomerId(booking, day, index);
      const name = String(booking.clientName || "").trim() || String(booking.customerEmail || "").trim() || "Guest client";
      if (!customerMap.has(id)) {
        customerMap.set(id, {
          address: booking.address || booking.location || "Address not captured yet",
          appointments: [],
          avatarUrl: booking.avatarUrl || booking.avatar_url || booking.picture || "",
          email: booking.customerEmail || "",
          id,
          name,
          notes: booking.notes || booking.additionalNotes || "No notes saved yet.",
          phone: booking.customerPhone || "",
          updates: "Created from booking history.",
          userId: booking.userId || "",
        });
      }

      const customer = customerMap.get(id);
      customer.address = customer.address === "Address not captured yet" ? (booking.address || booking.location || customer.address) : customer.address;
      customer.email = customer.email || booking.customerEmail || "";
      customer.phone = customer.phone || booking.customerPhone || "";
      customer.avatarUrl = customer.avatarUrl || booking.avatarUrl || booking.avatar_url || booking.picture || "";
      customer.userId = customer.userId || booking.userId || "";
      customer.notes = customer.notes === "No notes saved yet." ? (booking.notes || booking.additionalNotes || customer.notes) : customer.notes;
      customer.appointments.push({
        date: day.dateValue,
        duration: booking.duration,
        paymentStatus: booking.paymentStatus || "",
        serviceName: booking.serviceName,
        total: bookingTotal(booking),
        time: formatRange(booking.start, booking.sessionEnd),
      });
    });
  });

  waitlistEntries.forEach((entry) => {
    const id = entry.clientName.trim().toLowerCase().replace(/\s+/g, "-") || entry.id;
    if (!customerMap.has(id)) {
      customerMap.set(id, {
        address: "Address not captured yet",
        appointments: [],
        email: "",
        id,
        name: entry.clientName,
        notes: "Created from waitlist request.",
        phone: "",
        updates: `${getEffectiveWaitlistStatus(entry)} for ${entry.preferredWindow}`,
      });
    }
  });

  if (customerMap.size === 0) {
    SAMPLE_CUSTOMERS.forEach((customer) => {
      customerMap.set(customer.id, { ...customer, appointments: [], avatarUrl: "" });
    });
  }

  return [...customerMap.values()].sort((first, second) => first.name.localeCompare(second.name));
}
