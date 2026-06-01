import bcrypt from "bcrypt";
import User from "../../models/user.model";
import { generateOTP } from "../../utils/otp";
import { UserRepository } from "../../repositories/user.repository";
import jwt from "jsonwebtoken";
import { JWT_EXPIRES_IN, JWT_SECRET, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES_IN } from "../../config/jwt";
import { SmsService } from "../../services/sms/sms.service";
import { nomalizeCustomerPhone } from "../../utils/phoneNormalize";

type AdminSignUpInput = {
  name?: string;
  email: string;
  password: string;
  role: "admin" | "sous-admin" | "restaurant" | "usager" | "livreur";
};

class OtpDeliveryError extends Error {
  constructor(message: string = "Echec de l'envoi du code OTP.") {
    super(message);
    this.name = "OtpDeliveryError";
  }
}

async function saveOtp(phone: string, role: string = "usager") {
  const otp = generateOTP();
  const user = await UserRepository.findByPhoneAndRole(phone, role);
  if (!user) {
    throw new Error("Utilisateur introuvable lors de l'enregistrement du code OTP");
  }

  const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await User.update(
    { otpCode: otp, otpExpiresAt },
    { where: { id: user.id } }
  );

  // Appel automatique au service SMS (Twilio ou FasterMessage selon le .env)
  const smsSent = await SmsService.sendOtp(phone, otp);
  if (!smsSent) {
    throw new OtpDeliveryError(
      "Le code OTP a ete genere, mais son envoi par SMS a echoue."
    );
  }

  return process.env.NODE_ENV === "development" ? otp : undefined;
}

export class AuthFlowService {
  static async checkPhone(phone: string, role: string, countryCode: string = 'BJ') {

    // 1. Validation et Normalisation Google

    const normalizedPhone = await nomalizeCustomerPhone(phone, countryCode);
    if (normalizedPhone === "INVALID_PHONE") {
      return {
        error: "Votre numéro est invalide.",
        nextStep: "INVALID_PHONE"
      };
    }

    // 2. Recherche en base de données avec le numéro PROPRE (normalisé)

    // Modification CRUCIALE : On cherche si le numéro existe DÉJÀ avec ce RÔLE précis
    const existingUserWithRole = await UserRepository.findByPhoneAndRole(normalizedPhone, role);

    // const user = await UserRepository.findByPhone(normalizedPhone);

    const exists = Boolean(existingUserWithRole);
    const foundRole = existingUserWithRole?.role ?? null;
    const matchesProfile = foundRole === role;
    const isSuspended = existingUserWithRole?.accountStatus === "suspended";

    let nextStep = "REGISTER";
    let error = "";
    if (isSuspended) {
      error = "Votre compte a été suspendu";
      nextStep = "SUSPENDED ";
    }
    else if (exists && matchesProfile) {
      nextStep = "LOGIN";
    } else if (exists && !matchesProfile) {
      nextStep = "PROFILE_MISMATCH";
    }

    return {
      error,
      exists,
      normalizedPhone, // On renvoie le numÃ©ro propre pour la suite (OTP/Login)
      matchesProfile,
      isSuspended,
      foundRole,
      requestedRole: role,
      nextStep,
      existingUserWithRole,
    };
  }

  static async signIn(phone: string, role: string, password: string) {
    const normalizedPhone = await nomalizeCustomerPhone(phone);
    if (normalizedPhone === "INVALID_PHONE") {
      return { success: false, status: 400, message: "Numero de telephone invalide." };
    }
    const user = await UserRepository.findByPhoneAndRole(normalizedPhone, role);

    if (!user) {
      return { success: false, status: 404, message: "Utilisateur introuvable" };
    }

    if (user.accountStatus === "suspended") {
      return { success: false, status: 403, message: "Votre compte est bloque. Contactez le support." };
    }

    if (user.role === "admin" || user.role === "sous-admin") {
      return { success: false, status: 403, message: "Utilisez le point d'entrée de connexion administrateur." };
    }

    const isValid = user.password ? await bcrypt.compare(password, user.password) : false;
    if (!isValid) {
      return { success: false, status: 401, message: "Mot de passe invalide" };
    }

    let otp: string | undefined;
    try {
      otp = await saveOtp(normalizedPhone, role);
    } catch (error) {
      if (error instanceof OtpDeliveryError) {
        return { success: false, status: 502, message: error.message };
      }
      throw error;
    }
    return {
      success: true,
      status: 200,
      message: "Code OTP envoyé",
      data: { userId: user.id, otp },
    };
  }

