import { Request, Response } from "express";
import { Op } from "sequelize";
import DriverDocument from "../../models/driver-document.model";
import User from "../../models/user.model";
import KycRequest from "../../models/kyc-request.model";
import DriverVehicle from "../../models/driver-vehicle.model";
import VehicleType from "../../models/vehicle-type.model";
import { AuthenticatedRequest } from "../../types/auth-request";
import { resolveCountryId } from "../../services/country.service";
import { SmsService } from "../../services/sms/sms.service";
import { sendPushNotification } from "../../services/notification.service";

const REQUIRED_DRIVER_DOC_TYPES = [
  "ID_CARD",
  "DRIVER_LICENSE",
  "ID_PHOTO",
  "VEHICLE_IMAGE",
  "VEHICLE_REGISTRATION",
  "VEHICLE_INSURANCE",
] as const;

async function isAllowedVehicleType(vehicleType: unknown, countryId?: string) {
  const normalized = String(vehicleType ?? "").trim().toLowerCase();
  if (!normalized) return false;
  const resolvedCountryId = await resolveCountryId(countryId);
  const row = await VehicleType.findOne({ where: { code: normalized, isActive: true, countryId: resolvedCountryId } });
  return Boolean(row);
}

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
    return res.status(500).json({ success: false, message: error?.message || "Impossible de lister les documents du livreur." });
  }
}

export async function getDriverDocument(req: Request, res: Response) {
  try {
    const row = await DriverDocument.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Document livreur introuvable." });
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de charger le document du livreur." });
  }
}

export async function createDriverDocument(req: Request, res: Response) {
  try {
    const { userId, type, url, expiresAt } = req.body || {};
    if (!userId || !type) {
        return res.status(400).json({ success: false, message: "userId et type sont obligatoires." });
    }

    // Handle uploaded file if present
    let finalUrl = url;
    if ((req as any).file) {
      finalUrl = buildPublicDocumentUrl(req, (req as any).file.filename);
    }

    if (!finalUrl) {
        return res.status(400).json({ success: false, message: "Le fichier du document ou son URL est obligatoire." });
    }

    const row = await DriverDocument.create({
      userId,
      type,
      url: finalUrl,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      status: "APPROVED", // Admin manual upload
    });
    return res.status(201).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de créer le document du livreur." });
  }
}

export async function updateDriverDocument(req: Request, res: Response) {
  try {
    const { status, url, expiresAt, verifiedBy, rejectionReason } = req.body || {};
    const row = await DriverDocument.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Document livreur introuvable." });

    if (status) row.set("status", status);
    if (url !== undefined) row.set("url", url);
    if (expiresAt !== undefined) row.set("expiresAt", expiresAt ? new Date(expiresAt) : null);
    if (verifiedBy) row.set("verifiedBy", verifiedBy);
    if (status && status !== "PENDING") row.set("verifiedAt", new Date());

    // Store rejection reason when rejecting
    if (status === "REJECTED" && rejectionReason) {
      row.set("rejectionReason", rejectionReason.toString().trim());
    } else if (status === "APPROVED") {
      row.set("rejectionReason", null);
    }

    await row.save();
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de mettre à jour le document du livreur." });
  }
}

/**
 * Admin review endpoint: approve or reject a document and notify the driver.
 */
