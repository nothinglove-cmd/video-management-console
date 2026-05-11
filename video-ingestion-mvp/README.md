# video-ingestion-mvp

AI 素材入库系统的 Next.js MVP 应用。

## 功能概览

- 手机和电脑上传视频/图片素材
- 设备拷贝目录导入
- 动态栏目归档
- FFmpeg 媒体信息读取、缩略图、关键帧和预览文件生成
- AI 标签、摘要、命名建议和栏目建议
- 素材库搜索、筛选、预览、移动、改名、标签和回收站
- SQLite + Prisma 本地数据存储
- 存储巡检和低风险修复工具

## 快速启动

```bash
npm install
cp .env.example .env
npm run check:env
npm run db:push
npm run init:workspace
npm run typecheck
npm run dev
```

默认开发服务监听 `0.0.0.0:3000`。手机和电脑在同一局域网时，可以访问：

```text
http://你的电脑局域网IP:3000/mobile/upload
```

## 常用命令

```bash
npm run dev
npm run build
npm run start
npm run typecheck
npm run check:env
npm run backup:db
npm run db:push
npm run init:workspace
npm run backfill:workspace
npm run prisma:studio
```

## 环境变量

复制 `.env.example` 为 `.env`，本地第一次运行建议使用 mock provider：

```bash
STORAGE_ROOT=/Users/你的用户名/VideoIngestionStorage
DATABASE_URL="file:./dev.db"

AI_PROVIDER=mock
AI_MODEL=gpt-4.1-mini
AI_FALLBACK_PROVIDER=mock
AI_FRAME_MAX=5
AI_IMAGE_DETAIL=low
AI_REQUEST_TIMEOUT_MS=60000
```

不要提交真实 `.env`、API Key、SQLite 数据库、数据库备份和真实素材文件。

## FFmpeg

媒体信息读取、抽帧、缩略图和预览文件依赖 FFmpeg / ffprobe。

macOS 可安装：

```bash
brew install ffmpeg
```

检查：

```bash
ffmpeg -version
ffprobe -version
```

## 页面入口

- `/admin`：工作台
- `/mobile/upload`：手机上传
- `/upload`：电脑上传
- `/admin/library`：素材库
- `/admin/ingest-review`：入库确认
- `/admin/device-import`：设备拷贝导入
- `/admin/categories`：栏目管理
- `/admin/shooters`：拍摄人管理
- `/admin/trash`：回收站
- `/admin/settings`：设置、AI 连接测试、存储巡检
