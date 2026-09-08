import assert from "node:assert/strict";
import { createBookingStepHistory } from "./bookingStepHistory.js";

function browserHarness() {
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
  const controller = createBookingStepHistory({ history, location, onStep: (step) => visited.push(step) });
  listener = controller.handlePopState;
  controller.initialize("location");
  return { controller, entries, history, index: () => index, visited };
}

{
  const test = browserHarness();
  for (const step of ["treatment", "duration", "time", "review", "details", "payment"]) test.controller.navigate(step);
  assert.equal(test.entries.length, 8);
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
  assert.equal(test.entries.length, 5);
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
  assert.equal(test.index(), 1);
  assert.equal(test.visited.at(-1), "location");
  test.history.forward();
  assert.equal(test.visited.at(-1), "treatment");
  test.controller.navigate("location", { replace: true });
  assert.match(test.entries[test.index()].url, /clientStep=location/);
}

console.log("Booking step browser history tests passed.");
