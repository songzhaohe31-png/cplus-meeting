#!/usr/bin/env python3
"""生成桌面扫码图：公网 HTTPS，无需公司 Wi‑Fi"""

from __future__ import annotations

import argparse
import socket
import sys
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFont

try:
    from qrcode.image.styledpil import StyledPilImage
    from qrcode.image.styles.moduledrawers import RoundedModuleDrawer
    HAS_STYLE = True
except Exception:
    HAS_STYLE = False

ROOT = Path(__file__).resolve().parent
DESKTOP = Path.home() / "Desktop"
PORT = 8765


def get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def load_font(size: int):
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def make_poster(url: str, mode: str = "public") -> Path:
    """海报与文件名只出现「CPLUS预约会议系统」，绝不打印/绘制任何域名。"""
    (ROOT / "data").mkdir(exist_ok=True)
    # 仅内部保存真实地址，文件名不对外展示
    (ROOT / "data" / ".endpoint").write_text(url.strip() + "\n", encoding="utf-8")
    # 兼容旧逻辑
    (ROOT / "data" / "public_url.txt").write_text(url.strip() + "\n", encoding="utf-8")

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=12,
        border=2,
    )
    # 二维码内嵌真实地址（扫码跳转需要），画面上不写出来
    qr.add_data(url)
    qr.make(fit=True)

    if HAS_STYLE:
        try:
            qr_img = qr.make_image(
                image_factory=StyledPilImage,
                module_drawer=RoundedModuleDrawer(),
                fill_color="#0B3D5C",
                back_color="white",
            ).convert("RGB")
        except Exception:
            qr_img = qr.make_image(fill_color="#0B3D5C", back_color="white").convert("RGB")
    else:
        qr_img = qr.make_image(fill_color="#0B3D5C", back_color="white").convert("RGB")

    W, H = 900, 1180
    canvas = Image.new("RGB", (W, H), "#F4F6F9")
    draw = ImageDraw.Draw(canvas)
    brand = "CPLUS预约会议系统"

    draw.rectangle([0, 0, W, 170], fill="#0B3D5C")
    font_title = load_font(40)
    font_sub = load_font(22)
    font_tip = load_font(24)
    font_small = load_font(20)
    font_badge = load_font(20)

    draw.text((W // 2, 52), brand, fill="white", font=font_title, anchor="mm")
    draw.text(
        (W // 2, 105),
        "老板 / 客户 / 同事 · 一码通用",
        fill="#C9A227",
        font=font_sub,
        anchor="mm",
    )
    badge = "扫码预约 · 无需公司 Wi‑Fi" if mode == "public" else "扫码预约"
    bw, bh = 360, 36
    bx, by = (W - bw) // 2, 128
    draw.rounded_rectangle([bx, by, bx + bw, by + bh], radius=18, fill="#C9A227")
    draw.text((W // 2, by + bh // 2), badge, fill="#0B3D5C", font=font_badge, anchor="mm")

    size = 500
    qr_img = qr_img.resize((size, size), Image.Resampling.NEAREST)
    qx, qy = (W - size) // 2, 230
    pad = 24
    draw.rounded_rectangle(
        [qx - pad, qy - pad, qx + size + pad, qy + size + pad],
        radius=24,
        fill="white",
        outline="#E6EBF2",
        width=2,
    )
    canvas.paste(qr_img, (qx, qy))

    # 二维码下方只写系统名，禁止出现任何 http / 域名
    draw.text((W // 2, 800), brand, fill="#0E5A87", font=load_font(30), anchor="mm")

    tips = [
        "1. 扫码进入 CPLUS预约会议系统",
        "2. 周一至周五 9:30–18:00 · 先到先得",
        "3. 大10人 / 中4人 / 小2人 · 红色=已占用",
        "※ 行政电脑请保持「启动服务」运行",
    ]

    y = 860
    for t in tips:
        f = font_small if t.startswith("※") else font_tip
        color = "#6B7280" if t.startswith("※") else "#1A2332"
        draw.text((W // 2, y), t, fill=color, font=f, anchor="mm")
        y += 40

    # 桌面文件名也不带域名
    out1 = DESKTOP / "CPLUS预约会议系统.png"
    out2 = ROOT / "CPLUS预约会议系统.png"
    canvas.save(out1, "PNG")
    canvas.save(out2, "PNG")
    # 删除旧文件名（可能让人误以为有域名相关）
    for old in (
        DESKTOP / "CPLUS会议室预约_扫码进入.png",
        ROOT / "CPLUS会议室预约_扫码进入.png",
    ):
        try:
            if old.exists():
                old.unlink()
        except Exception:
            pass
    print("二维码已生成：桌面 / CPLUS预约会议系统.png")
    print("（海报仅显示「CPLUS预约会议系统」，不含任何域名文字）")
    return out1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="", help="公网或内网完整 URL")
    parser.add_argument("--mode", choices=["public", "lan"], default="public")
    args = parser.parse_args()

    if args.url:
        url = args.url.strip()
    elif args.mode == "lan":
        url = f"http://{get_lan_ip()}:{PORT}/"
    else:
        saved = ROOT / "data" / ".endpoint"
        if not saved.exists():
            saved = ROOT / "data" / "public_url.txt"
        if saved.exists():
            url = saved.read_text(encoding="utf-8").strip()
        else:
            print("请先运行「启动服务」", file=sys.stderr)
            sys.exit(1)

    if not url.endswith("/"):
        url = url + "/"
    make_poster(url, mode=args.mode)


if __name__ == "__main__":
    main()
