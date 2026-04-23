import { z } from "zod";

const normalizeAuthRole = (value: unknown) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "driver" || normalized === "courier") return "livreur";
  if (normalized === "rider" || normalized === "customer" || normalized === "user") return "usager";
  return normalized;
};

export const verifyOtpSchema = z.object({
  phone: z.string().min(8),
  role: z.preprocess(
    normalizeAuthRole,
    z.enum(["usager", "livreur", "admin", "sous-admin"]),
  ),
  otp: z.string().length(6),
});
