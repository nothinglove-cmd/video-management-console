import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";

import { getCurrentUser, roleAtLeast } from "@/lib/auth/session";

type PageGuardOptions = {
  allowPasswordChange?: boolean;
};

export async function requirePageUser(options: PageGuardOptions = {}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !options.allowPasswordChange) redirect("/change-password");
  return user;
}

export async function requirePageRole(minimumRole: UserRole) {
  const user = await requirePageUser();
  if (!roleAtLeast(user.role, minimumRole)) redirect("/admin/library");
  return user;
}
