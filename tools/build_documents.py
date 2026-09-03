#!/usr/bin/env python3
"""
Baut die Bewerbungsunterlagen aus dem Word-Export.

Quelle:  pdf-quellen/IDAF_Bewerbungsdossier.pdf   (Export aus Word, 9 Seiten)
Ziel:    pdf-quellen/fertig/*.pdf                 (Klartext, wird verschlüsselt)

Aus dem Export werden zwei Abschnitte entfernt – die ausgewählte Stellenanzeige
(Seite 2-3) und das Motivationsschreiben (Seite 6). Danach stimmen weder das
Inhaltsverzeichnis noch die gedruckten Seitenzahlen, beides wird darum neu
gesetzt: die verbleibenden Zeilen rücken auf eine saubere 22pt-Leiter zusammen
und bekommen die neuen Seitenzahlen, die Fusszeilen werden durchnummeriert.

Zusätzlich entstehen die einzelnen Dokumente (Lebenslauf, Zeugnis, ...) als
eigenständige PDFs, die bei 1 zu nummerieren beginnen.

Der Text im Inhaltsverzeichnis wird dabei nicht neu gezeichnet, sondern der
vorhandene Content-Stream bearbeitet – so bleiben Schrift (Aptos), Punktlinien
und Ausrichtung exakt wie im Word-Original.

Aufruf:  python3 tools/build_documents.py
"""

import re
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject

ROOT = Path(__file__).resolve().parent.parent
SRC  = ROOT / "pdf-quellen" / "IDAF_Bewerbungsdossier.pdf"
DEST = ROOT / "pdf-quellen" / "fertig"

BLOCK = re.compile(rb"BT\s.*?\sET", re.S)
TM    = re.compile(rb"1 0 0 1 ([\d.\-]+) ([\d.\-]+) Tm")
SHOW  = re.compile(rb"\((?:\\.|[^()\\])*\)")

FOOTER_Y = 54.275          # Grundlinie der Seitenzahl
NUM_X    = b"533.72"       # Seitenzahlen im Verzeichnis sind hier rechtsbündig
LINE     = 22.0            # Zeilenabstand im Inhaltsverzeichnis
TOP      = 670.45          # erste Zeile des Inhaltsverzeichnisses

# Seiten des Word-Exports, die wegfallen (1-basiert)
DROPPED_PAGES = [2, 3, 6]

# Verzeichniszeilen, erkannt an ihrer y-Position im Original.
# None = Zeile entfällt, sonst die Nummer der Seite im fertigen Dossier.
TOC_LINES = [
    (b"670.45", None),   # Ausgewählter Stellanzeige
    (b"648.45", 2),      # Lebenslauf
    (b"626.45", 2),      #   Personalien
    (b"604.45", 2),      #   Schulbildung
    (b"582.42", 2),      #   Sprachkenntnisse
    (b"560.42", 3),      #   Informatikkenntnisse
    (b"538.42", 3),      #   Freizeitinteressen
    (b"516.15", 3),      #   Referenzen
    (b"494.15", None),   # Motivationsschreiben
    (b"472.15", 4),      # Zeugnis
    (b"450.15", 5),      # Modulnotenüberblick
    (b"428.13", 6),      # Schulbestägigung
]

# Einzeldokumente: Datei -> Seiten des Word-Exports
SEPARATES = {
    "Lebenslauf.pdf":           [4, 5],
    "Zeugnis.pdf":              [7],
    "Modulnotenueberblick.pdf": [8],
    "Schulbestaetigung.pdf":    [9],
}


def runs(block: bytes) -> str:
    """Der sichtbare Text eines BT..ET-Blocks (Word zerlegt Wörter in Teile)."""
    return "".join(
        re.sub(rb"\\([()\\])", rb"\1", m.group(0)[1:-1]).decode("cp1252", "replace")
        for m in SHOW.finditer(block)
    )


def rebuild_toc(data: bytes) -> bytes:
    """Entfernt die wegfallenden Zeilen und setzt Position und Nummer neu."""
    survivors = [line for line in TOC_LINES if line[1] is not None]
    layout = {
        old_y: (b"%.2f" % (TOP - i * LINE), str(number).encode())
        for i, (old_y, number) in enumerate(survivors)
    }
    dropped = {old_y for old_y, number in TOC_LINES if number is None}

    def fix(match):
        block = match.group(0)
        tm = TM.search(block)
        if not tm:
            return block
        x, y = tm.group(1), tm.group(2)
        if y in dropped:
            return b"BT ET"                      # Zeile fällt weg
        if y not in layout:
            return block                         # Titel, Fusszeile: unverändert
        new_y, new_number = layout[y]
        block = block.replace(b"1 0 0 1 %s %s Tm" % (x, y),
                              b"1 0 0 1 %s %s Tm" % (x, new_y))
        if x == NUM_X:
            old = runs(block).strip()
            assert old.isdigit(), f"unerwartete Seitenzahl {old!r}"
            block = SHOW.sub(b"(%s)" % new_number, block, count=1)
        return block

    return BLOCK.sub(fix, data)


def restamp_footer(data: bytes, number: int) -> bytes:
    """Ersetzt die gedruckte Seitenzahl in der Fusszeile."""
    def fix(match):
        block = match.group(0)
        tm = TM.search(block)
        if not tm or abs(float(tm.group(2)) - FOOTER_Y) > 0.5:
            return block
        if runs(block).strip().isdigit():
            return SHOW.sub(b"(%d)" % number, block, count=1)
        return block

    return BLOCK.sub(fix, data)


def write_pdf(pages, path, title, toc_on_first=False):
    """pages: Liste (Quellseite 1-basiert, gedruckte Seitenzahl)."""
    reader, writer = PdfReader(SRC), PdfWriter()
    for source_page, number in pages:
        page = reader.pages[source_page - 1]
        data = page.get_contents().get_data()
        if toc_on_first and source_page == 1:
            data = rebuild_toc(data)
        else:
            data = restamp_footer(data, number)
        stream = DecodedStreamObject()
        stream.set_data(data)
        page.replace_contents(stream)
        if "/Annots" in page:      # Word-Verzeichnislinks zeigen ins Leere
            del page["/Annots"]
        writer.add_page(page)
    writer.add_metadata({"/Title": title, "/Author": "Euan S. Roberts"})
    with open(path, "wb") as fh:
        writer.write(fh)
    print(f"{path.name:32} {len(pages)} Seite(n)")


def main() -> int:
    DEST.mkdir(parents=True, exist_ok=True)
    kept = [n for n in range(1, len(PdfReader(SRC).pages) + 1) if n not in DROPPED_PAGES]

    write_pdf(list(zip(kept, range(1, len(kept) + 1))),
              DEST / "Bewerbungsdossier.pdf",
              "Bewerbungsdossier Euan Roberts",
              toc_on_first=True)

    for name, source_pages in SEPARATES.items():
        write_pdf(list(zip(source_pages, range(1, len(source_pages) + 1))),
                  DEST / name, f"{name[:-4]} – Euan Roberts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
