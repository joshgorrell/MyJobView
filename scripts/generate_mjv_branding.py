from PIL import Image, ImageDraw, ImageFilter, ImageFont
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
assets = root / "mobile/assets"
native = root / "mobile/ios/MyJobView/Images.xcassets"
source = assets / "MJV_icon_1024_x_1024_for_IOS.png"
logo = Image.open(source).convert("RGBA")
# Preserve the exact official icon artwork.
icon = logo.resize((1024, 1024), Image.Resampling.LANCZOS).convert("RGB")
icon.save(assets / "icon.png")
icon.save(native / "AppIcon.appiconset/App-Icon-1024x1024@1x.png")
# Full-screen dark splash art: glowing blue perimeter, official icon, app name.
W, H = 1170, 2532
im = Image.new("RGBA", (W, H), (0, 2, 9, 255))
glow = Image.new("RGBA", (W, H))
g = ImageDraw.Draw(glow)
for inset, alpha, width in [(28, 190, 6), (34, 240, 5)]:
    g.rounded_rectangle((inset, inset, W-inset, H-inset), radius=125, outline=(0, 186, 255, alpha), width=width)
blur = glow.filter(ImageFilter.GaussianBlur(28))
im = Image.alpha_composite(im, blur)
im = Image.alpha_composite(im, glow)
# Put the supplied logo in the center; do not redraw it.
sz = 555
mark = logo.resize((sz, sz), Image.Resampling.LANCZOS)
im.alpha_composite(mark, ((W-sz)//2, 810))
draw = ImageDraw.Draw(im)
fonts = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"]
font = next((ImageFont.truetype(p, 95) for p in fonts if Path(p).exists()), ImageFont.load_default())
name = "MyJobView"
bbox = draw.textbbox((0, 0), name, font=font)
draw.text(((W-(bbox[2]-bbox[0]))/2, 1475), name, font=font, fill=(239, 248, 255, 255))
# Native splash uses the same full-height graphic with scaleAspectFit.
im.convert("RGB").save(assets / "splash.png", optimize=True)
im.convert("RGB").save(native / "SplashScreen.imageset/image.png", optimize=True)
# Dark background replaces the previous blue launch background.
Image.new("RGB", (4, 4), (0, 2, 9)).save(native / "SplashScreenBackground.imageset/image.png")
print("Generated official MyJobView icon and black/cyan splash assets.")
