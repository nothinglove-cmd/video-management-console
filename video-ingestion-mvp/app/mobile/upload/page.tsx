import { MobileLiteShell } from "@/components/layout/mobile-lite-shell";
import { UploadClient } from "@/components/upload/upload-client";
import { requirePageUser } from "@/lib/auth/page-guards";

export default async function MobileUploadPage() {
  await requirePageUser();
  return (
    <MobileLiteShell title="手机上传" eyebrow="视频素材上传">
      <UploadClient mode="mobile" sourceType="WEB_MOBILE_UPLOAD" />
    </MobileLiteShell>
  );
}
