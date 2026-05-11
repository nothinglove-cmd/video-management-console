import { MobileLiteShell } from "@/components/layout/mobile-lite-shell";
import { UploadClient } from "@/components/upload/upload-client";

export default function MobileUploadPage() {
  return (
    <MobileLiteShell title="手机上传" eyebrow="视频素材上传">
      <UploadClient mode="mobile" sourceType="WEB_MOBILE_UPLOAD" />
    </MobileLiteShell>
  );
}
