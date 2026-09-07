export const DEFAULT_COVERAGE_ZONES = {
  preapproval: ["W1", "W2", "W3", "W5", "W7", "W9", "W13", "WC1", "WC2", "NW1", "NW8", "SW1", "SW3", "SW4", "SW7", "SW8", "SW9", "SW12", "SW17", "SW18", "SE1", "SE11"],
  usual: ["W4", "W6", "W8", "W10", "W11", "W12", "W14", "SW5", "SW6", "SW10", "SW11", "SW13", "SW15"],
};

export function normalizePostcodeAreaList(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(
      value
        .map((item) => String(item ?? "").toUpperCase().replace(/\s+/g, ""))
        .filter((item) => /^[A-Z]{1,2}\d[A-Z\d]?$/.test(item))
    ));
  }

  return normalizePostcodeAreaList(String(value ?? "").split(/[\s,;]+/));
}

export function sanitizeCoverageZones(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const usual = normalizePostcodeAreaList(source.usual);
  const preapproval = normalizePostcodeAreaList(source.preapproval);

  return {
    preapproval: preapproval.length ? preapproval : DEFAULT_COVERAGE_ZONES.preapproval,
    usual: usual.length ? usual : DEFAULT_COVERAGE_ZONES.usual,
  };
}

export function getPostcodeArea(postcode) {
  const compact = String(postcode ?? "").toUpperCase().replace(/\s+/g, "");
  const match = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)/);
  return match ? match[1] : "";
}

export function getPostcodeCoverage(postcode, coverageZones = DEFAULT_COVERAGE_ZONES) {
  const area = getPostcodeArea(postcode);
  const usualAreas = new Set(normalizePostcodeAreaList(coverageZones.usual));
  const preApprovalAreas = new Set(normalizePostcodeAreaList(coverageZones.preapproval));

  if (!area) return { area, status: "missing", message: "Enter your treatment postcode to continue." };
  if (usualAreas.has(area)) return { area, status: "usual", message: "This postcode is in the usual working area." };
  if (preApprovalAreas.has(area)) {
    return {
      area,
      status: "preapproval",
      message: "This postcode is in the wider area and needs pre-approval before booking.",
    };
  }
  return {
    area,
    status: "outside",
    message: "This postcode is outside the current mobile massage coverage area.",
  };
}
