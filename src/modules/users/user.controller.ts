import { Request, Response } from "express";
import { UserService } from "./user.service";
import { UserRepository } from "./user.repository";
import User from "../../models/user.model";
import { Op } from "sequelize";
import bcrypt from "bcrypt";
import { AuthenticatedRequest } from "../../types/auth-request";
import { StatusHistoryRepository } from "../../repositories/status-history.repository";
import { sendPushNotification, sendSmsNotification } from "../../services/notification.service";
import {
  emitUserLocationUpdated,
} from "../../realtime/location.events";
import { resolveCountryFromCoordinates } from "../../services/country.service";
import Country from "../../models/country.model";
import DriverAccount from "../../models/driver-account.model";
import { getOrCreateUserWalletAccount } from "../wallet/wallet.service";
import { generateOTP } from "../../utils/otp";
import { SmsService } from "../../services/sms/sms.service";
import Order from "../../models/order.model";

const DRIVER_ACTIVE_DELIVERY_STATUSES = [
  "ASSIGNED",
  "ACCEPTED",
  "DRIVER_ASSIGNED",
  "DRIVER_ARRIVED_PICKUP",
  "DRIVER_LEFT_PICKUP",
  "PICKED_UP",
  "IN_PROGRESS",
  "ONGOING",
  "ON_GOING",
  "IN_TRANSIT",
] as const;
const DRIVER_ACTIVE_DELIVERY_STATUS_SET = new Set(DRIVER_ACTIVE_DELIVERY_STATUSES);

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

function normalizeDeliveryStatus(status: unknown): string {
  return String(status ?? "").trim().toUpperCase();
}

async function attachDriverDeliveryState(users: any[]) {
  const driverIds = users
    .filter((user) => String(user?.role || "").trim() === "livreur")
    .map((user) => String(user?.id || "").trim())
    .filter(Boolean);

  if (driverIds.length === 0) {
    return users;
  }

  const activeOrders = await Order.findAll({
    where: {
      driverId: { [Op.in]: driverIds },
      status: { [Op.in]: Array.from(DRIVER_ACTIVE_DELIVERY_STATUS_SET) },
    },
    attributes: ["id", "driverId", "status", "updatedAt"],
    raw: true,
    order: [["updatedAt", "DESC"]],
  });

  const activeByDriver = new Map<string, { orderId: string; status: string }>();
  activeOrders.forEach((order) => {
    const rawOrder = order as unknown as Record<string, unknown>;
    const driverId = String(rawOrder.driverId || "").trim();
    if (!driverId || activeByDriver.has(driverId)) return;
    activeByDriver.set(driverId, {
      orderId: String(rawOrder.id || "").trim(),
      status: normalizeDeliveryStatus(rawOrder.status),
    });
  });

  return users.map((user) => {
    if (String(user?.role || "").trim() !== "livreur") {
      return user;
    }

    const activeDelivery = activeByDriver.get(String(user?.id || "").trim()) || null;
    return {
      ...user,
      activeDeliveryOrderId: activeDelivery?.orderId ?? null,
      activeDeliveryStatus: activeDelivery?.status ?? null,
    };
  });
}

export const getMyProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    const user = await User.findByPk(userId, {
      attributes: { exclude: ["password"] },
    });
    if (!user) {
      return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
    }

    const userRole = String(user.get("role") || "").trim().toLowerCase();
    const wallet =
      userRole === "usager"
        ? await getOrCreateUserWalletAccount(userId)
        : null;

    const safeUser = toSafeUser(user);

    return res.status(200).json({
      success: true,
      message: "Profile loaded",
      data: {
        ...safeUser,
        wallet,
        walletBalance: wallet?.balance ?? null,
        walletCurrency: wallet?.currency ?? null,
        walletUpdatedAt: wallet?.updatedAt ?? null,
        walletIsNegative: wallet?.isNegative ?? null,
        walletAvailableBalance: wallet?.availableBalance ?? null,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Erreur serveur inconnue",
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
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
    }
    const currentRole = String(user.get("role") || "").trim();

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
            role: currentRole,
          },
        });
        if (existingEmail) {
          return res
            .status(409)
            .json({ success: false, message: "Cet email est dÃ©jÃ  utilisÃ©." });
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
            role: currentRole,
          },
        });
        if (existingPhone) {
          return res
            .status(409)
            .json({ success: false, message: "Ce numÃ©ro est dÃ©jÃ  utilisÃ©." });
        }
      }
      user.set("phone", normalizedPhone);
    }

    if (typeof password === "string" && password.trim().length > 0) {
      const nextPassword = password.trim();
      if (nextPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "Le mot de passe doit contenir au moins 6 caractÃ¨res.",
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
      message: error?.message || "Erreur serveur inconnue",
    });
  }
};

