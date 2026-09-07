import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

function readDefaultCoverageZones(source) {
  const start = source.indexOf("const DEFAULT_COVERAGE_ZONES = {");
  assert.notEqual(start, -1, "DEFAULT_COVERAGE_ZONES should exist");
  const end = source.indexOf("\n};", start);
  assert.notEqual(end, -1, "DEFAULT_COVERAGE_ZONES should close");
  return source.slice(start, end + 3);
}

async function loadCoverageZones() {
  const modulePath = resolve("src/lib/coverageZones.js");
  if (existsSync(modulePath)) {
    return import("./coverageZones.js");
  }

  const appSource = readFileSync(resolve("src/App.jsx"), "utf8");
  const source = [
    readDefaultCoverageZones(appSource).replace("const DEFAULT_COVERAGE_ZONES", "export const DEFAULT_COVERAGE_ZONES"),
    readBalancedFunction(appSource, "normalizePostcodeAreaList").replace("function normalizePostcodeAreaList", "export function normalizePostcodeAreaList"),
    readBalancedFunction(appSource, "sanitizeCoverageZones").replace("function sanitizeCoverageZones", "export function sanitizeCoverageZones"),
    readBalancedFunction(appSource, "getPostcodeArea").replace("function getPostcodeArea", "export function getPostcodeArea"),
    readBalancedFunction(appSource, "getPostcodeCoverage").replace("function getPostcodeCoverage", "export function getPostcodeCoverage"),
  ].join("\n\n");

  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
}

const {
  DEFAULT_COVERAGE_ZONES,
  getPostcodeArea,
  getPostcodeCoverage,
  normalizePostcodeAreaList,
  sanitizeCoverageZones,
} = await loadCoverageZones();

assert.deepEqual(DEFAULT_COVERAGE_ZONES, {
  preapproval: ["W1", "W2", "W3", "W5", "W7", "W9", "W13", "WC1", "WC2", "NW1", "NW8", "SW1", "SW3", "SW4", "SW7", "SW8", "SW9", "SW12", "SW17", "SW18", "SE1", "SE11"],
  usual: ["W4", "W6", "W8", "W10", "W11", "W12", "W14", "SW5", "SW6", "SW10", "SW11", "SW13", "SW15"],
});

{
  assert.deepEqual(sanitizeCoverageZones(), DEFAULT_COVERAGE_ZONES);
  assert.deepEqual(sanitizeCoverageZones(null), DEFAULT_COVERAGE_ZONES);
  assert.deepEqual(sanitizeCoverageZones("W4"), DEFAULT_COVERAGE_ZONES);
  assert.deepEqual(sanitizeCoverageZones(["W4"]), DEFAULT_COVERAGE_ZONES);
}

{
  assert.deepEqual(normalizePostcodeAreaList("w4"), ["W4"]);
  assert.deepEqual(normalizePostcodeAreaList(" w 4 "), []);
  assert.deepEqual(normalizePostcodeAreaList([" w4 ", "W4", "sw 6", null, "bad-value"]), ["W4", "SW6"]);
}

{
  assert.equal(getPostcodeArea(" w4 1aa "), "W41");
  assert.equal(getPostcodeArea("sw6 2ab"), "SW62");
  assert.equal(getPostcodeArea("W4"), "W4");
  assert.equal(getPostcodeArea("SW6"), "SW6");
  assert.equal(getPostcodeArea("EC1A 1BB"), "EC1A");
  assert.equal(getPostcodeArea("not a postcode"), "");
  assert.equal(getPostcodeArea(null), "");
}

{
  assert.deepEqual(getPostcodeCoverage("W4"), {
    area: "W4",
    status: "usual",
    message: "This postcode is in the usual working area.",
  });
}

{
  assert.deepEqual(getPostcodeCoverage("SW1A"), {
    area: "SW1A",
    status: "outside",
    message: "This postcode is outside the current mobile massage coverage area.",
  });
  assert.deepEqual(getPostcodeCoverage("SW1"), {
    area: "SW1",
    status: "preapproval",
    message: "This postcode is in the wider area and needs pre-approval before booking.",
  });
}

{
  assert.deepEqual(getPostcodeCoverage("EC2A 1AA"), {
    area: "EC2A",
    status: "outside",
    message: "This postcode is outside the current mobile massage coverage area.",
  });
}

{
  assert.deepEqual(getPostcodeCoverage(""), {
    area: "",
    status: "missing",
    message: "Enter your treatment postcode to continue.",
  });
}

{
  assert.deepEqual(normalizePostcodeAreaList("W4, SW6, w10"), ["W4", "SW6", "W10"]);
  assert.deepEqual(normalizePostcodeAreaList("W4;SW6;w10"), ["W4", "SW6", "W10"]);
  assert.deepEqual(normalizePostcodeAreaList("W4 SW6 w10"), ["W4", "SW6", "W10"]);
}

{
  assert.deepEqual(sanitizeCoverageZones({ usual: [], preapproval: ["SW1"] }), {
    preapproval: ["SW1"],
    usual: DEFAULT_COVERAGE_ZONES.usual,
  });
  assert.deepEqual(sanitizeCoverageZones({ usual: ["W4"], preapproval: [] }), {
    preapproval: DEFAULT_COVERAGE_ZONES.preapproval,
    usual: ["W4"],
  });
}

{
  assert.deepEqual(normalizePostcodeAreaList(123), []);
  assert.deepEqual(normalizePostcodeAreaList({ usual: "W4" }), []);
  assert.deepEqual(sanitizeCoverageZones({ usual: 123, preapproval: { area: "SW1" } }), DEFAULT_COVERAGE_ZONES);
}

console.log("Coverage zone tests passed.");
