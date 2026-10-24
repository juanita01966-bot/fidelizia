import math
from PIL import Image, ImageDraw, ImageFont

def create_wallet_logo():
    size = 500
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Fondo circular en oro tostado y espresso
    draw.ellipse([10, 10, size - 10, size - 10], fill=(22, 10, 4, 255), outline=(212, 163, 115, 255), width=6)
    draw.ellipse([24, 24, size - 24, size - 24], outline=(212, 163, 115, 80), width=2)

    # Monograma CC en el centro
    try:
        font_main = ImageFont.truetype("C:\\Windows\\Fonts\\georgiab.ttf", 160)
        font_sub = ImageFont.truetype("C:\\Windows\\Fonts\\segoeuib.ttf", 26)
    except Exception:
        font_main = ImageFont.load_default()
        font_sub = ImageFont.load_default()

    # Texto CC
    draw.text((125, 120), "CC", fill=(212, 163, 115, 255), font=font_main)
    # Leyenda curva o centrada
    draw.text((120, 310), "CAFÉ CANELO", fill=(255, 245, 235, 255), font=font_sub)
    draw.text((170, 345), "BOGOTÁ", fill=(180, 140, 105, 220), font=font_sub)

    img.save('public/wallet_logo_canelo.png', 'PNG')

create_wallet_logo()
