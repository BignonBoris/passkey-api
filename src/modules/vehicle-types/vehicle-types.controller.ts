import { Request, Response } from "express";
import VehicleType from "../../models/vehicle-type.model";
import VehiclePricingConfig from "../../models/vehicle-pricing-config.model";
import DriverRevenueConfig from "../../models/driver-revenue-config.model";
import { resolveCountryId } from "../../services/country.service";

function slugifyVehicleTypeCode(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapVehicleType(row: VehicleType) {
  return {
    id: String(row.get("code") || ""),
    countryId: String(row.get("countryId") || ""),
    code: String(row.get("code") || ""),
    name: String(row.get("name") || ""),
    label: String(row.get("name") || ""),
    iconKey: String(row.get("iconKey") || "two_wheeler_rounded"),
    sortOrder: Number(row.get("sortOrder") || 0),
    isActive: Boolean(row.get("isActive")),
    createdAt: row.get("createdAt"),
    updatedAt: row.get("updatedAt"),
  };
}

async function ensureVehicleTypePricingRows(vehicleType: string, countryId: string) {
  const normalized = vehicleType.trim().toLowerCase();
  if (!normalized) return;

  const pricing = await VehiclePricingConfig.findOne({ where: { vehicleType: normalized, countryId } });
  if (!pricing) {
    await VehiclePricingConfig.create({
      countryId,
      vehicleType: normalized,
      baseFare: 0,
      perKmRate: 0,
      perMinuteRate: 0,
      bookingFee: 0,
      minimumFare: 0,
    });
  }

  const revenue = await DriverRevenueConfig.findOne({ where: { vehicleType: normalized, countryId } });
  if (!revenue) {
    await DriverRevenueConfig.create({
      countryId,
      vehicleType: normalized,
      baseFare: 0,
      perKmRate: 0,
      perMinuteRate: 0,
      commissionPercent: 25,
      serviceFeePercent: 5,
    });
  }
}

export async function listVehicleTypes(req: Request, res: Response) {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const countryId = await resolveCountryId(String(req.query.countryId || ""));
    const rows = await VehicleType.findAll({
      where: includeInactive ? { countryId } : { isActive: true, countryId },
      order: [
        ["sortOrder", "ASC"],
        ["name", "ASC"],
      ],
    });

    return res.status(200).json({
      success: true,
      data: rows.map((row) => mapVehicleType(row)),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de lister les types de vehicule" });
  }
}

export async function createVehicleType(req: Request, res: Response) {
  try {
    const rawName = String(req.body?.name ?? "").trim();
    const rawCode = String(req.body?.code ?? rawName).trim();
    const iconKey = String(req.body?.iconKey ?? req.body?.icon ?? "two_wheeler_rounded").trim() || "two_wheeler_rounded";
    const sortOrder = Math.max(0, Number(req.body?.sortOrder ?? 0) || 0);
    const isActive = req.body?.isActive !== false;

    if (!rawName) {
      return res.status(400).json({ success: false, message: "Le nom du type de vehicule est requis." });
    }

    const code = slugifyVehicleTypeCode(rawCode);
    if (!code) {
      return res.status(400).json({ success: false, message: "Le code du type de vehicule est invalide." });
    }

    const countryId = await resolveCountryId(String(req.body?.countryId || ""));
    const existing = await VehicleType.findOne({ where: { code, countryId } });
    if (existing) {
      return res.status(409).json({ success: false, message: "Ce type de vehicule existe deja." });
    }

    const row = await VehicleType.create({
      countryId,
      code,
      name: rawName,
      iconKey,
      sortOrder,
      isActive,
    });

    await ensureVehicleTypePricingRows(code, countryId);

    return res.status(201).json({ success: true, data: mapVehicleType(row) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de creer le type de vehicule" });
  }
}

export async function updateVehicleType(req: Request, res: Response) {
  try {
    const row = await VehicleType.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Type de vehicule introuvable." });
    }

    const currentCode = String(row.get("code") || "").trim().toLowerCase();
    const countryId = String(row.get("countryId") || "");
    if (req.body?.name !== undefined) {
      const name = String(req.body.name ?? "").trim();
      if (!name) {
        return res.status(400).json({ success: false, message: "Le nom du type de vehicule est requis." });
      }
      row.set("name", name);
    }

    if (req.body?.code !== undefined) {
      const nextCode = slugifyVehicleTypeCode(String(req.body.code ?? "").trim());
      if (!nextCode) {
        return res.status(400).json({ success: false, message: "Le code du type de vehicule est invalide." });
      }

      const duplicate = await VehicleType.findOne({ where: { code: nextCode, countryId } });
      if (duplicate && String(duplicate.get("id")) !== String(row.get("id"))) {
        return res.status(409).json({ success: false, message: "Ce code est deja utilise." });
      }

      row.set("code", nextCode);
    }

    if (req.body?.iconKey !== undefined || req.body?.icon !== undefined) {
      row.set(
        "iconKey",
        String(req.body?.iconKey ?? req.body?.icon ?? "two_wheeler_rounded").trim() || "two_wheeler_rounded"
      );
    }
    if (req.body?.sortOrder !== undefined) {
      row.set("sortOrder", Math.max(0, Number(req.body.sortOrder ?? 0) || 0));
    }
    if (req.body?.isActive !== undefined) {
      row.set("isActive", Boolean(req.body.isActive));
    }

    await row.save();

    const nextCode = String(row.get("code") || "").trim().toLowerCase();
    if (nextCode && nextCode !== currentCode) {
      await VehiclePricingConfig.update(
        { vehicleType: nextCode },
        { where: { vehicleType: currentCode, countryId } }
      );
      await DriverRevenueConfig.update(
        { vehicleType: nextCode },
        { where: { vehicleType: currentCode, countryId } }
      );
    }
    await ensureVehicleTypePricingRows(nextCode, countryId);

    return res.status(200).json({ success: true, data: mapVehicleType(row) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de mettre a jour le type de vehicule" });
  }
}

export async function deleteVehicleType(req: Request, res: Response) {
  try {
    const row = await VehicleType.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Type de vehicule introuvable." });
    }

    const code = String(row.get("code") || "").trim().toLowerCase();
    const countryId = String(row.get("countryId") || "");
    await row.destroy();
    await VehiclePricingConfig.destroy({ where: { vehicleType: code, countryId } });
    await DriverRevenueConfig.destroy({ where: { vehicleType: code, countryId } });

    return res.status(200).json({ success: true, message: "Type de vehicule supprime." });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de supprimer le type de vehicule" });
  }
}

export async function activateVehicleType(req: Request, res: Response) {
  try {
    const row = await VehicleType.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Type de vehicule introuvable." });
    }

    row.set("isActive", true);
    await row.save();
    await ensureVehicleTypePricingRows(
      String(row.get("code") || "").trim().toLowerCase(),
      String(row.get("countryId") || "")
    );

    return res.status(200).json({ success: true, data: mapVehicleType(row) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible d'activer le type de vehicule" });
  }
}

export async function deactivateVehicleType(req: Request, res: Response) {
  try {
    const row = await VehicleType.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Type de vehicule introuvable." });
    }

    row.set("isActive", false);
    await row.save();

    return res.status(200).json({ success: true, data: mapVehicleType(row) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de desactiver le type de vehicule" });
  }
}
