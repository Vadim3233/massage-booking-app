import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Activity,
  Baby,
  Bone,
  Flame,
  HandHeart,
  HeartPulse,
  Leaf,
  StretchHorizontal,
  UserRound,
  Waves,
} from "lucide-react";

globalThis.__clientTreatmentCardTestIcons = {
  Activity,
  Baby,
  Bone,
  Flame,
  HandHeart,
  HeartPulse,
  Leaf,
  StretchHorizontal,
  UserRound,
  Waves,
};

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

function readBalancedConst(source, name) {
  const start = source.indexOf(`const ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);

  const objectStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = objectStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) {
      const semicolon = source.indexOf(";", index);
      assert.notEqual(semicolon, -1, `${name} should end with a semicolon`);
      return source.slice(start, semicolon + 1);
    }
  }

  throw new Error(`Could not read ${name}`);
}

async function loadClientTreatmentCards() {
  const modulePath = resolve("src/lib/clientTreatmentCards.js");
  if (existsSync(modulePath)) {
    return import("./clientTreatmentCards.js");
  }

  const appSource = readFileSync(resolve("src/App.jsx"), "utf8");
  const source = [
    "const { Activity, Baby, Bone, Flame, HandHeart, HeartPulse, Leaf, StretchHorizontal, UserRound, Waves } = globalThis.__clientTreatmentCardTestIcons;",
    readBalancedConst(appSource, "CLIENT_TREATMENT_CARD_DETAILS").replace("const CLIENT_TREATMENT_CARD_DETAILS", "export const CLIENT_TREATMENT_CARD_DETAILS"),
    readBalancedFunction(appSource, "getServiceIconFromText").replace("function getServiceIconFromText", "export function getServiceIconFromText"),
    readBalancedFunction(appSource, "getClientTreatmentCardDetails").replace("function getClientTreatmentCardDetails", "export function getClientTreatmentCardDetails"),
  ].join("\n\n");

  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
}

const {
  CLIENT_TREATMENT_CARD_DETAILS,
  getClientTreatmentCardDetails,
  getServiceIconFromText,
} = await loadClientTreatmentCards();

assert.deepEqual(CLIENT_TREATMENT_CARD_DETAILS, {
  massage: {
    description: "Bespoke mobile massage adapted to what your body needs.",
    icon: HandHeart,
    title: "Massage",
  },
  "assisted-stretching": {
    description: "Guided stretching to improve mobility and ease restriction.",
    icon: StretchHorizontal,
    title: "Assisted Stretching",
  },
  "soft-tissue-therapy": {
    description: "Targeted soft tissue work for recovery, tension, and movement.",
    icon: HeartPulse,
    title: "Soft Tissue Therapy",
  },
  "body-exam": {
    description: "A focused body assessment before planning your next session.",
    icon: Activity,
    title: "Body Exam",
  },
});

{
  const details = getClientTreatmentCardDetails({
    id: "massage",
    name: "Custom Massage",
    shortDescription: "Custom short description.",
  });

  assert.equal(details.title, "Custom Massage");
  assert.equal(details.description, "Custom short description.");
  assert.equal(details.icon, HandHeart);
}

{
  assert.equal(getServiceIconFromText({ name: "Prenatal care" }), Baby);
  assert.equal(getServiceIconFromText({ name: "assisted stretching" }), StretchHorizontal);
  assert.equal(getServiceIconFromText({ name: "soft tissue therapy" }), HeartPulse);
  assert.equal(getServiceIconFromText({ name: "recovery session" }), HeartPulse);
  assert.equal(getServiceIconFromText({ name: "head massage" }), UserRound);
  assert.equal(getServiceIconFromText({ name: "neck and shoulders" }), UserRound);
  assert.equal(getServiceIconFromText({ name: "hot stone" }), Flame);
  assert.equal(getServiceIconFromText({ name: "sport performance" }), Activity);
  assert.equal(getServiceIconFromText({ name: "relax and calm" }), Waves);
  assert.equal(getServiceIconFromText({ name: "deep tension" }), Bone);
  assert.equal(getServiceIconFromText({ name: "massage treatment" }), HandHeart);
}

{
  assert.equal(getServiceIconFromText({ name: "PRENATAL MASSAGE" }), Baby);
  assert.equal(getServiceIconFromText({ name: "stretching" }), StretchHorizontal);
  assert.equal(getServiceIconFromText({ name: "soft tissue recovery massage" }), HeartPulse);
  assert.equal(getServiceIconFromText({ name: "head hot stone sport relax deep massage" }), UserRound);
  assert.equal(getServiceIconFromText({ name: "hot stone sport relax deep massage" }), Flame);
  assert.equal(getServiceIconFromText({ name: "sport relax deep massage" }), Activity);
  assert.equal(getServiceIconFromText({ name: "relax deep massage" }), Waves);
  assert.equal(getServiceIconFromText({ name: "deep massage" }), Bone);
}

{
  assert.deepEqual(getClientTreatmentCardDetails({ id: "unknown-service" }), {
    description: "A tailored mobile massage treatment.",
    icon: Leaf,
    title: "Massage treatment",
  });

  assert.deepEqual(getClientTreatmentCardDetails({}), {
    description: "A tailored mobile massage treatment.",
    icon: Leaf,
    title: "Massage treatment",
  });

  assert.deepEqual(getClientTreatmentCardDetails({ id: "massage" }), {
    description: "Bespoke mobile massage adapted to what your body needs.",
    icon: HandHeart,
    title: "Massage",
  });

  assert.deepEqual(getClientTreatmentCardDetails({
    id: "body-exam",
    name: "",
    shortDescription: "",
  }), {
    description: "A focused body assessment before planning your next session.",
    icon: Activity,
    title: "Body Exam",
  });
}

{
  assert.equal(getServiceIconFromText(null), null);
  assert.equal(getServiceIconFromText(undefined), null);
  assert.throws(() => getClientTreatmentCardDetails(null), TypeError);
  assert.throws(() => getClientTreatmentCardDetails(undefined), TypeError);
}

console.log("Client treatment card tests passed.");
