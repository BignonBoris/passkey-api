import { Request, Response } from "express";
import { Op } from "sequelize";
import DriverVehicle from "@/models/driver-vehicle.model";

export async function listDriverVehicles(req: Request, res: Response) {
  try {
    const { driverId, status, type, isPrimary, search } = req.query as Record<string, string | undefined>;
    const whereClause: any = {};
    if (driverId) whereClause.driverId = driverId;
    if (status) whereClause.status = status;
    if (type) whereClause.type = type;
    if (isPrimary) whereClause.isPrimary = isPrimary === "true";
    if (search) {
      whereClause[Op.or] = [
        { plateNumber: { [Op.like]: `%${search}%` } },
        { brand: { [Op.like]: `%${search}%` } },
        { model: { [Op.like]: `%${search}%` } },
      ];
    }

    const rows = await DriverVehicle.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list vehicles" });
  }
}

export async function getDriverVehicle(req: Request, res: Response) {
  try {
    const row = await DriverVehicle.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Vehicle not found" });
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to load vehicle" });
  }
}

export async function createDriverVehicle(req: Request, res: Response) {
  try {
    const { driverId, type, plateNumber, brand, model, year, status, isPrimary } = req.body || {};
    if (!driverId || !type || !plateNumber) {
      return res.status(400).json({ success: false, message: "driverId, type, plateNumber are required" });
    }

    if (isPrimary === true) {
      await DriverVehicle.update({ isPrimary: false }, { where: { driverId } });
    }

    const row = await DriverVehicle.create({
      driverId,
      type,
      plateNumber,
      brand: brand || null,
      model: model || null,
      year: year ?? null,
      status: status || "ACTIVE",
      isPrimary: Boolean(isPrimary),
    });
    return res.status(201).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to create vehicle" });
  }
}

export async function updateDriverVehicle(req: Request, res: Response) {
  try {
    const { type, plateNumber, brand, model, year, status, isPrimary } = req.body || {};
    const row = await DriverVehicle.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Vehicle not found" });

    if (type !== undefined) row.set("type", type);
    if (plateNumber !== undefined) row.set("plateNumber", plateNumber);
    if (brand !== undefined) row.set("brand", brand);
    if (model !== undefined) row.set("model", model);
    if (year !== undefined) row.set("year", year);
    if (status !== undefined) row.set("status", status);
    if (isPrimary !== undefined) {
      if (isPrimary === true) {
        await DriverVehicle.update({ isPrimary: false }, { where: { driverId: row.driverId } });
      }
      row.set("isPrimary", Boolean(isPrimary));
    }

    await row.save();
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to update vehicle" });
  }
}

export async function deleteDriverVehicle(req: Request, res: Response) {
  try {
    const row = await DriverVehicle.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Vehicle not found" });
    await row.destroy();
    return res.status(200).json({ success: true, message: "Vehicle deleted" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to delete vehicle" });
  }
}

export async function activateDriverVehicle(req: Request, res: Response) {
  try {
    const row = await DriverVehicle.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Vehicle not found" });

    await DriverVehicle.update({ isPrimary: false }, { where: { driverId: row.driverId } });
    row.set("isPrimary", true);
    await row.save();

    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to activate vehicle" });
  }
}
