import { Request, Response } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();
interface DistanceRequest {
  origin: string;
  destination: string;
  vehicleType: 'moto' | 'car';
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

        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
        const response = await axios.get(url);

        if (response.data.status !== 'OK' || !Array.isArray(response.data.results) || response.data.results.length === 0) {
            return res.json({
                lat,
                lng,
                formattedAddress: "(nom inconnu)",
            });
        }

        return res.json({
            lat,
            lng,
            formattedAddress: response.data.results[0].formatted_address || "(nom inconnu)",
        });
    } catch (error) {
        return res.status(500).json({ error: "Erreur de geocodage inverse" });
    }
};

export const getPlaceSuggestions = async (req: Request, res: Response) => {
    try {
        const { input } = req.query;
        if (!input) return res.json([]);

        // On peut restreindre à un pays (ex: BJ pour le Bénin) pour plus de précision
        const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input as string)}&components=country:BJ&key=${process.env.GOOGLE_MAPS_API_KEY}`;

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
