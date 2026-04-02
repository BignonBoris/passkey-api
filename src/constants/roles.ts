export const USER_ROLES = ["usager", "livreur", "admin", "sous-admin", "restaurant"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const PRIVILEGED_ROLES: UserRole[] = ["admin", "sous-admin"];

export function isUserRole(value: string): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}
