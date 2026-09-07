import assert from "node:assert/strict";
import {
  CLIENT_MINIMUM_BOOKING_NOTICE_MINUTES,
  DEFAULT_DAY_SETTINGS,
  DEFAULT_SERVICES,
  addDaysToPlainDateValue,
  dateValueInTimeZone,
  filterClientBookableSlots,
  getSchedulingPreview,
  minutesToTime,
  minutesInTimeZone,
  normalizePlainDateValue,
  timeToMinutes,
} from "./schedulingEngine.js";

function labelsAndTimes(slots) {
  return slots.map((slot) => `${slot.label}:${minutesToTime(slot.start)}-${minutesToTime(slot.bufferEnd)}`);
}

function startTimes(slots) {
  return slots.map((slot) => minutesToTime(slot.start));
}

const baseSettings = {
  ...DEFAULT_DAY_SETTINGS,
  workingStart: "09:00",
  workingEnd: "18:00",
};

assert.equal(normalizePlainDateValue("2026-07-18"), "2026-07-18");
assert.equal(
  dateValueInTimeZone(new Date("2026-07-17T23:30:00.000Z")),
  "2026-07-18",
  "London local date must not shift one day backward near midnight",
);
assert.equal(addDaysToPlainDateValue("2026-07-18", 1), "2026-07-19");
assert.equal(addDaysToPlainDateValue("2026-03-29", 1), "2026-03-30");
assert.equal(
  dateValueInTimeZone(new Date("2026-03-29T01:30:00.000Z")),
  "2026-03-29",
  "London DST start keeps the selected calendar date",
);
assert.equal(
  minutesInTimeZone(new Date("2026-03-29T01:30:00.000Z")),
  150,
  "London DST start converts 01:30Z to 02:30 local",
);
assert.equal(
  dateValueInTimeZone(new Date("2026-10-25T01:30:00.000Z")),
  "2026-10-25",
  "London DST end keeps the selected calendar date",
);

assert.deepEqual(DEFAULT_SERVICES.map((service) => service.id), [
  "massage",
  "assisted-stretching",
  "soft-tissue-therapy",
  "body-exam",
]);

const existingBookings = [
  {
    id: "a",
    serviceId: "deep-tissue",
    serviceName: "Deep Tissue Recovery",
    start: timeToMinutes("10:00"),
    duration: 90,
    travelBuffer: 60,
  },
  {
    id: "b",
    serviceId: "sports",
    serviceName: "Performance Sports Massage",
    start: timeToMinutes("12:30"),
    duration: 60,
    travelBuffer: 45,
  },
];

{
  const preview = getSchedulingPreview({
    settings: { ...baseSettings, mode: "optimized", workingStart: "08:00" },
    bookings: existingBookings,
    minimumStartMinutes: timeToMinutes("14:09"),
    requestedDuration: 60,
    requestedTravelBuffer: 60,
  });
  const filteredToday = filterClientBookableSlots(preview.slots, "2026-07-18", {
    minimumNoticeMinutes: CLIENT_MINIMUM_BOOKING_NOTICE_MINUTES,
    now: new Date("2026-07-18T10:59:00.000Z"),
  });

  assert(startTimes(filteredToday).includes("14:30"), "Same-day optimized mode offers a later slot once the chain edge is inside 2 hours");
}

{
  const preview = getSchedulingPreview({
    settings: { ...baseSettings, mode: "optimized", workingStart: "08:00" },
    bookings: existingBookings,
    requestedDuration: 60,
    requestedTravelBuffer: 60,
  });

  assert.equal(minutesToTime(preview.flow.flowStart), "10:00");
  assert.equal(minutesToTime(preview.flow.flowEnd), "14:15");
  assert.deepEqual(labelsAndTimes(preview.slots), [
    "next slot before flow:08:00-10:00",
    "next slot after flow:14:15-16:15",
  ]);
}

{
  const preview = getSchedulingPreview({
    settings: { ...baseSettings, mode: "optimized", startMode: "fixed", fixedStart: "11:30" },
    bookings: [],
    requestedDuration: 90,
    requestedTravelBuffer: 60,
  });

  assert.deepEqual(labelsAndTimes(preview.slots), ["fixed first booking:11:30-14:00"]);
}

