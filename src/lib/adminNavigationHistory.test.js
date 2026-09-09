import assert from "node:assert/strict";
import { createAdminNavigationHistory } from "./adminNavigationHistory.js";

const calendar = { tab: "calendar", calendarMode: "agenda", settingsCategory: null, settingsSubsection: null, settingsReturnCategory: null, clientDirectoryView: "history", clientProfileOpen: false, selectedCustomerId: null };
const settings = { ...calendar, tab: "settings" };
const servicesCategory = { ...settings, settingsCategory: "services" };
const preferences = { ...servicesCategory, settingsSubsection: "Session Preferences" };

function harness() {
  const entries = [{ state: null }];
  let index = 1;
  let listener = () => {};
  const history = {
    state: null,
    replaceState(state) { entries[index] = { state }; this.state = state; },
    pushState(state) { entries.splice(index + 1); entries.push({ state }); index++; this.state = state; },
    back() { index--; this.state = entries[index]?.state ?? null; listener({ state: this.state }); },
    forward() { index++; this.state = entries[index]?.state ?? null; listener({ state: this.state }); },
  };
  const restored = [];
  const controller = createAdminNavigationHistory({ history, onNavigate: (snapshot) => restored.push(snapshot) });
  listener = controller.handlePopState;
  controller.initialize(calendar);
  return { controller, entries, history, index: () => index, restored };
}

{
  const test = harness();
  test.controller.sync(settings);
  test.controller.sync(servicesCategory);
  test.controller.sync(preferences);
  assert.equal(test.entries.length, 5);
  test.history.back(); test.history.back();
  assert.deepEqual(test.restored, [servicesCategory, settings]);
  test.history.forward();
  assert.deepEqual(test.restored.at(-1), servicesCategory);
}

{
  const test = harness();
  const clients = { ...calendar, tab: "customers" };
  const access = { ...clients, clientDirectoryView: "access" };
  const pending = { ...calendar, tab: "pending" };
  test.controller.sync(clients);
  test.controller.sync(access);
  test.controller.sync(pending);
  test.history.back(); test.history.back(); test.history.back();
  assert.deepEqual(test.restored, [access, clients, calendar]);
  test.history.forward(); test.history.forward();
  assert.deepEqual(test.restored.slice(-2), [clients, access]);
}

{
  const test = harness();
  test.controller.sync(calendar);
  test.controller.sync({ ...calendar });
  assert.equal(test.entries.length, 2);
  const fieldDraft = { search: "client", notes: "changed" };
  fieldDraft.search = "another client";
  assert.equal(test.entries.length, 2);
  test.history.back();
  assert.equal(test.index(), 0);
}

{
  const test = harness();
  test.controller.sync(settings);
  test.controller.sync(servicesCategory);
  test.controller.sync(preferences);
  test.controller.sync(servicesCategory);
  assert.equal(test.index(), 3);
  test.history.forward();
  assert.deepEqual(test.restored.at(-1), preferences);
}

console.log("Admin browser history tests passed.");
