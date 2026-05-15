import axios from "axios";
import {
  CoordinateLike,
  GeocodeResult,
  MapsProvider,
  PlaceSuggestionResult,
  ResolvedLocationData,
  RouteInfo,
  RouteResponse,
} from "../../maps.types";
import {
  getGeoapifyApiKey,
  hasGeoapifyApiKey,
  shouldUseGeoapifySimulation,
} from "../../maps.config";
import {
  encodePolyline,
  formatDistanceText,
  formatDurationText,
  isExplicitPlaceName,
  normalizeAddress,
  parseCoordinate,
} from "../../shared/maps-helpers";
import {
  buildSimulatedGeocode,
  buildSimulatedPlaceSuggestions,
  buildSimulatedResolvedLocation,
  buildSimulatedRoute,
  buildSimulatedRouteDetails,
} from "../../shared/maps-simulation";

type GeoapifyResult = {
  lat?: number;
  lon?: number;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  place_id?: string;
  name?: string;
  result_type?: string;
};

type GeoapifyRouteResult = RouteResponse & {
  durationValue: number;
  points: Array<{ lat: number; lng: number }>;
};

function ensureGeoapifyKey() {
  if (!hasGeoapifyApiKey()) {
    throw new Error("GEOAPIFY_API_KEY manquante");
  }
  return getGeoapifyApiKey();
}

function toGeoapifyWaypoint(input: CoordinateLike) {
  const coordinate = parseCoordinate(input);
  if (!coordinate) return "";
  return `${coordinate.lat},${coordinate.lng}`;
}

function buildResolvedLocationFromResult(result?: GeoapifyResult | null): ResolvedLocationData | null {
  if (!result) return null;

  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const formattedAddress = normalizeAddress(result.formatted);
  const line1 = String(result.address_line1 || "").trim();
  const line2 = String(result.address_line2 || "").trim();
  const fallbackAddress = [line1, line2].filter(Boolean).join(", ");
  const address = normalizeAddress(fallbackAddress || formattedAddress);
  const candidateName = String(result.name || line1 || "").trim();
  const placeName = isExplicitPlaceName(candidateName) ? candidateName : null;
  const placeId = String(result.place_id || "").trim() || null;

  return {
    placeName,
    address,
    placeId,
    latitude,
    longitude,
  };
}

function buildRouteInfoFromGeoapifyRoute(route: RouteResponse & { durationValue?: number }): RouteInfo {
  return {
    distanceValue: route.distance,
    distanceText: route.distanceText,
    durationValue: Number(route.durationValue || 0),
    durationText: route.durationText,
  };
}

function buildRouteResponseFromPoints(
  points: Array<{ lat: number; lng: number }>,
  distanceValue: number,
  durationValue: number
): GeoapifyRouteResult | null {
  if (!points.length) return null;

  return {
    success: true,
    polyline: encodePolyline(points),
    distance: Math.max(0, Math.round(distanceValue || 0)),
    distanceText: formatDistanceText(distanceValue),
    durationText: formatDurationText(durationValue),
    durationValue: Math.max(60, Math.round(durationValue || 0)),
    points,
  };
}

