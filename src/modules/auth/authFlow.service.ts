import bcrypt from "bcrypt";
import User from "@/models/user.model";
import { generateOTP } from "@/utils/otp";
import { UserRepository } from "@/repositories/user.repository";
import jwt from "jsonwebtoken";
import { JWT_EXPIRES_IN, JWT_SECRET } from "@/config/jwt";
import { SmsService } from "@/services/sms.service";
import { nomalizeCustomerPhone } from "@/utils/phoneNormalize";

type AdminSignUpInput = {
  name?: string;
  phone: string;
  email: string;
  password: string;
  role: "admin" | "sous-admin" | "restaurant" | "usager" | "livreur";
};

async function saveOtp(phone: string, role: string = "usager") {
  console.log({ phone, role });
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
      normalizedPhone, // On renvoie le numéro propre pour la suite (OTP/Login)
      matchesProfile,
      isSuspended,
      foundRole,
      requestedRole: role,
      nextStep,
      existingUserWithRole,
    };
  }
  // static async checkPhone(phone: string, role: string) {
  //   const user = await UserRepository.findByPhone(phone);
  //   const exists = Boolean(user);
  //   const foundRole = user?.role ?? null;
  //   const matchesProfile = foundRole === role;
  //   const isSuspended = user?.accountStatus === "suspended";

  //   let nextStep = "REGISTER";
  //   if (exists && matchesProfile) {
  //     nextStep = "LOGIN";
  //   } else if (exists && !matchesProfile) {
  //     nextStep = "PROFILE_MISMATCH";
  //   }

  //   return {
  //     exists,
  //     matchesProfile,
  //     isSuspended,
  //     foundRole,
  //     requestedRole: role,
  //     nextStep,
  //   };
  // }

  static async signIn(phone: string, role: string, password: string) {
    const normalizedPhone = await nomalizeCustomerPhone(phone);
    const user = await UserRepository.findByPhoneAndRole(normalizedPhone, role);

    if (!user) {
      return { success: false, status: 404, message: "User not found" };
    }

    if (user.accountStatus === "suspended") {
      return { success: false, status: 403, message: "Votre compte est bloque. Contactez le support." };
    }

    if (user.role === "admin" || user.role === "sous-admin") {
      return { success: false, status: 403, message: "Use admin sign-in endpoint" };
    }

    const isValid = user.password ? await bcrypt.compare(password, user.password) : false;
    if (!isValid) {
      return { success: false, status: 401, message: "Invalid password" };
    }

    const otp = await saveOtp(normalizedPhone, role);
    return {
      success: true,
      status: 200,
      message: "OTP sent",
      data: { userId: user.id, otp },
    };
  }

  // services/auth-flow.service.ts
  static async resendOtp(phone: string, role: string) {
    const normalizedPhone = await nomalizeCustomerPhone(phone);
    // 1. Trouver l'utilisateur par téléphone ET rôle
    const user = await UserRepository.findByPhoneAndRole(normalizedPhone, role);

    if (!user) {
      return { success: false, status: 404, message: "Utilisateur introuvable pour ce profil." };
    }

    // 2. Générer un nouvel OTP (6 chiffres)
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60000); // Expire dans 5 minutes

    // 3. Mettre à jour dans la DB (Utilise ton modèle Sequelize)
    await User.update(
      {
        otpCode: newOtp,
        otpExpiresAt: expiresAt
      },
      { where: { id: user.id } }
    );

    // 4. Envoi du SMS réel (Simulation ou Provider réel)
    await SmsService.sendOtp(phone, newOtp);

    return {
      success: true,
      status: 200,
      message: "Un nouveau code a été envoyé par SMS.",
      // 💡 CONSEIL SENIOR : En production, ne renvoie JAMAIS l'OTP dans la réponse JSON.
      // On le laisse ici pour tes tests Flutter.
      data: { otp: newOtp }
    };
  }

  static async signUp(phone: string, password: string, role: string) {
    if (role !== "usager" && role !== "livreur") {
      return { success: false, status: 400, message: "Role must be usager or livreur" };
    }
    const normalizedPhone = await nomalizeCustomerPhone(phone);
    if (normalizedPhone === "INVALID_PHONE") {
      return { success: false, status: 400, message: "Invalid phone number" };
    }
    const existingUser = await UserRepository.findByPhoneAndRole(normalizedPhone, role);
    if (existingUser) {
      return { success: false, status: 409, message: "Le téléphone existe déjà" };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ phone: normalizedPhone, password: hashedPassword, role });

    const otp = await saveOtp(normalizedPhone, role);
    return {
      success: true,
      status: 201,
      message: "Account created. OTP sent",
      data: { userId: user.id, otp },
    };
  }

  static async forgotPassword(phone: string) {
    const user = await UserRepository.findByPhone(phone);
    if (!user) {
      return { success: false, status: 404, message: "User not found" };
    }

    if (user.accountStatus === "suspended") {
      return { success: false, status: 403, message: "Votre compte est bloque. Contactez le support." };
    }

    const otp = await saveOtp(phone, user.role);
    return {
      success: true,
      status: 200,
      message: "OTP sent",
      data: { userId: user.id, otp },
    };
  }

  static async recoverPassword(phone: string, otp: string, newPassword: string) {
    const user = await UserRepository.findByPhone(phone);
    if (!user) {
      return { success: false, status: 404, message: "User not found" };
    }

    const now = new Date();
    if (
      !user.otpCode ||
      user.otpCode !== otp ||
      !user.otpExpiresAt ||
      user.otpExpiresAt < now
    ) {
      return { success: false, status: 400, message: "Invalid or expired OTP" };
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
      return { success: false, status: 401, message: "Invalid password" };
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    return {
      success: true,
      status: 200,
      message: user.role === "restaurant" ? "Restaurant authentication successful" : "Admin authentication successful",
      data: {
        token,
        user: {
          id: user.id,
          role: user.role,
          email: user.email,
        },
      },
    };
  }

  static async adminSignUp(input: AdminSignUpInput) {
    const existingPhone = await UserRepository.findByPhone(input.phone);
    if (existingPhone) {
      return { success: false, status: 409, message: "Ce numéro de téléphone existe déjà." };
    }

    const existingEmail = await UserRepository.findByEmail(input.email);
    if (existingEmail) {
      return { success: false, status: 409, message: "Cet email existe déjà." };
    }

    const hashedPassword = await bcrypt.hash(input.password, 10);
    const user = await User.create({
      name: input.name?.trim() || null,
      phone: input.phone,
      email: input.email.trim().toLowerCase(),
      password: hashedPassword,
      role: input.role,
      isActive: true,
      accountStatus: "active",
    });

    return {
      success: true,
      status: 201,
      message: "Compte admin créé avec succès.",
      data: {
        userId: user.id,
      },
    };
  }
}
