import "dotenv/config";

export const GOOGLE_PLACEHOLDER_KEY = "GOOGLE_MAPS_API_KEY";
export const HERE_PLACEHOLDER_KEY = "HERE_API_KEY";
export const GEOAPIFY_PLACEHOLDER_KEY = "GEOAPIFY_API_KEY";

export function getMapsProviderName() {
  return String(process.env.MAPS_PROVIDER || "google").trim().toLowerCase();
}

export function getGoogleMapsApiKey() {
  return String(process.env.GOOGLE_MAPS_API_KEY || "").trim();
}

export function getHereApiKey() {
  return String(process.env.HERE_API_KEY || "").trim();
}

export function getGeoapifyApiKey() {
  return String(process.env.GEOAPIFY_API_KEY || "").trim();
}

export function hasGoogleMapsKey() {
  return getGoogleMapsApiKey().length > 0;
}

export function hasHereApiKey() {
  return getHereApiKey().length > 0;
}

export function hasGeoapifyApiKey() {
  return getGeoapifyApiKey().length > 0;
}

export function shouldUseGoogleSimulation() {
  return getGoogleMapsApiKey() === GOOGLE_PLACEHOLDER_KEY;
}

export function shouldUseHereSimulation() {
  return getHereApiKey() === HERE_PLACEHOLDER_KEY;
}

export function shouldUseGeoapifySimulation() {
  return getGeoapifyApiKey() === GEOAPIFY_PLACEHOLDER_KEY;
}
