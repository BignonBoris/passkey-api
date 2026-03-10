import { Request, Response } from "express";
import VehiclePricingConfig from "@/models/vehicle-pricing-config.model";

function parseNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export async function listPricingConfigs(req: Request, res: Response) {
  try {
    const { vehicleType } = req.query as Record<string, string | undefined>;
    const whereClause: Record<string, unknown> = {};
    if (vehicleType) whereClause.vehicleType = vehicleType;

    const rows = await VehiclePricingConfig.findAll({
      where: whereClause,
      order: [["updatedAt", "DESC"]],
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list pricing configs" });
  }
}

export async function createOrUpdatePricingConfig(req: Request, res: Response) {
  try {
    const {
      id,
      vehicleType,
      baseFare,
      perKmRate,
      perMinuteRate,
      bookingFee,
      minimumFare,
    } = req.body || {};

    if (!vehicleType) {
      return res.status(400).json({ success: false, message: "vehicleType is required" });
    }

    const payload = {
      vehicleType: String(vehicleType).trim(),
      baseFare: parseNumber(baseFare, 0),
      perKmRate: parseNumber(perKmRate, 0),
      perMinuteRate: parseNumber(perMinuteRate, 0),
      bookingFee: parseNumber(bookingFee, 0),
      minimumFare: parseNumber(minimumFare, 0),
    };

    let row = id ? await VehiclePricingConfig.findByPk(id) : null;
    if (!row) {
      row = await VehiclePricingConfig.findOne({ where: { vehicleType: payload.vehicleType } });
    }

    if (row) {
      row.set(payload);
      await row.save();
      return res.status(200).json({ success: true, data: row });
    }

    const created = await VehiclePricingConfig.create(payload);
    return res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to save pricing config" });
  }
}

export async function updatePricingConfig(req: Request, res: Response) {
  try {
    const row = await VehiclePricingConfig.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Pricing config not found" });

    if (req.body.baseFare !== undefined) row.set("baseFare", parseNumber(req.body.baseFare, row.baseFare));
    if (req.body.perKmRate !== undefined) row.set("perKmRate", parseNumber(req.body.perKmRate, row.perKmRate));
    if (req.body.perMinuteRate !== undefined) {
      row.set("perMinuteRate", parseNumber(req.body.perMinuteRate, row.perMinuteRate));
    }
    if (req.body.bookingFee !== undefined) row.set("bookingFee", parseNumber(req.body.bookingFee, row.bookingFee));
    if (req.body.minimumFare !== undefined) row.set("minimumFare", parseNumber(req.body.minimumFare, row.minimumFare));

    await row.save();
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to update pricing config" });
  }
}

export async function deletePricingConfig(req: Request, res: Response) {
  try {
    const row = await VehiclePricingConfig.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Pricing config not found" });
    await row.destroy();
    return res.status(200).json({ success: true, message: "Pricing config deleted" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to delete pricing config" });
  }
}

export async function calculatePricing(req: Request, res: Response) {
  try {
    const { vehicleType, configId, distanceKm, durationMinutes, extras } = req.body || {};
    const distance = parseNumber(distanceKm, 0);
    const duration = parseNumber(durationMinutes, 0);
    const extrasAmount = parseNumber(extras, 0);

    if (!configId && !vehicleType) {
      return res.status(400).json({ success: false, message: "vehicleType or configId is required" });
    }

    const config = configId
      ? await VehiclePricingConfig.findByPk(configId)
      : await VehiclePricingConfig.findOne({ where: { vehicleType } });

    if (!config) return res.status(404).json({ success: false, message: "Pricing config not found" });

    const distanceComponent = config.perKmRate * distance;
    const timeComponent = config.perMinuteRate * duration;
    const rawTotal = config.baseFare + config.bookingFee + distanceComponent + timeComponent + extrasAmount;
    const total = Math.max(rawTotal, config.minimumFare);

    return res.status(200).json({
      success: true,
      data: {
        config,
        calculation: {
          total: Number(total.toFixed(2)),
          baseFare: Number(config.baseFare.toFixed(2)),
          bookingFee: Number(config.bookingFee.toFixed(2)),
          distanceComponent: Number(distanceComponent.toFixed(2)),
          timeComponent: Number(timeComponent.toFixed(2)),
          extras: Number(extrasAmount.toFixed(2)),
          minimumFareApplied: total === config.minimumFare && rawTotal < config.minimumFare,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to calculate pricing" });
  }
}
