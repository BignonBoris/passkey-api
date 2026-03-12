import bcrypt from "bcrypt";
import User from "../../models/user.model";
import { generateOTP } from "../../utils/otp";
import { UserRepository } from "../../repositories/user.repository";
import jwt from "jsonwebtoken";
import { JWT_EXPIRES_IN, JWT_SECRET } from "../../config/jwt";

type AdminSignUpInput = {
  name?: string;
  phone: string;
  email: string;
  password: string;
  role: "admin" | "sous-admin";
};

async function saveOtp(phone: string) {
  const otp = generateOTP();
  const user = await UserRepository.findByPhone(phone);
  if (!user) {
    throw new Error("User not found while saving OTP");
  }

  const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await User.update(
    { otpCode: otp, otpExpiresAt },
    { where: { id: user.id } }
  );

  return process.env.NODE_ENV === "development" ? otp : undefined;
}

export class AuthFlowService {
  static async checkPhone(phone: string, role: string) {
    const user = await UserRepository.findByPhone(phone);
    const exists = Boolean(user);
    const foundRole = user?.role ?? null;
    const matchesProfile = foundRole === role;

    let nextStep = "REGISTER";
    if (exists && matchesProfile) {
      nextStep = "LOGIN";
    } else if (exists && !matchesProfile) {
      nextStep = "PROFILE_MISMATCH";
    }

    return {
      exists,
      matchesProfile,
      foundRole,
      requestedRole: role,
      nextStep,
    };
  }

  static async signIn(phone: string, password: string) {
    const user = await UserRepository.findByPhone(phone);

    if (!user) {
      return { success: false, status: 404, message: "User not found" };
    }

    if (user.role === "admin" || user.role === "sous-admin") {
      return { success: false, status: 403, message: "Use admin sign-in endpoint" };
    }

    const isValid = user.password ? await bcrypt.compare(password, user.password) : false;
    if (!isValid) {
      return { success: false, status: 401, message: "Invalid password" };
    }

    const otp = await saveOtp(phone);
    return {
      success: true,
      status: 200,
      message: "OTP sent",
      data: { userId: user.id, otp },
    };
  }

  static async signUp(phone: string, password: string, role: string) {
    if (role !== "usager" && role !== "livreur") {
      return { success: false, status: 400, message: "Role must be usager or livreur" };
    }

    const existingUser = await UserRepository.findByPhone(phone);
    if (existingUser) {
      return { success: false, status: 409, message: "Phone already exists" };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ phone, password: hashedPassword, role });

    const otp = await saveOtp(phone);
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

    const otp = await saveOtp(phone);
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

    if (user.role !== "admin" && user.role !== "sous-admin") {
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
      message: "Admin authentication successful",
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
