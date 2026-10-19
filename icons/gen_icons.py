# -*- coding: utf-8 -*-
"""weather_pwa のアプリアイコン(PNG)を生成する。
icon.svg と同等のデザインを Pillow で描画し、各サイズに出力。"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
S = 512  # 基準キャンバス


def rounded_rect_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def vgrad(size, top, bottom):
    """上→下の縦グラデーション画像"""
    base = Image.new("RGB", (size, size))
    px = base.load()
    for y in range(size):
        t = y / (size - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        for x in range(size):
            px[x, y] = (r, g, b)
    return base


def draw_icon():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # 背景（角丸＋グラデ）
    bg = vgrad(S, (31, 111, 235), (13, 17, 23)).convert("RGBA")
    mask = rounded_rect_mask(S, 112)
    img.paste(bg, (0, 0), mask)

    d = ImageDraw.Draw(img)

    # 太陽
    sun = (255, 211, 77, 255)
    cx, cy, r = 200, 190, 70
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=sun)
    rays = [
        (200, 70, 200, 40), (200, 310, 200, 340),
        (80, 190, 50, 190), (320, 190, 350, 190),
        (115, 105, 94, 84), (285, 105, 306, 84),
        (115, 275, 94, 296),
    ]
    for x1, y1, x2, y2 in rays:
        d.line([x1, y1, x2, y2], fill=sun, width=16)

    # 雲（白）
    white = (255, 255, 255, 255)
    for ex, ey, er in [(250, 330, 60), (320, 300, 78), (400, 340, 58)]:
        d.ellipse([ex - er, ey - er, ex + er, ey + er], fill=white)
    d.rounded_rectangle([248, 330, 404, 400], radius=35, fill=white)

    # 雨
    rain = (159, 208, 255, 255)
    for x1, y1, x2, y2 in [(270, 420, 256, 458), (330, 420, 316, 458), (390, 420, 376, 458)]:
        d.line([x1, y1, x2, y2], fill=rain, width=16)

    return img


def main():
    base = draw_icon()
    for size, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "icon-180.png")]:
        out = base.resize((size, size), Image.LANCZOS)
        out.save(os.path.join(HERE, name))
        print("wrote", name)


if __name__ == "__main__":
    main()