export const updateToken = async (
  req: Request & { user?: { id?: string } },
  res: Response
) => {
  try {
    const userId = req.user?.id; // RÃ©cupÃ©rÃ© via ton middleware JWT
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({ message: "Token manquant" });
    }

    if (!userId) {
      return res.status(401).json({ message: "Utilisateur non authentifiÃ©" });
    }

    await UserRepository.updateFcmToken(userId, fcmToken);

    res.status(200).json({ message: "FCM Token mis Ã  jour avec succÃ¨s" });
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
    const existingUser = await User.findByPk(userId);
    if (!existingUser) {
      return res.status(404).json({ message: "Utilisateur non trouvÃƒÂ©" });
    }
    const currentRole = String(existingUser.get("role") || "").trim();

    if (dataToUpdate.email) {
      const normalizedEmail = String(dataToUpdate.email).trim().toLowerCase();
      if (normalizedEmail) {
        const existingEmail = await User.findOne({
          where: {
            email: normalizedEmail,
            id: { [Op.ne]: userId },
            role: currentRole,
          },
        });
        if (existingEmail) {
          return res.status(409).json({
            success: false,
            message: "Cet email est dÃ©jÃ  utilisÃ©.",
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
      return res.status(404).json({ message: "Utilisateur non trouvÃ©" });
    }

    return res.status(200).json({
      success: true,
      message: "Mise Ã  jour rÃ©ussie",
      user: updatedUser,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Erreur serveur inconnue",
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

    // Pour les booleens, on vÃ©rifie la chaÃ®ne de caractÃ¨res car req.query reÃ§oit du texte
    if (isActive) whereClause.isActive = isActive === "true";
    if (isAvailable) whereClause.isAvailable = isAvailable === "true";
    if (accountStatus) whereClause.accountStatus = accountStatus;
    if (identityVerified)
      whereClause.identityVerified = identityVerified === "true";
    if (countryId) whereClause.countryId = countryId;

    // Filtre de recherche par nom/tÃ©lÃ©phone/email
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
        { model: Country, as: 'country', attributes: ['id', 'name'] },
        { model: DriverAccount, as: 'account', attributes: ['balance'] }
      ],
      attributes: { exclude: ['password'] }, // SÃ©curitÃ© : on n'envoie jamais le mot de passe
      order: [['createdAt', 'DESC']]
    });

    const safeUsers = users.map((user) => toSafeUser(user));
    const enrichedUsers = await attachDriverDeliveryState(safeUsers);

    return res.status(200).json({
      success: true,
      count: enrichedUsers.length,
      data: enrichedUsers,
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
        message: "Utilisateur introuvable",
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

    const userPhone = String(user.getDataValue("phone") || "").trim();
    if (accountStatus === "suspended" && userPhone) {
      const suspensionMessage = reason
        ? `Votre compte PassKey a ete suspendu. Motif: ${reason}. Contactez le support pour plus d'informations.`
        : "Votre compte PassKey a ete suspendu. Contactez le support pour plus d'informations.";
      sendSmsNotification(userPhone, suspensionMessage).catch((error) => {
        console.error("User suspension SMS failed:", error);
      });
    }

    return res.status(200).json({
      success: true,
      message: "User status updated successfully",
      data: safeUser,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Erreur serveur inconnue",
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
      return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
    }

    return res.status(200).json({ success: true, data: user });
  } catch (error: any) {
    return res
      .status(500)
      .json({ success: false, message: error?.message || "Erreur serveur inconnue" });
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
      .json({ success: false, message: error?.message || "Erreur serveur inconnue" });
  }
};

export const updateIdentityVerified = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.params.id;
    const identityVerified = req.body?.identityVerified;
    const rejectionReason = req.body?.rejectionReason;

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
        message: "Utilisateur introuvable",
      });
    }

    const targetRole = String(user.getDataValue("role") || "");

    const updatedUser = await UserRepository.updateIdentityVerified({
      userId,
      identityVerified,
      rejectionReason,
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

    // Notifier le livreur en temps réel quand son dossier est validé ou rejeté
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

    // Cas de validation réussie
    if (identityVerified === true && targetRole === "livreur") {
      const verificationMessage =
        "Votre verification a ete effectuee. Votre dossier est complet et vous etes eligible pour exercer l'activite.";
      const payload = {
        type: "DRIVER_VERIFICATION_APPROVED",
        title: "Verification terminee",
        message: verificationMessage,
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
            payload,
          }
        );
      }

      const targetPhone = String(user.getDataValue("phone") || "").trim();
      if (targetPhone) {
        sendSmsNotification(targetPhone, verificationMessage).catch((error) => {
          console.error("Driver verification SMS failed:", error);
        });
      }
    }

    // Cas de rejet (rejet global du dossier)
    if (identityVerified === false && rejectionReason && targetRole === "livreur") {
      const rejectionMessage = `Votre dossier a été refusé. Motif : ${rejectionReason}. Veuillez corriger vos informations.`;
      const payload = {
        type: "DRIVER_VERIFICATION_REJECTED",
        title: "Dossier refusé",
        message: rejectionMessage,
        rejectionReason,
        userId,
        createdAt: new Date().toISOString(),
      };

      if (io) {
        io.to(`user_${userId}`).emit("driver:verification_rejected", payload);
      }

      const targetUser = await User.findByPk(userId, {
        attributes: ["fcmToken"],
        raw: true,
      });
      const token = String((targetUser as any)?.fcmToken || "").trim();
      if (token && token !== "undefined" && token !== "null") {
        await sendPushNotification(
          token,
          "Dossier refusé",
          rejectionMessage,
          {
            type: "DRIVER_VERIFICATION_REJECTED",
            route: "/onboarding",
            userId,
            title: "Dossier refusé",
            message: rejectionMessage,
            rejectionReason,
            createdAt: new Date().toISOString(),
          },
          {
            room: `user_${userId}`,
            event: "driver:verification_rejected",
            payload,
          }
        );
      }

      const targetPhone = String(user.getDataValue("phone") || "").trim();
      if (targetPhone) {
        sendSmsNotification(targetPhone, rejectionMessage).catch((error) => {
          console.error("Driver rejection SMS failed:", error);
        });
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
      message: error?.message || "Erreur serveur inconnue",
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

    // Security check: only allow self-update or admin-update
    if (req.user?.role !== "admin" && req.user?.id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Vous ne pouvez mettre à jour que votre propre position.",
      });
    }

    const user = await UserRepository.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur introuvable",
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

    // Emission Socket pour le temps rÃ©el
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
      message: error?.message || "Erreur serveur inconnue",
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
        message: "Non authentifie",
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
        message: "Utilisateur introuvable",
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
          "Votre compte doit Ãªtre activÃ© par un administrateur pour passer en ligne.",
      });
    }

    if (isAvailable) {
      const activeDelivery = await Order.findOne({
        where: {
          driverId: userId,
          status: {
            [Op.in]: DRIVER_ACTIVE_DELIVERY_STATUSES,
          },
        },
      });

      if (activeDelivery) {
        return res.status(409).json({
          success: false,
          message:
            "Vous avez une livraison en cours. Terminez-la avant de vous remettre disponible.",
        });
      }
    }

    const updatedUser = await UserRepository.updateUser({
      id: userId,
      isAvailable,
    } as any);

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur introuvable",
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
      message: error?.message || "Erreur serveur inconnue",
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
      message: "Utilisateur supprimÃ© avec succÃ¨s.",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Erreur serveur inconnue",
    });
  }
};

export const generateEmergencyUserOtp = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = String(req.params.id || "").trim();
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Identifiant utilisateur requis",
      });
    }

    const user = await User.findByPk(userId, {
      attributes: { exclude: ["password"] },
    });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur introuvable",
      });
    }

    const role = String(user.get("role") || "").trim();
    if (!["usager", "livreur"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "L'OTP d'urgence n'est disponible que pour les usagers et les livreurs.",
      });
    }

    const phone = String(user.get("phone") || "").trim();
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Aucun numero de telephone n'est enregistre pour cet utilisateur.",
      });
    }

    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await user.update({ otpCode: otp, otpExpiresAt });

    const smsSent = await SmsService.sendOtp(phone, otp);

    return res.status(200).json({
      success: true,
      message: smsSent
        ? "OTP d'urgence genere et envoye par SMS."
        : "OTP d'urgence genere, mais l'envoi SMS a echoue.",
      data: {
        otp,
        otpExpiresAt,
        smsSent,
        userId,
        role,
        phone,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Impossible de generer l'OTP d'urgence.",
    });
  }
};
