# AI 素材入库系统

一个本地/NAS 优先的视频、图片素材入库与管理系统，支持手机/电脑上传、设备拷贝导入、动态栏目归档、FFmpeg 媒体处理、AI 打标、规范命名、SQLite 记录、素材库搜索、预览、回收站、存储巡检和基础修复。

当前仓库保存第一版 MVP 代码和公开运行说明。接下来计划基于该版本重构 2.0，因此这个版本适合作为可运行参考和社区共建起点。

## 界面预览

> 预览图使用空数据演示环境生成，不包含真实素材、路径或密钥。

![后台首页](assets/screenshots/admin-dashboard.png)

![素材库](assets/screenshots/library.png)

![手机上传](assets/screenshots/mobile-upload.png)

## 项目结构

```text
video-ingestion-mvp/              # Next.js 应用主目录
```

## 快速启动

```bash
cd video-ingestion-mvp
npm install
cp .env.example .env
npm run check:env
npm run db:push
npm run init:workspace
npm run typecheck
npm run dev
```

开发服务默认监听 `0.0.0.0:3000`，手机可通过同一局域网访问：

```text
http://你的电脑局域网IP:3000/mobile/upload
```

更完整的运行说明见 [video-ingestion-mvp/README.md](video-ingestion-mvp/README.md)。

## 开源发布注意

- 不提交 `.env`、API Key、真实数据库、数据库备份、真实素材文件和构建产物。
- 本地默认数据库是 `video-ingestion-mvp/prisma/dev.db`，由 `npm run db:push` 创建。
- AI provider 建议先用 `AI_PROVIDER=mock` 跑通本地流程，再配置 OpenAI、火山方舟或本地兼容服务。
- 第一版偏本地私有化部署，不是 SaaS，多用户权限、支付、云托管等能力不在当前版本范围。

## License

MIT
