import "dotenv/config";
import { generateOTP } from "../../../utils/otp";
import { UserService } from "../../users/user.service";
import bcrypt from "bcrypt";
import { UserRepository } from "../../../repositories/user.repository";
import User from '../../../models/user.model';
import { nomalizeCustomerPhone } from "../../../utils/phoneNormalize";
import { SmsService } from "../../../services/sms/sms.service";

export class LoginService {
  static async login(phone: string, password: string, role: string) {
    const normalizedPhone = await nomalizeCustomerPhone(phone);
    let user = await UserRepository.findByPhoneAndRole(normalizedPhone, role);
    if (user) {
      if (user.accountStatus === "suspended") {
        return { success: false, status: 403, message: "Votre compte est bloque. Contactez le support." };
      }
      if (user.password) {
        const isValid = await bcrypt.compare(password, user.password!);
        if (!isValid) {
          return { success: false, message: "Mot de passe invalide" };
        }
      }
    } else {
      return { success: false, status: 404, message: "Compte inexistant. Veuillez vous inscrire." };
    }

    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await User.update(
      { otpCode: otp, otpExpiresAt },
      { where: { id: user.id } }
    );

    // Envoi du SMS via le service centralisé
    await SmsService.sendOtp(phone, otp);

    return {
      userId: user.id,
      otp: process.env.NODE_ENV === "development" ? otp : undefined
    }
  }

  static async sendOTP(phone: string, password: string) {
    const user = await UserService.getOrCreateUser(phone);
    if (user.accountStatus === "suspended") {
      return {
        success: false,
        status: 403,
        message: "Votre compte est bloque. Contactez le support.",
      };
    }

    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await User.update(
      { otpCode: otp, otpExpiresAt },
      { where: { id: user.id } }
    );

    // Envoi du SMS via le service centralisé
    await SmsService.sendOtp(phone, otp);

    return {
      userId: user.id,
      otp: process.env.NODE_ENV === "development" ? otp : undefined,
    };
  }
}