async function fetchGeoapifyRoute(
  origin: string,
  destination: string,
  waypoint?: string
): Promise<GeoapifyRouteResult | null> {
  const apiKey = ensureGeoapifyKey();
  const waypoints = waypoint
    ? `${origin}|${waypoint}|${destination}`
    : `${origin}|${destination}`;

  const response = await axios.get("https://api.geoapify.com/v1/routing", {
    params: {
      waypoints,
      mode: "drive",
      apiKey,
    },
  });

  const feature = response.data?.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  const properties = feature?.properties;

  if (!Array.isArray(coordinates) || !properties) {
    console.error("[GEOAPIFY_ROUTE][INVALID_RESPONSE]", {
      origin,
      destination,
      waypoint,
      data: response.data,
    });
    return null;
  }

  const points = coordinates
    .filter((point: any) => Array.isArray(point) && point.length >= 2)
    .map((point: any) => ({
      lat: Number(point[1]),
      lng: Number(point[0]),
    }))
    .filter((point: any) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

  if (!points.length) {
    console.error("[GEOAPIFY_ROUTE][NO_VALID_POINTS]", {
      origin,
      destination,
      waypoint,
      coordinates,
    });
    return null;
  }

  const distanceValue = Math.max(0, Math.round(Number(properties.distance) || 0));
  const durationValue = Math.max(60, Math.round(Number(properties.time) || 0));

  return buildRouteResponseFromPoints(points, distanceValue, durationValue);
}

async function fetchNearestGeoapifyAddressCoordinate(
  input: CoordinateLike
): Promise<CoordinateLike | null> {
  const coordinate = parseCoordinate(input);
  if (!coordinate) return null;

  const response = await axios.get("https://api.geoapify.com/v1/geocode/reverse", {
    params: {
      lat: coordinate.lat,
      lon: coordinate.lng,
      format: "json",
      limit: 1,
      apiKey: ensureGeoapifyKey(),
    },
  });

  const result = response.data?.results?.[0];
  const resolved = buildResolvedLocationFromResult(result);
  if (!resolved) {
    console.error("[GEOAPIFY_ROUTE][REVERSE_GEOCODE_EMPTY]", {
      input,
      data: response.data,
    });
    return null;
  }

  return {
    lat: resolved.latitude,
    lng: resolved.longitude,
  };
}

export const geoapifyMapsProvider: MapsProvider = {
  async getRoute(origin, destination, waypoint): Promise<RouteResponse | null> {
    if (shouldUseGeoapifySimulation()) {
      return buildSimulatedRoute(origin, destination, waypoint);
    }

    const originText = toGeoapifyWaypoint(origin);
    const destinationText = toGeoapifyWaypoint(destination);
    const waypointText = waypoint ? toGeoapifyWaypoint(waypoint) : "";
    const directRoute = await fetchGeoapifyRoute(
      originText,
      destinationText,
      waypointText || undefined
    );
    if (directRoute || !waypointText) {
      return directRoute;
    }

    const firstLeg = await fetchGeoapifyRoute(originText, waypointText);
    const secondLeg = await fetchGeoapifyRoute(waypointText, destinationText);
    if (!firstLeg || !secondLeg) {
      const [resolvedOrigin, resolvedWaypoint, resolvedDestination] = await Promise.all([
        fetchNearestGeoapifyAddressCoordinate(origin),
        fetchNearestGeoapifyAddressCoordinate(waypoint),
        fetchNearestGeoapifyAddressCoordinate(destination),
      ]);

      if (!resolvedOrigin || !resolvedWaypoint || !resolvedDestination) {
        return null;
      }

      console.error("[GEOAPIFY_ROUTE][RETRY_WITH_REVERSE_GEOCODE]", {
        origin,
        destination,
        waypoint,
        resolvedOrigin,
        resolvedWaypoint,
        resolvedDestination,
      });

      const resolvedOriginText = toGeoapifyWaypoint(resolvedOrigin);
      const resolvedWaypointText = toGeoapifyWaypoint(resolvedWaypoint);
      const resolvedDestinationText = toGeoapifyWaypoint(resolvedDestination);

      const resolvedFirstLeg = await fetchGeoapifyRoute(
        resolvedOriginText,
        resolvedWaypointText
      );
      const resolvedSecondLeg = await fetchGeoapifyRoute(
        resolvedWaypointText,
        resolvedDestinationText
      );

      if (!resolvedFirstLeg || !resolvedSecondLeg) {
        console.error("[GEOAPIFY_ROUTE][FALLBACK_SIMULATED_ROUTE_FROM_RESOLVED_POINTS]", {
          origin,
          destination,
          waypoint,
          resolvedOrigin,
          resolvedWaypoint,
          resolvedDestination,
        });
        return buildSimulatedRoute(
          resolvedOrigin,
          resolvedDestination,
          resolvedWaypoint
        );
      }

      const resolvedMergedPoints = [
        ...resolvedFirstLeg.points,
        ...resolvedSecondLeg.points.slice(1),
      ];

      return buildRouteResponseFromPoints(
        resolvedMergedPoints,
        resolvedFirstLeg.distance + resolvedSecondLeg.distance,
        resolvedFirstLeg.durationValue + resolvedSecondLeg.durationValue
      );
    }

    const mergedPoints = [
      ...firstLeg.points,
      ...secondLeg.points.slice(1),
    ];

    return buildRouteResponseFromPoints(
      mergedPoints,
      firstLeg.distance + secondLeg.distance,
      firstLeg.durationValue + secondLeg.durationValue
    );
  },

  async getRouteDetails(origin, destination): Promise<RouteInfo | null> {
    if (shouldUseGeoapifySimulation()) {
      return buildSimulatedRouteDetails(origin, destination);
    }

    const originText = toGeoapifyWaypoint(origin);
    const destinationText = toGeoapifyWaypoint(destination);
    let route = await fetchGeoapifyRoute(originText, destinationText);
    if (!route) {
      const [resolvedOrigin, resolvedDestination] = await Promise.all([
        fetchNearestGeoapifyAddressCoordinate(origin),
        fetchNearestGeoapifyAddressCoordinate(destination),
      ]);

      if (resolvedOrigin && resolvedDestination) {
        console.error("[GEOAPIFY_ROUTE_DETAILS][RETRY_WITH_REVERSE_GEOCODE]", {
          origin,
          destination,
          resolvedOrigin,
          resolvedDestination,
        });
        route = await fetchGeoapifyRoute(
          toGeoapifyWaypoint(resolvedOrigin),
          toGeoapifyWaypoint(resolvedDestination)
        );
        if (!route) {
          const simulated = buildSimulatedRouteDetails(
            resolvedOrigin,
            resolvedDestination
          );
          if (simulated) {
            return simulated;
          }
        }
      }
    }
    if (!route) return null;
    return buildRouteInfoFromGeoapifyRoute(route);
  },

  async geocodeAddress(address: string): Promise<GeocodeResult | null> {
    if (shouldUseGeoapifySimulation()) {
      return buildSimulatedGeocode(address);
    }

    const response = await axios.get("https://api.geoapify.com/v1/geocode/search", {
      params: {
        text: address,
        format: "json",
        apiKey: ensureGeoapifyKey(),
      },
    });

    const result = response.data?.results?.[0];
    if (!result) return null;

    const lat = Number(result.lat);
    const lng = Number(result.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
      lat,
      lng,
      formattedAddress: normalizeAddress(result.formatted),
    };
  },

  async resolveLocation(lat: number, lng: number): Promise<ResolvedLocationData> {
    if (shouldUseGeoapifySimulation()) {
      return buildSimulatedResolvedLocation(lat, lng);
    }

    const response = await axios.get("https://api.geoapify.com/v1/geocode/reverse", {
      params: {
        lat,
        lon: lng,
        format: "json",
        apiKey: ensureGeoapifyKey(),
      },
    });

    const resolved = buildResolvedLocationFromResult(response.data?.results?.[0]);
    if (!resolved) {
      throw new Error("Impossible de resoudre le lieu avec Geoapify.");
    }
    return resolved;
  },

  async getPlaceSuggestions(input: string, countryCode: string): Promise<PlaceSuggestionResult[]> {
    if (shouldUseGeoapifySimulation()) {
      return buildSimulatedPlaceSuggestions(input);
    }

    const response = await axios.get("https://api.geoapify.com/v1/geocode/autocomplete", {
      params: {
        text: input,
        format: "json",
        filter: `countrycode:${countryCode}`,
        apiKey: ensureGeoapifyKey(),
      },
    });

    return (response.data?.results || [])
      .map((result: GeoapifyResult) => ({
        description: normalizeAddress(result.formatted),
        placeId: String(result.place_id || "").trim(),
      }))
      .filter((item: PlaceSuggestionResult) => item.description && item.placeId);
  },
};