{
  const preview = getSchedulingPreview({
    settings: { ...baseSettings, mode: "optimized", startMode: "flexible" },
    bookings: [],
    requestedDuration: 240,
    requestedTravelBuffer: 60,
  });

  assert.equal(preview.slots[0].label, "first booking option");
  assert.equal(minutesToTime(preview.slots[0].start), "09:00");
  assert.equal(minutesToTime(preview.slots.at(-1).start), "13:00");
}

{
  const preview = getSchedulingPreview({
    settings: { ...baseSettings, mode: "flexible" },
    bookings: [],
    requestedDuration: 60,
    requestedTravelBuffer: 60,
  });
  const filteredToday = filterClientBookableSlots(preview.slots, "2026-07-18", {
    now: new Date("2026-07-18T11:04:00.000Z"),
  });

  assert(!startTimes(filteredToday).includes("09:00"), "Today past slots are unavailable");
  assert(!startTimes(filteredToday).includes("11:00"), "The current in-progress half-hour is unavailable");
  assert(startTimes(filteredToday).includes("12:30"), "Today future slots remain available");
}

{
  const preview = getSchedulingPreview({
    settings: { ...baseSettings, mode: "flexible" },
    bookings: [],
    requestedDuration: 60,
    requestedTravelBuffer: 60,
  });
  const filteredToday = filterClientBookableSlots(preview.slots, "2026-07-18", {
    minimumNoticeMinutes: CLIENT_MINIMUM_BOOKING_NOTICE_MINUTES,
    now: new Date("2026-07-18T11:04:00.000Z"),
  });

  assert(!startTimes(filteredToday).includes("12:30"), "Today slots inside 2 hours are unavailable");
  assert(startTimes(filteredToday).includes("14:30"), "Today slots at least 2 hours ahead remain available");
}

{
  const preview = getSchedulingPreview({
    settings: { ...baseSettings, mode: "flexible" },
    bookings: [],
    requestedDuration: 60,
    requestedTravelBuffer: 60,
  });
  const tomorrowDate = addDaysToPlainDateValue("2026-07-18", 1);
  const filteredTomorrow = filterClientBookableSlots(preview.slots, tomorrowDate, {
    now: new Date("2026-07-18T11:04:00.000Z"),
  });

  assert.equal(tomorrowDate, "2026-07-19");
  assert(startTimes(filteredTomorrow).includes("09:00"), "Tomorrow's early slots remain unchanged");
}

{
  const preview = getSchedulingPreview({
    settings: { ...baseSettings, mode: "flexible" },
    bookings: existingBookings,
    requestedDuration: 60,
    requestedTravelBuffer: 0,
  });

  assert(preview.slots.some((slot) => minutesToTime(slot.start) === "09:00"));
  assert(preview.slots.some((slot) => minutesToTime(slot.start) === "14:30"));
  assert(!preview.slots.some((slot) => minutesToTime(slot.start) === "11:30"));
}

{
  const preview = getSchedulingPreview({
    settings: { ...baseSettings, mode: "optimized", workingStart: "08:00" },
    bookings: existingBookings,
    requestedDuration: 55,
    requestedTravelBuffer: 60,
  });

  assert.equal(preview.slots.length, 0);
  assert.equal(preview.warnings.length, 1);
}

{
  const preview = getSchedulingPreview({
    settings: { ...baseSettings, mode: "flexible" },
    bookings: [
      {
        id: "midday",
        serviceId: "deep-tissue",
        serviceName: "Deep Tissue Recovery",
        start: timeToMinutes("12:00"),
        duration: 60,
        travelBuffer: 60,
      },
    ],
    requestedDuration: 60,
    requestedTravelBuffer: 60,
  });

  assert.deepEqual(startTimes(preview.slots), [
    "09:00",
    "09:30",
    "10:00",
    "14:00",
    "14:30",
    "15:00",
    "15:30",
    "16:00",
  ]);
}

