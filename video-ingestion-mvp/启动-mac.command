#!/bin/sh
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
sh "$DIR/install/start-mac-linux.sh"
status=$?
printf '\n系统已停止。按回车退出...'
read _answer
exit "$status"
