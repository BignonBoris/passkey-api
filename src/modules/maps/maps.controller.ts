import { Request, Response } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { findCountryByIdOrCode, resolveCountryFromCoordinates } from '@/services/country.service';

dotenv.config();
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const GOOGLE_PLACE_DETAILS_URL =
  'https://maps.googleapis.com/maps/api/place/details/json';

interface DistanceRequest {
  origin: string;
  destination: string;
  vehicleType: 'moto' | 'car';
}

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

type ResolvedLocationData = {
  placeName: string | null;
  address: string;
  placeId: string | null;
  latitude: number;
  longitude: number;
};

function hasGoogleMapsKey() {
  return typeof GOOGLE_MAPS_API_KEY === 'string' && GOOGLE_MAPS_API_KEY.trim().length > 0;
}

function normalizeAddress(value?: string | null) {
  const formatted = String(value || '').trim();
  return formatted || 'Lieu selectionne';
}

function isPlusCodeLike(value?: string | null) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return false;

  // Exemples: "99H8+FF8", "7FG8V4Q6+X2"
  return /^[23456789CFGHJMPQRVWX]{4,}\+[23456789CFGHJMPQRVWX]{2,}$/i.test(
    normalized.replace(/\s+/g, '')
  );
}

function isExplicitPlaceName(value?: string | null) {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  if (isPlusCodeLike(normalized)) return false;

  const lowerValue = normalized.toLowerCase();
  if (lowerValue === 'unnamed road' || lowerValue === 'unknown place') {
    return false;
  }

  return true;
}

function extractFallbackPlaceName(result?: GoogleGeocodeResult | null) {
  if (!result?.address_components?.length) return null;

  const preferredTypes = [
    'premise',
    'subpremise',
    'point_of_interest',
    'establishment',
    'street_address',
    'route',
    'neighborhood',
    'sublocality',
    'locality',
  ];

  for (const finalType of preferredTypes) {
    const match = result.address_components.find((component) =>
      Array.isArray(component.types) && component.types.includes(finalType)
    );
    const candidate = String(match?.long_name || '').trim();
    if (isExplicitPlaceName(candidate)) return candidate;
  }

  return null;
}

async function fetchPlaceName(placeId: string) {
  if (!hasGoogleMapsKey()) return null;

  const response = await axios.get(GOOGLE_PLACE_DETAILS_URL, {
    params: {
      place_id: placeId,
      fields: 'name,place_id',
      key: GOOGLE_MAPS_API_KEY,
    },
  });

  if (response.data?.status !== 'OK') {
    return null;
  }

  const name = String(response.data?.result?.name || '').trim();
  return isExplicitPlaceName(name) ? name : null;
}

