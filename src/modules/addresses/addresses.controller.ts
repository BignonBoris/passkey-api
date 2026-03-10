import { Response } from "express";
import { Op, WhereOptions } from "sequelize";
import { AuthenticatedRequest } from "@/types/auth-request";
import UserAddress from "@/models/user-address.model";

function normalizeAddress(address: UserAddress) {
  return {
    id: address.getDataValue("id"),
    userId: address.getDataValue("userId"),
    label: address.getDataValue("label"),
    mapLabel: address.getDataValue("mapLabel"),
    latitude: Number(address.getDataValue("latitude")),
    longitude: Number(address.getDataValue("longitude")),
    createdAt: address.getDataValue("createdAt"),
    updatedAt: address.getDataValue("updatedAt"),
  };
}

function isValidCoordinate(value: unknown, min: number, max: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= min && numberValue <= max;
}

export const listMyAddresses = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const search = String(req.query?.search ?? "").trim();
    const whereClause: WhereOptions = { userId };

    if (search) {
      Object.assign(whereClause, {
        [Op.or]: [
          { label: { [Op.like]: `%${search}%` } },
          { mapLabel: { [Op.like]: `%${search}%` } },
        ],
      });
    }

    const addresses = await UserAddress.findAll({
      where: whereClause,
      order: [["updatedAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      count: addresses.length,
      data: addresses.map(normalizeAddress),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Unknown server error",
    });
  }
};

export const createMyAddress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const label = String(req.body?.label ?? "").trim();
    const mapLabel = String(req.body?.mapLabel ?? "").trim();
    const latitude = req.body?.latitude;
    const longitude = req.body?.longitude;

    if (!label || !mapLabel) {
      return res.status(400).json({
        success: false,
        message: "label and mapLabel are required",
      });
    }

    if (!isValidCoordinate(latitude, -90, 90) || !isValidCoordinate(longitude, -180, 180)) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude or longitude",
      });
    }

    const created = await UserAddress.create({
      userId,
      label,
      mapLabel,
      latitude: Number(latitude),
      longitude: Number(longitude),
    } as any);

    return res.status(201).json({
      success: true,
      message: "Address created",
      data: normalizeAddress(created),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Unknown server error",
    });
  }
};

export const updateMyAddress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const addressId = String(req.params?.id ?? "").trim();
    if (!addressId) {
      return res.status(400).json({ success: false, message: "Address id is required" });
    }

    const address = await UserAddress.findOne({
      where: { id: addressId, userId },
    });
    if (!address) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    const label = String(req.body?.label ?? "").trim();
    const mapLabel = String(req.body?.mapLabel ?? "").trim();
    const latitude = req.body?.latitude;
    const longitude = req.body?.longitude;

    if (!label || !mapLabel) {
      return res.status(400).json({
        success: false,
        message: "label and mapLabel are required",
      });
    }

    if (!isValidCoordinate(latitude, -90, 90) || !isValidCoordinate(longitude, -180, 180)) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude or longitude",
      });
    }

    address.set("label", label);
    address.set("mapLabel", mapLabel);
    address.set("latitude", Number(latitude));
    address.set("longitude", Number(longitude));
    await address.save();

    return res.status(200).json({
      success: true,
      message: "Address updated",
      data: normalizeAddress(address),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Unknown server error",
    });
  }
};

export const deleteMyAddress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const addressId = String(req.params?.id ?? "").trim();
    if (!addressId) {
      return res.status(400).json({ success: false, message: "Address id is required" });
    }

    const deleted = await UserAddress.destroy({
      where: { id: addressId, userId },
    });
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Address deleted",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Unknown server error",
    });
  }
};
