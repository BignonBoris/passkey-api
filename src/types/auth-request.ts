import { Request } from "express";
import { UserRole } from "@/constants/roles";

export interface AuthUser {
  id: string;
  role: UserRole;
}

export type AuthenticatedRequest = Request & {
  user?: AuthUser;
  files?: any;
};