{
  const internalGapBookings = [
    {
      id: "gap-a",
      serviceId: "deep-tissue",
      serviceName: "Deep Tissue Recovery",
      start: timeToMinutes("10:00"),
      duration: 60,
      travelBuffer: 60,
    },
    {
      id: "gap-b",
      serviceId: "sports",
      serviceName: "Performance Sports Massage",
      start: timeToMinutes("14:00"),
      duration: 60,
      travelBuffer: 60,
    },
  ];

  const preview = getSchedulingPreview({
    settings: { ...baseSettings, mode: "optimized", workingStart: "08:00", workingEnd: "18:00" },
    bookings: internalGapBookings,
    requestedDuration: 60,
    requestedTravelBuffer: 60,
  });

  assert.deepEqual(startTimes(preview.slots), ["08:00", "16:00"]);
  assert(!startTimes(preview.slots).includes("12:00"));
  assert(!startTimes(preview.slots).includes("12:30"));
  assert(preview.slots.every((slot) => slot.start < timeToMinutes("12:00") || slot.start >= timeToMinutes("14:00")));
}

{
  const bufferBookings = [
    {
      id: "buffer-a",
      serviceId: "deep-tissue",
      serviceName: "Deep Tissue Recovery",
      start: timeToMinutes("10:00"),
      duration: 60,
      travelBuffer: 60,
    },
  ];

  const bufferCases = [
    {
      requestedTravelBuffer: 0,
      expectedStarts: ["09:00", "12:00"],
      expectedRanges: ["next slot before flow:09:00-10:00", "next slot after flow:12:00-13:00"],
    },
    {
      requestedTravelBuffer: 30,
      expectedStarts: ["08:30", "12:00"],
      expectedRanges: ["next slot before flow:08:30-10:00", "next slot after flow:12:00-13:30"],
    },
    {
      requestedTravelBuffer: 90,
      expectedStarts: ["07:30", "12:00"],
      expectedRanges: ["next slot before flow:07:30-10:00", "next slot after flow:12:00-14:30"],
    },
  ];

  for (const testCase of bufferCases) {
    const preview = getSchedulingPreview({
      settings: { ...baseSettings, mode: "optimized", workingStart: "07:00", workingEnd: "18:00" },
      bookings: bufferBookings,
      requestedDuration: 60,
      requestedTravelBuffer: testCase.requestedTravelBuffer,
    });

    assert.deepEqual(startTimes(preview.slots), testCase.expectedStarts);
    assert.deepEqual(labelsAndTimes(preview.slots), testCase.expectedRanges);
  }

  const filteredBeforePreview = getSchedulingPreview({
    settings: { ...baseSettings, mode: "optimized", workingStart: "09:00", workingEnd: "18:00" },
    bookings: bufferBookings,
    requestedDuration: 60,
    requestedTravelBuffer: 30,
  });

  assert.deepEqual(startTimes(filteredBeforePreview.slots), ["12:00"]);

  const filteredAfterPreview = getSchedulingPreview({
    settings: { ...baseSettings, mode: "optimized", workingStart: "07:00", workingEnd: "13:00" },
    bookings: bufferBookings,
    requestedDuration: 60,
    requestedTravelBuffer: 90,
  });

  assert.deepEqual(startTimes(filteredAfterPreview.slots), ["07:30"]);
}

{
  const preview = getSchedulingPreview({
    settings: { ...baseSettings, mode: "optimized", workingStart: "09:00", workingEnd: "18:00" },
    bookings: [
      {
        id: "late-flow",
        serviceId: "deep-tissue",
        serviceName: "Deep Tissue Recovery",
        start: timeToMinutes("10:00"),
        duration: 60,
        travelBuffer: 60,
      },
    ],
    requestedDuration: 120,
    requestedTravelBuffer: 60,
  });

  assert.deepEqual(startTimes(preview.slots), ["12:00"]);
  assert.deepEqual(labelsAndTimes(preview.slots), ["next slot after flow:12:00-15:00"]);
}

{
  const preview = getSchedulingPreview({
    settings: { ...baseSettings, mode: "optimized", workingStart: "07:00", workingEnd: "18:00" },
    bookings: [
      {
        id: "end-flow",
        serviceId: "deep-tissue",
        serviceName: "Deep Tissue Recovery",
        start: timeToMinutes("14:00"),
        duration: 60,
        travelBuffer: 60,
      },
    ],
    requestedDuration: 120,
    requestedTravelBuffer: 60,
  });

  assert.deepEqual(startTimes(preview.slots), ["11:00"]);
  assert.deepEqual(labelsAndTimes(preview.slots), ["next slot before flow:11:00-14:00"]);
}

console.log("Scheduling engine tests passed.");
