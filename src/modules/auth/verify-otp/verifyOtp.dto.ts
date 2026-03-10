import { z } from "zod";

export const verifyOtpSchema = z.object({
  phone: z.string().min(8),
  otp: z.string().length(6),
});
