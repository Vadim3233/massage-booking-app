const CLIENT_AUTH_REDIRECT_PARAMS = {
  view: "client",
  clientStep: "my-bookings",
};

function viteEnv() {
  return typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
}

function browserLocation() {
  return typeof window !== "undefined" ? window.location : null;
}

export function normalizePublicAppUrl(value) {
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) return "";

  try {
    const url = new URL(trimmedValue);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function buildClientAuthRedirectUrl({ env = viteEnv(), location = browserLocation() } = {}) {
  const configuredProductionUrl = normalizePublicAppUrl(env?.VITE_PUBLIC_APP_URL);
  const productionMode = env?.PROD === true || env?.MODE === "production";
  const locationOrigin = location?.origin || "";
  const locationPathname = location?.pathname || "/";
  const baseUrl = productionMode && configuredProductionUrl
    ? configuredProductionUrl
    : `${locationOrigin}${locationPathname}`;
  const redirectUrl = new URL(baseUrl || "/", locationOrigin || "http://localhost");

  Object.entries(CLIENT_AUTH_REDIRECT_PARAMS).forEach(([key, value]) => {
    redirectUrl.searchParams.set(key, value);
  });

  return redirectUrl.toString();
}
