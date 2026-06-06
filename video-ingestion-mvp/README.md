# video-ingestion-mvp

AI 素材入库系统的 Next.js MVP 应用。本版本面向本地电脑或 NAS 部署，默认使用 SQLite + 本地文件目录，不依赖云端 SaaS 账号体系。

## 功能概览

- 手机和电脑上传视频/图片素材，支持大文件和多文件批量上传。
- 设备拷贝目录导入，通过批次和入库队列统一处理。
- 动态栏目归档，支持栏目、目录、素材之间的映射。
- FFmpeg / ffprobe 媒体信息读取、缩略图、关键帧和预览文件生成。
- AI 标签、摘要、命名建议和栏目建议，默认可用 mock provider 跑通流程。
- 素材库搜索、筛选、预览、下载、移动、改名、标签、回收站。
- 批次中心集中追踪上传/设备导入批次、后台任务、失败原因和失败项重试。
- 持久化精选包、成片发布/交付记录和素材使用回溯，支持素材库按未使用、已进包、已成片筛选，精选包可追踪转成片结果，成片可记录项目、账号、版本、发布标题、链接和发布时间。
- 存储巡检、低风险修复和系统重置类维护工具。
- 本地账号登录、httpOnly 会话和三层权限。
- 全新安装器可自动准备项目专用 Node.js、依赖、FFmpeg、数据库和初始超级管理员。

## 推荐启动方式

普通用户全新安装请先看 [安装说明.md](安装说明.md)。

安装后日常启动：

```bash
cd /path/to/video-ingestion-mvp
./install/start-mac-linux.sh
```

也可以直接使用项目自带 Node/npm：

```bash
cd /path/to/video-ingestion-mvp
.runtime/node/bin/npm run start
```

启动后访问：

```text
http://localhost:8888/login
```

手机和电脑在同一局域网时，可以访问：

```text
http://你的电脑局域网IP:8888/mobile/upload
```

## 开发调试

开发模式使用：

```bash
cd /path/to/video-ingestion-mvp
.runtime/node/bin/npm run dev
```

如果没有使用安装器，而是手动准备环境：

```bash
npm install
cp .env.example .env
npm run check:env
npm run db:push
npm run init:workspace
npm run typecheck
npm run dev
```

开发服务和生产服务默认都监听 `0.0.0.0:8888`。

## 常用命令

优先使用项目自带 npm：

```bash
.runtime/node/bin/npm run dev
.runtime/node/bin/npm run build
.runtime/node/bin/npm run start
.runtime/node/bin/npm run typecheck
.runtime/node/bin/npm run check:env
.runtime/node/bin/npm run backup:db
.runtime/node/bin/npm run db:push
.runtime/node/bin/npm run init:workspace
.runtime/node/bin/npm run backfill:workspace
.runtime/node/bin/npm run prisma:studio
```

安装器自检：

```bash
VIDEO_INSTALL_SELF_TEST=1 .runtime/node/bin/node install/runtime-installer.js
```

## 环境变量

复制 `.env.example` 为 `.env`，本地第一次运行建议使用 mock provider：

```bash
STORAGE_ROOT=/Users/你的用户名/VideoIngestionStorage
DATABASE_URL="file:./dev.db"
AUTH_SECRET=请替换为至少32位随机字符串

AI_PROVIDER=mock
AI_MODEL=gpt-4.1-mini
AI_FALLBACK_PROVIDER=mock
AI_FRAME_MAX=5
AI_IMAGE_DETAIL=low
AI_REQUEST_TIMEOUT_MS=60000
```

使用 OpenAI-compatible 中转站时，可以登录后台进入“系统设置 / AI 配置”新建 `OpenAI-compatible 中转站` 配置。需要填写：

- 中转站 Base URL：通常要带 `/v1`，例如 `https://your-relay.example.com/v1`
- 中转站 API Key：填写中转站提供的 key
- 中转站模型：填写中转站支持图片输入的模型名

系统会优先调用 `/responses`；如果中转站不支持，会自动兼容 `/chat/completions`。

首次初始化超级管理员可选配置：

```bash
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_DISPLAY_NAME=超级管理员
# INITIAL_ADMIN_PASSWORD=
```

不要提交真实 `.env`、API Key、SQLite 数据库、数据库备份、真实素材文件、`.runtime`、`.next` 或 `node_modules`。

## 初始账号和密码

全新安装时，安装器会生成初始超级管理员并在安装完成页显示：

```text
用户名：admin
密码：安装器生成的随机密码
```

`npm run init:workspace` 在没有可用超级管理员时也会创建初始账号，并在终端输出一次性初始密码。首次登录后系统会要求修改密码。

如果忘记超级管理员密码，可以在项目目录执行下面的脚本重置 `admin`：

