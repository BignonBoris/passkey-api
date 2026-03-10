import axios from 'axios';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY; // Ta clé serveur

interface RouteInfo {
  distanceValue: number; // en mètres
  distanceText: string;  // "5.4 km"
  durationValue: number; // en secondes
  durationText: string;  // "15 mins"
}

export const getRouteDetails = async (origin: string, destination: string): Promise<RouteInfo | null> => {
  try {
    // On demande le trajet en mode "DRIVING" (Voiture) par défaut
    // C'est la base la plus fiable. Pour la moto, on ajustera mathématiquement.
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&mode=driving&traffic_model=best_guess&departure_time=now&key=${GOOGLE_MAPS_API_KEY}`;

    const response = await axios.get(url);
    const data = response.data;

    if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
      const element = data.rows[0].elements[0];
      return {
        distanceValue: element.distance.value,
        distanceText: element.distance.text,
        durationValue: element.duration_in_traffic ? element.duration_in_traffic.value : element.duration.value,
        durationText: element.duration_in_traffic ? element.duration_in_traffic.text : element.duration.text,
      };
    }
    return null;
  } catch (error) {
    console.error("Erreur Google Maps:", error);
    return null;
  }
};