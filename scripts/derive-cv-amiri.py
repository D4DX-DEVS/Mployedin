"""
Builds the two Amiri files the CV PDF ships (public/fonts/cv/amiri-400-normal.ttf and amiri-700-normal.ttf)
from the upstream Amiri release (https://github.com/aliftype/amiri, SIL OFL 1.1, no Reserved Font Name).

What changes, and why
---------------------
react-pdf (textkit 6.3) asks fontkit to shape every run with direction "ltr", Arabic included, and positions
the glyphs from what comes back. Upstream Amiri joins letters such as meem+hah, beh+khah, jeem+hah with
cursive attachment (the GPOS "curs" feature), and fontkit applies that differently per direction: shaped
"ltr" the pair's advance collapses to 0, shaped "rtl" (how Arabic is read) it is ~660 units. In the PDF
the line is measured too narrow, right-aligned text runs ~5 pt past the margin and the next word is drawn
on top of the pair. Emptying the "curs" lookups makes both directions measure the same; the joins still
connect (the glyphs are the same) and only a sub-point vertical nudge between joined letters is lost.

The only other change is the name, because this is a modified font: "Amiri CV". The licence file stays.
src/__tests__/lib/cv/cvFontStacks.test.ts checks both properties on the shipped files.

Usage (needs `pip install fonttools`):
    python scripts/derive-cv-amiri.py <Amiri-Regular.ttf> <Amiri-Bold.ttf> [out-dir=public/fonts/cv]
"""
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

FAMILY = "Amiri CV"
POSTSCRIPT = "AmiriCV"


def derive(source: Path, destination: Path, style: str) -> None:
    font = TTFont(str(source))

    # 1. Empty the cursive-attachment lookups (the feature records stay, with no lookups).
    for record in font["GPOS"].table.FeatureList.FeatureRecord:
        if record.FeatureTag == "curs":
            record.Feature.LookupListIndex = []
            record.Feature.LookupCount = 0

    # 2. Rename: this is a modified version.
    names = {
        1: FAMILY if style in ("Regular", "Bold") else f"{FAMILY} {style}",
        3: f"{POSTSCRIPT}-{style}; derived from Amiri",
        4: f"{FAMILY} {style}",
        6: f"{POSTSCRIPT}-{style}",
        16: FAMILY,
    }
    table = font["name"]
    for record in list(table.names):
        if record.nameID in names:
            table.setName(names[record.nameID], record.nameID, record.platformID, record.platEncID, record.langID)

    destination.parent.mkdir(parents=True, exist_ok=True)
    font.save(str(destination))
    print(f"{source.name} -> {destination}")


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    regular, bold = Path(sys.argv[1]), Path(sys.argv[2])
    out = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("public/fonts/cv")
    derive(regular, out / "amiri-400-normal.ttf", "Regular")
    derive(bold, out / "amiri-700-normal.ttf", "Bold")


if __name__ == "__main__":
    main()
