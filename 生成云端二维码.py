#!/usr/bin/env python3
"""根据云端地址生成桌面二维码（海报只显示 CPLUS预约会议系统，不显示域名）"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

# 复用海报生成
from importlib.util import spec_from_loader, module_from_spec
import importlib.machinery

# 直接调用 生成二维码.py
import runpy

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python3 生成云端二维码.py https://你的云端地址")
        print("示例: python3 生成云端二维码.py https://cplus-meeting.onrender.com")
        sys.exit(1)
    url = sys.argv[1].strip()
    if not url.startswith("http"):
        url = "https://" + url
    # 调用同目录生成脚本
    import subprocess
    subprocess.check_call(
        [sys.executable, str(ROOT / "生成二维码.py"), "--url", url, "--mode", "public"]
    )
    print("桌面已生成：CPLUS预约会议系统.png")
    print("把这张图发给老板/客户，或打印贴门口即可随时扫码预约。")
