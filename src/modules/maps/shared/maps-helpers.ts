import { Coordinate, CoordinateLike } from "../maps.types";

export function parseCoordinate(input: CoordinateLike): Coordinate | null {
  if (!input) return null;

  if (typeof input === "string") {
    const parts = input.split(",").map((part) => Number(part.trim()));
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      return { lat: parts[0], lng: parts[1] };
    }
    return null;
  }

  const lat = Number(input.lat ?? input.latitude);
  const lng = Number(input.lng ?? input.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function toCoordinateString(input: CoordinateLike) {
  if (typeof input === "string") {
    return input.trim();
  }

  const coordinate = parseCoordinate(input);
  if (!coordinate) return "";
  return `${coordinate.lat},${coordinate.lng}`;
}

export function haversineDistanceMeters(a: Coordinate, b: Coordinate) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;

  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const haversine =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  const angularDistance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return earthRadiusMeters * angularDistance;
}

export function formatDistanceText(distanceMeters: number) {
  if (distanceMeters < 1000) return `${Math.max(1, Math.round(distanceMeters))} m`;
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

export function formatDurationText(durationSeconds: number) {
  const roundedMinutes = Math.max(1, Math.round(durationSeconds / 60));
  if (roundedMinutes < 60) return `${roundedMinutes} min`;
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

export function slugifyPlaceId(input: string) {
  return (
    String(input || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "test"
  );
}

export function normalizeAddress(value?: string | null) {
  const formatted = String(value || "").trim();
  return formatted || "Lieu selectionne";
}

export function isPlusCodeLike(value?: string | null) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return false;

  return /^[23456789CFGHJMPQRVWX]{4,}\+[23456789CFGHJMPQRVWX]{2,}$/i.test(
    normalized.replace(/\s+/g, "")
  );
}

export function isExplicitPlaceName(value?: string | null) {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  if (isPlusCodeLike(normalized)) return false;

  const lowerValue = normalized.toLowerCase();
  if (lowerValue === "unnamed road" || lowerValue === "unknown place") {
    return false;
  }

  return true;
}

function encodeSignedValue(value: number) {
  let shifted = value < 0 ? ~(value << 1) : value << 1;
  let output = "";
  while (shifted >= 0x20) {
    output += String.fromCharCode((0x20 | (shifted & 0x1f)) + 63);
    shifted >>= 5;
  }
  output += String.fromCharCode(shifted + 63);
  return output;
}

export function encodePolyline(points: Coordinate[]) {
  let previousLat = 0;
  let previousLng = 0;
  let output = "";

  for (const point of points) {
    const latitude = Math.round(point.lat * 1e5);
    const longitude = Math.round(point.lng * 1e5);

    output += encodeSignedValue(latitude - previousLat);
    output += encodeSignedValue(longitude - previousLng);

    previousLat = latitude;
    previousLng = longitude;
  }

  return output;
}