  // services/auth-flow.service.ts
  static async resendOtp(phone: string, role: string) {
    const normalizedPhone = await nomalizeCustomerPhone(phone);
    if (normalizedPhone === "INVALID_PHONE") {
      return { success: false, status: 400, message: "Numero de telephone invalide." };
    }
    // 1. Trouver l'utilisateur par tÃ©lÃ©phone ET rÃ´le
    const user = await UserRepository.findByPhoneAndRole(normalizedPhone, role);

    if (!user) {
      return { success: false, status: 404, message: "Utilisateur introuvable pour ce profil." };
    }

    // 2. GÃ©nÃ©rer un nouvel OTP (6 chiffres)
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60000); // Expire dans 5 minutes

    // 3. Mettre Ã  jour dans la DB (Utilise ton modÃ¨le Sequelize)
    await User.update(
      {
        otpCode: newOtp,
        otpExpiresAt: expiresAt
      },
      { where: { id: user.id } }
    );

    // 4. Envoi du SMS rÃ©el (Simulation ou Provider rÃ©el)
    const smsSent = await SmsService.sendOtp(normalizedPhone, newOtp);
    if (!smsSent) {
      return {
        success: false,
        status: 502,
        message: "Le code OTP a ete regenere, mais son envoi par SMS a echoue.",
      };
    }

