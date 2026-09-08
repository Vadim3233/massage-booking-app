export function createAreaSettingsState(draft = []) {
  return { areas: [], draft, baseline: null, loading: true, saving: false, ready: false, message: "", type: "" };
}
export function areaSettingsDirty(state) {
  return state.baseline === null || JSON.stringify(state.draft) !== JSON.stringify(state.baseline);
}
export function areaSettingsReducer(state, action) {
  switch (action.type) {
    case "loading": return { ...state, loading: true, message: "", type: "" };
    case "loaded": return {
      ...state, areas: action.areas, draft: action.initialized ? action.areas : state.draft,
      baseline: action.initialized ? action.areas : null, loading: false, saving: false, ready: true,
      message: action.initialized ? "" : "Review these browser settings, then save to make them available on every device.", type: "info",
    };
    case "edit": return { ...state, draft: typeof action.update === "function" ? action.update(state.draft) : action.update, message: "Unsaved area settings", type: "info" };
    case "saving": return { ...state, saving: true, message: "Saving area settings...", type: "info" };
    case "saved": return { ...state, areas: action.areas, draft: action.areas, baseline: action.areas, saving: false, message: "Area settings saved.", type: "success" };
    case "failed": return { ...state, loading: false, saving: false, message: action.message, type: "error" };
    default: return state;
  }
}
