"""家有糖人 小程序图标生成器
设计：橙色渐变圆角方块底 + 白色水滴 + 橙色心形（关爱+血糖意象）
依赖：仅 Pillow
用法：python3 icon-design.py
输出：icon-1024.png（主输出，提交微信后台用），icon-512.png，icon-256.png，icon-144.png
"""
import math
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
SS = 4
W = SIZE * SS

ORANGE_TOP = (255, 178, 102)
ORANGE_BOTTOM = (250, 140, 22)
HEART_COLOR = (250, 140, 22)
WHITE = (255, 255, 255, 255)


def vertical_gradient(width, height, c_top, c_bot):
    img = Image.new("RGB", (1, height))
    for y in range(height):
        t = y / max(1, height - 1)
        r = int(c_top[0] * (1 - t) + c_bot[0] * t)
        g = int(c_top[1] * (1 - t) + c_bot[1] * t)
        b = int(c_top[2] * (1 - t) + c_bot[2] * t)
        img.putpixel((0, y), (r, g, b))
    return img.resize((width, height), Image.BILINEAR)


def teardrop_points(cx, cy, half_w, height_top, height_bot, n=200):
    """水滴：上半三角弧 + 下半圆。返回闭合 polygon 点列。"""
    pts = []
    bot_r = half_w
    bot_cy = cy + height_bot - bot_r
    for i in range(n + 1):
        a = math.pi - i / n * math.pi
        pts.append((cx + bot_r * math.cos(a), bot_cy + bot_r * math.sin(a)))
    apex = (cx, cy - height_top)
    n2 = n // 2
    for i in range(1, n2):
        t = i / n2
        x = (1 - t) * (cx + bot_r) + t * apex[0]
        ctrl_y = cy - height_top * 0.4
        y = (1 - t) ** 2 * bot_cy + 2 * (1 - t) * t * ctrl_y + t ** 2 * apex[1]
        x = (1 - t) ** 2 * (cx + bot_r) + 2 * (1 - t) * t * (cx + bot_r * 0.6) + t ** 2 * apex[0]
        pts.append((x, y))
    pts.append(apex)
    for i in range(1, n2):
        t = i / n2
        x = (1 - t) ** 2 * apex[0] + 2 * (1 - t) * t * (cx - bot_r * 0.6) + t ** 2 * (cx - bot_r)
        ctrl_y = cy - height_top * 0.4
        y = (1 - t) ** 2 * apex[1] + 2 * (1 - t) * t * ctrl_y + t ** 2 * bot_cy
        pts.append((x, y))
    return pts


def heart_points(cx, cy, size, n=200):
    """参数方程心形。size 控制总高度。"""
    pts = []
    scale = size / 32.0
    for i in range(n):
        t = i / n * 2 * math.pi
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        pts.append((cx + x * scale, cy + y * scale))
    return pts


def make_icon():
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))

    bg = vertical_gradient(W, W, ORANGE_TOP, ORANGE_BOTTOM).convert("RGBA")
    mask = Image.new("L", (W, W), 0)
    mdraw = ImageDraw.Draw(mask)
    radius = int(W * 0.225)
    mdraw.rounded_rectangle((0, 0, W - 1, W - 1), radius=radius, fill=255)
    bg.putalpha(mask)
    img.alpha_composite(bg)

    cx, cy = W / 2, W * 0.50
    half_w = W * 0.22
    h_top = W * 0.30
    h_bot = W * 0.28

    shadow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.polygon(teardrop_points(cx, cy + W * 0.012, half_w, h_top, h_bot), fill=(0, 0, 0, 60))
    shadow = shadow.filter(ImageFilter.GaussianBlur(W * 0.012))
    img.alpha_composite(shadow)

    drop_layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    ddraw = ImageDraw.Draw(drop_layer)
    ddraw.polygon(teardrop_points(cx, cy, half_w, h_top, h_bot), fill=WHITE)
    img.alpha_composite(drop_layer)

    heart_layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    hdraw = ImageDraw.Draw(heart_layer)
    heart_size = W * 0.16
    heart_cx = cx
    heart_cy = cy + W * 0.05
    hdraw.polygon(heart_points(heart_cx, heart_cy, heart_size), fill=HEART_COLOR + (255,))
    img.alpha_composite(heart_layer)

    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    return img


if __name__ == "__main__":
    icon = make_icon()
    sizes = [1024, 512, 256, 144]
    for s in sizes:
        out = icon.resize((s, s), Image.LANCZOS) if s != SIZE else icon
        out.save(f"icon-{s}.png", optimize=True)
        print(f"✓ icon-{s}.png ({s}x{s})")
