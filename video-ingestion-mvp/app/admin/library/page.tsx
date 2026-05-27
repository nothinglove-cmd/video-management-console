import { AppShell } from "@/components/layout/app-shell";
import { LibraryWorkbench } from "@/components/library/library-workbench";
import { requirePageUser } from "@/lib/auth/page-guards";

export default async function LibraryPage() {
  await requirePageUser();
  return (
    <AppShell>
      <LibraryWorkbench />
    </AppShell>
  );
}
