from PIL import Image, ImageDraw, ImageFont


def make_icon(size: int) -> None:
    background = "#B8420F"
    cream = "#FAF4E8"
    image = Image.new("RGB", (size, size), background)
    draw = ImageDraw.Draw(image)

    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", int(size * 0.58))
    except OSError:
        font = ImageFont.load_default()

    text = "D"
    box = draw.textbbox((0, 0), text, font=font)
    width = box[2] - box[0]
    height = box[3] - box[1]
    position = ((size - width) / 2, (size - height) / 2 - size * 0.04)
    draw.text(position, text, fill=cream, font=font)
    image.save(f"web/icons/icon-{size}.png")


for icon_size in (192, 512):
    make_icon(icon_size)
