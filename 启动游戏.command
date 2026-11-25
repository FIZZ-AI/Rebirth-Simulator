#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
    echo "请先安装 Python 3.9 或更新版本，然后重新打开。"
    read -r answer
    exit 1
fi
python3 server.py --open
