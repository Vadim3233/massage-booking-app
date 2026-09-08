import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";
import { getServiceAreaFees, sanitizeServiceAreas } from "./serviceAreas.js";
import { bookingToSupabasePayload, supabaseRowToStorageBooking } from "./bookingPersistence.js";
import { buildTelegramStartUrl, normalizeTelegramBotUrl } from "./telegramLinks.js";

const source = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const areas = sanitizeServiceAreas([{ id: "mayfair", congestionFee: 20, travelSurcharge: 15 }]);
// Exercise the actual total expression used by the booking flow.
const expression = source.match(/const bookingTotal = ([^;]+);/)[1];
const totalFor = new Function("bookingSubtotal", "selectedAreaFees", `return ${expression}`);
for (const areaId of ["mayfair", "mayfair", "chelsea", "mayfair"]) {
  for (const subtotal of [100, 150, 200]) {
    const fees = getServiceAreaFees(areas, areaId);
    const expected = subtotal + (areaId === "mayfair" ? 35 : 0);
    assert.equal(totalFor(subtotal, fees), expected);
    const payload = bookingToSupabasePayload({
      id: "test-booking", serviceId: "massage", serviceName: "Massage",
      start: 600, duration: 60, travelBuffer: 60, dateValue: "2026-10-01",
      price: subtotal, congestionFee: fees.congestionFee, travelFee: fees.travelSurcharge,
    });
    assert.equal(payload.price + payload.congestion_fee + payload.travel_fee, expected);
    assert.equal(JSON.parse(payload.notes).appBooking.total, expected);
    const restored = supabaseRowToStorageBooking(payload);
    assert.equal(restored.price + restored.congestionFee + restored.travelFee, expected);
    assert.equal(restored.total, expected);
  }
}
const areaHandler = source.slice(source.indexOf("  function updateSelectedArea("), source.indexOf("  function selectAreaAndContinue("));
assert.match(areaHandler, /areaId !== selectedAreaId/);
assert.match(areaHandler, /releaseCheckoutHolds\(\)/);
assert.match(areaHandler, /setCheckoutAppointments\(\[\]\)/);
assert.match(source, /congestionFee: selectedAreaFees.congestionFee/);
assert.match(source, /travelFee: selectedAreaFees.travelSurcharge/);
assert.match(source, /total: bookingTotal/);

// Use the actual appointment builder, including the fee snapshots passed to persistence.
const draftSource = source.slice(source.indexOf("  function buildCurrentAppointmentDraft("), source.indexOf("  function addCurrentAppointmentToBasket("));
const buildDraft = new Function("context", `with (context) { ${draftSource}; return buildCurrentAppointmentDraft(); }`);
const oneFeeArea = { id: "other", name: "Other", congestionFee: 0, travelSurcharge: 7 };
let historicalPayload;
for (const selectedArea of [areas.find((a) => a.id === "mayfair"), areas.find((a) => a.id === "chelsea"), oneFeeArea]) {
  for (const minutes of [60, 90, 120]) {
    const selectedAreaFees = getServiceAreaFees([selectedArea], selectedArea.id);
    const bookingSubtotal = minutes * 2;
    const context = {
      selectedArea, selectedAreaFees, bookingSubtotal,
      bookingTotal: totalFor(bookingSubtotal, selectedAreaFees),
      orderDurationIsValid: true, basketItems: [{ id: "massage", name: "Massage", minutes, price: bookingSubtotal }],
      clientSelectedSlot: { start: 600, end: 600 + minutes, bufferEnd: 660 + minutes },
      selectedDay: { dateValue: "2026-10-01" }, selectedEnhancementItems: [],
      chosenDayLabel: "Thursday", clientDayIndex: 0, bookingDurationMinutes: minutes,
      activeBookingHold: null, primaryServiceId: "massage", addressDetails: { additionalNotes: "" },
      selectedSessionPreferenceIds: [], selectedSessionPreferenceSnapshots: [], DEFAULT_TRAVEL_BUFFER: 60,
    };
    for (const step of ["review", "details", "review", "payment"]) {
      const appointment = buildDraft({ ...context, clientStep: step }).appointment;
      assert.equal(appointment.total, bookingSubtotal + selectedAreaFees.congestionFee + selectedAreaFees.travelSurcharge);
      const payload = bookingToSupabasePayload(appointment);
      assert.equal(payload.price + payload.travel_fee + payload.congestion_fee, appointment.total);
      if (!historicalPayload) historicalPayload = payload;
    }
  }
}
// Exercise real Back/Forward progress navigation and area-change invalidation.
const navigateStart = source.indexOf("  function navigateClientStepFromProgress(");
const navigateSource = source.slice(navigateStart, source.indexOf("\n  useEffect(", navigateStart));
let released = 0;
const navigation = {
  clientStep: "review", selectedAreaId: "mayfair", checkoutAppointments: [],
  selectedArea: areas.find((a) => a.id === "mayfair"),
  getClientStepNavigationReason: () => "", setCheckoutError() {}, setClientBookingMessage() {},
  setMobileProgressOpen() {}, setAreaSelectionMessage() {},
  setClientStep: (step) => { navigation.clientStep = step; },
  setSelectedAreaId: (id) => { navigation.selectedAreaId = id; navigation.selectedArea = [...areas, oneFeeArea].find((a) => a.id === id); },
  setCheckoutAppointments: (appointments) => { navigation.checkoutAppointments = appointments; },
  releaseCheckoutHolds: () => { released++; },
  addCurrentAppointmentToBasket: () => {
    const fees = getServiceAreaFees([navigation.selectedArea], navigation.selectedAreaId);
    const appointment = { selectedAreaId: navigation.selectedAreaId, congestionFee: fees.congestionFee,
      travelFee: fees.travelSurcharge, total: totalFor(100, fees) };
    navigation.checkoutAppointments = [appointment];
    return appointment;
  },
};
const handlers = new Function("context", `with(context) { ${navigateSource} ${areaHandler} return { navigateClientStepFromProgress, updateSelectedArea }; }`)(navigation);
for (const [areaId, expected] of [["mayfair",135],["chelsea",100],["other",107],["mayfair",135]]) {
  handlers.updateSelectedArea(areaId);
  for (const step of ["details", "review", "payment", "details", "payment"]) {
    handlers.navigateClientStepFromProgress(step);
    assert.equal(navigation.checkoutAppointments.length, 1);
    assert.equal(navigation.checkoutAppointments[0].total, expected);
  }
}
assert.equal(released, 3);

