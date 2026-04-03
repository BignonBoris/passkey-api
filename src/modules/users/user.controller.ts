import { Request, Response } from "express";
import { UserService } from "./user.service";
import { UserRepository } from "./user.repository";
import User from "../../models/user.model";
import { Op } from "sequelize";
import bcrypt from "bcrypt";
import { AuthenticatedRequest } from "../../types/auth-request";
import { StatusHistoryRepository } from "../../repositories/status-history.repository";
import { sendPushNotification } from "../../services/notification.service";
import { emitUserLocationUpdated } from "../../realtime/location.events";
import { resolveCountryFromCoordinates } from "../../services/country.service";
import Country from "../../models/country.model";

function toSafeUser(user: any) {
  if (!user) return user;
  const clone = typeof user.toJSON === "function" ? user.toJSON() : { ...user };
  delete clone.password;
  return clone;
}

export async function getProfile(
  req: Request & { user?: { id?: string } },
  res: Response
) {
  const userId = req.user?.id;

  res.json({
    success: true,
    message: "Profile loaded",
    data: userId,
  });
}

function buildPublicUploadUrl(
  req: Request,
  folder: string,
  storedName?: string | null
) {
  if (!storedName) return null;
  const protocol = req.protocol || "http";
  const host = req.get("host");
  if (!host) return null;
  return `${protocol}://${host}/uploads/${folder}/${storedName}`;
}

export const getMyProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await User.findByPk(userId, {
      attributes: { exclude: ["password"] },
    });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Profile loaded",
      data: user,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Unknown server error",
    });
  }
};

export const updateMyProfile = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const { name, email, phone, password } = (req.body || {}) as Record<
      string,
      string | undefined
    >;
    const file = (req as any).file as { filename?: string } | undefined;

    if (typeof name === "string") user.set("name", name.trim());

    if (typeof email === "string") {
      const normalizedEmail = email.trim().toLowerCase();
      if (normalizedEmail) {
        const existingEmail = await User.findOne({
          where: {
            email: normalizedEmail,
            id: { [Op.ne]: userId },
          },
        });
        if (existingEmail) {
          return res
            .status(409)
            .json({ success: false, message: "Cet email est déjà utilisé." });
        }
      }
      user.set("email", normalizedEmail || null);
    }

    if (typeof phone === "string") {
      const normalizedPhone = phone.trim();
      if (normalizedPhone) {
        const existingPhone = await User.findOne({
          where: {
            phone: normalizedPhone,
            id: { [Op.ne]: userId },
          },
        });
        if (existingPhone) {
          return res
            .status(409)
            .json({ success: false, message: "Ce numéro est déjà utilisé." });
        }
      }
      user.set("phone", normalizedPhone);
    }

    if (typeof password === "string" && password.trim().length > 0) {
      const nextPassword = password.trim();
      if (nextPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "Le mot de passe doit contenir au moins 6 caractères.",
        });
      }
      const hashedPassword = await bcrypt.hash(nextPassword, 10);
      user.set("password", hashedPassword);
    }

    if (file?.filename) {
      const avatarUrl = buildPublicUploadUrl(req, "user-profiles", file.filename);
      if (avatarUrl) user.set("avatarUrl", avatarUrl);
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated",
      data: toSafeUser(user),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Unknown server error",
    });
  }
};