```bash
.runtime/node/bin/node - <<'NODE'
require('sucrase/register');
const { PrismaClient } = require('@prisma/client');
const { hashPassword, generateReadablePassword } = require('./lib/auth/password.ts');
const prisma = new PrismaClient();

async function main() {
  const password = generateReadablePassword(18);
  const user = await prisma.userAccount.update({
    where: { username: 'admin' },
    data: {
      passwordHash: await hashPassword(password),
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      mustChangePassword: true
    },
    select: { id: true, username: true, displayName: true, role: true }
  });
  await prisma.userSession.deleteMany({ where: { userId: user.id } });
  console.log({ username: user.username, password, role: user.role });
}

main().finally(async () => prisma.$disconnect());
NODE
```

## 本地权限

| 角色 | 主要权限 |
| --- | --- |
| `SUPER_ADMIN` | 全部功能，包括系统设置、AI 设置、存储根目录、栏目/目录管理、系统维护、系统重置、用户管理和素材全操作。 |
| `ADMIN` | 上传、素材管理、精选包管理、成片/交付记录管理、删除到回收站、恢复、确认入库、重分析、设备导入、拍摄人管理和普通用户管理。不能进入高危系统设置、存储根目录、AI 设置、栏目/目录结构管理和系统重置。 |
| `USER` | 上传文件和只读素材库。可以查看、预览、下载已入库素材；不能删除、移动、改名、编辑标签、确认入库、重分析、恢复回收站或修改设置。 |

后端 API 会真实校验权限，不只依赖前端隐藏菜单。强制修改初始密码的账号只能访问改密码、退出登录和当前用户接口。

## 页面入口

- `/login`：登录页
- `/change-password`：修改初始密码
- `/admin`：工作台
- `/mobile/upload`：手机上传
- `/upload`：电脑上传
- `/admin/library`：素材库
- `/admin/batches`：批次中心
- `/admin/packages`：精选包
- `/admin/packages/[id]`：精选包详情、排序、移除、归档、下载、导出和转成片回溯
- `/admin/finished-works`：成片记录
- `/admin/finished-works/[id]`：成片详情、关联精选包、导入素材、排序、状态和发布信息维护
- `/admin/ingest-review`：入库确认
- `/admin/device-import`：设备拷贝导入
- `/admin/categories`：栏目管理
- `/admin/shooters`：拍摄人管理
- `/admin/users`：用户管理
- `/admin/trash`：回收站
- `/admin/settings`：系统设置、AI 连接测试、存储巡检和维护

菜单会按当前登录角色自动过滤。

## 安装器做了什么

安装器是全新安装流程，不保留旧数据库数据。它会：

- 下载项目专用 Node.js 到 `.runtime/node`
- 安装项目依赖
- 安装项目专用 FFmpeg / ffprobe
- 生成 `.env`，包括 `AUTH_SECRET` 和初始超级管理员密码
- 删除旧 SQLite 开发数据库并重新初始化
- 执行 `db:push` 和 `init:workspace`
- 执行 `check:env`
- 构建生产版本

如果选择的素材存储目录不是空目录，安装器会自动切换到一个新的 `VideoIngestionStorage-*` 子目录，不会删除已有文件。

## 验证清单

本次权限和安装器改动已按下面命令验证通过：

```bash
.runtime/node/bin/npm run prisma:generate
.runtime/node/bin/npm run db:push
.runtime/node/bin/npm run init:workspace
.runtime/node/bin/npm run typecheck
.runtime/node/bin/npm run build
VIDEO_INSTALL_SELF_TEST=1 .runtime/node/bin/node install/runtime-installer.js
.runtime/node/bin/npm run check:env
```

权限冒烟覆盖：

- 未登录访问 `/admin` 会跳转 `/login`
- `SUPER_ADMIN` 可以访问系统设置和用户管理
- `ADMIN` 可以删除素材到回收站，不能访问存储根目录设置
- `USER` 可以访问上传和只读素材库
- `USER` 调用删除、批量操作、高危设置、伪造设备导入来源都会返回 403
- `USER` 即使请求 `scope=all&status=PROCESSING`，后端也只返回已入库素材
- 强制改密码用户不能访问普通业务接口

## 已知边界

- 当前数据库结构同步使用 `prisma db push`，适合全新安装；如果以后要保留旧数据升级，需要补正式 Prisma migrations。
- 普通用户上传批次目前按网页上传来源限制，没有做“只看自己上传”的所有者隔离。
- 重分析接口权限正确，但重分析内部日志的操作者归因后续可以继续加强。

## FFmpeg

安装器和 `npm install` 会准备项目专用 FFmpeg / ffprobe，不要求安装到系统全局。手动部署后可以用下面命令检查：

```bash
.runtime/bin/ffmpeg -version
.runtime/bin/ffprobe -version
.runtime/node/bin/npm run check:env
```