const historicalTotal = historicalPayload.price + historicalPayload.travel_fee + historicalPayload.congestion_fee;
areas.find((a) => a.id === "mayfair").congestionFee = 99;
const historical = supabaseRowToStorageBooking(historicalPayload);
assert.equal(historical.price + historical.travelFee + historical.congestionFee, historicalTotal);
assert.equal(historical.total, historicalTotal);

const adminSource = readFileSync(new URL("../components/Admin/LiveAdminWorkspace.jsx", import.meta.url), "utf8");
const adminTotalSource = adminSource.slice(
  adminSource.indexOf("function bookingTotalDue("),
  adminSource.indexOf("function normalizeDurationPrices(")
);
const adminTotalDue = new Function(`${adminTotalSource}; return bookingTotalDue;`)();
assert.equal(adminTotalDue({ price: 90, congestionFee: 18, travelFee: 12 }), 120);

const analyticsSource = readFileSync(new URL("../components/Admin/BusinessAnalyticsDashboard.jsx", import.meta.url), "utf8");
const analyticsRevenueSource = analyticsSource.slice(
  analyticsSource.indexOf("function bookingRevenue("),
  analyticsSource.indexOf("function bookingStatus(")
);
const analyticsRevenue = new Function(
  "isPersonalEvent",
  "isFiniteNumber",
  "itemsForBooking",
  `${analyticsRevenueSource}; return bookingRevenue;`
)(() => false, Number.isFinite, () => []);
assert.equal(analyticsRevenue({ price: 90, congestionFee: 18, travelFee: 12 }), 120);

const botUrl = normalizeTelegramBotUrl("https://t.me/@vadmassagebookingbot");
assert.equal(botUrl, "https://t.me/vadmassagebookingbot");
for (const invalid of [undefined, "", "  ", "javascript:alert(1)", "https://example.com/bot", "https://t.me/", "invalid"]) {
  assert.equal(normalizeTelegramBotUrl(invalid), "");
}
const confirmationTelegramUrl = buildTelegramStartUrl(botUrl, "vdm-ABC_123");
assert.equal(confirmationTelegramUrl, `${botUrl}?start=VDM-ABC_123`);
const card = source.slice(source.indexOf('<section className="confirmation-card confirmation-telegram-card">'), source.indexOf('{paymentMethod === "bank_transfer" && (', source.indexOf('<section className="confirmation-card confirmation-telegram-card">'))).trim();
const transformed = await transformWithOxc(`const Card = () => (${card});`, "telegram-card.jsx", { jsx: { runtime: "classic" } });
const Icon = () => null;
const Card = new Function("React", "MessageCircle", "ChevronRight", "confirmationTelegramUrl", "clientTelegramConnected", transformed.code + "; return Card;")(React, Icon, Icon, confirmationTelegramUrl, false);
const html = renderToStaticMarkup(React.createElement(Card));
assert.match(html, /<a class="confirmation-telegram-action" href="https:\/\/t.me\/vadmassagebookingbot\?start=VDM-ABC_123"/);
assert.match(html, /Open Telegram bot/);
assert.doesNotMatch(html, /contact me directly/);
const MissingCard = new Function("React", "MessageCircle", "ChevronRight", "confirmationTelegramUrl", "clientTelegramConnected", transformed.code + "; return Card;")(React, Icon, Icon, "", false);
const missingHtml = renderToStaticMarkup(React.createElement(MissingCard));
assert.doesNotMatch(missingHtml, /<a |open the chat bot/);
assert.match(missingHtml, /Telegram updates are currently unavailable/);
const ConnectedCard = new Function("React", "MessageCircle", "ChevronRight", "confirmationTelegramUrl", "clientTelegramConnected", transformed.code + "; return Card;")(React, Icon, Icon, "", true);
const connectedHtml = renderToStaticMarkup(React.createElement(ConnectedCard));
assert.doesNotMatch(connectedHtml, /<a |open the chat bot/);
assert.match(connectedHtml, /already connected to your client account/);
console.log("Booking flow pricing and Telegram CTA tests passed.");
