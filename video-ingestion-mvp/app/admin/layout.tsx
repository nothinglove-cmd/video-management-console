import { requirePageUser } from "@/lib/auth/page-guards";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser();
  return children;
}
