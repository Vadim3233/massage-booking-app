import { getPublicSupabaseClient, getSupabaseClient } from "./bookingSupabase.js";

export function normalizeSavedServiceAreas(areas) {
  if (!Array.isArray(areas)) throw new Error("Area settings returned an invalid response.");
  const ids = new Set();
  return areas.map((area) => {
    const id = String(area.id || "").trim();
    const name = String(area.name || "").trim();
    const congestionFee = Number(area.congestionFee);
    const travelSurcharge = Number(area.travelSurcharge);
    if (!id || !name || ids.has(id) || !Number.isFinite(congestionFee) || congestionFee < 0
      || !Number.isFinite(travelSurcharge) || travelSurcharge < 0) {
      throw new Error("Each area needs a unique identity, a name and valid non-negative fees.");
    }
    ids.add(id);
    return { id, name, active: area.active !== false, custom: Boolean(area.custom), congestionFee, travelSurcharge };
  });
}

function fromRows(rows) {
  return normalizeSavedServiceAreas(rows?.map((row) => ({
    ...row, congestionFee: row.congestion_fee, travelSurcharge: row.travel_fee,
  })));
}

function persistenceError(error) {
  if (["42P01", "PGRST205", "PGRST202"].includes(error?.code)) {
    return new Error("Area storage is unavailable. The service areas migration needs to be applied after review.");
  }
  return new Error("Area settings could not be saved or loaded. Please try again.");
}

export async function loadServiceAreasFromSupabase({ includeHidden = false } = {}) {
  const client = includeHidden ? await getSupabaseClient() : await getPublicSupabaseClient();
  const { data: catalogue, error: catalogueError } = await client.from("business_service_area_catalogue")
    .select("id").eq("id", true).maybeSingle();
  if (catalogueError) throw persistenceError(catalogueError);
  if (!catalogue) return { initialized: false, areas: [] };
  const { data, error } = await client.from("business_service_areas")
    .select("id,name,active,custom,congestion_fee,travel_fee,display_order").order("display_order");
  if (error) throw persistenceError(error);
  return { initialized: true, areas: fromRows(data) };
}

export async function saveServiceAreasToSupabase(areas) {
  const normalized = normalizeSavedServiceAreas(areas);
  const client = await getSupabaseClient();
  const { data, error } = await client.rpc("replace_business_service_areas", { areas_payload: normalized });
  if (error) throw persistenceError(error);
  return fromRows(data);
}
