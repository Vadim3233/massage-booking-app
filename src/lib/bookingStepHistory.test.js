import assert from "node:assert/strict";
import {
  createBeforeUnloadProtection,
  createBookingStepHistory,
  hasMeaningfulBookingProgress,
} from "./bookingStepHistory.js";

function browserHarness({ dirty = false } = {}) {
  const entries = [{ state: null, url: "https://wa.me/thread" }];
  let index = 1;
  const location = { pathname: "/", search: "?source=whatsapp", hash: "" };
  let listener = () => {};
  const history = {
    state: null,
    replaceState(state, _title, url) { entries[index] = { state, url }; this.state = state; },
    pushState(state, _title, url) { entries.splice(index + 1); entries.push({ state, url }); index++; this.state = state; },
    back() { index--; this.state = entries[index]?.state ?? null; listener({ state: this.state }); },
    forward() { index++; this.state = entries[index]?.state ?? null; listener({ state: this.state }); },
  };
  const visited = [];
  let exitPrompt = null;
  const controller = createBookingStepHistory({
    history,
    location,
    onExitAttempt: ({ leave, stay }) => {
      if (dirty) exitPrompt = { leave, stay };
      else leave();
    },
    onStep: (step) => visited.push(step),
  });
  listener = controller.handlePopState;
  controller.initialize("location");
  return { controller, entries, exitPrompt: () => exitPrompt, history, index: () => index, visited };
}

{
  const test = browserHarness();
  for (const step of ["treatment", "duration", "time", "review", "details", "payment"]) test.controller.navigate(step);
  assert.equal(test.entries.length, 9);
  test.history.back(); test.history.back(); test.history.back();
  assert.deepEqual(test.visited.slice(-3), ["details", "review", "time"]);
  test.history.forward(); test.history.forward();
  assert.deepEqual(test.visited.slice(-2), ["review", "details"]);
  assert.match(test.entries.at(-1).url, /source=whatsapp&clientStep=payment/);
}

{
  const test = browserHarness();
  const form = { area: "mayfair", service: "massage", duration: 90, slot: "12:30", address: "1 Test St", enhancement: "oil", payment: "bank" };
  test.controller.navigate("treatment"); test.controller.navigate("duration"); test.controller.navigate("time");
  test.history.back(); test.history.forward();
  assert.deepEqual(form, { area: "mayfair", service: "massage", duration: 90, slot: "12:30", address: "1 Test St", enhancement: "oil", payment: "bank" });
  assert.equal(test.entries.length, 6);
}

{
  const test = browserHarness();
  const beforeFields = test.entries.length;
  const fields = { address: "A", phone: "1" };
  fields.address = "Address changed"; fields.phone = "07700900123";
  assert.equal(test.entries.length, beforeFields);
  test.history.back();
  assert.equal(test.index(), 0);
  assert.equal(test.visited.length, 0);
}

{
  const test = browserHarness();
  test.controller.navigate("treatment");
  test.controller.navigate("location");
  assert.equal(test.index(), 2);
  assert.equal(test.visited.at(-1), "location");
  test.history.forward();
  assert.equal(test.visited.at(-1), "treatment");
  test.controller.navigate("location", { replace: true });
  assert.match(test.entries[test.index()].url, /clientStep=location/);
}

{
  const test = browserHarness({ dirty: true });
  test.controller.navigate("treatment");
  test.history.back();
  assert.equal(test.visited.at(-1), "location", "ordinary step Back does not prompt");
  test.history.back();
  assert.ok(test.exitPrompt(), "leaving the first booking entry prompts when dirty");
  test.exitPrompt().stay();
  assert.equal(test.visited.at(-1), "location");
  test.history.back();
  test.exitPrompt().leave();
  assert.equal(test.index(), 0, "Leave continues to the external entry without another prompt");
}

{
  const base = {
    addressDetails: {}, clientServiceId: "", clientSelectedSlot: null, confirmedAppointments: [],
    contactDetails: {}, durationQuantitiesByService: {}, paymentSelected: false, selectedAreaId: "",
    selectedEnhancements: [], selectedSessionPreferenceIds: [], serviceDurations: {},
  };
  assert.equal(hasMeaningfulBookingProgress(base), false);
  assert.equal(hasMeaningfulBookingProgress({ ...base, selectedAreaId: "chelsea" }), true);
  assert.equal(hasMeaningfulBookingProgress({ ...base, contactDetails: { phone: "07700 900123" } }), true);
  assert.equal(hasMeaningfulBookingProgress({ ...base, paymentSelected: true }), true);
  assert.equal(hasMeaningfulBookingProgress({ ...base, selectedAreaId: "chelsea", confirmedAppointments: [{ id: "booked" }] }), false);
}

{
  const listeners = new Map();
  const target = {
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
  };
  const protection = createBeforeUnloadProtection(target);
  protection.sync(false);
  assert.equal(listeners.has("beforeunload"), false);
  protection.sync(true);
  const event = { preventDefaultCalled: false, preventDefault() { this.preventDefaultCalled = true; }, returnValue: null };
  listeners.get("beforeunload")(event);
  assert.equal(event.preventDefaultCalled, true);
  assert.equal(event.returnValue, "");
  protection.sync(false);
  assert.equal(listeners.has("beforeunload"), false);
}

console.log("Booking step browser history tests passed.");
