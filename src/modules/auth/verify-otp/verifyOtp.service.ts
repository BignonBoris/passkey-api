import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../../../config/jwt";
import { UserRepository } from "../../../repositories/user.repository";
import User from "../../../models/user.model";

export class VerifyOtpService {
  static async verifyOTP(phone: string, otp: string) {

    const user = await UserRepository.findByPhone(phone);

    if(!user) {
      return {
        success: false,
        message: "User not found",
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
        message: "Invalid or expired OTP",
      };
    }

    await User.update(
      { otpCode: null, otpExpiresAt: null },
      { where: { id: user.id } }
    );

    // const updatedUser = await UserRepository.updateUser(user);

    // UserRepository.updateUser likely returns [affectedCount, updatedUser] or similar,
    // so fetch the fresh user record to access id and role after update. 

    if (!user) {
      throw new Error("User not found after update");
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );


    return { ...user, token };
  }
}
