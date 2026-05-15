import axios from "axios";
import {
  GeocodeResult,
  MapsProvider,
  PlaceSuggestionResult,
  ResolvedLocationData,
  RouteInfo,
} from "../../maps.types";
import {
  getGoogleMapsApiKey,
  hasGoogleMapsKey,
  shouldUseGoogleSimulation,
} from "../../maps.config";
import {
  isExplicitPlaceName,
  normalizeAddress,
  toCoordinateString,
} from "../../shared/maps-helpers";
import {
  buildSimulatedGeocode,
  buildSimulatedPlaceSuggestions,
  buildSimulatedResolvedLocation,
  buildSimulatedRoute,
  buildSimulatedRouteDetails,
} from "../../shared/maps-simulation";

const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

type GoogleGeocodeResult = {
  formatted_address?: string;
  place_id?: string;
  address_components?: Array<{
    long_name?: string;
    short_name?: string;
    types?: string[];
  }>;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
};

function extractFallbackPlaceName(result?: GoogleGeocodeResult | null) {
  if (!result?.address_components?.length) return null;

  const preferredTypes = [
    "premise",
    "subpremise",
    "point_of_interest",
    "establishment",
    "street_address",
    "route",
    "neighborhood",
    "sublocality",
    "locality",
  ];

  for (const finalType of preferredTypes) {
    const match = result.address_components.find(
      (component) => Array.isArray(component.types) && component.types.includes(finalType)
    );
    const candidate = String(match?.long_name || "").trim();
    if (isExplicitPlaceName(candidate)) return candidate;
  }

  return null;
}

async function fetchPlaceName(placeId: string) {
  if (!hasGoogleMapsKey()) return null;

  const response = await axios.get(GOOGLE_PLACE_DETAILS_URL, {
    params: {
      place_id: placeId,
      fields: "name,place_id",
      key: getGoogleMapsApiKey(),
    },
  });

  if (response.data?.status !== "OK") {
    return null;
  }

  const name = String(response.data?.result?.name || "").trim();
  return isExplicitPlaceName(name) ? name : null;
}

async function resolveGoogleLocation(lat: number, lng: number): Promise<ResolvedLocationData> {
  if (shouldUseGoogleSimulation()) {
    return buildSimulatedResolvedLocation(lat, lng);
  }

  if (!hasGoogleMapsKey()) {
    throw new Error("GOOGLE_MAPS_API_KEY manquante");
  }

  const response = await axios.get(GOOGLE_GEOCODE_URL, {
    params: {
      latlng: `${lat},${lng}`,
      key: getGoogleMapsApiKey(),
    },
  });

  const results = Array.isArray(response.data?.results)
    ? (response.data.results as GoogleGeocodeResult[])
    : [];

  const primaryResult = results[0];
  const address = normalizeAddress(primaryResult?.formatted_address);
  const placeId = String(primaryResult?.place_id || "").trim() || null;

  let placeName: string | null = null;

  if (placeId) {
    try {
      placeName = await fetchPlaceName(placeId);
    } catch (error) {
      console.error("Erreur Google Place Details:", error);
    }
  }

  if (!placeName) {
    placeName =
      extractFallbackPlaceName(
        results.find((item) =>
          item.address_components?.some((component) =>
            (component.types || []).some((type) =>
              ["point_of_interest", "establishment", "premise"].includes(type)
            )
          )
        ) || primaryResult
      ) || null;
  }

  return {
    placeName,
    address,
    placeId,
    latitude: lat,
    longitude: lng,
  };
}

