import assert from "node:assert/strict";
import {
  INITIAL_SESSION_PREFERENCE_IDS,
  SESSION_PREFERENCES,
  normalizeSessionPreferenceIds,
  sanitizeSessionPreferences,
  sessionPreferenceLabels,
  sessionPreferenceSnapshots,
  toggleSessionPreferenceId,
  visibleSessionPreferences,
} from "./sessionPreferences.js";

assert.equal(SESSION_PREFERENCES.length, 20);
const neckFocusId = "11111111-1111-4111-8111-111111111111";
const strongerShouldersId = "11111111-1111-4111-8111-111111111116";
const lighterCalvesId = "11111111-1111-4111-8111-111111111118";
const lighterPressureId = "11111111-1111-4111-8111-111111111119";
const firmPressureId = "11111111-1111-4111-8111-111111111120";
const headMassageId = "11111111-1111-4111-8111-111111111121";
const footMassageId = "11111111-1111-4111-8111-111111111122";
const avoidFeetId = "11111111-1111-4111-8111-111111111127";
assert.deepEqual(INITIAL_SESSION_PREFERENCE_IDS, [
  neckFocusId,
  strongerShouldersId,
  lighterCalvesId,
  headMassageId,
  footMassageId,
  avoidFeetId,
]);

{
  const selected = toggleSessionPreferenceId([], neckFocusId);
  assert.deepEqual(selected, [neckFocusId]);
  assert.deepEqual(toggleSessionPreferenceId(selected, neckFocusId), []);
}

{
  const withFootMassage = toggleSessionPreferenceId([avoidFeetId], footMassageId);
  assert.deepEqual(withFootMassage, [footMassageId]);
  const avoidFeetAgain = toggleSessionPreferenceId(withFootMassage, avoidFeetId);
  assert.deepEqual(avoidFeetAgain, [avoidFeetId]);
}

{
  assert.deepEqual(toggleSessionPreferenceId([lighterPressureId], firmPressureId), [firmPressureId]);
  assert.deepEqual(toggleSessionPreferenceId([firmPressureId], lighterPressureId), [lighterPressureId]);
}

{
  assert.deepEqual(
    normalizeSessionPreferenceIds(["neck_focus", "unknown_preference", "neck_focus", "", null]),
    [neckFocusId]
  );
  assert.deepEqual(sessionPreferenceLabels(["neck_focus", "head_massage", "unknown_preference"]), [
    "Neck focus",
    "Head massage",
  ]);
}

{
  const legacyCachedPreferences = sanitizeSessionPreferences([
    { id: "neck_focus", label: "Neck focus", sortOrder: 1, visible: true },
    { id: "shoulder_focus", label: "Shoulder focus", sortOrder: 2, visible: true },
  ]);
  assert.deepEqual(legacyCachedPreferences.map((item) => item.id), [
    neckFocusId,
    "11111111-1111-4111-8111-111111111112",
  ]);
  assert.deepEqual(toggleSessionPreferenceId([], "neck_focus", legacyCachedPreferences), [neckFocusId]);
  assert.deepEqual(toggleSessionPreferenceId([], neckFocusId, legacyCachedPreferences), [neckFocusId]);
}

{
  const customPreferences = sanitizeSessionPreferences([
    { id: "22222222-2222-4222-8222-222222222221", label: "Visible custom", sortOrder: 2, visible: true },
    { id: "22222222-2222-4222-8222-222222222222", label: "Hidden custom", sortOrder: 1, visible: false },
    { id: "22222222-2222-4222-8222-222222222223", label: "Deleted custom", sortOrder: 3, visible: true, deletedAt: "2026-07-13T10:00:00.000Z" },
  ]);
  assert.deepEqual(visibleSessionPreferences(customPreferences).map((item) => item.label), ["Visible custom"]);
}

{
  const customId = "33333333-3333-4333-8333-333333333333";
  const snapshots = sessionPreferenceSnapshots([customId], [{ id: customId, label: "Quiet music", visible: true, sortOrder: 1 }]);
  assert.deepEqual(snapshots, [{ id: customId, label: "Quiet music" }]);
  assert.deepEqual(sessionPreferenceLabels([customId], [], snapshots), ["Quiet music"]);
}

console.log("Session preference tests passed.");
