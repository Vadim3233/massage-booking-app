import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync(new URL("./LiveAdminWorkspace.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../styles/app.css", import.meta.url), "utf8");

assert.equal((workspace.match(/\{workingScheduleSaveLabel\(\)\}/g) || []).length, 1, "Working Hours has one Save action");
assert.match(workspace, /admin-nav-tab-\$\{tab\.id\}/, "Admin tabs expose stable responsive selectors");
assert.match(styles, /\.admin-nav-tab-analytics[\s\S]*\.admin-nav-tab-settings[\s\S]*display:\s*none/, "secondary destinations leave mobile bottom navigation");
assert.match(styles, /\.weekly-working-summary\s*\{[\s\S]*grid-template-areas:/, "weekday summaries reflow on mobile");
assert.match(styles, /\.weekly-working-footer\s+\.admin-danger-option\s*\{[\s\S]*width:\s*fit-content/, "weekly reset remains a secondary utility action");
assert.match(styles, /\.day-settings-time-grid\s*\{[\s\S]*grid-template-columns:\s*1fr/, "date override time controls stack on narrow screens");

console.log("Admin mobile layout tests passed.");
