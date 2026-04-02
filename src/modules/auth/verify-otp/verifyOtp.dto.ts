import { z } from "zod";

export const verifyOtpSchema = z.object({
  phone: z.string().min(8),
  role: z.enum(["usager", "livreur", "admin", "sous-admin"]),
  otp: z.string().length(6),
});
