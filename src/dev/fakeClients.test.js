import assert from "node:assert/strict";
import { fakeClients, pickFakeClientForArea } from "./fakeClients.js";

const maleNames = new Set([
  "Oliver Bennett",
  "Henry Clarke",
  "Arthur Morgan",
  "George Turner",
  "Thomas Harris",
  "William Foster",
  "James Collins",
  "Daniel Hughes",
  "Samuel Edwards",
  "Alexander Price",
  "Benjamin Scott",
  "Joseph Carter",
  "Edward Murphy",
  "Leo Richardson",
  "Maxwell Cooper",
]);

const femaleNames = new Set([
  "Amelia Hart",
  "Olivia Parker",
  "Isabella Ward",
  "Sophia Lane",
  "Charlotte Green",
  "Emily Brooks",
  "Grace Phillips",
  "Mia Fletcher",
  "Ella Robertson",
  "Ava Mitchell",
  "Lily Chapman",
  "Freya Russell",
  "Ruby Spencer",
  "Ivy Reynolds",
  "Hannah Walsh",
]);

assert.equal(fakeClients.length, 30);
assert.equal(fakeClients.filter((client) => maleNames.has(client.name)).length, 15);
assert.equal(fakeClients.filter((client) => femaleNames.has(client.name)).length, 15);

for (const client of fakeClients) {
  assert.match(client.email, /^[a-z.]+@example\.com$/);
  assert.match(client.phone, /^07\d{3} \d{6}$/);
  assert.ok(client.name);
  assert.ok(client.area);
  assert.ok(client.streetAddress);
  assert.ok(client.city);
  assert.ok(client.postcode);
}

for (let index = 0; index < 20; index += 1) {
  assert.equal(pickFakeClientForArea("Chelsea").area, "Chelsea");
  assert.equal(pickFakeClientForArea("Fulham").area, "Fulham");
  assert.ok(fakeClients.includes(pickFakeClientForArea("Unsupported Area")));
}

console.log("Fake client dev fixtures tests passed.");