export const updateToken = async (
  req: Request & { user?: { id?: string } },
  res: Response
) => {
  try {
    const userId = req.user?.id; // Récupéré via ton middleware JWT
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({ message: "Token manquant" });
    }

    if (!userId) {
      return res.status(401).json({ message: "Utilisateur non authentifié" });
    }

    await UserRepository.updateFcmToken(userId, fcmToken);

    res.status(200).json({ message: "FCM Token mis à jour avec succès" });
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur", error });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId =
      String(req.params.id || "").trim() ||
      String((req as any).user?.id || "").trim();
    if (!userId) {
      return res.status(400).json({ message: "Identifiant utilisateur requis" });
    }
    const dataToUpdate = req.body;

    if (dataToUpdate.email) {
      const normalizedEmail = String(dataToUpdate.email).trim().toLowerCase();
      if (normalizedEmail) {
        const existingEmail = await User.findOne({
          where: {
            email: normalizedEmail,
            id: { [Op.ne]: userId },
          },
        });
        if (existingEmail) {
          return res.status(409).json({
            success: false,
            message: "Cet email est déjà utilisé.",
          });
        }
        dataToUpdate.email = normalizedEmail;
      }
    }

    const updatedUser = await UserRepository.updateUser({
      id: userId,
      ...dataToUpdate,
    });

    if (updatedUser) {
      const io = (req as any).io;
      if (io && updatedUser.role === "livreur") {
        io.to("drivers").emit("driver:profile_updated", toSafeUser(updatedUser));
      }
    }

    if (!updatedUser) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    return res.status(200).json({
      success: true,
      message: "Mise à jour réussie",
      user: updatedUser,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Unknown server error",
    });
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const {
      role,
      isActive,
      isAvailable,
      name,
      accountStatus,
      identityVerified,
      countryId,
      search,
      dateFrom,
      dateTo,
    } = req.query as Record<string, string | undefined>;

    // Construction dynamique de la clause WHERE
    const whereClause: any = {};

    if (role) whereClause.role = role;

    // Pour les booleens, on vérifie la chaîne de caractères car req.query reçoit du texte
    if (isActive) whereClause.isActive = isActive === "true";
    if (isAvailable) whereClause.isAvailable = isAvailable === "true";
    if (accountStatus) whereClause.accountStatus = accountStatus;
    if (identityVerified)
      whereClause.identityVerified = identityVerified === "true";
    if (countryId) whereClause.countryId = countryId;

    // Filtre de recherche par nom/téléphone/email
    if (search || name) {
      const q = (search || name || "").trim();
      if (q) {
        whereClause[Op.or] = [
          { name: { [Op.like]: `%${q}%` } },
          { phone: { [Op.like]: `%${q}%` } },
          { email: { [Op.like]: `%${q}%` } },
        ];
      }
    }

    if (dateFrom || dateTo) {
      whereClause.createdAt = {};
      if (dateFrom) whereClause.createdAt[Op.gte] = new Date(dateFrom);
      if (dateTo) whereClause.createdAt[Op.lte] = new Date(dateTo);
    }

    const users = await User.findAll({
      where: whereClause,
      include: [
        { model: Country, as: 'country', attributes: ['id', 'name'] }
      ],
      attributes: { exclude: ['password'] }, // Sécurité : on n'envoie jamais le mot de passe
      order: [['createdAt', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateUserAccountStatus = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.params.id;
    const accountStatus = req.body?.accountStatus;
    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : undefined;

    if (accountStatus !== "active" && accountStatus !== "suspended") {
      return res.status(400).json({
        success: false,
        message: "accountStatus must be either 'active' or 'suspended'",
      });
    }

    const user = await UserRepository.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.getDataValue("accountStatus") === accountStatus) {
      return res.status(200).json({
        success: true,
        message: "User status unchanged",
        data: {
          ...user.toJSON(),
          password: undefined,
        },
      });
    }

    const updatedUser = await UserRepository.updateAccountStatus({
      userId,
      accountStatus,
      reason,
      actorId: req.user?.id,
    });

    const safeUser = toSafeUser(updatedUser);
    const io = (req as any).io as any;

    if (safeUser.role === "livreur") {
      const io = (req as any).io;
      if (io) {
        io.to("drivers").emit("driver:status_updated", {
          id: userId,
          accountStatus: safeUser.accountStatus,
        });
      }
    }

    await StatusHistoryRepository.createEntry({
      userId,
      actorId: req.user?.id,
      action: "ACCOUNT_STATUS_CHANGE",
      before: toSafeUser(user),
      after: safeUser,
    });

    return res.status(200).json({
      success: true,
      message: "User status updated successfully",
      data: safeUser,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Unknown server error",
    });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const user = await User.findByPk(userId, {
      attributes: { exclude: ["password"] },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, data: user });
  } catch (error: any) {
    return res
      .status(500)
      .json({ success: false, message: error?.message || "Unknown server error" });
  }
};

export const getUserHistory = async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const history = await StatusHistoryRepository.listByUserId(userId);
    return res.status(200).json({ success: true, data: history });
  } catch (error: any) {
    return res
      .status(500)
      .json({ success: false, message: error?.message || "Unknown server error" });
  }
};

