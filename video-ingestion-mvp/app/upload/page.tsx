import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { UploadClient } from "@/components/upload/upload-client";

export default function DesktopUploadPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Desktop Upload"
        title="电脑上传"
        description="适合批量上传剪辑电脑里的视频和图片素材。左侧设置上传上下文，右侧拖拽文件入库。"
      />
      <UploadClient mode="desktop" sourceType="WEB_DESKTOP_UPLOAD" />
    </AppShell>
  );
}
