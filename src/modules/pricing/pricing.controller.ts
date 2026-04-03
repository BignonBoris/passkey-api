import { Request, Response } from "express";
import VehiclePricingConfig from "@/models/vehicle-pricing-config.model";
import Country from "@/models/country.model";
import { calculateDeliveryPricing } from "@/services/pricing.service";
import {
  listPricingRules,
  upsertPricingRule,
  removePricingRule,
  PricingRulePayload,
} from "@/services/config.service";
import PricingRule from "@/models/pricing-rule.model";
import { resolveCountryId } from "@/services/country.service";

function parseNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export async function listPricingConfigs(req: Request, res: Response) {
  try {
    const { vehicleType, countryId: rawCountryId } = req.query as Record<string, string | undefined>;
    const whereClause: Record<string, unknown> = {};

    if (rawCountryId && rawCountryId !== "all") {
      whereClause.countryId = await resolveCountryId(String(rawCountryId));
    }
    if (vehicleType) {
      whereClause.vehicleType = vehicleType;
    }

    const rows = await VehiclePricingConfig.findAll({
      where: whereClause,
      include: [
        {
          model: Country,
          as: "country",
          attributes: ["name"],
        },
      ],
      order: [["updatedAt", "DESC"]],
    });
    console.log(`[listPricingConfigs] Found ${rows.length} configs for where:`, whereClause);
    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list pricing configs" });
  }
}

export async function createOrUpdatePricingConfig(req: Request, res: Response) {
  try {
    const {
      id,
      countryId: rawCountryId,
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
      countryId: await resolveCountryId(String(rawCountryId || "")),
      vehicleType: String(vehicleType).trim(),
      baseFare: parseNumber(baseFare, 0),
      perKmRate: parseNumber(perKmRate, 0),
      perMinuteRate: parseNumber(perMinuteRate, 0),
      bookingFee: parseNumber(bookingFee, 0),
      minimumFare: parseNumber(minimumFare, 0),
    };

    let row = id ? await VehiclePricingConfig.findByPk(id) : null;
    if (!row) {
      row = await VehiclePricingConfig.findOne({
        where: { vehicleType: payload.vehicleType, countryId: payload.countryId },
      });
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
    const { vehicleType, configId, distanceKm, durationMinutes, extras, pickupTimestamp } = req.body || {};
    const countryId = await resolveCountryId(String(req.body?.countryId || req.query.countryId || ""));
    const distance = parseNumber(distanceKm, 0);
    const duration = parseNumber(durationMinutes, 0);
    const extrasAmount = parseNumber(extras, 0);

    if (!configId && !vehicleType) {
      return res.status(400).json({ success: false, message: "vehicleType or configId is required" });
    }

    const calculation = await calculateDeliveryPricing({
      vehicleType: vehicleType || "",
      countryId,
      distanceKm: distance,
      durationMinutes: duration,
      extras: extrasAmount,
      pickupTimestamp,
    });

    return res.status(200).json({
      success: true,
      data: {
        config: calculation,
        calculation,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to calculate pricing" });
  }
}

export async function listPricingRulesController(req: Request, res: Response) {
  try {
    const rawType = req.query.type;
    const type = typeof rawType === "string" ? rawType : undefined;
    const countryId = await resolveCountryId(String(req.query.countryId || ""));
    const rows = await listPricingRules(type as any, countryId);
    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list pricing rules" });
  }
}

export async function createPricingRuleController(req: Request, res: Response) {
  try {
    const payload = {
      ...(req.body as PricingRulePayload),
      countryId: await resolveCountryId(String(req.body?.countryId || "")),
    };
    const row = await upsertPricingRule(payload);
    return res.status(201).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to save pricing rule" });
  }
}

export async function updatePricingRuleController(req: Request, res: Response) {
  try {
    const payload = {
      ...(req.body as PricingRulePayload),
      countryId: await resolveCountryId(String(req.body?.countryId || "")),
    };
    const row = await upsertPricingRule({ ...payload, id: req.params.id });
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to update pricing rule" });
  }
}

export async function deletePricingRuleController(req: Request, res: Response) {
  try {
    const row = await removePricingRule(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Pricing rule not found" });
    }
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to delete pricing rule" });
  }
}
