import { Request, Response } from "express";
import { findCountryByIdOrCode, resolveCountryFromCoordinates } from "../../services/country.service";
import { getActiveMapsProvider, getRouteDetails } from "./maps.service";

interface DistanceRequest {
  origin: string;
  destination: string;
  vehicleType: "moto" | "car";
}

export const getRoute = async (req: Request, res: Response) => {
  try {
    const { origin, destination, waypoint } = req.body;

    if (!origin || !destination) {
      return res.status(400).json({ error: "L'origine et la destination sont requises." });
    }

    const route = await getActiveMapsProvider().getRoute(origin, destination, waypoint);
    if (!route) {
      return res.status(400).json({ error: "Impossible de trouver un itineraire" });
    }

    return res.json(route);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error
      ? error.message
      : "Erreur serveur lors du calcul de l'itineraire";
    console.error("Erreur maps provider:", errorMessage);
    return res.status(500).json({ error: errorMessage });
  }
};

export const getCoordinatesFromAddress = async (req: Request, res: Response) => {
  try {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: "L'adresse est requise" });

    const result = await getActiveMapsProvider().geocodeAddress(String(address));
    if (!result) {
      return res.status(400).json({ error: "Adresse introuvable" });
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: "Erreur lors du geocodage" });
  }
};

export const geocodeAddress = async (req: Request, res: Response) => {
  try {
    const { address } = req.query;
    if (!address) {
      return res.status(400).json({ error: "L'adresse est vide" });
    }

    const result = await getActiveMapsProvider().geocodeAddress(String(address));
    if (!result) {
      return res.status(400).json({ error: "Adresse introuvable" });
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: "Erreur de geocodage" });
  }
};

export const reverseGeocode = async (req: Request, res: Response) => {
  try {
    const lat = Number(req.query?.lat);
    const lng = Number(req.query?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "Les coordonnees sont invalides" });
    }

    const resolved = await getActiveMapsProvider().resolveLocation(lat, lng);
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

    const data = await getActiveMapsProvider().resolveLocation(lat, lng);
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

    const countryLookup = String(req.query?.countryId || req.query?.countryCode || "").trim();
    const country = await findCountryByIdOrCode(countryLookup || undefined);
    // Allow global search if country lookup fails or is not explicitly Benin
    const countryCode = country ? String(country.get("iso2")).trim().toLowerCase() : undefined;

    console.log(`[MapsController] input="${input}", countryLookup="${countryLookup}", resolvedCountry="${countryCode || 'GLOBAL'}"`);

    const suggestions = await getActiveMapsProvider().getPlaceSuggestions(
      String(input),
      countryCode || ""
    );

    return res.json(suggestions);
  } catch (error) {
    return res.status(500).json({ error: "Erreur suggestions" });
  }
};

export const calculatePrice = async (
  req: Request<{}, {}, DistanceRequest>,
  res: Response
) => {
  const { origin, destination, vehicleType } = req.body;

  try {
    const routeData = await getRouteDetails(origin, destination);
    if (!routeData) {
      return res.status(400).json({ message: "Route non trouvee" });
    }

    const distanceKm = routeData.distanceValue / 1000;
    const tariffs: Record<string, { base: number; km: number }> = {
      moto: { base: 500, km: 100 },
      car: { base: 1500, km: 200 },
    };

    const selected = tariffs[vehicleType] || tariffs.moto;
    const finalPrice = Math.ceil(selected.base + distanceKm * selected.km);

    return res.json({
      distance: distanceKm.toFixed(1),
      price: finalPrice,
      duration: routeData.durationText,
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur lors du calcul" });
  }
};
