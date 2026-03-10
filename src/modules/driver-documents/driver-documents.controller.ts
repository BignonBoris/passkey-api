import { Request, Response } from "express";
import { Op } from "sequelize";
import DriverDocument from "@/models/driver-document.model";
import User from "@/models/user.model";
import KycRequest from "@/models/kyc-request.model";
import DriverVehicle from "@/models/driver-vehicle.model";
import { AuthenticatedRequest } from "@/types/auth-request";

const REQUIRED_DRIVER_DOC_TYPES = [
  "ID_CARD",
  "DRIVER_LICENSE",
  "ID_PHOTO",
  "VEHICLE_REGISTRATION",
  "VEHICLE_INSURANCE",
] as const;

type RequiredDriverDocType = (typeof REQUIRED_DRIVER_DOC_TYPES)[number];

function buildPublicDocumentUrl(req: Request, storedName: string) {
  const host = req.get("host");
  const protocol = req.protocol || "http";
  return `${protocol}://${host}/uploads/driver-documents/${storedName}`;
}

export async function listDriverDocuments(req: Request, res: Response) {
  try {
    const { status, type, userId, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    const whereClause: any = {};

    if (status) whereClause.status = status;
    if (type) whereClause.type = type;
    if (userId) whereClause.userId = userId;
    if (dateFrom || dateTo) {
      whereClause.createdAt = {};
      if (dateFrom) whereClause.createdAt[Op.gte] = new Date(dateFrom);
      if (dateTo) whereClause.createdAt[Op.lte] = new Date(dateTo);
    }

    const rows = await DriverDocument.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list driver documents" });
  }
}

export async function getDriverDocument(req: Request, res: Response) {
  try {
    const row = await DriverDocument.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Driver document not found" });
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to load driver document" });
  }
}

export async function createDriverDocument(req: Request, res: Response) {
  try {
    const { userId, type, url, expiresAt } = req.body || {};
    if (!userId || !type) {
      return res.status(400).json({ success: false, message: "userId and type are required" });
    }
    const row = await DriverDocument.create({
      userId,
      type,
      url: url || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });
    return res.status(201).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to create driver document" });
  }
}

export async function updateDriverDocument(req: Request, res: Response) {
  try {
    const { status, url, expiresAt, verifiedBy } = req.body || {};
    const row = await DriverDocument.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Driver document not found" });

    if (status) row.set("status", status);
    if (url !== undefined) row.set("url", url);
    if (expiresAt !== undefined) row.set("expiresAt", expiresAt ? new Date(expiresAt) : null);
    if (verifiedBy) row.set("verifiedBy", verifiedBy);
    if (status && status !== "PENDING") row.set("verifiedAt", new Date());

    await row.save();
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to update driver document" });
  }
}

export async function deleteDriverDocument(req: Request, res: Response) {
  try {
    const row = await DriverDocument.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Driver document not found" });
    await row.destroy();
    return res.status(200).json({ success: true, message: "Driver document deleted" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to delete driver document" });
  }
}

export async function getMyDriverOnboardingStatus(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.id || req.user.role !== "livreur") {
      return res.status(403).json({ success: false, message: "Only drivers can access this endpoint" });
    }

    const user = await User.findByPk(req.user.id, {
      attributes: [
        "id",
        "name",
        "email",
        "role",
        "identityVerified",
        "hasSubmittedOnboarding",
        "city",
        "dateOfBirth",
        "accountStatus",
        "isActive",
        "isAvailable",
      ],
    });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const docs = await DriverDocument.findAll({
      where: { userId: req.user.id },
      order: [["createdAt", "DESC"]],
    });

    const latestByType = new Map<string, any>();
    for (const doc of docs) {
      const docType = String(doc.get("type") || "");
      if (!latestByType.has(docType)) latestByType.set(docType, doc.toJSON());
    }

    const documents = REQUIRED_DRIVER_DOC_TYPES.map((type) => {
      const row = latestByType.get(type);
      return {
        type,
        status: row?.status || "MISSING",
        url: row?.url || null,
        updatedAt: row?.updatedAt || null,
      };
    });

    const hasAllDocuments = documents.every((d) => d.status !== "MISSING");
    const allApproved = documents.every((d) => d.status === "APPROVED");
    const hasRejected = documents.some((d) => d.status === "REJECTED");
    const hasPending = documents.some((d) => d.status === "PENDING");
    const hasSubmittedOnboarding = Boolean(user.get("hasSubmittedOnboarding"));
    const identityVerified = Boolean(user.get("identityVerified"));
    const isAccountActive =
      String(user.get("accountStatus") || "").toLowerCase() === "active" &&
      Boolean(user.get("isActive"));
    const canAccessCourier = isAccountActive || identityVerified;

    const latestVehicle = await DriverVehicle.findOne({
      where: { driverId: req.user.id },
      order: [["createdAt", "DESC"]],
    });

    const vehicleData = latestVehicle
      ? {
          id: latestVehicle.get("id"),
          type: latestVehicle.get("type"),
          brand: latestVehicle.get("brand"),
          year: latestVehicle.get("year"),
          plateNumber: latestVehicle.get("plateNumber"),
        }
      : null;

    const driverData = {
      id: user.get("id"),
      name: user.get("name") || "",
      email: user.get("email") || "",
      city: user.get("city") || "",
      dateOfBirth: (() => {
        const raw = user.get("dateOfBirth");
        if (!raw) return null;
        const date = raw instanceof Date ? raw : new Date(raw);
        return date.toISOString().split("T")[0];
      })(),
    };

    return res.status(200).json({
      success: true,
      data: {
        identityVerified,
        accountStatus: String(user.get("accountStatus") || "active"),
        isActive: Boolean(user.get("isActive")),
        isAvailable: Boolean(user.get("isAvailable")),
        hasSubmittedOnboarding,
        hasAllDocuments,
        allApproved,
        canAccessCourier,
        onboardingState: canAccessCourier
          ? "APPROVED"
          : hasRejected
          ? "REJECTED"
          : allApproved
          ? "APPROVED"
          : hasPending || hasSubmittedOnboarding
          ? "PENDING"
          : "INCOMPLETE",
        driver: driverData,
        vehicle: vehicleData,
        documents,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to load onboarding status" });
  }
}

export async function listMyDriverVehicleTypes(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.id || req.user.role !== "livreur") {
      return res.status(403).json({ success: false, message: "Only drivers can access this endpoint" });
    }

    const rows = await DriverVehicle.findAll({
      attributes: ["type"],
      where: {
        type: {
          [Op.not]: null,
        },
      },
      group: ["type"],
      order: [["type", "ASC"]],
    });

    const fromDb = rows
      .map((row) => String(row.get("type") || "").trim())
      .filter((value) => value.length > 0);
    const fallback = ["Moto", "Tricycle", "Voiture"];

    const options = Array.from(new Set([...fromDb, ...fallback]));

    return res.status(200).json({
      success: true,
      data: options.map((value) => ({ id: value, label: value })),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list vehicle types" });
  }
}

export async function submitMyDriverOnboarding(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.id || req.user.role !== "livreur") {
      return res.status(403).json({ success: false, message: "Only drivers can submit onboarding" });
    }

    const files = req.files as Record<string, any[]> | undefined;
    const idCard = files?.idCard?.[0];
    const driverLicense = files?.driverLicense?.[0];
    const idPhoto = files?.idPhoto?.[0];
    const vehicleRegistration = files?.vehicleRegistration?.[0];
    const vehicleInsurance = files?.vehicleInsurance?.[0];

    if (!idCard || !driverLicense || !idPhoto || !vehicleRegistration || !vehicleInsurance) {
      return res.status(400).json({
        success: false,
        message: "idCard, driverLicense, idPhoto, vehicleRegistration and vehicleInsurance files are required",
      });
    }

    const {
      fullName,
      email,
      city,
      dateOfBirth,
      vehicleType,
      brand,
      year,
      plateNumber,
    } = req.body || {};

    if (!fullName || !city || !dateOfBirth || !vehicleType || !brand || !year || !plateNumber) {
      return res.status(400).json({
        success: false,
        message:
          "fullName, city, dateOfBirth, vehicleType, brand, year and plateNumber are required",
      });
    }

    const parsedYear = Number(year);
    if (!Number.isInteger(parsedYear) || parsedYear < 1950 || parsedYear > new Date().getFullYear() + 1) {
      return res.status(400).json({
        success: false,
        message: "year is invalid",
      });
    }

    await User.update(
      {
        name: fullName,
        email: email || null,
        city,
        dateOfBirth,
        identityVerified: false,
        hasSubmittedOnboarding: true,
      },
      { where: { id: req.user.id } }
    );

    const uploads: Array<{ type: RequiredDriverDocType; file: any }> = [
      { type: "ID_CARD", file: idCard },
      { type: "DRIVER_LICENSE", file: driverLicense },
      { type: "ID_PHOTO", file: idPhoto },
      { type: "VEHICLE_REGISTRATION", file: vehicleRegistration },
      { type: "VEHICLE_INSURANCE", file: vehicleInsurance },
    ];

    const createdDocuments = await Promise.all(
      uploads.map(({ type, file }) =>
        DriverDocument.create({
          userId: req.user!.id,
          type,
          status: "PENDING",
          url: buildPublicDocumentUrl(req, file.filename),
        })
      )
    );

    const existingVehicle = await DriverVehicle.findOne({
      where: { driverId: req.user.id, plateNumber },
      order: [["createdAt", "DESC"]],
    });
    if (!existingVehicle) {
      await DriverVehicle.create({
        driverId: req.user.id,
        type: vehicleType,
        plateNumber,
        brand,
        year: parsedYear,
        isPrimary: true,
      });
    } else {
      existingVehicle.set("type", vehicleType);
      existingVehicle.set("brand", brand);
      existingVehicle.set("year", parsedYear);
      existingVehicle.set("status", "ACTIVE");
      await existingVehicle.save();
    }

    await KycRequest.create({
      userId: req.user.id,
      type: "KYC",
      status: "PENDING",
      submittedAt: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: "Driver onboarding submitted",
      data: {
        documents: createdDocuments,
        hasSubmittedOnboarding: true,
        onboardingState: "PENDING",
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to submit onboarding" });
  }
}

export async function updateMyDriverOnboarding(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.id || req.user.role !== "livreur") {
      return res.status(403).json({ success: false, message: "Only drivers can update onboarding" });
    }

    const files = req.files as Record<string, any[]> | undefined;
    const idCard = files?.idCard?.[0];
    const driverLicense = files?.driverLicense?.[0];
    const idPhoto = files?.idPhoto?.[0];
    const vehicleRegistration = files?.vehicleRegistration?.[0];
    const vehicleInsurance = files?.vehicleInsurance?.[0];

    const {
      fullName,
      email,
      city,
      dateOfBirth,
      vehicleType,
      brand,
      year,
      plateNumber,
    } = req.body || {};

    const hasAnyFile =
      Boolean(idCard) ||
      Boolean(driverLicense) ||
      Boolean(idPhoto) ||
      Boolean(vehicleRegistration) ||
      Boolean(vehicleInsurance);

    const hasAnyProfileField =
      Boolean(fullName) ||
      email !== undefined ||
      Boolean(city) ||
      Boolean(dateOfBirth) ||
      Boolean(vehicleType) ||
      Boolean(brand) ||
      year !== undefined ||
      Boolean(plateNumber);

    if (!hasAnyFile && !hasAnyProfileField) {
      return res.status(400).json({
        success: false,
        message: "No changes provided",
      });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const userUpdate: Record<string, any> = {};
    if (fullName) userUpdate.name = fullName;
    if (email !== undefined) userUpdate.email = email || null;
    if (city) userUpdate.city = city;
    if (dateOfBirth) userUpdate.dateOfBirth = dateOfBirth;
    if (hasAnyFile || hasAnyProfileField) {
      userUpdate.identityVerified = false;
      userUpdate.hasSubmittedOnboarding = true;
    }

    if (Object.keys(userUpdate).length > 0) {
      await user.update(userUpdate);
    }

    const latestVehicle = await DriverVehicle.findOne({
      where: { driverId: req.user.id },
      order: [["createdAt", "DESC"]],
    });

    if (vehicleType || brand || year !== undefined || plateNumber) {
      let parsedYear: number | undefined;
      if (year !== undefined && year !== null && String(year).trim() != "") {
        parsedYear = Number(year);
        if (!Number.isInteger(parsedYear) || parsedYear < 1950 || parsedYear > new Date().getFullYear() + 1) {
          return res.status(400).json({
            success: false,
            message: "year is invalid",
          });
        }
      }

      if (!latestVehicle) {
        if (!vehicleType || !brand || parsedYear === undefined || !plateNumber) {
          return res.status(400).json({
            success: false,
            message: "vehicleType, brand, year and plateNumber are required to create vehicle",
          });
        }
        await DriverVehicle.create({
          driverId: req.user.id,
          type: vehicleType,
          plateNumber,
          brand,
          year: parsedYear,
          isPrimary: true,
        });
      } else {
        if (vehicleType) latestVehicle.set("type", vehicleType);
        if (brand) latestVehicle.set("brand", brand);
        if (parsedYear !== undefined) latestVehicle.set("year", parsedYear);
        if (plateNumber) latestVehicle.set("plateNumber", plateNumber);
        latestVehicle.set("status", "ACTIVE");
        await latestVehicle.save();
      }
    }

    const uploads: Array<{ type: RequiredDriverDocType; file: any }> = [];
    if (idCard) uploads.push({ type: "ID_CARD", file: idCard });
    if (driverLicense) uploads.push({ type: "DRIVER_LICENSE", file: driverLicense });
    if (idPhoto) uploads.push({ type: "ID_PHOTO", file: idPhoto });
    if (vehicleRegistration) uploads.push({ type: "VEHICLE_REGISTRATION", file: vehicleRegistration });
    if (vehicleInsurance) uploads.push({ type: "VEHICLE_INSURANCE", file: vehicleInsurance });

    const createdDocuments = await Promise.all(
      uploads.map(({ type, file }) =>
        DriverDocument.create({
          userId: req.user!.id,
          type,
          status: "PENDING",
          url: buildPublicDocumentUrl(req, file.filename),
        })
      )
    );

    if (hasAnyFile || hasAnyProfileField) {
      const existingPendingKyc = await KycRequest.findOne({
        where: {
          userId: req.user.id,
          type: "KYC",
          status: "PENDING",
        },
      });
      if (!existingPendingKyc) {
        await KycRequest.create({
          userId: req.user.id,
          type: "KYC",
          status: "PENDING",
          submittedAt: new Date(),
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Driver onboarding updated",
      data: {
        documents: createdDocuments,
        hasSubmittedOnboarding: true,
        onboardingState: "PENDING",
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to update onboarding" });
  }
}
