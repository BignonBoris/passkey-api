import { Request, Response } from "express";
import { Op } from "sequelize";
import ServiceZone from "../../models/service-zone.model";
import { resolveCountryId } from "../../services/country.service";

export async function listZones(req: Request, res: Response) {
  try {
    const { status, name } = req.query as Record<string, string | undefined>;
    const whereClause: any = { countryId: await resolveCountryId(String(req.query.countryId || "")) };
    if (status) whereClause.status = status;
    if (name) whereClause.name = { [Op.like]: `%${name}%` };

    const rows = await ServiceZone.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de lister les zones" });
  }
}

export async function getZone(req: Request, res: Response) {
  try {
    const row = await ServiceZone.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Zone introuvable" });
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de charger la zone" });
  }
}

export async function createZone(req: Request, res: Response) {
  try {
    const { name, city, status, polygon } = req.body || {};
    if (!name) return res.status(400).json({ success: false, message: "Le nom est requis" });
    const countryId = await resolveCountryId(String(req.body?.countryId || ""));
    const row = await ServiceZone.create({
      countryId,
      name,
      city: city || null,
      status: status || "ACTIVE",
      polygon: polygon || null,
    });
    return res.status(201).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de creer la zone" });
  }
}

export async function updateZone(req: Request, res: Response) {
  try {
    const { name, city, status, polygon } = req.body || {};
    const row = await ServiceZone.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Zone introuvable" });

    if (name !== undefined) row.set("name", name);
    if (city !== undefined) row.set("city", city);
    if (status !== undefined) row.set("status", status);
    if (polygon !== undefined) row.set("polygon", polygon);

    await row.save();
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de mettre a jour la zone" });
  }
}

export async function deleteZone(req: Request, res: Response) {
  try {
    const row = await ServiceZone.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Zone introuvable" });
    await row.destroy();
    return res.status(200).json({ success: true, message: "Zone supprimee" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de supprimer la zone" });
  }
}
