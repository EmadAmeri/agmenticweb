from PIL import Image, ImageDraw, ImageFont


def make_icon(size: int) -> None:
    background = "#8FD42E"
    text_color = "#0b0c0d"
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
    draw.text(position, text, fill=text_color, font=font)
    image.save(f"web/icons/icon-{size}.png")


for icon_size in (192, 512):
    make_icon(icon_size)
