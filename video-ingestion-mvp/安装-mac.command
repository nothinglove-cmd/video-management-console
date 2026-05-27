#!/bin/sh
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
sh "$DIR/install/bootstrap-mac-linux.sh"
status=$?
printf '\n'
if [ "$status" -eq 0 ]; then
  printf '安装程序已结束。可以关闭窗口，或双击“启动-mac.command”启动系统。\n'
else
  printf '安装程序没有完成，请查看上面的错误信息。\n'
fi
printf '按回车退出...'
read _answer
exit "$status"
