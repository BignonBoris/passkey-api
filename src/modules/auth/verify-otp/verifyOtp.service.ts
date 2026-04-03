import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN } from "@/config/jwt";
import { UserRepository } from "@/repositories/user.repository";
import User from "@/models/user.model";
import { nomalizeCustomerPhone } from "@/utils/phoneNormalize";

export class VerifyOtpService {
  static async verifyOTP(phone: string, role: string, otp: string) {

    const normalizedPhone = await nomalizeCustomerPhone(phone);

    const user = await UserRepository.findByPhoneAndRole(normalizedPhone, role);

    if (!user) {
      return {
        success: false,
        status: 404,
        message: "User not found",
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
        message: "Le code OTP a expiré.",
      };
    }

    // Only activate automatically for non-courier roles. 
    // Couriers are activated manually by admin after validation.
    const updateData: any = { otpCode: null, otpExpiresAt: null };
    if (user.role !== "livreur") {
      updateData.isActive = true;
    }

    await User.update(updateData, { where: { id: user.id } });

    // const updatedUser = await UserRepository.updateUser(user);

    // UserRepository.updateUser likely returns [affectedCount, updatedUser] or similar,
    // so fetch the fresh user record to access id and role after update. 

    if (!user) {
      throw new Error("User not found after update");
    }

    const canAccessCourier = user.identityVerified;

    const token = jwt.sign(
      { id: user.id, role: user.role, canAccessCourier },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );


    return { ...user, token };
  }

}
