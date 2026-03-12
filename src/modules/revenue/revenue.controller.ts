import { Request, Response } from "express";
import DriverRevenueConfig from "../../models/driver-revenue-config.model";
import { calculateDriverRevenue, RevenueCalculationInput } from "../../services/revenue.service";

function parseNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export async function listRevenueConfigs(req: Request, res: Response) {
  try {
    const { vehicleType } = req.query as Record<string, string | undefined>;
    const whereClause: Record<string, unknown> = {};
    if (vehicleType) whereClause.vehicleType = vehicleType;

    const configs = await DriverRevenueConfig.findAll({
      where: whereClause,
      order: [["updatedAt", "DESC"]],
    });
    return res.status(200).json({ success: true, data: configs });
  } catch (error: any) {
    return res
      .status(500)
      .json({ success: false, message: error?.message || "Impossible de lister les configurations" });
  }
}

export async function getRevenueConfig(req: Request, res: Response) {
  try {
    const config = await DriverRevenueConfig.findByPk(req.params.id, {
    });
    if (!config)
      return res.status(404).json({ success: false, message: "Configuration introuvable" });
    return res.status(200).json({ success: true, data: config });
  } catch (error: any) {
    return res
      .status(500)
      .json({ success: false, message: error?.message || "Impossible de récupérer la configuration" });
  }
}

export async function createOrUpdateRevenueConfig(req: Request, res: Response) {
  try {
    const {
      id,
      vehicleType,
      baseFare,
      perKmRate,
      perMinuteRate,
      commissionPercent,
      serviceFeePercent,
    } = req.body || {};

    if (!vehicleType) {
      return res
        .status(400)
        .json({ success: false, message: "Le type de véhicule est requis" });
    }

    const payload = {
      vehicleType,
      baseFare: parseNumber(baseFare),
      perKmRate: parseNumber(perKmRate),
      perMinuteRate: parseNumber(perMinuteRate),
      commissionPercent: parseNumber(commissionPercent, 0),
      serviceFeePercent: parseNumber(serviceFeePercent, 0),
    };

    let config = id ? await DriverRevenueConfig.findByPk(id) : null;
    if (!config) {
      config = await DriverRevenueConfig.findOne({ where: { vehicleType } });
    }

    if (config) {
      config.set(payload);
      await config.save();
      return res.status(200).json({ success: true, data: config });
    }

    const created = await DriverRevenueConfig.create(payload);
    return res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    return res
      .status(500)
      .json({ success: false, message: error?.message || "Impossible d’enregistrer la configuration" });
  }
}

export async function updateRevenueConfig(req: Request, res: Response) {
  try {
    const config = await DriverRevenueConfig.findByPk(req.params.id);
    if (!config)
      return res.status(404).json({ success: false, message: "Configuration introuvable" });

    const payload = {
      baseFare: parseNumber(req.body.baseFare, config.baseFare),
      perKmRate: parseNumber(req.body.perKmRate, config.perKmRate),
      perMinuteRate: parseNumber(req.body.perMinuteRate, config.perMinuteRate),
      commissionPercent: parseNumber(req.body.commissionPercent, config.commissionPercent),
      serviceFeePercent: parseNumber(req.body.serviceFeePercent, config.serviceFeePercent),
    };

    config.set(payload);
    await config.save();
    return res.status(200).json({ success: true, data: config });
  } catch (error: any) {
    return res
      .status(500)
      .json({ success: false, message: error?.message || "Impossible de mettre à jour la configuration" });
  }
}

export async function deleteRevenueConfig(req: Request, res: Response) {
  try {
    const config = await DriverRevenueConfig.findByPk(req.params.id);
    if (!config)
      return res.status(404).json({ success: false, message: "Configuration introuvable" });
    await config.destroy();
    return res.status(200).json({ success: true, message: "Config deleted" });
  } catch (error: any) {
    return res
      .status(500)
      .json({ success: false, message: error?.message || "Impossible de supprimer la configuration" });
  }
}

export async function calculateRevenue(req: Request, res: Response) {
  try {
    const {
      vehicleType,
      configId,
      distanceKm,
      durationMinutes,
      tip,
      extras,
    } = req.body || {};

    const parsedDistance = parseNumber(distanceKm);
    const parsedDuration = parseNumber(durationMinutes);
    if (parsedDistance <= 0 && parsedDuration <= 0) {
      return res.status(400).json({ success: false, message: "distanceKm or durationMinutes is required" });
    }

    if (!configId && !vehicleType) {
      return res.status(400).json({ success: false, message: "vehicleType or configId is required" });
    }

    const revenueConfig = configId
      ? await DriverRevenueConfig.findByPk(configId)
      : await DriverRevenueConfig.findOne({
          where: vehicleType ? { vehicleType } : undefined,
        });

    if (!revenueConfig) {
      return res.status(404).json({ success: false, message: "Revenue config not found" });
    }

    const input: RevenueCalculationInput = {
      distanceKm: parsedDistance,
      durationMinutes: parsedDuration,
      tip: parseNumber(tip, 0),
      extras: parseNumber(extras, 0),
    };

    const calculated = calculateDriverRevenue(revenueConfig, input);
    return res.status(200).json({ success: true, data: { config: revenueConfig, calculation: calculated } });
  } catch (error: any) {
    return res
      .status(500)
      .json({ success: false, message: error?.message || "Impossible de calculer les revenus" });
  }
}
