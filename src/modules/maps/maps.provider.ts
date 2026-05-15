import { getMapsProviderName } from "./maps.config";
import { MapsProvider } from "./maps.types";
import { googleMapsProvider } from "./providers/google/google-maps.provider";
import { hereMapsProvider } from "./providers/here/here-maps.provider";
import { geoapifyMapsProvider } from "./providers/geoapify/geoapify-maps.provider";

export function getMapsProvider(): MapsProvider {
  const providerName = getMapsProviderName();
  if (providerName === "here") return hereMapsProvider;
  if (providerName === "geoapify") return geoapifyMapsProvider;
  return googleMapsProvider;
}
