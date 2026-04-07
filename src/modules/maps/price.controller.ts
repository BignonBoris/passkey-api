import { Request, Response } from 'express';
import VehiclePricingConfig from '../../models/vehicle-pricing-config.model';
import VehicleType from '../../models/vehicle-type.model';
import { getRouteDetails } from './maps.service';
import { resolveCountryFromCoordinates } from '../../services/country.service';
import { calculateDeliveryPricing } from '../../services/pricing.service';

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
  const resolvedCountry = await resolveCountryFromCoordinates(Number(pickup?.lat), Number(pickup?.lng));
  const countryId = String(resolvedCountry.country.get("id") || "");

  const routeData = await getRouteDetails(pickup, delivery);
  if (!routeData) {
    return res.status(400).json({ message: "Impossible de calculer l'itineraire" });
  }

  const [configs, vehicleTypes] = await Promise.all([
    VehiclePricingConfig.findAll({
      where: { countryId },
      order: [['vehicleType', 'ASC']],
    }),
    VehicleType.findAll({
      where: { isActive: true, countryId },
      order: [['sortOrder', 'ASC'], ['name', 'ASC']],
    }),
  ]);

  const configByType = new Map(
    configs.map((config) => [String(config.vehicleType || '').trim().toLowerCase(), config])
  );

  const sourceRows = vehicleTypes.length
    ? vehicleTypes.map((item) => ({
        code: String(item.get('code') || '').trim().toLowerCase(),
        name: String(item.get('name') || '').trim(),
        iconKey: String(item.get('iconKey') || 'two_wheeler_rounded').trim(),
      }))
    : configs.map((config) => ({
        code: String(config.vehicleType || '').trim().toLowerCase(),
        name: toVehicleLabel(String(config.vehicleType || '').trim().toLowerCase()),
        iconKey: 'two_wheeler_rounded',
      }));

  if (!sourceRows.length) {
    return res.status(404).json({
      success: false,
      message: 'Aucune configuration tarifaire disponible',
    });
  }

  const distanceKm = routeData.distanceValue / 1000;

  const options = sourceRows
    .map((source) => {
      const vehicleType = source.code;
      const config = configByType.get(vehicleType);
      if (!config || !vehicleType) return null;

      const speedFactor = VEHICLE_SPEED_FACTORS[vehicleType] ?? 1.0;
      const adjustedDurationSeconds = routeData.durationValue * speedFactor;
      const adjustedDurationMinutes = adjustedDurationSeconds / 60;

      return {
        id: vehicleType,
        name: source.name || toVehicleLabel(vehicleType),
        distanceKm,
        durationMinutes: Math.ceil(adjustedDurationMinutes),
        distance: routeData.distanceText,
        duration: `${Math.ceil(adjustedDurationMinutes)} min`,
        image: `${vehicleType}.png`,
        iconKey: source.iconKey || 'two_wheeler_rounded',
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (!options.length) {
    return res.status(404).json({
      success: false,
      message: 'Aucune configuration tarifaire valide disponible',
    });
  }

  const pricedOptions = await Promise.all(
    options.map(async (option) => {
      const pricing = await calculateDeliveryPricing({
        vehicleType: option.id,
        countryId,
        distanceKm: option.distanceKm,
        durationMinutes: option.durationMinutes,
        extras: 0,
        tip: 0,
      });

      return {
        id: option.id,
        name: option.name,
        price: pricing.price,
        distanceKm: option.distanceKm,
        durationMinutes: option.durationMinutes,
        distance: option.distance,
        duration: option.duration,
        image: option.image,
        iconKey: option.iconKey,
      };
    })
  );

  return res.json({
    success: true,
    origin: pickup,
    destination: delivery,
    options: pricedOptions,
  });
};
