export type CoordinateLike =
  | string
  | {
      lat?: number | string;
      lng?: number | string;
      latitude?: number | string;
      longitude?: number | string;
    }
  | null
  | undefined;

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface RouteInfo {
  distanceValue: number;
  distanceText: string;
  durationValue: number;
  durationText: string;
}

export interface RouteResponse {
  success: boolean;
  polyline: string;
  distance: number;
  distanceText: string;
  durationText: string;
  simulated?: boolean;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
  simulated?: boolean;
}

export interface ResolvedLocationData {
  placeName: string | null;
  address: string;
  placeId: string | null;
  latitude: number;
  longitude: number;
}

export interface PlaceSuggestionResult {
  description: string;
  placeId: string;
}

export interface MapsProvider {
  getRoute(origin: CoordinateLike, destination: CoordinateLike, waypoint?: CoordinateLike): Promise<RouteResponse | null>;
  getRouteDetails(origin: CoordinateLike, destination: CoordinateLike): Promise<RouteInfo | null>;
  geocodeAddress(address: string): Promise<GeocodeResult | null>;
  resolveLocation(lat: number, lng: number): Promise<ResolvedLocationData>;
  getPlaceSuggestions(input: string, countryCode: string): Promise<PlaceSuggestionResult[]>;
}
