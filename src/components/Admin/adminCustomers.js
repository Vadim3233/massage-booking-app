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

export function buildAdminCustomers(days, waitlistEntries, getEffectiveWaitlistStatus) {
  const customerMap = new Map(SAMPLE_CUSTOMERS.map((customer) => [customer.id, { ...customer, appointments: [] }]));

  days.forEach((day) => {
    getBookingBlocks(day.bookings).forEach((booking, index) => {
      if (isPersonalEvent(booking)) return;
      const fallbackCustomer = SAMPLE_CUSTOMERS[(index + day.id.length) % SAMPLE_CUSTOMERS.length];
      const customer = customerMap.get(fallbackCustomer.id);
      customer.appointments.push({
        date: day.dateValue,
        duration: booking.duration,
        serviceName: booking.serviceName,
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

  return [...customerMap.values()].sort((first, second) => first.name.localeCompare(second.name));
}
