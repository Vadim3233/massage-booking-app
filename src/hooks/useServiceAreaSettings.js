import { useEffect, useReducer, useRef, useState } from "react";
import { SERVICE_AREAS_STORAGE_KEY } from "../config/storageKeys.js";
import { readStoredJson, writeStoredJson } from "../lib/localStorage.js";
import { sanitizeServiceAreas } from "../lib/serviceAreas.js";
import { loadServiceAreasFromSupabase, saveServiceAreasToSupabase } from "../lib/serviceAreasSupabase.js";
import { areaSettingsDirty, areaSettingsReducer, createAreaSettingsState } from "../lib/serviceAreaSettingsState.js";

export function useServiceAreaSettings(includeHidden) {
  const [state, dispatch] = useReducer(areaSettingsReducer, null, () =>
    createAreaSettingsState(sanitizeServiceAreas(readStoredJson(SERVICE_AREAS_STORAGE_KEY, null))));
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  const saving = useRef(false);
  useEffect(() => {
    const current = ++generation.current;
    dispatch({ type: "loading" });
    loadServiceAreasFromSupabase({ includeHidden }).then((result) => {
      if (generation.current !== current) return;
      dispatch({ type: "loaded", ...result });
    }).catch((error) => {
      if (generation.current === current) dispatch({ type: "failed", message: error.message });
    });
    return () => { generation.current++; };
  }, [includeHidden, reload]);
  // Refresh authoritative pricing when a client returns to the app.
  useEffect(() => {
    if (includeHidden) return;
    const refresh = () => setReload((value) => value + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [includeHidden]);
  async function save() {
    if (!includeHidden || !state.ready || state.loading || saving.current || !areaSettingsDirty(state)) return;
    saving.current = true;
    const current = generation.current;
    dispatch({ type: "saving" });
    try {
      const areas = await saveServiceAreasToSupabase(state.draft);
      if (generation.current !== current) return;
      writeStoredJson(SERVICE_AREAS_STORAGE_KEY, areas);
      dispatch({ type: "saved", areas });
    } catch (error) {
      if (generation.current === current) dispatch({ type: "failed", message: error.message });
    } finally { saving.current = false; }
  }
  return { ...state, dirty: areaSettingsDirty(state), save,
    retry: () => setReload((value) => value + 1),
    setDraft: (update) => { if (!state.loading && !saving.current) dispatch({ type: "edit", update }); },
  };
}
