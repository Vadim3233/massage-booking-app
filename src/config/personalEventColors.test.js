import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function readArrayConst(source, name) {
  const start = source.indexOf(`const ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);

  const arrayStart = source.indexOf("[", start);
  let depth = 0;
  for (let index = arrayStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "[") depth += 1;
    if (character === "]") depth -= 1;
    if (depth === 0) {
      const semicolon = source.indexOf(";", index);
      assert.notEqual(semicolon, -1, `${name} should end with a semicolon`);
      return source.slice(start, semicolon + 1);
    }
  }

  throw new Error(`Could not read ${name}`);
}

function readSimpleConst(source, name) {
  const start = source.indexOf(`const ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);

  const semicolon = source.indexOf(";", start);
  assert.notEqual(semicolon, -1, `${name} should end with a semicolon`);
  return source.slice(start, semicolon + 1);
}

function readBalancedFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);

  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  throw new Error(`Could not read ${name}`);
}

async function loadPersonalEventColors() {
  const modulePath = resolve("src/config/personalEventColors.js");
  if (existsSync(modulePath)) {
    return import("./personalEventColors.js");
  }

  const appSource = readFileSync(resolve("src/App.jsx"), "utf8");
  const source = [
    readArrayConst(appSource, "PERSONAL_EVENT_COLORS").replace("const PERSONAL_EVENT_COLORS", "export const PERSONAL_EVENT_COLORS"),
    readSimpleConst(appSource, "DEFAULT_PERSONAL_EVENT_COLOR").replace("const DEFAULT_PERSONAL_EVENT_COLOR", "export const DEFAULT_PERSONAL_EVENT_COLOR"),
    readBalancedFunction(appSource, "personalEventColorClass").replace("function personalEventColorClass", "export function personalEventColorClass"),
  ].join("\n\n");

  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
}

const {
  DEFAULT_PERSONAL_EVENT_COLOR,
  PERSONAL_EVENT_COLORS,
  personalEventColorClass,
} = await loadPersonalEventColors();

const expectedColors = [
  { id: "orange", label: "Orange" },
  { id: "red", label: "Red" },
  { id: "green", label: "Green" },
  { id: "blue", label: "Blue" },
  { id: "purple", label: "Purple" },
];

assert.equal(PERSONAL_EVENT_COLORS.length, 5);
assert.deepEqual(PERSONAL_EVENT_COLORS, expectedColors);
assert.deepEqual(PERSONAL_EVENT_COLORS.map((color) => color.id), ["orange", "red", "green", "blue", "purple"]);
assert.deepEqual(PERSONAL_EVENT_COLORS.map((color) => color.label), ["Orange", "Red", "Green", "Blue", "Purple"]);

for (const color of PERSONAL_EVENT_COLORS) {
  assert.deepEqual(Object.keys(color), ["id", "label"]);
  assert.equal(typeof color.id, "string");
  assert.equal(typeof color.label, "string");
}

assert.equal(Object.isFrozen(PERSONAL_EVENT_COLORS), false);
for (const color of PERSONAL_EVENT_COLORS) {
  assert.equal(Object.isFrozen(color), false);
}

assert.equal(DEFAULT_PERSONAL_EVENT_COLOR, "orange");

for (const color of ["orange", "red", "green", "blue", "purple"]) {
  assert.equal(personalEventColorClass(color), `personal-event-color-${color}`);
}

assert.equal(personalEventColorClass("unknown"), "personal-event-color-orange");
assert.equal(personalEventColorClass(""), "personal-event-color-orange");
assert.equal(personalEventColorClass(" orange "), "personal-event-color-orange");
assert.equal(personalEventColorClass("Orange"), "personal-event-color-orange");
assert.equal(personalEventColorClass(null), "personal-event-color-orange");
assert.equal(personalEventColorClass(undefined), "personal-event-color-orange");
assert.equal(personalEventColorClass(123), "personal-event-color-orange");
assert.equal(personalEventColorClass({ id: "red" }), "personal-event-color-orange");
assert.equal(personalEventColorClass(["red"]), "personal-event-color-orange");

assert.equal(personalEventColorClass("blue"), personalEventColorClass("blue"));

const colorSnapshot = structuredClone(PERSONAL_EVENT_COLORS);
personalEventColorClass("purple");
personalEventColorClass("missing");
personalEventColorClass(null);
assert.deepEqual(PERSONAL_EVENT_COLORS, colorSnapshot);

console.log("Personal event color tests passed.");
