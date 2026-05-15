import {
  CoordinateLike,
  GeocodeResult,
  PlaceSuggestionResult,
  ResolvedLocationData,
  RouteInfo,
  RouteResponse,
} from "../maps.types";
import {
  encodePolyline,
  formatDistanceText,
  formatDurationText,
  haversineDistanceMeters,
  parseCoordinate,
  slugifyPlaceId,
} from "./maps-helpers";

export function buildSimulatedRoute(
  origin: CoordinateLike,
  destination: CoordinateLike,
  waypoint?: CoordinateLike
): RouteResponse | null {
  const start = parseCoordinate(origin);
  const end = parseCoordinate(destination);
  if (!start || !end) return null;

  const points = [start];
  const intermediate = parseCoordinate(waypoint);
  if (intermediate) points.push(intermediate);
  points.push(end);

  let distanceMeters = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    distanceMeters += haversineDistanceMeters(points[index], points[index + 1]);
  }

  const averageSpeedMetersPerSecond = 8.33;
  const durationSeconds = Math.max(60, Math.round(distanceMeters / averageSpeedMetersPerSecond));

  return {
    success: true,
    polyline: encodePolyline(points),
    distance: Math.round(distanceMeters),
    distanceText: formatDistanceText(distanceMeters),
    durationText: formatDurationText(durationSeconds),
    simulated: true,
  };
}

export function buildSimulatedRouteDetails(
  origin: CoordinateLike,
  destination: CoordinateLike
): RouteInfo | null {
  const simulatedRoute = buildSimulatedRoute(origin, destination);
  if (!simulatedRoute) return null;

  const durationMinutesMatch = simulatedRoute.durationText.match(/(\d+)/);
  const durationMinutes = durationMinutesMatch ? Number(durationMinutesMatch[1]) : 1;

  return {
    distanceValue: simulatedRoute.distance,
    distanceText: simulatedRoute.distanceText,
    durationValue: Math.max(60, durationMinutes * 60),
    durationText: simulatedRoute.durationText,
  };
}

export function buildSimulatedAddress(lat: number, lng: number) {
  return `Zone de test (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
}

export function buildSimulatedGeocode(address: string): GeocodeResult {
  const normalized = String(address || "").trim();
  const fallback = normalized || "Lieu de test";
  const seed = Array.from(fallback).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const lat = 6 + ((seed % 9000) / 100000);
  const lng = 2 + (((seed * 7) % 9000) / 100000);

  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    formattedAddress: fallback,
    simulated: true,
  };
}

export function buildSimulatedResolvedLocation(lat: number, lng: number): ResolvedLocationData {
  const address = buildSimulatedAddress(lat, lng);
  return {
    placeName: null,
    address,
    placeId: `simulated-${lat.toFixed(5)}-${lng.toFixed(5)}`,
    latitude: lat,
    longitude: lng,
  };
}

export function buildSimulatedPlaceSuggestions(input: string): PlaceSuggestionResult[] {
  const normalizedInput = String(input).trim();
  return [
    { description: normalizedInput, placeId: `simulated-${slugifyPlaceId(normalizedInput)}` },
    {
      description: `${normalizedInput}, Zone 1`,
      placeId: `simulated-${slugifyPlaceId(normalizedInput)}-zone-1`,
    },
    {
      description: `${normalizedInput}, Zone 2`,
      placeId: `simulated-${slugifyPlaceId(normalizedInput)}-zone-2`,
    },
  ];
}
