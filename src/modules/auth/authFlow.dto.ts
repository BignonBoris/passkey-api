import { z } from "zod";

export const checkPhoneSchema = z.object({
  phone: z.string().min(8),
  role: z.enum(["usager", "livreur", "admin", "sous-admin", "restaurant"]),
});

export const signInSchema = z.object({
  phone: z.string().min(8),
  role: z.string(),
  password: z.string().min(6),
});

export const signUpSchema = z.object({
  phone: z.string().min(8),
  password: z.string().min(6),
  role: z.string().default("usager"),
});

export const forgotPasswordSchema = z.object({
  phone: z.string().min(8),
  role: z.string().default("usager"),
});

export const validateRecoveryOtpSchema = z.object({
  phone: z.string().min(8),
  otp: z.string().length(6),
});

export const recoverPasswordSchema = z.object({
  phone: z.string().min(8),
  otp: z.string().length(6),
  newPassword: z.string().min(6),
  role: z.string().default("usager"),
});

export const adminSignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  captchaToken: z.string().optional(),
});

export const adminSignUpSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["admin", "sous-admin", "restaurant"]).default("admin"),
});
