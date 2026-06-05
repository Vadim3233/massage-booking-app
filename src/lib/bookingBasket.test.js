import assert from "node:assert/strict";
import {
  DEFAULT_DAY_SETTINGS,
  minutesToTime,
  timeToMinutes,
} from "../schedulingEngine.js";
import {
  cancelSingleBooking,
  getActiveServiceAreas,
  getBasketAwareSchedulingPreview,
  rescheduleSingleBooking,
  validateBasketAppointments,
} from "./bookingBasket.js";

function startTimes(slots) {
  return slots.map((slot) => minutesToTime(slot.start));
}

const chainSettings = {
  ...DEFAULT_DAY_SETTINGS,
  mode: "optimized",
  startMode: "flexible",
  workingStart: "09:00",
  workingEnd: "20:00",
};

const serviceAreas = [
  { id: "chelsea", name: "Chelsea", active: true },
  { id: "mayfair", name: "Mayfair", active: false },
];

const day = {
  dateValue: "2026-06-03",
  settings: chainSettings,
  bookings: [
    {
      id: "existing-a",
      serviceId: "deep-tissue",
      serviceName: "Deep Tissue Recovery",
      start: timeToMinutes("15:00"),
      duration: 60,
      travelBuffer: 0,
    },
    {
      id: "existing-b",
      serviceId: "sports",
      serviceName: "Performance Sports Massage",
      start: timeToMinutes("18:00"),
      duration: 60,
      travelBuffer: 0,
    },
  ],
};

{
  const preview = getBasketAwareSchedulingPreview({
    appointments: [],
    bookings: day.bookings,
    dateValue: day.dateValue,
    requestedDuration: 60,
    requestedTravelBuffer: 0,
    settings: day.settings,
  });

  assert.deepEqual(startTimes(preview.slots), ["14:00", "19:00"]);
}

{
  const basket = [
    {
      id: "basket-a",
      dateValue: day.dateValue,
      duration: 60,
      selectedAreaId: "chelsea",
      selectedAreaName: "Chelsea",
      serviceId: "deep-tissue",
      serviceName: "Deep Tissue Recovery",
      start: timeToMinutes("14:00"),
      travelBuffer: 0,
    },
  ];
  const preview = getBasketAwareSchedulingPreview({
    appointments: basket,
    bookings: day.bookings,
    dateValue: day.dateValue,
    requestedDuration: 60,
    requestedTravelBuffer: 0,
    settings: day.settings,
  });

  assert.deepEqual(startTimes(preview.slots), ["13:00", "19:00"]);
  assert(!startTimes(preview.slots).includes("16:00"));
}

{
  const basket = [
    {
      id: "valid",
      dateLabel: "Wed, 2026-06-03",
      dateValue: day.dateValue,
      duration: 60,
      selectedAreaId: "chelsea",
      selectedAreaName: "Chelsea",
      serviceId: "deep-tissue",
      serviceName: "Deep Tissue Recovery",
      start: timeToMinutes("14:00"),
      travelBuffer: 0,
    },
    {
      id: "invalid-gap",
      dateLabel: "Wed, 2026-06-03",
      dateValue: day.dateValue,
      duration: 60,
      selectedAreaId: "chelsea",
      selectedAreaName: "Chelsea",
      serviceId: "sports",
      serviceName: "Performance Sports Massage",
      start: timeToMinutes("16:00"),
      travelBuffer: 0,
    },
  ];
  const result = validateBasketAppointments({ appointments: basket, days: [day], serviceAreas });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "unavailable_slot");
  assert.equal(result.appointment.id, "invalid-gap");
}

{
  const bookings = [
    { id: "one", orderId: "order-1", status: "confirmed" },
    { id: "two", orderId: "order-1", status: "confirmed" },
  ];

  assert.deepEqual(cancelSingleBooking(bookings, "one"), [
    { id: "one", orderId: "order-1", status: "cancelled" },
    { id: "two", orderId: "order-1", status: "confirmed" },
  ]);
  assert.deepEqual(rescheduleSingleBooking(bookings, "two", { start: "16:00" }), [
    { id: "one", orderId: "order-1", status: "confirmed" },
    { id: "two", orderId: "order-1", status: "confirmed", start: "16:00" },
  ]);
}

{
  assert.deepEqual(getActiveServiceAreas(serviceAreas).map((area) => area.id), ["chelsea"]);
  const inactiveAreaResult = validateBasketAppointments({
    appointments: [
      {
        id: "inactive-area",
        dateValue: day.dateValue,
        duration: 60,
        selectedAreaId: "mayfair",
        selectedAreaName: "Mayfair",
        start: timeToMinutes("14:00"),
        travelBuffer: 0,
      },
    ],
    days: [day],
    serviceAreas,
  });

  assert.equal(inactiveAreaResult.ok, false);
  assert.equal(inactiveAreaResult.reason, "inactive_area");
}

{
  const bufferPreview = getBasketAwareSchedulingPreview({
    appointments: [
      {
        id: "buffered",
        dateValue: "2026-06-04",
        duration: 60,
        selectedAreaId: "chelsea",
        serviceId: "deep-tissue",
        serviceName: "Deep Tissue Recovery",
        start: timeToMinutes("12:00"),
        travelBuffer: 60,
      },
    ],
    bookings: [],
    dateValue: "2026-06-04",
    requestedDuration: 60,
    requestedTravelBuffer: 60,
    settings: chainSettings,
  });

  assert.deepEqual(startTimes(bufferPreview.slots), ["10:00", "14:00"]);
}

console.log("Booking basket tests passed.");
