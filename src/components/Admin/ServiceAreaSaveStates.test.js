import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";
const source = readFileSync(new URL("./ServiceAreasSettingsPanel.jsx", import.meta.url), "utf8")
  .replace('import React from "react";', '').replace('export function', 'function');
const transformed = await transformWithOxc(source, "areas.jsx", { jsx: { runtime: "classic" } });
const Panel = new Function("React", `${transformed.code}; return ServiceAreasSettingsPanel;`)(React);
const appSource = readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("../../hooks/useServiceAreaSettings.js", import.meta.url), "utf8");
assert.match(appSource, /React\.lazy\(\(\) => import\("\.\/components\/Admin\/LiveAdminWorkspace\.jsx"\)/);
assert.match(hookSource, /async function save\(\)[\s\S]*saveServiceAreasToSupabase\(state\.draft\)/);
assert.doesNotMatch(hookSource, /useEffect\([\s\S]{0,500}saveServiceAreasToSupabase/);
const props = {
  serviceAreas: [{ id: "mayfair", name: "Mayfair", congestionFee: 20, travelSurcharge: 15, active: true }],
  onAddServiceArea() {}, onDeleteServiceArea() {}, onUpdateServiceArea() {}, onSave() {}, onRetry() {},
};
for (const [status, disabled, expected] of [
  [{ ready: true, dirty: false }, true, "Save area settings"],
  [{ ready: true, dirty: true }, false, "Save area settings"],
  [{ ready: true, dirty: true, saving: true }, true, "Saving area settings..."],
  [{ ready: true, dirty: true, type: "error", message: "Save failed" }, false, "Save failed"],
  [{ ready: false, type: "error", message: "Load failed" }, true, "Retry loading areas"],
]) {
  const html = renderToStaticMarkup(React.createElement(Panel, { ...props, saveStatus: status }));
  const button = html.match(/<button[^>]*class="admin-primary-action"[^>]*>/)[0];
  assert.equal(button.includes('disabled=""'), disabled);
  assert.ok(html.includes(expected));
  assert.match(html, /Congestion fee/);
  assert.match(html, /Travel surcharge/);
  if (status.type === "error") assert.match(html, /role="alert"/);
}
console.log("Service areas settings UI tests passed.");