export const updateIdentityVerified = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.params.id;
    const identityVerified = req.body?.identityVerified;

    if (typeof identityVerified !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "identityVerified must be boolean",
      });
    }

    const user = await UserRepository.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const targetRole = String(user.getDataValue("role") || "");

    const updatedUser = await UserRepository.updateIdentityVerified({
      userId,
      identityVerified,
    });

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User update failed",
      });
    }

    const safeUser = toSafeUser(updatedUser);
    const io = (req as any).io as any;

    await StatusHistoryRepository.createEntry({
      userId,
      actorId: req.user?.id,
      action: "IDENTITY_VERIFIED_CHANGE",
      before: toSafeUser(user),
      after: safeUser,
    });

    // Notifier le livreur en temps réel quand son dossier est validé
    if (targetRole === "livreur" && io) {
      io.to("drivers").emit("driver:profile_updated", safeUser);
      io.to("drivers").emit("driver:verification_updated", {
        id: userId,
        identityVerified,
      });
      io.to("drivers").emit("driver:availability_updated", {
        id: userId,
        isAvailable: Boolean((safeUser as any)?.isAvailable),
      });
      io.to(`user_${userId}`).emit("driver:availability_updated", {
        id: userId,
        isAvailable: Boolean((safeUser as any)?.isAvailable),
      });
    }

    if (identityVerified === true && targetRole === "livreur") {
      const payload = {
        type: "DRIVER_VERIFICATION_APPROVED",
        title: "Verification terminee",
        message:
          "Votre verification a ete effectuee. Votre dossier est complet et vous etes eligible pour exercer l'activite.",
        userId,
        createdAt: new Date().toISOString(),
      };

      if (io) {
        io.to(`user_${userId}`).emit("driver:verification_completed", payload);
      }

      const targetUser = await User.findByPk(userId, {
        attributes: ["fcmToken"],
        raw: true,
      });
      const token = String((targetUser as any)?.fcmToken || "").trim();
      if (token && token !== "undefined" && token !== "null") {
        await sendPushNotification(
          token,
          "Verification du dossier",
          "Votre dossier est complet. Vous etes eligible pour l'activite livreur.",
          {
            type: "DRIVER_VERIFICATION_APPROVED",
            route: "/delivery",
            userId,
            title: "Verification du dossier",
            message:
              "Votre dossier est complet. Vous etes eligible pour l'activite livreur.",
            createdAt: new Date().toISOString(),
          },
          {
            room: `user_${userId}`,
            event: "driver:verification_completed",
            payload: {
              type: "DRIVER_VERIFICATION_APPROVED",
              title: "Verification du dossier",
              message:
                "Votre dossier est complet. Vous etes eligible pour l'activite livreur.",
              userId,
            },
          }
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Identity verification updated",
      data: safeUser,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Unknown server error",
    });
  }
};

export const updateUserLocation = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.params.id;
    const { latitude, longitude } = req.body || {};

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: "latitude and longitude are required",
      });
    }

    const user = await UserRepository.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const countryResolution = await resolveCountryFromCoordinates(
      Number(latitude),
      Number(longitude)
    );
    const updatedUser = await UserRepository.updateUser({
      id: userId,
      latitude: Number(latitude),
      longitude: Number(longitude),
      locationUpdatedAt: new Date(),
      countryId: String(countryResolution.country.get("id") || ""),
    } as any);

    // Emission Socket pour le temps réel
    const io = (req as any).io;
    if (io && updatedUser) {
      emitUserLocationUpdated(io, {
        userId,
        role: String((updatedUser as any).role || "usager"),
        latitude: Number(latitude),
        longitude: Number(longitude),
        locationUpdatedAt: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      success: true,
      message: "Location updated",
      data: updatedUser,
      country: countryResolution.country,
      matchedByGps: countryResolution.matchedByGps,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Unknown server error",
    });
  }
};

export const updateMyAvailability = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { isAvailable } = req.body || {};
    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isAvailable must be boolean",
      });
    }

    const user = await UserRepository.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (String(user.getDataValue("role") || "") !== "livreur") {
      return res.status(403).json({
        success: false,
        message: "Only drivers can update availability",
      });
    }

    if (
      !user.getDataValue("isActive") ||
      !user.getDataValue("identityVerified")
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Votre compte doit être activé par un administrateur pour passer en ligne.",
      });
    }

    const updatedUser = await UserRepository.updateUser({
      id: userId,
      isAvailable,
    } as any);

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const safeUser = toSafeUser(updatedUser);
    const io = (req as any).io;
    if (io && safeUser.role === "livreur") {
      io.to("drivers").emit("driver:profile_updated", safeUser);
      io.to("drivers").emit("driver:availability_updated", {
        id: userId,
        isAvailable,
      });
      io.to(`user_${userId}`).emit("driver:availability_updated", {
        id: userId,
        isAvailable,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Availability updated",
      data: safeUser,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Unknown server error",
    });
  }
};

export const deleteUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.params.id;
    const actorId = req.user?.id;
    const actorRole = req.user?.role;

    const targetUser = await User.findByPk(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur introuvable.",
      });
    }

    if (actorId && actorId === userId) {
      return res.status(400).json({
        success: false,
        message: "Vous ne pouvez pas supprimer votre propre compte.",
      });
    }

    const targetRole = targetUser.getDataValue("role");
    if (
      (targetRole === "admin" || targetRole === "sous-admin") &&
      actorRole !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Seul un admin peut supprimer un compte admin.",
      });
    }

    if (targetRole === "admin") {
      const adminCount = await User.count({ where: { role: "admin" } });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: "Impossible de supprimer le dernier admin.",
        });
      }
    }

    await UserRepository.deleteById(userId);

    return res.status(200).json({
      success: true,
      message: "Utilisateur supprimé avec succès.",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Erreur serveur inconnue",
    });
  }
};