export const googleMapsProvider: MapsProvider = {
  async getRoute(origin, destination, waypoint) {
    if (shouldUseGoogleSimulation()) {
      return buildSimulatedRoute(origin, destination, waypoint);
    }

    const originText = toCoordinateString(origin);
    const destinationText = toCoordinateString(destination);
    let url =
      `https://maps.googleapis.com/maps/api/directions/json?origin=${originText}` +
      `&destination=${destinationText}&key=${getGoogleMapsApiKey()}`;

    if (waypoint) {
      url += `&waypoints=optimize:false|${toCoordinateString(waypoint)}`;
    }

    const response = await axios.get(url);
    if (response.data.status !== "OK") {
      return null;
    }

    const route = response.data.routes?.[0];
    const legs = Array.isArray(route?.legs) ? route.legs : [];
    if (!route?.overview_polyline?.points || !legs.length) return null;

    return {
      success: true,
      polyline: route.overview_polyline.points,
      distance: legs.reduce((acc: number, leg: any) => acc + Number(leg?.distance?.value || 0), 0),
      distanceText: String(legs[0]?.distance?.text || "").trim(),
      durationText: String(legs[0]?.duration?.text || "").trim(),
    };
  },

  async getRouteDetails(origin, destination): Promise<RouteInfo | null> {
    if (shouldUseGoogleSimulation()) {
      return buildSimulatedRouteDetails(origin, destination);
    }

    const url =
      "https://maps.googleapis.com/maps/api/distancematrix/json" +
      `?origins=${encodeURIComponent(toCoordinateString(origin))}` +
      `&destinations=${encodeURIComponent(toCoordinateString(destination))}` +
      "&mode=driving&traffic_model=best_guess&departure_time=now" +
      `&key=${getGoogleMapsApiKey()}`;

    const response = await axios.get(url);
    const data = response.data;

    if (data.status === "OK" && data.rows?.[0]?.elements?.[0]?.status === "OK") {
      const element = data.rows[0].elements[0];
      return {
        distanceValue: Number(element.distance.value || 0),
        distanceText: String(element.distance.text || "").trim(),
        durationValue: Number(
          element.duration_in_traffic ? element.duration_in_traffic.value : element.duration.value
        ),
        durationText: String(
          element.duration_in_traffic ? element.duration_in_traffic.text : element.duration.text
        ).trim(),
      };
    }

    return null;
  },

  async geocodeAddress(address: string): Promise<GeocodeResult | null> {
    if (shouldUseGoogleSimulation()) {
      return buildSimulatedGeocode(address);
    }

    const url = `${GOOGLE_GEOCODE_URL}?address=${encodeURIComponent(address)}&key=${getGoogleMapsApiKey()}`;
    console.log(`[GoogleMaps] Calling Geocode: ${url.replace(/key=AIza[^&]+/, 'key=***')}`);
    const response = await axios.get(url);
    console.log(`[GoogleMaps] Geocode Response Status: ${response.data.status}`);
    if (response.data.error_message) {
      console.log(`[GoogleMaps] Geocode Error: ${response.data.error_message}`);
    }

    if (response.data.status !== "OK") {
      return null;
    }

    const location = response.data.results?.[0]?.geometry?.location;
    if (!location) return null;

    return {
      lat: Number(location.lat),
      lng: Number(location.lng),
      formattedAddress: String(response.data.results?.[0]?.formatted_address || "").trim(),
    };
  },

  async resolveLocation(lat: number, lng: number) {
    return resolveGoogleLocation(lat, lng);
  },

  async getPlaceSuggestions(input: string, countryCode: string): Promise<PlaceSuggestionResult[]> {
    if (shouldUseGoogleSimulation()) {
      return buildSimulatedPlaceSuggestions(input);
    }

    let url =
      "https://maps.googleapis.com/maps/api/place/autocomplete/json" +
      `?input=${encodeURIComponent(input)}` +
      `&key=${getGoogleMapsApiKey()}`;

    if (countryCode && countryCode.trim().length > 0) {
      url += `&components=country:${countryCode.trim().toLowerCase()}`;
    }

    console.log(`[GoogleMaps] Calling Autocomplete: ${url.replace(/key=AIza[^&]+/, 'key=***')}`);
    const response = await axios.get(url);
    console.log(`[GoogleMaps] Autocomplete Response Status: ${response.data.status}`);
    if (response.data.error_message) {
      console.log(`[GoogleMaps] Autocomplete Error: ${response.data.error_message}`);
    }

    return (response.data.predictions || []).map((prediction: any) => ({
      description: String(prediction.description || "").trim(),
      placeId: String(prediction.place_id || "").trim(),
    }));
  },
};
