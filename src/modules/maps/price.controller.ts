import { Request, Response } from 'express';
import VehiclePricingConfig from '../../models/vehicle-pricing-config.model';
import { getRouteDetails } from './maps.service';

const VEHICLE_SPEED_FACTORS: Record<string, number> = {
  moto: 0.8,
  tricycle: 1.1,
  voiture: 1.0,
  car: 1.0,
  van: 1.15,
};

const VEHICLE_LABELS: Record<string, string> = {
  moto: 'Moto',
  tricycle: 'Tricycle',
  voiture: 'Voiture',
  car: 'Voiture',
  van: 'Camionnette',
};

function toVehicleLabel(vehicleType: string) {
  if (VEHICLE_LABELS[vehicleType]) return VEHICLE_LABELS[vehicleType];
  if (!vehicleType) return 'Vehicule';
  return `${vehicleType.charAt(0).toUpperCase()}${vehicleType.slice(1)}`;
}

export const calculateTrip = async (req: Request, res: Response) => {
  const { pickup, delivery } = req.body;

  const routeData = await getRouteDetails(pickup, delivery);
  if (!routeData) {
    return res.status(400).json({ message: "Impossible de calculer l'itineraire" });
  }

  const configs = await VehiclePricingConfig.findAll({
    order: [['vehicleType', 'ASC']],
  });

  if (!configs.length) {
    return res.status(404).json({
      success: false,
      message: 'Aucune configuration tarifaire disponible',
    });
  }

  const distanceKm = routeData.distanceValue / 1000;

  const options = configs
    .map((config) => {
      const vehicleType = String(config.vehicleType || '').trim().toLowerCase();
      const baseFare = Number(config.baseFare);
      const perKmRate = Number(config.perKmRate);
      const perMinuteRate = Number(config.perMinuteRate);
      const bookingFee = Number(config.bookingFee);
      const minimumFare = Number(config.minimumFare);

      if (!vehicleType) return null;
      if (
        !Number.isFinite(baseFare) ||
        !Number.isFinite(perKmRate) ||
        !Number.isFinite(perMinuteRate) ||
        !Number.isFinite(bookingFee) ||
        !Number.isFinite(minimumFare)
      ) {
        return null;
      }

      const speedFactor = VEHICLE_SPEED_FACTORS[vehicleType] ?? 1.0;
      const adjustedDurationSeconds = routeData.durationValue * speedFactor;
      const adjustedDurationMinutes = adjustedDurationSeconds / 60;

      const rawPrice =
        baseFare +
        bookingFee +
        distanceKm * perKmRate +
        adjustedDurationMinutes * perMinuteRate;
      let price = Math.max(rawPrice, minimumFare);
      price = Math.ceil(price / 50) * 50;

      return {
        id: vehicleType,
        name: toVehicleLabel(vehicleType),
        price,
        distance: routeData.distanceText,
        duration: `${Math.ceil(adjustedDurationMinutes)} min`,
        image: `${vehicleType}.png`,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (!options.length) {
    return res.status(404).json({
      success: false,
      message: 'Aucune configuration tarifaire valide disponible',
    });
  }

  return res.json({
    success: true,
    origin: pickup,
    destination: delivery,
    options,
  });
};
