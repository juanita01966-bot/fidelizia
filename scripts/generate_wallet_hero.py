import sys
import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
import urllib.request

def create_wallet_hero():
    width = 1032
    height = 460

    # 1. Descargar imagen base de café de especialidad macro oscuro de alta resolución
    bg_url = "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=1200&auto=format&fit=crop&q=90"
    bg_path = "public/temp_coffee_bg.jpg"
    
    print("Descargando fondo de café de especialidad...")
    try:
        req = urllib.request.Request(bg_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response, open(bg_path, 'wb') as out_file:
            out_file.write(response.read())
        bg_img = Image.open(bg_path).convert('RGBA')
        bg_img = bg_img.resize((width, height), Image.Resampling.LANCZOS)
    except Exception as e:
        print(f"Fallback a fondo procedural por error: {e}")
        bg_img = Image.new('RGBA', (width, height), (15, 8, 3, 255))

    # Oscurecer y dar atmósfera de lujo al fondo con desenfoque suave
    bg_img = bg_img.filter(ImageFilter.GaussianBlur(radius=3))
    enhancer = ImageEnhance.Brightness(bg_img)
    bg_img = enhancer.enhance(0.45)

    # Capa de gradiente viñeta
    vignette = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    v_draw = ImageDraw.Draw(vignette)
    for y in range(height):
        # Gradiente vertical oscuro en bordes
        alpha = int(120 * (1 - math.sin(math.pi * y / height)))
        v_draw.line([(0, y), (width, y)], fill=(8, 4, 2, min(230, alpha + 80)))
    
    base = Image.alpha_composite(bg_img, vignette)

    # 2. Dibujar la Tarjeta de Fidelidad Física Flotante PBR
    # Coordenadas de la tarjeta
    card_x0, card_y0 = 36, 25
    card_x1, card_y1 = width - 36, height - 25
    card_w = card_x1 - card_x0
    card_h = card_y1 - card_y0
    card_rad = 22

    # Sombra tridimensional profunda de la tarjeta
    shadow_layer = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow_layer)
    s_draw.rounded_rectangle(
        [card_x0 + 6, card_y0 + 12, card_x1 + 6, card_y1 + 16],
        radius=card_rad,
        fill=(0, 0, 0, 190)
    )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=12))
    base = Image.alpha_composite(base, shadow_layer)

    # Capa de la tarjeta
    card_layer = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    c_draw = ImageDraw.Draw(card_layer)

    # Fondo degradado de la tarjeta (Espresso tostado a oro oscuro)
    for i in range(card_h):
        ratio = i / float(card_h)
        # Interpolación entre #261408 y #0e0602
        r = int(38 * (1 - ratio) + 14 * ratio)
        g = int(20 * (1 - ratio) + 6 * ratio)
        b = int(8 * (1 - ratio) + 2 * ratio)
        y = card_y0 + i
        c_draw.line([(card_x0, y), (card_x1, y)], fill=(r, g, b, 248))

    # Máscara redondeada para la tarjeta
    mask = Image.new('L', (width, height), 0)
    m_draw = ImageDraw.Draw(mask)
    m_draw.rounded_rectangle([card_x0, card_y0, card_x1, card_y1], radius=card_rad, fill=255)
    
    # Aplicar máscara a la tarjeta
    card_layer.putalpha(mask)
    base = Image.alpha_composite(base, card_layer)

    # Dibujar elementos decorativos sobre la tarjeta
    overlay = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Doble borde de oro cepillado (Doppelrand)
    draw.rounded_rectangle([card_x0, card_y0, card_x1, card_y1], radius=card_rad, outline=(212, 163, 115, 180), width=2)
    draw.rounded_rectangle([card_x0 + 4, card_y0 + 4, card_x1 - 4, card_y1 - 4], radius=card_rad - 3, outline=(212, 163, 115, 45), width=1)

    # Cargar fuentes (usar fuentes del sistema Windows como Arial / Georgia / Segoe UI)
    font_bold = None
    font_regular = None
    font_small = None
    font_mono = None

    try:
        font_brand = ImageFont.truetype("C:\\Windows\\Fonts\\georgiab.ttf", 28)
        font_sub = ImageFont.truetype("C:\\Windows\\Fonts\\segoeui.ttf", 11)
        font_badge = ImageFont.truetype("C:\\Windows\\Fonts\\segoeuib.ttf", 12)
        font_stamps = ImageFont.truetype("C:\\Windows\\Fonts\\courbd.ttf", 15)
        font_mono = ImageFont.truetype("C:\\Windows\\Fonts\\consola.ttf", 12)
    except Exception:
        font_brand = ImageFont.load_default()
        font_sub = ImageFont.load_default()
        font_badge = ImageFont.load_default()
        font_stamps = ImageFont.load_default()
        font_mono = ImageFont.load_default()

    # --- 1. CABECERA ---
    # Logotipo Emblema Dorado "CC"
    logo_x = card_x0 + 32
    logo_y = card_y0 + 26
    logo_w, logo_h = 56, 56
    draw.rounded_rectangle([logo_x, logo_y, logo_x + logo_w, logo_y + logo_h], radius=14, fill=(212, 163, 115, 230), outline=(255, 230, 190, 200), width=1)
    
    # Monograma CC en el logo
    try:
        font_cc = ImageFont.truetype("C:\\Windows\\Fonts\\georgiab.ttf", 26)
        draw.text((logo_x + 10, logo_y + 11), "CC", fill=(24, 10, 3, 255), font=font_cc)
    except Exception:
        draw.text((logo_x + 15, logo_y + 15), "CC", fill=(24, 10, 3, 255))

    # Textos de Marca
    text_x = logo_x + logo_w + 16
    draw.text((text_x, logo_y + 4), "CAFÉ CANELO", fill=(255, 245, 235, 255), font=font_brand)
    draw.text((text_x + 1, logo_y + 36), "SPECIALTY ROASTERS · CLUB DE LEALTAD", fill=(212, 163, 115, 220), font=font_sub)

    # Badge de Estado Titular (Derecha)
    badge_w, badge_h = 195, 34
    badge_x = card_x1 - badge_w - 32
    badge_y = card_y0 + 36
    draw.rounded_rectangle([badge_x, badge_y, badge_x + badge_w, badge_y + badge_h], radius=17, fill=(212, 163, 115, 30), outline=(212, 163, 115, 90), width=1)
    
    # Punto verde esmeralda activo
    draw.ellipse([badge_x + 12, badge_y + 12, badge_x + 22, badge_y + 22], fill=(16, 185, 129, 255))
    draw.text((badge_x + 30, badge_y + 9), "MIEMBRO TITULAR VIP", fill=(245, 215, 180, 255), font=font_badge)

    # --- 2. ZONA MEDIA: CHIP EMV + HOLOGRAMA ---
    chip_x = card_x0 + 36
    chip_y = logo_y + logo_h + 20
    chip_w, chip_h = 52, 40
    # Chip metálico
    draw.rounded_rectangle([chip_x, chip_y, chip_x + chip_w, chip_y + chip_h], radius=7, fill=(245, 210, 140, 240), outline=(130, 85, 30, 200), width=1)
    draw.rectangle([chip_x + 7, chip_y + 6, chip_x + chip_w - 7, chip_y + chip_h - 6], outline=(140, 95, 40, 180), width=1)
    draw.line([(chip_x + 7, chip_y + 20), (chip_x + chip_w - 7, chip_y + 20)], fill=(140, 95, 40, 180), width=1)
    draw.line([(chip_x + 26, chip_y + 6), (chip_x + 26, chip_y + chip_h - 6)], fill=(140, 95, 40, 180), width=1)

    # Holograma circular de seguridad
    holo_x = chip_x + chip_w + 18
    holo_y = chip_y
    holo_r = 20
    draw.ellipse([holo_x, holo_y, holo_x + holo_r * 2, holo_y + holo_r * 2], fill=(180, 150, 220, 140), outline=(255, 255, 255, 120), width=1)
    try:
        font_holo = ImageFont.truetype("C:\\Windows\\Fonts\\segoeuib.ttf", 9)
        draw.text((holo_x + 8, holo_y + 14), "VERIFIED", fill=(255, 255, 255, 220), font=font_holo)
    except Exception:
        pass

    # Meta de fidelidad y leyenda central
    legend_x = card_x1 - 32
    try:
        draw.text((legend_x - 310, chip_y + 4), "PROGRAMA DE SELLOS DE AUTOR", fill=(212, 163, 115, 180), font=font_sub)
        draw.text((legend_x - 310, chip_y + 20), "10 Sellos = Café de Especialidad + Croissant", fill=(255, 245, 235, 240), font=font_badge)
    except Exception:
        pass

    # --- 3. BANCADA DE SELLOS TROQUELADOS PBR (10 SELLOS) ---
    rack_x0 = card_x0 + 32
    rack_x1 = card_x1 - 32
    rack_y0 = chip_y + chip_h + 20
    rack_h = 76
    rack_w = rack_x1 - rack_x0

    # Fondo bajo relieve de la bancada de sellos
    draw.rounded_rectangle([rack_x0, rack_y0, rack_x1, rack_y0 + rack_h], radius=16, fill=(10, 4, 1, 210), outline=(212, 163, 115, 60), width=1)

    # 10 Sellos circulares
    num_stamps = 10
    stamp_diameter = 54
    slot_spacing = (rack_w - 32 - (num_stamps * stamp_diameter)) / float(num_stamps - 1)

    for s_idx in range(num_stamps):
        sx = int(rack_x0 + 16 + s_idx * (stamp_diameter + slot_spacing))
        sy = rack_y0 + 11

        # Sello #1 (Completado con estrella brillante de bienvenida)
        if s_idx == 0:
            draw.ellipse([sx, sy, sx + stamp_diameter, sy + stamp_diameter], fill=(235, 180, 110, 255), outline=(255, 235, 190, 255), width=2)
            # Dibujar estrella en el centro
            cx, cy = sx + stamp_diameter // 2, sy + stamp_diameter // 2
            # Estrella dorada
            star_points = []
            for pt in range(10):
                ang = pt * math.pi / 5.0 - math.pi / 2.0
                r = 16 if pt % 2 == 0 else 7
                star_points.append((cx + int(r * math.cos(ang)), cy + int(r * math.sin(ang))))
            draw.polygon(star_points, fill=(28, 12, 3, 255))
        # Sello #3 (Hito Galleta)
        elif s_idx == 2:
            draw.ellipse([sx, sy, sx + stamp_diameter, sy + stamp_diameter], fill=(18, 8, 2, 230), outline=(212, 163, 115, 150), width=2)
            draw.text((sx + 21, sy + 16), "3", fill=(212, 163, 115, 180), font=font_stamps)
            # Etiqueta hito
            draw.rounded_rectangle([sx + 4, sy - 9, sx + stamp_diameter - 4, sy + 4], radius=6, fill=(212, 163, 115, 230))
            try:
                font_mini = ImageFont.truetype("C:\\Windows\\Fonts\\segoeuib.ttf", 8)
                draw.text((sx + 8, sy - 8), "GALLETA", fill=(20, 8, 2, 255), font=font_mini)
            except Exception:
                pass
        # Sello #6 (Hito Bebida Fría)
        elif s_idx == 5:
            draw.ellipse([sx, sy, sx + stamp_diameter, sy + stamp_diameter], fill=(18, 8, 2, 230), outline=(212, 163, 115, 150), width=2)
            draw.text((sx + 21, sy + 16), "6", fill=(212, 163, 115, 180), font=font_stamps)
            draw.rounded_rectangle([sx + 6, sy - 9, sx + stamp_diameter - 6, sy + 4], radius=6, fill=(212, 163, 115, 230))
            try:
                font_mini = ImageFont.truetype("C:\\Windows\\Fonts\\segoeuib.ttf", 8)
                draw.text((sx + 10, sy - 8), "BEBIDA", fill=(20, 8, 2, 255), font=font_mini)
            except Exception:
                pass
        # Sello #10 (Meta Final Corona)
        elif s_idx == 9:
            draw.ellipse([sx, sy, sx + stamp_diameter, sy + stamp_diameter], fill=(45, 22, 6, 255), outline=(255, 220, 140, 255), width=2)
            draw.rounded_rectangle([sx + 6, sy - 9, sx + stamp_diameter - 6, sy + 4], radius=6, fill=(255, 220, 140, 255))
            try:
                font_mini = ImageFont.truetype("C:\\Windows\\Fonts\\segoeuib.ttf", 8)
                draw.text((sx + 9, sy - 8), "PREMIO", fill=(20, 8, 2, 255), font=font_mini)
                # Dibujar corona
                cx, cy = sx + stamp_diameter // 2, sy + stamp_diameter // 2
                draw.text((cx - 8, cy - 8), "👑", fill=(255, 220, 140, 255), font=font_mini)
            except Exception:
                pass
            draw.text((sx + 16, sy + 16), "10", fill=(255, 230, 170, 255), font=font_stamps)
        else:
            # Sellos vacíos con hendidura cóncava troquelada
            draw.ellipse([sx, sy, sx + stamp_diameter, sy + stamp_diameter], fill=(14, 6, 1, 230), outline=(212, 163, 115, 70), width=1)
            draw.text((sx + 21, sy + 16), str(s_idx + 1), fill=(212, 163, 115, 110), font=font_stamps)

    # --- 4. PIE DE TARJETA ---
    footer_y = rack_y0 + rack_h + 16
    draw.text((card_x0 + 36, footer_y), "SEDE CHAPINERO · CALLE 85 # 11-53 · BOGOTÁ D.C.", fill=(160, 130, 110, 200), font=font_mono)
    draw.text((card_x1 - 250, footer_y), "NATIVE GOOGLE WALLET PASS", fill=(212, 163, 115, 200), font=font_mono)

    final = Image.alpha_composite(base, overlay)
    
    # Guardar en public/wallet_hero_card.png y en JPG
    final.convert('RGB').save('public/wallet_hero_card.png', 'PNG', quality=95)
    final.convert('RGB').save('public/wallet_hero_card.jpg', 'JPEG', quality=95)
    print("✅ Tarjeta física renderizada con éxito en public/wallet_hero_card.png")

create_wallet_hero()
