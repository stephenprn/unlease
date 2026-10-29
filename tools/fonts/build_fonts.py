"""
Build the app's fonts from Signika (OFL, Anna Giedrys, google/fonts ofl/signika), a variable font.
React Native cannot set variation axes: each (weight, grade) pair becomes its own file and family.
Run from the repository root; needs fontTools and brotli (pip install fonttools brotli).
"""
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tools/fonts/source/Signika[GRAD,wght].ttf"
APP_OUT = ROOT / "mobile/notes/assets/fonts"
WEB_OUT = ROOT / "web/notes/public/fonts"
# The home-screen widgets' titles, set by the app (WidgetType.kt) from font resources, the night grade under font-night.
WIDGET_OUT = ROOT / "mobile/notes/android/app/src/main/res"
WIDGET_WEIGHTS = ("Regular", "SemiBold")

WEIGHTS = {"Regular": 400, "Medium": 500, "SemiBold": 600, "Bold": 700}
GRADES = {"Signika": 0, "SignikaNight": -30}

# Latin-1 and Latin Extended-A, plus currency signs, arrows and typographic punctuation.
UNICODES = (
    list(range(0x0020, 0x0180))
    + [0x0192, 0x0218, 0x0219, 0x021A, 0x021B, 0x02C6, 0x02C7, 0x02D8, 0x02D9, 0x02DA, 0x02DB, 0x02DC, 0x02DD]
    + list(range(0x2000, 0x2070))
    + [0x2074, 0x20AC, 0x20BA, 0x20BD, 0x2113, 0x2116, 0x2122, 0x2126]
    + list(range(0x2190, 0x219A))
    + [0x2212, 0x2215, 0x2260, 0x2264, 0x2265, 0xFEFF, 0xFFFD]
)


def subset(font: TTFont) -> None:
    options = Options()
    # Running text and figures only: small caps and stylistic sets add hundreds of glyphs.
    options.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "tnum", "case", "frac", "numr", "dnom", "sups", "ordn"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.glyph_names = False
    options.hinting = False
    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)


def rename(font: TTFont, family: str, style: str) -> None:
    """Give each static file its own family, which is what React Native looks up."""
    full = f"{family}-{style}"
    names = font["name"]
    for record in list(names.names):
        if record.nameID in (1, 4, 6, 16, 17, 21, 22, 25):
            names.removeNames(nameID=record.nameID)
    names.setName(full, 1, 3, 1, 0x409)
    names.setName("Regular", 2, 3, 1, 0x409)
    names.setName(full, 4, 3, 1, 0x409)
    names.setName(full, 6, 3, 1, 0x409)
    font["OS/2"].usWeightClass = 400
    font["OS/2"].fsSelection = (font["OS/2"].fsSelection & ~0b1100001) | 0b1000000
    font["head"].macStyle = 0


def build_app() -> None:
    APP_OUT.mkdir(parents=True, exist_ok=True)
    for family, grade in GRADES.items():
        for style, weight in WEIGHTS.items():
            font = TTFont(SOURCE)
            instance = instantiateVariableFont(font, {"wght": weight, "GRAD": grade}, updateFontNames=False)
            subset(instance)
            rename(instance, family, style)
            path = APP_OUT / f"{family}-{style}.ttf"
            instance.save(path)
            print(f"{path.relative_to(ROOT)}  {path.stat().st_size // 1024} KB")


def copy_widget_fonts() -> None:
    for family, folder in (("Signika", "font"), ("SignikaNight", "font-night")):
        (WIDGET_OUT / folder).mkdir(parents=True, exist_ok=True)
        for style in WIDGET_WEIGHTS:
            path = WIDGET_OUT / folder / f"signika_{style.lower()}.ttf"
            path.write_bytes((APP_OUT / f"{family}-{style}.ttf").read_bytes())
            print(path.relative_to(ROOT))


def build_web() -> None:
    WEB_OUT.mkdir(parents=True, exist_ok=True)
    font = TTFont(SOURCE)
    subset(font)
    font.flavor = "woff2"
    path = WEB_OUT / "signika-variable.woff2"
    font.save(path)
    print(f"{path.relative_to(ROOT)}  {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    build_app()
    copy_widget_fonts()
    build_web()
