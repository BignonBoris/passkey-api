import jwt from "jsonwebtoken";
import {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRES_IN,
} from "../../../config/jwt";
import { UserRepository } from "../../../repositories/user.repository";
import User from "../../../models/user.model";
import { nomalizeCustomerPhone } from "../../../utils/phoneNormalize";

export class VerifyOtpService {
  static async verifyOTP(phone: string, role: string, otp: string) {
    const normalizedPhone = await nomalizeCustomerPhone(phone);
    console.log(normalizedPhone, role, otp);

    const user = await UserRepository.findByPhoneAndRole(normalizedPhone, role);
    console.log(user);

    if (!user) {
      return {
        success: false,
        status: 404,
        message: "Utilisateur introuvable",
      };
    }

    if (user.accountStatus === "suspended") {
      return {
        success: false,
        status: 403,
        message: "Votre compte est bloque. Contactez le support.",
      };
    }

    const now = new Date();
    if (
      !user.otpCode ||
      user.otpCode !== otp ||
      !user.otpExpiresAt ||
      user.otpExpiresAt < now
    ) {
      return {
        success: false,
        status: 400,
        message: "Le code OTP a expire.",
      };
    }

    const canAccessCourier = user.identityVerified;
    const token = jwt.sign(
      { id: user.id, role: user.role, canAccessCourier },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      JWT_REFRESH_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES_IN },
    );

    const updateData: Record<string, unknown> = {
      otpCode: null,
      otpExpiresAt: null,
      refreshToken,
    };
    if (user.role !== "livreur") {
      updateData.isActive = true;
    }

    await User.update(updateData, { where: { id: user.id } });

    const userPayload: Record<string, unknown> =
      user instanceof User
        ? (user.get({ plain: true }) as Record<string, unknown>)
        : (user as unknown as Record<string, unknown>);

    return { ...userPayload, token, refreshToken };
  }
}
