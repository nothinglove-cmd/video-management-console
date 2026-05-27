#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
RUNTIME_DIR="$PROJECT_ROOT/.runtime"
NODE_DIR="$RUNTIME_DIR/node"
RUNTIME_BIN="$RUNTIME_DIR/bin"
NPM_BIN="$NODE_DIR/bin/npm"
URL="http://localhost:8888/admin"

if [ ! -x "$NPM_BIN" ]; then
  printf '还没有完成安装。请先运行“安装-mac.command”。\n' >&2
  exit 1
fi

if [ ! -f "$PROJECT_ROOT/.env" ]; then
  printf '没有找到 .env 配置文件。请先运行安装程序。\n' >&2
  exit 1
fi

export PATH="$RUNTIME_BIN:$NODE_DIR/bin:$PATH"
cd "$PROJECT_ROOT"

(
  sleep 5
  if command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  fi
) &

printf '系统启动中，请保持这个窗口打开。\n'
printf '后台地址：%s\n\n' "$URL"
exec "$NPM_BIN" run start