export async function reviewDriverDocument(req: AuthenticatedRequest, res: Response) {
  try {
    const { status, rejectionReason } = req.body || {};

    if (!status || !["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ success: false, message: "Le statut doit être APPROVED ou REJECTED." });
    }
    if (status === "REJECTED" && (!rejectionReason || !rejectionReason.toString().trim())) {
      return res.status(400).json({ success: false, message: "Une raison de refus est obligatoire." });
    }

    const doc = await DriverDocument.findByPk(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Document livreur introuvable." });

    // Update document status
    doc.set("status", status);
    doc.set("verifiedAt", new Date());
    doc.set("verifiedBy", req.user?.id || null);
    doc.set("rejectionReason", status === "REJECTED" ? rejectionReason.toString().trim() : null);
    await doc.save();

    // Fetch driver to send notification
    const driver = await User.findByPk(String(doc.get("userId")));
    if (driver) {
      const fcmToken = String(driver.get("fcmToken") || "").trim();
      const docType = String(doc.get("type") || "");
      const docTypeLabels: Record<string, string> = {
        ID_CARD: "Carte d'identité",
        DRIVER_LICENSE: "Permis de conduire",
        ID_PHOTO: "Photo d'identité",
        VEHICLE_IMAGE: "Photo du véhicule",
        VEHICLE_REGISTRATION: "Carte grise",
        VEHICLE_INSURANCE: "Assurance du véhicule",
      };
      const docLabel = docTypeLabels[docType] || docType;

      if (status === "APPROVED") {
        const title = "Document approuvé ✅";
        const body = `Votre document "${docLabel}" a été approuvé par notre équipe.`;
        if (fcmToken) {
          await sendPushNotification(fcmToken, title, body, { type: "document_approved", documentId: String(doc.get("id")), docType }).catch(console.error);
        }
      } else {
        const reason = rejectionReason.toString().trim();
        const title = "Document refusé ❌";
        const body = `Votre document "${docLabel}" a été refusé. Raison : ${reason}`;
        if (fcmToken) {
          await sendPushNotification(fcmToken, title, body, { type: "document_rejected", documentId: String(doc.get("id")), docType, rejectionReason: reason }).catch(console.error);
        }
        // Also send SMS as fallback
        const phone = String(driver.get("phone") || "").trim();
        if (phone) {
          SmsService.sendSms(phone, `PassKey : Votre document "${docLabel}" a ete refuse. Raison : ${reason}. Veuillez le soumettre a nouveau.`).catch(console.error);
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: status === "APPROVED" ? "Document approuvé avec succès." : "Document refusé. Le livreur a été notifié.",
      data: doc,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de traiter la revue du document." });
  }
}

export async function deleteDriverDocument(req: Request, res: Response) {
  try {
    const row = await DriverDocument.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Document livreur introuvable." });
    await row.destroy();
    return res.status(200).json({ success: true, message: "Document livreur supprimé." });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de supprimer le document du livreur." });
  }
}

export async function getMyDriverOnboardingStatus(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.id || req.user.role !== "livreur") {
        return res.status(403).json({ success: false, message: "Seuls les livreurs peuvent accéder à ce point d'entrée." });
    }

    const user = await User.findByPk(req.user.id, {
      attributes: [
        "id",
        "name",
        "email",
        "role",
        "identityVerified",
        "hasSubmittedOnboarding",
        "kycRejectionReason",
        "city",
        "dateOfBirth",
        "accountStatus",
        "isActive",
        "isAvailable",
      ],
    });
    if (!user) {
      return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
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
        rejectionReason: row?.rejectionReason || null,
        updatedAt: row?.updatedAt || null,
      };
    });

    const hasAllDocuments = documents.every((d) => d.status !== "MISSING");
    const allApproved = documents.every((d) => d.status === "APPROVED");
    const kycRejectionReason = user.get("kycRejectionReason");
    const hasRejected = documents.some((d) => d.status === "REJECTED") || Boolean(kycRejectionReason);
    const hasPending = documents.some((d) => d.status === "PENDING");
    const hasSubmittedOnboarding = Boolean(user.get("hasSubmittedOnboarding"));
    const identityVerified = Boolean(user.get("identityVerified"));
    
    // CRITICAL: A courier only has access if they are identityVerified (validated by admin)
    const canAccessCourier = identityVerified;

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
        kycRejectionReason: kycRejectionReason || null,
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
          : (hasPending || hasSubmittedOnboarding)
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
      return res.status(403).json({ success: false, message: "Seuls les livreurs peuvent accéder à ce point d'entrée." });
    }
    const currentUser = await User.findByPk(req.user.id);
    const countryId = await resolveCountryId(String(currentUser?.get("countryId") || ""));

    const rows = await VehicleType.findAll({
      where: { isActive: true, countryId },
      order: [
        ["sortOrder", "ASC"],
        ["name", "ASC"],
      ],
    });

    return res.status(200).json({
      success: true,
      data: rows.map((row) => ({
        id: String(row.get("code") || ""),
        code: String(row.get("code") || ""),
        label: String(row.get("name") || ""),
        name: String(row.get("name") || ""),
        iconKey: String(row.get("iconKey") || "two_wheeler_rounded"),
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de lister les types de vehicule" });
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
    const vehicleImage = files?.vehicleImage?.[0];
    const vehicleRegistration = files?.vehicleRegistration?.[0];
    const vehicleInsurance = files?.vehicleInsurance?.[0];

    if (!idCard || !driverLicense || !idPhoto || !vehicleImage || !vehicleRegistration || !vehicleInsurance) {
      return res.status(400).json({
        success: false,
        message:
          "idCard, driverLicense, idPhoto, vehicleImage, vehicleRegistration and vehicleInsurance files are required",
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

    const currentUser = await User.findByPk(req.user?.id || "");
    if (!(await isAllowedVehicleType(vehicleType, String(currentUser?.get("countryId") || "")))) {
      return res.status(400).json({
        success: false,
        message: "Ce type de vehicule n'est pas disponible.",
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
      { type: "VEHICLE_IMAGE", file: vehicleImage },
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

    const confirmationMessage =
      "Felicitations pour la soumission complete de votre dossier. Nous reviendrons vers vous tres bientot.";
    const phone = String(currentUser?.get("phone") || "").trim();
    if (phone) {
      SmsService.sendSms(phone, confirmationMessage).catch((error) => {
        console.error("Driver onboarding confirmation SMS failed:", error);
      });
    }

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
    return res.status(500).json({ success: false, message: error?.message || "Impossible d'envoyer le dossier." });
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
    const vehicleImage = files?.vehicleImage?.[0];
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
      Boolean(vehicleImage) ||
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
      return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
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

      const currentUser = await User.findByPk(req.user?.id || "");
      if (vehicleType && !(await isAllowedVehicleType(vehicleType, String(currentUser?.get("countryId") || "")))) {
        return res.status(400).json({
          success: false,
          message: "Ce type de vehicule n'est pas disponible.",
        });
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
    if (vehicleImage) uploads.push({ type: "VEHICLE_IMAGE", file: vehicleImage });
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
    return res.status(500).json({ success: false, message: error?.message || "Impossible de mettre à jour le dossier." });
  }
}
