import type { UserRole } from "@prisma/client";

export const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN"];
export const SUPER_ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN"];
export const USER_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "USER"];

export function canManageTargetRole(actorRole: UserRole, targetRole: UserRole) {
  if (actorRole === "SUPER_ADMIN") return true;
  if (actorRole === "ADMIN") return targetRole === "USER";
  return false;
}

export function canCreateRole(actorRole: UserRole, targetRole: UserRole) {
  if (actorRole === "SUPER_ADMIN") return true;
  if (actorRole === "ADMIN") return targetRole === "USER";
  return false;
}

export function menuAllowedRoles(itemId: string): UserRole[] {
  if (["mobile-upload", "desktop-upload", "library"].includes(itemId)) return USER_ROLES;
  if (["dashboard", "ingest-review", "batches", "trash", "device-import", "shooters", "users"].includes(itemId)) return ADMIN_ROLES;
  return SUPER_ADMIN_ROLES;
}