    return {
      success: true,
      status: 200,
      message: "Un nouveau code a Ã©tÃ© envoyÃ© par SMS.",
      // ðŸ’¡ CONSEIL SENIOR : En production, ne renvoie JAMAIS l'OTP dans la rÃ©ponse JSON.
      // On le laisse ici pour tes tests Flutter.
      data: { otp: newOtp }
    };
  }

  static async signUp(phone: string, password: string, role: string) {
    if (role !== "usager" && role !== "livreur") {
      return { success: false, status: 400, message: "Le rôle doit être usager ou livreur." };
    }
    const normalizedPhone = await nomalizeCustomerPhone(phone);
    if (normalizedPhone === "INVALID_PHONE") {
      return { success: false, status: 400, message: "Numéro de téléphone invalide." };
    }
    const existingUser = await UserRepository.findByPhoneAndRole(normalizedPhone, role);
    if (existingUser) {
      return { success: false, status: 409, message: `L'utilisateur avec le numÃ©ro ${normalizedPhone} existe dÃ©jÃ  comme ${role}.` };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ phone: normalizedPhone, password: hashedPassword, role });

    let otp: string | undefined;
    try {
      otp = await saveOtp(normalizedPhone, role);
    } catch (error) {
      if (error instanceof OtpDeliveryError) {
        console.warn(
          `[AUTH][SIGNUP_OTP_SMS_FAILED] phone=${normalizedPhone} role=${role}`
        );
        return {
          success: true,
          status: 201,
          message: "Compte créé.",
          data: { userId: user.id, otp: otp ?? "" },
        };
      }
      throw error;
    }
    return {
      success: true,
      status: 201,
      message: "Compte créé. Code OTP envoyé.",
      data: { userId: user.id, otp: otp ?? "" },
    };
  }

  static async forgotPassword(phone: string, role: string, countryCode: string = 'BJ') {
    const normalizedPhone = await nomalizeCustomerPhone(phone, countryCode);
    if (normalizedPhone === "INVALID_PHONE") {
      return { success: false, status: 400, message: "Numero de telephone invalide." };
    }
    const user = await UserRepository.findByPhoneAndRole(normalizedPhone, role);

    if (!user) {
      return { success: false, status: 404, message: "Utilisateur introuvable" };
    }

    if (user.accountStatus === "suspended") {
      return { success: false, status: 403, message: "Votre compte est bloque. Contactez le support." };
    }

    let otp: string | undefined;
    try {
      otp = await saveOtp(normalizedPhone, user.role);
    } catch (error) {
      if (error instanceof OtpDeliveryError) {
        return { success: false, status: 502, message: error.message };
      }
      throw error;
    }
    return {
      success: true,
      status: 200,
      message: "Code OTP envoyé",
      data: { userId: user.id, otp },
    };
  }

  static async validateRecoveryOtp(
    phone: string,
    otp: string,
    role: string = 'usager',
    countryCode: string = 'BJ'
  ) {
    const normalizedPhone = await nomalizeCustomerPhone(phone, countryCode);
    if (normalizedPhone === "INVALID_PHONE") {
      return { success: false, status: 400, message: "Numéro de téléphone invalide." };
    }

    const user = await UserRepository.findByPhoneAndRole(normalizedPhone, role);
    if (!user) {
      return { success: false, status: 404, message: "Utilisateur introuvable" };
    }

    const now = new Date();
    if (
      !user.otpCode ||
      user.otpCode !== otp ||
      !user.otpExpiresAt ||
      user.otpExpiresAt < now
    ) {
      return { success: false, status: 400, message: "Le code OTP est invalide ou expiré." };
    }

    return {
      success: true,
      status: 200,
      message: "Code OTP valide",
    };
  }

  static async recoverPassword(phone: string, otp: string, newPassword: string, role: string, countryCode: string = 'BJ') {
    const normalizedPhone = await nomalizeCustomerPhone(phone, countryCode);
    if (normalizedPhone === "INVALID_PHONE") {
      return { success: false, status: 400, message: "Numéro de téléphone invalide." };
    }

    const user = await UserRepository.findByPhoneAndRole(normalizedPhone, role);
    if (!user) {
      return { success: false, status: 404, message: "Utilisateur introuvable" };
    }

    const now = new Date();
    if (
      !user.otpCode ||
      user.otpCode !== otp ||
      !user.otpExpiresAt ||
      user.otpExpiresAt < now
    ) {
      return { success: false, status: 400, message: "Le code OTP est invalide ou expiré." };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.update(
      { password: hashedPassword, otpCode: null, otpExpiresAt: null },
      { where: { id: user.id } }
    );

    return {
      success: true,
      status: 200,
      message: "Password updated successfully",
    };
  }

  static async adminSignIn(email: string, password: string) {
    const user = await UserRepository.findByEmail(email);
    if (!user) {
      return { success: false, status: 404, message: "Admin not found" };
    }

    if (user.accountStatus === "suspended") {
      return { success: false, status: 403, message: "Votre compte est bloque. Contactez le support." };
    }

    if (user.role !== "admin" && user.role !== "sous-admin" && user.role !== "restaurant") {
      return { success: false, status: 403, message: "Access denied for this account" };
    }

    const isValid = user.password ? await bcrypt.compare(password, user.password) : false;
    if (!isValid) {
      return { success: false, status: 401, message: "Mot de passe invalide" };
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    const refreshToken = jwt.sign({ id: user.id }, JWT_REFRESH_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRES_IN,
    });

    await User.update({ refreshToken }, { where: { id: user.id } });

    return {
      success: true,
      status: 200,
      message: user.role === "restaurant" ? "Restaurant authentication successful" : "Admin authentication successful",
      data: {
        token,
        refreshToken,
        user: {
          id: user.id,
          role: user.role,
          email: user.email,
        },
      },
    };
  }

  static async adminSignUp(input: AdminSignUpInput) {
    const existingEmail = await UserRepository.findByEmail(input.email);
    if (existingEmail) {
      return { success: false, status: 409, message: "Cet email existe dÃ©jÃ ." };
    }

    const hashedPassword = await bcrypt.hash(input.password, 10);
    const user = await User.create({
      name: input.name?.trim() || null,
      email: input.email.trim().toLowerCase(),
      password: hashedPassword,
      role: input.role,
      isActive: true,
      accountStatus: "active",
    });

    return {
      success: true,
      status: 201,
      message: "Compte admin crÃ©Ã© avec succÃ¨s.",
      data: {
        userId: user.id,
      },
    };
  }
}
