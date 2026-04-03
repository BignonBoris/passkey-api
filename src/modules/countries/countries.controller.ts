import { Request, Response } from "express";
import Country from "../../models/country.model";
import User from "../../models/user.model";
import {
  findCountryByIdOrCode,
  resolveCountryFromCoordinates,
  resolveCountryId,
} from "../../services/country.service";

function parseCoordinate(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function listCountries(_req: Request, res: Response) {
  try {
    const rows = await Country.findAll({
      order: [["isDefault", "DESC"], ["name", "ASC"]],
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list countries" });
  }
}

export async function resolveCountryByGps(req: Request, res: Response) {
  try {
    const latitude = parseCoordinate(req.body?.latitude ?? req.query?.latitude ?? req.body?.lat ?? req.query?.lat);
    const longitude = parseCoordinate(req.body?.longitude ?? req.query?.longitude ?? req.body?.lng ?? req.query?.lng);

    if (latitude === null || longitude === null) {
      return res.status(400).json({
        success: false,
        message: "latitude and longitude are required",
      });
    }

    const resolution = await resolveCountryFromCoordinates(latitude, longitude);
    return res.status(200).json({
      success: true,
      data: {
        country: resolution.country,
        matchedByGps: resolution.matchedByGps,
        latitude,
        longitude,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to resolve country" });
  }
}

export async function assignUserCountryByGps(req: Request, res: Response) {
  try {
    const userId = String(req.body?.userId || req.params?.userId || "").trim();
    const latitude = parseCoordinate(req.body?.latitude ?? req.body?.lat);
    const longitude = parseCoordinate(req.body?.longitude ?? req.body?.lng);

    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }
    if (latitude === null || longitude === null) {
      return res.status(400).json({ success: false, message: "latitude and longitude are required" });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const resolution = await resolveCountryFromCoordinates(latitude, longitude);
    user.set("countryId", String(resolution.country.get("id") || ""));
    user.set("latitude", latitude);
    user.set("longitude", longitude);
    user.set("locationUpdatedAt", new Date());
    await user.save();

    return res.status(200).json({
      success: true,
      data: {
        user,
        country: resolution.country,
        matchedByGps: resolution.matchedByGps,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to assign country" });
  }
}

export async function getCountry(req: Request, res: Response) {
  try {
    const country = await findCountryByIdOrCode(req.params.id);
    if (!country) {
      return res.status(404).json({ success: false, message: "Country not found" });
    }
    return res.status(200).json({ success: true, data: country });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to load country" });
  }
}

/**
 * Save country configuration in database
 * @param req 
 * @param res 
 * @returns 
 */
export async function saveCountry(req: Request, res: Response) {
  console.log("[saveCountry] Request body:", JSON.stringify(req.body, null, 2));
  try {
    const { code, name, iso2, iso3, phoneCode, currencyCode, deliveryDistanceKm, driverLocationDistanceKm, 
      isActive, isDefault, minLatitude, maxLatitude, minLongitude, maxLongitude, centerLatitude, centerLongitude } = req.body;
    
    if (!code || !name) {
      console.warn("[saveCountry] Missing required fields:", { code, name });
      return res.status(400).json({ success: false, message: "Code and name are required" });
    }

    let country = await Country.findOne({ where: { code } });
    console.log("[saveCountry] Existing country found:", !!country);

    const payload = {
      name: String(name).trim(),
      code: String(code).trim().toLowerCase(),
      iso2: String(iso2 || req.body.isoCode || "").trim().toUpperCase(),
      iso3: String(iso3 || "").trim().toUpperCase(),
      phoneCode: String(phoneCode || "").trim(),
      currencyCode: String(currencyCode || req.body.currency || "XOF").trim().toUpperCase(),
      minLatitude: parseCoordinate(req.body.minLatitude),
      maxLatitude: parseCoordinate(req.body.maxLatitude),
      minLongitude: parseCoordinate(req.body.minLongitude),
      maxLongitude: parseCoordinate(req.body.maxLongitude),
      centerLatitude: parseCoordinate(req.body.centerLatitude),
      centerLongitude: parseCoordinate(req.body.centerLongitude),
      isActive: req.body.isActive !== false,
      isDefault: req.body.isDefault === true,
      deliveryDistanceKm: Number(req.body.deliveryDistanceKm) ?? 10,
      driverLocationDistanceKm: Number(req.body.driverLocationDistanceKm) ?? 2,
    };

    if (payload.isDefault) {
      console.log("[saveCountry] Resetting other default countries");
      await Country.update({ isDefault: false }, { where: {} });
    }

    if (country) {
      console.log("[saveCountry] Updating country ID:", country.id);
      country.set(payload as any);
      await country.save();
      return res.status(200).json({ success: true, data: country, message: "Country updated" });
    } else {
      console.log("[saveCountry] Creating new country");
      // Double check critical fields for creation if not using findOne by iso
      if (!payload.iso2) {
        return res.status(400).json({ success: false, message: "ISO2 is required for creation" });
      }
      country = await Country.create(payload as any);
      return res.status(201).json({ success: true, data: country, message: "Country created" });
    }
  } catch (error: any) {
    console.error("[saveCountry] Error:", error);
    return res.status(500).json({ success: false, message: error?.message || "Failed to save country" });
  }
}

export async function updateCountry(req: Request, res: Response) {
  try {
    const country = await findCountryByIdOrCode(req.params.id);
    if (!country) {
      return res.status(404).json({ success: false, message: "Country not found" });
    }

    const nextDefault = req.body?.isDefault === true;
    if (nextDefault) {
      await Country.update({ isDefault: false }, { where: {} });
    }

    country.set({
      name: req.body?.name ?? country.get("name"),
      code: req.body?.code ?? country.get("code"),
      iso2: req.body?.iso2 ?? req.body?.isoCode ?? country.get("iso2"), // Support both frontend names
      iso3: req.body?.iso3 ?? country.get("iso3"),
      phoneCode: req.body?.phoneCode ?? country.get("phoneCode"),
      currencyCode: req.body?.currencyCode ?? req.body?.currency ?? country.get("currencyCode"),
      minLatitude: req.body?.minLatitude ?? country.get("minLatitude"),
      maxLatitude: req.body?.maxLatitude ?? country.get("maxLatitude"),
      minLongitude: req.body?.minLongitude ?? country.get("minLongitude"),
      maxLongitude: req.body?.maxLongitude ?? country.get("maxLongitude"),
      centerLatitude: req.body?.centerLatitude ?? country.get("centerLatitude"),
      centerLongitude: req.body?.centerLongitude ?? country.get("centerLongitude"),
      isActive: req.body?.isActive ?? country.get("isActive"),
      isDefault: req.body?.isDefault ?? country.get("isDefault"),
      deliveryDistanceKm: req.body?.deliveryDistanceKm ?? country.get("deliveryDistanceKm"),
      driverLocationDistanceKm: req.body?.driverLocationDistanceKm ?? country.get("driverLocationDistanceKm"),
    });
    await country.save();

    return res.status(200).json({ success: true, data: country });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to update country" });
  }
}

export async function createCountry(req: Request, res: Response) {
  try {
    const payload = {
      code: String(req.body?.code || "").trim().toLowerCase(),
      iso2: String(req.body?.iso2 || req.body?.isoCode || "").trim().toUpperCase(),
      iso3: String(req.body?.iso3 || "").trim().toUpperCase(),
      name: String(req.body?.name || "").trim(),
      phoneCode: String(req.body?.phoneCode || "").trim(),
      currencyCode: String(req.body?.currencyCode || req.body?.currency || "XOF").trim().toUpperCase(),
      minLatitude: parseCoordinate(req.body?.minLatitude),
      maxLatitude: parseCoordinate(req.body?.maxLatitude),
      minLongitude: parseCoordinate(req.body?.minLongitude),
      maxLongitude: parseCoordinate(req.body?.maxLongitude),
      centerLatitude: parseCoordinate(req.body?.centerLatitude),
      centerLongitude: parseCoordinate(req.body?.centerLongitude),
      isActive: req.body?.isActive !== false,
      isDefault: req.body?.isDefault === true,
      deliveryDistanceKm: req.body?.deliveryDistanceKm ?? 10,
      driverLocationDistanceKm: req.body?.driverLocationDistanceKm ?? 2,
    };

    if (!payload.code || !payload.iso2 || !payload.iso3 || !payload.name) {
      return res.status(400).json({ success: false, message: "code, iso2, iso3 and name are required" });
    }

    if (payload.isDefault) {
      await Country.update({ isDefault: false }, { where: {} });
    }

    const row = await Country.create(payload as any);
    return res.status(201).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to create country" });
  }
}