async function resolveGoogleLocation(lat: number, lng: number): Promise<ResolvedLocationData> {
  if (!hasGoogleMapsKey()) {
    throw new Error('GOOGLE_MAPS_API_KEY manquante');
  }

  const response = await axios.get(GOOGLE_GEOCODE_URL, {
    params: {
      latlng: `${lat},${lng}`,
      key: GOOGLE_MAPS_API_KEY,
    },
  });

  const results = Array.isArray(response.data?.results)
    ? (response.data.results as GoogleGeocodeResult[])
    : [];

  const primaryResult = results[0];
  const address = normalizeAddress(primaryResult?.formatted_address);
  const placeId = String(primaryResult?.place_id || '').trim() || null;

  let placeName: string | null = null;

  if (placeId) {
    try {
      placeName = await fetchPlaceName(placeId);
    } catch (error) {
      console.error('Erreur Google Place Details:', error);
    }
  }

  if (!placeName) {
    placeName =
      extractFallbackPlaceName(
        results.find((item) =>
          item.address_components?.some((component) =>
            (component.types || []).some((type) =>
              ['point_of_interest', 'establishment', 'premise'].includes(type)
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

export const getRoute = async (req: Request, res: Response) => {
    try {
        const { origin, destination, waypoint } = req.body;

        if (!origin || !destination) {
            return res.status(400).json({ error: "L'origine et la destination sont requises." });
        }

        let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
        if (waypoint) {
            url += `&waypoints=optimize:false|${waypoint}`;
        }
        const response = await axios.get(url);

        if (response.data.status !== 'OK') {
            return res.status(400).json({ 
                error: "Impossible de trouver un itinéraire", 
                details: response.data 
            });
        }

        const polyline = response.data.routes[0].overview_polyline.points;
        const distance = response.data.routes[0].legs[0].distance.text;
        const duration = response.data.routes[0].legs[0].duration.text;

        return res.json({
            success: true,
            polyline: polyline,
            distance: response.data.routes[0].legs.reduce((acc: any, leg: any) => acc + leg.distance.value, 0), // Somme des distances
            // distance: distance,
            // duration: duration
        });

    } catch (error: unknown) { // On explicite le type unknown
        let errorMessage = "Erreur serveur lors du calcul de l'itinéraire";
        
        // CORRECTION ICI : On vérifie si c'est bien une instance d'Error
        if (error instanceof Error) {
            errorMessage = error.message;
        }

        console.error("Erreur Google Maps:", errorMessage);
        return res.status(500).json({ error: errorMessage });
    }
};

export const getCoordinatesFromAddress = async (req: Request, res: Response) => {
    try {
        const { address } = req.query; // ex: ?address=Cotonou+Erevan

        if (!address) return res.status(400).json({ error: "L'adresse est requise" });

        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address as string)}&key=${process.env.GOOGLE_MAPS_API_KEY}`;

        const response = await axios.get(url);

        if (response.data.status !== 'OK') {
            return res.status(400).json({ error: "Adresse introuvable" });
        }

        const location = response.data.results[0].geometry.location;
        return res.json({
            lat: location.lat,
            lng: location.lng,
            formattedAddress: response.data.results[0].formatted_address
        });
    } catch (error) {
        return res.status(500).json({ error: "Erreur lors du géocodage" });
    }
};

export const geocodeAddress = async (req: Request, res: Response) => {
    try {
        const { address } = req.query;

        if (!address) {
            return res.status(400).json({ error: "L'adresse est vide" });
        }

        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address as string)}&key=${process.env.GOOGLE_MAPS_API_KEY}`;

        const response = await axios.get(url);

        if (response.data.status === 'OK') {
            const location = response.data.results[0].geometry.location;
            return res.json({
                lat: location.lat,
                lng: location.lng,
                formattedAddress: response.data.results[0].formatted_address
            });
        } else {
            return res.status(400).json({ error: "Adresse introuvable", status: response.data.status });
        }
    } catch (error) {
        return res.status(500).json({ error: "Erreur de géocodage" });
    }
};

export const reverseGeocode = async (req: Request, res: Response) => {
    try {
        const lat = Number(req.query?.lat);
        const lng = Number(req.query?.lng);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).json({ error: "Les coordonnees sont invalides" });
        }

        const resolved = await resolveGoogleLocation(lat, lng);
        const countryResolution = await resolveCountryFromCoordinates(lat, lng);

        return res.json({
            lat,
            lng,
            formattedAddress: resolved.placeName || resolved.address,
            placeName: resolved.placeName,
            address: resolved.address,
            placeId: resolved.placeId,
            latitude: resolved.latitude,
            longitude: resolved.longitude,
            country: countryResolution.country,
            matchedByGps: countryResolution.matchedByGps,
        });
    } catch (error) {
        return res.status(500).json({ error: "Erreur de geocodage inverse" });
    }
};

export const resolveLocation = async (req: Request, res: Response) => {
    try {
        const lat = Number(req.body?.lat);
        const lng = Number(req.body?.lng);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).json({
                success: false,
                message: "Les coordonnees sont invalides",
            });
        }

        const data = await resolveGoogleLocation(lat, lng);
        const countryResolution = await resolveCountryFromCoordinates(lat, lng);

        return res.json({
            success: true,
            data: {
                ...data,
                country: countryResolution.country,
                matchedByGps: countryResolution.matchedByGps,
            },
        });
    } catch (error) {
        console.error("Erreur resolve-location:", error);
        return res.status(500).json({
            success: false,
            message: "Erreur lors de la resolution du lieu",
        });
    }
};

export const getPlaceSuggestions = async (req: Request, res: Response) => {
    try {
        const { input } = req.query;
        if (!input) return res.json([]);

        // On peut restreindre à un pays (ex: BJ pour le Bénin) pour plus de précision
        const countryLookup = String(req.query?.countryId || req.query?.countryCode || "").trim();
        const country = await findCountryByIdOrCode(countryLookup || undefined);
        const countryCode = String(country?.get("iso2") || "BJ").trim().toLowerCase();
        const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input as string)}&components=country:${countryCode}&key=${process.env.GOOGLE_MAPS_API_KEY}`;

        const response = await axios.get(url);
        
        // On ne renvoie que la description et l'ID du lieu
        const suggestions = response.data.predictions.map((p: any) => ({
            description: p.description,
            placeId: p.place_id
        }));

        return res.json(suggestions);
    } catch (error) {
        return res.status(500).json({ error: "Erreur suggestions" });
    }
};


// Fonction pour calculer la distance et le prix
export const calculatePrice = async (req: Request<{}, {}, DistanceRequest>, res: Response) => {
  const { origin, destination, vehicleType } = req.body;
  const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;

  try {
    const googleUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${GOOGLE_KEY}`;
    
    const response = await axios.get(googleUrl);
    const element = response.data.rows[0].elements[0];

    if (element.status === "OK") {
      const distanceMetres: number = element.distance.value;
      const distanceKm = distanceMetres / 1000;

      // Tarifs typés
      const tariffs: Record<string, { base: number; km: number }> = {
        "moto": { base: 500, km: 100 },
        "car": { base: 1500, km: 200 }
      };

      const selected = tariffs[vehicleType] || tariffs["moto"];
      const finalPrice = Math.ceil(selected.base + (distanceKm * selected.km));

      return res.json({
        distance: distanceKm.toFixed(1),
        price: finalPrice,
        duration: element.duration.text
      });
    } else {
      return res.status(400).json({ message: "Route non trouvée" });
    }
  } catch (error) {
    return res.status(500).json({ error: "Erreur lors du calcul" });
  }
};
