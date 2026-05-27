import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/session";
import { skin } from "@/components/theme/skin";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : "/admin");

  return (
    <main style={skin.vars} className="flex min-h-screen items-center justify-center bg-[color:var(--skin-page-bg)] p-4">
      <LoginForm />
    </main>
  );
}
