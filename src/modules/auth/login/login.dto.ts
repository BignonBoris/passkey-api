import { z } from "zod";

export const userRoleEnum = z.enum([
  "usager",
  "livreur",
  "admin",
  "sous-admin",
]);

export const loginSchema = z.object({
  phone: z.string().min(8),
  password: z.string().min(6),
  role: z.string().min(6).default("usager"),
  // role: userRoleEnum.default("usager"),
});
