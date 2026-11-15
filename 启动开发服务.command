#!/bin/zsh
set -eu
cd "$(dirname "$0")"
manager="../银河奶牛本地开发服务/source/control.mjs"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [[ -f "$manager" ]]; then
  exec node "$manager" start labyrinth
fi
print '未找到后台管理工具，使用前台模式；请保持终端运行。'
exec node tools/dev-server.mjs
