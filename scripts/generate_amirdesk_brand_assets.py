#!/usr/bin/env python3
"""Generate all AmirDesk launcher icons from the existing project logo."""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "AmirDesk Dynamic Tech Logo.png"
RES = ROOT / "res"
ANDROID_RES = ROOT / "flutter" / "android" / "app" / "src" / "main" / "res"


def make_square(size: int) -> Image.Image:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"AmirDesk logo not found: {SOURCE}")

    logo = Image.open(SOURCE).convert("RGBA")
    bbox = logo.getchannel("A").getbbox()
    if bbox:
        logo = logo.crop(bbox)

    inner = size - max(24, size // 12)
    fitted = ImageOps.contain(logo, (inner, inner), method=Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (7, 19, 48, 255))
    canvas.alpha_composite(
        fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2)
    )
    return canvas


def save_png(size: int, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    make_square(size).save(target, format="PNG", optimize=True)


def main() -> None:
    RES.mkdir(parents=True, exist_ok=True)

    for size, name in (
        (512, "icon.png"),
        (32, "32x32.png"),
        (64, "64x64.png"),
        (128, "128x128.png"),
        (256, "128x128@2x.png"),
        (1024, "mac-icon.png"),
    ):
        save_png(size, RES / name)

    ico = make_square(512)
    ico.save(
        RES / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    (RES / "tray-icon.ico").write_bytes((RES / "icon.ico").read_bytes())

    windows_ico = ROOT / "flutter" / "windows" / "runner" / "resources" / "app_icon.ico"
    windows_ico.parent.mkdir(parents=True, exist_ok=True)
    windows_ico.write_bytes((RES / "icon.ico").read_bytes())

    density_sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    for folder, size in density_sizes.items():
        target_dir = ANDROID_RES / folder
        for filename in ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"):
            save_png(size, target_dir / filename)

    save_png(
        512,
        ROOT / "fastlane" / "metadata" / "android" / "en-US" / "images" / "icon.png",
    )


if __name__ == "__main__":
    main()
