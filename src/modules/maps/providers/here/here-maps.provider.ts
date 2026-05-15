import { MapsProvider } from "../../maps.types";

function notImplemented(): never {
  throw new Error("HERE maps provider non implemente pour le moment.");
}

export const hereMapsProvider: MapsProvider = {
  async getRoute() {
    return notImplemented();
  },
  async getRouteDetails() {
    return notImplemented();
  },
  async geocodeAddress() {
    return notImplemented();
  },
  async resolveLocation() {
    return notImplemented();
  },
  async getPlaceSuggestions() {
    return notImplemented();
  },
};
