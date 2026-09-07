import assert from "node:assert/strict";
import {
  DEFAULT_ENHANCEMENTS,
  getClientEnhancements,
  sanitizeStoredEnhancements,
} from "./enhancementSettings.js";

const hiddenCatalogue = [
  { ...DEFAULT_ENHANCEMENTS[0], active: false, name: "Renamed head massage", price: 22 },
  { ...DEFAULT_ENHANCEMENTS[1], active: true },
];

assert.equal(sanitizeStoredEnhancements(hiddenCatalogue)[0].active, false);
assert.equal(sanitizeStoredEnhancements(hiddenCatalogue)[0].price, 22);
assert.equal(sanitizeStoredEnhancements(hiddenCatalogue)[0].name, "Renamed head massage");

const reloadedCatalogue = sanitizeStoredEnhancements(JSON.parse(JSON.stringify(hiddenCatalogue)));
assert.equal(getClientEnhancements(reloadedCatalogue).some((item) => item.name === "Renamed head massage"), false);
assert.equal(getClientEnhancements(reloadedCatalogue).some((item) => item.name === "Hot stones"), true);
assert.deepEqual(sanitizeStoredEnhancements([]), []);
assert.deepEqual(sanitizeStoredEnhancements(undefined), DEFAULT_ENHANCEMENTS);

console.log("Enhancement persistence tests passed.");
