import { getMapsProvider } from "./maps.provider";
import { CoordinateLike, RouteInfo } from "./maps.types";

export function getActiveMapsProvider() {
  return getMapsProvider();
}

export const getRouteDetails = async (
  origin: CoordinateLike,
  destination: CoordinateLike
): Promise<RouteInfo | null> => {
  try {
    return await getMapsProvider().getRouteDetails(origin, destination);
  } catch (error) {
    console.error("Erreur provider maps:", error);
    return null;
  }
};
