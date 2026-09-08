const HISTORY_KEY = "__vadAdminNavigation";

function sameSnapshot(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

export function createAdminNavigationHistory({ history, onNavigate }) {
  const flowId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const entries = new Map();
  let currentIndex = 0;
  let currentSnapshot = null;
  let initialized = false;

  function stateFor(snapshot, index) {
    return { ...(history.state || {}), [HISTORY_KEY]: { flowId, index, snapshot } };
  }

  function initialize(snapshot) {
    if (initialized) return;
    currentSnapshot = snapshot;
    entries.set(0, snapshot);
    history.replaceState(stateFor(snapshot, 0), "");
    initialized = true;
  }

  function sync(snapshot) {
    if (!initialized) initialize(snapshot);
    if (sameSnapshot(snapshot, currentSnapshot)) return false;
    if (currentIndex > 0 && sameSnapshot(snapshot, entries.get(currentIndex - 1))) {
      history.back();
      return true;
    }
    if (sameSnapshot(snapshot, entries.get(currentIndex + 1))) {
      history.forward();
      return true;
    }
    currentIndex += 1;
    for (const index of [...entries.keys()]) if (index > currentIndex) entries.delete(index);
    currentSnapshot = snapshot;
    entries.set(currentIndex, snapshot);
    history.pushState(stateFor(snapshot, currentIndex), "");
    return true;
  }

  function handlePopState(event) {
    const entry = event?.state?.[HISTORY_KEY];
    if (!entry || entry.flowId !== flowId || !entry.snapshot) return false;
    currentIndex = entry.index;
    currentSnapshot = entry.snapshot;
    entries.set(currentIndex, currentSnapshot);
    onNavigate(currentSnapshot);
    return true;
  }

  return { handlePopState, initialize, sync };
}
