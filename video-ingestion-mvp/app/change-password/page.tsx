import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { skin } from "@/components/theme/skin";
import { getCurrentUser } from "@/lib/auth/session";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/admin");

  return (
    <main style={skin.vars} className="flex min-h-screen items-center justify-center bg-[color:var(--skin-page-bg)] p-4">
      <ChangePasswordForm />
    </main>
  );
}
