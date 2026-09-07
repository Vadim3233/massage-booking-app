import { ENHANCEMENTS_STORAGE_KEY } from "../config/storageKeys.js";
import { getPublicSupabaseClient, getSupabaseClient } from "./bookingSupabase.js";
import { readStoredJson, writeStoredJson } from "./localStorage.js";
import { DEFAULT_ENHANCEMENTS, sanitizeStoredEnhancements } from "./enhancementSettings.js";

export const BUSINESS_ENHANCEMENTS_TABLE = "business_enhancements";
export const BUSINESS_ENHANCEMENT_CATALOGUE_TABLE = "business_enhancement_catalogue";

const ENHANCEMENT_COLUMNS = "id,name,description,price,duration_minutes,active,display_order,updated_at";

function isMissingEnhancementTable(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    ([BUSINESS_ENHANCEMENTS_TABLE, BUSINESS_ENHANCEMENT_CATALOGUE_TABLE].some((tableName) =>
      message.includes(tableName)
    ) &&
      (message.includes("does not exist") || message.includes("schema cache")))
  );
}

function enhancementPersistenceError(error, action) {
  if (isMissingEnhancementTable(error)) {
    return new Error("Enhancement storage is unavailable. Please apply the latest Supabase migration.");
  }
  return new Error(`Enhancements could not be ${action}: ${error?.message || "Supabase request failed"}`);
}

function rowToEnhancement(row = {}) {
  return {
    active: row.active !== false,
    description: String(row.description ?? ""),
    durationMinutes: Math.max(0, Math.round(Number(row.duration_minutes) || 0)),
    id: String(row.id || ""),
    name: String(row.name || ""),
    price: Math.max(0, Number(row.price) || 0),
  };
}

export function readCachedEnhancements() {
  const cachedValue = readStoredJson(ENHANCEMENTS_STORAGE_KEY, null);
  const enhancements = sanitizeStoredEnhancements(cachedValue);
  return {
    exists: Array.isArray(cachedValue),
    enhancements: Array.isArray(cachedValue) ? enhancements : DEFAULT_ENHANCEMENTS,
  };
}

export function cacheEnhancements(enhancements) {
  const normalizedEnhancements = sanitizeStoredEnhancements(enhancements);
  writeStoredJson(ENHANCEMENTS_STORAGE_KEY, normalizedEnhancements);
  return normalizedEnhancements;
}

export function enhancementSeedForUninitializedSupabase() {
  const cached = readCachedEnhancements();
  return {
    enhancements: cached.exists ? cached.enhancements : DEFAULT_ENHANCEMENTS,
    source: cached.exists ? "localStorage" : "defaults",
  };
}

export async function loadEnhancementsFromSupabase({ includeHidden = false } = {}) {
  const supabase = includeHidden ? await getSupabaseClient() : await getPublicSupabaseClient();
  const { data: catalogue, error: catalogueError } = await supabase
    .from(BUSINESS_ENHANCEMENT_CATALOGUE_TABLE)
    .select("id,initialized_at,updated_at")
    .eq("id", true)
    .maybeSingle();

  if (catalogueError) throw enhancementPersistenceError(catalogueError, "loaded");
  if (!catalogue?.id) return { status: "missing", enhancements: null, updatedAt: "" };

  const { data, error } = await supabase
    .from(BUSINESS_ENHANCEMENTS_TABLE)
    .select(ENHANCEMENT_COLUMNS)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw enhancementPersistenceError(error, "loaded");

  return {
    status: "found",
    enhancements: sanitizeStoredEnhancements((Array.isArray(data) ? data : []).map(rowToEnhancement)),
    updatedAt: catalogue.updated_at || "",
  };
}

export async function loadAndCacheEnhancementsFromSupabase(options = {}) {
  const result = await loadEnhancementsFromSupabase(options);
  if (result.status !== "found") return result;

  return {
    ...result,
    enhancements: cacheEnhancements(result.enhancements),
  };
}

export async function saveEnhancementsToSupabase(enhancements) {
  const normalizedEnhancements = sanitizeStoredEnhancements(enhancements);
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc("replace_business_enhancements", {
    enhancements_payload: normalizedEnhancements,
  });

  if (error) throw enhancementPersistenceError(error, "saved");

  return {
    enhancements: cacheEnhancements((Array.isArray(data) ? data : []).map(rowToEnhancement)),
  };
}
