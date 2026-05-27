#!/bin/sh
set -eu

NODE_MAJOR="${VIDEO_INSTALL_NODE_MAJOR:-22}"
NODE_VERSION="${VIDEO_INSTALL_NODE_VERSION:-}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
RUNTIME_DIR="$PROJECT_ROOT/.runtime"
NODE_DIR="$RUNTIME_DIR/node"
DOWNLOAD_DIR="$RUNTIME_DIR/downloads"

print_step() {
  printf '\n== %s ==\n' "$1"
}

fail() {
  printf '\n安装失败：%s\n' "$1" >&2
  exit 1
}

detect_platform() {
  system=$(uname -s)
  machine=$(uname -m)

  case "$system" in
    Darwin) os_name="darwin" ;;
    Linux) os_name="linux" ;;
    *) fail "暂不支持当前系统：$system" ;;
  esac

  case "$machine" in
    x86_64|amd64) arch_name="x64" ;;
    arm64|aarch64) arch_name="arm64" ;;
    *) fail "暂不支持当前 CPU 架构：$machine" ;;
  esac

  printf '%s-%s' "$os_name" "$arch_name"
}

download_file() {
  url="$1"
  output="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 2 --connect-timeout 20 -o "$output" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$output" "$url"
  else
    fail "没有找到 curl 或 wget，无法自动下载 Node.js。"
  fi
}

resolve_node_version() {
  platform="$1"
  if [ -n "$NODE_VERSION" ]; then
    printf '%s' "$NODE_VERSION"
    return
  fi

  shasums_path="$DOWNLOAD_DIR/node-latest-v$NODE_MAJOR.x-SHASUMS256.txt"
  shasums_url="https://nodejs.org/dist/latest-v$NODE_MAJOR.x/SHASUMS256.txt"
  download_file "$shasums_url" "$shasums_path" || fail "无法读取 Node.js 最新版本信息：$shasums_url"

  version=$(sed -n "s/.*node-v\\([^-]*\\)-$platform\\.tar\\.xz.*/\\1/p" "$shasums_path" | head -n 1)
  if [ -z "$version" ]; then
    fail "没有找到适合 $platform 的 Node.js $NODE_MAJOR 最新安装包。"
  fi
  printf '%s' "$version"
}

install_node_runtime() {
  if [ -x "$NODE_DIR/bin/node" ]; then
    "$NODE_DIR/bin/node" -v
    return
  fi

  platform=$(detect_platform)
  mkdir -p "$DOWNLOAD_DIR"
  resolved_version=$(resolve_node_version "$platform")
  archive_name="node-v$resolved_version-$platform.tar.xz"
  archive_url="https://nodejs.org/dist/v$resolved_version/$archive_name"
  archive_path="$DOWNLOAD_DIR/$archive_name"
  extract_dir="$DOWNLOAD_DIR/node-extract"

  print_step "下载项目专用 Node.js"
  rm -rf "$extract_dir"
  download_file "$archive_url" "$archive_path" || fail "Node.js 下载失败：$archive_url"

  print_step "解压 Node.js"
  mkdir -p "$extract_dir"
  tar -xJf "$archive_path" -C "$extract_dir" || fail "Node.js 解压失败。"
  rm -rf "$NODE_DIR"
  mv "$extract_dir/node-v$resolved_version-$platform" "$NODE_DIR"
  chmod +x "$NODE_DIR/bin/node" "$NODE_DIR/bin/npm" "$NODE_DIR/bin/npx" 2>/dev/null || true
}

print_step "准备安装环境"
mkdir -p "$RUNTIME_DIR"
install_node_runtime

print_step "启动安装向导"
exec "$NODE_DIR/bin/node" "$PROJECT_ROOT/install/runtime-installer.js"
