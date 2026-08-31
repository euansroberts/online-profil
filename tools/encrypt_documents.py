#!/usr/bin/env python3
"""
Verschlüsselt die Bewerbungsunterlagen für das Online-Bewerbungsprofil.

Die Website liegt statisch auf GitHub Pages – jede Datei im Repository ist
also über ihre URL abrufbar. Damit die Unterlagen nicht am Login vorbei
heruntergeladen werden können, liegen im Ordner unterlagen/ nur verschlüsselte
Dateien (.enc). Erst die Seite entschlüsselt sie nach dem Login im Browser.

    Klartext:      pdf-quellen/fertig/*.pdf  (nicht im Git, nicht veröffentlicht)
    Veröffentlicht: unterlagen/*.pdf.enc      (ohne Passwort unbrauchbar)

Die Klartext-PDFs erzeugt vorher tools/build_documents.py.

Verfahren (identisch zur WebCrypto-Seite in scripts/script.js):
    Schlüssel   PBKDF2-HMAC-SHA256, 600'000 Runden, 32 Byte
    Inhalt      AES-256-GCM
    Dateiaufbau IV (12 Byte) || Ciphertext+Tag

Aufruf:  python3 tools/encrypt_documents.py '<passwort>'
"""

import os
import sys
from hashlib import pbkdf2_hmac
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT   = Path(__file__).resolve().parent.parent
SRC    = ROOT / "pdf-quellen" / "fertig"
DEST   = ROOT / "unterlagen"

ITERATIONS = 600_000
# Das Salt muss nicht geheim sein; es steht auch in scripts/script.js.
SALT_HEX   = "5c1d8f2ab7e04936a1c8d5e73f0b2647"
FILES      = [
    "IDAF_Bewerbungsdossier.pdf",
    "Lebenslauf.pdf",
    "Zeugnis.pdf",
    "Modulnotenueberblick.pdf",
    "Schulbestaetigung.pdf",
]
# Winzige Prüfdatei: lässt sie sich entschlüsseln, war das Passwort richtig.
CHECK_NAME  = "check.enc"
CHECK_PLAIN = b"IDAF-OK"


def derive_key(password: str) -> bytes:
    return pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(SALT_HEX), ITERATIONS, 32)


def encrypt(key: bytes, data: bytes) -> bytes:
    iv = os.urandom(12)
    return iv + AESGCM(key).encrypt(iv, data, None)


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 1

    key = derive_key(sys.argv[1])
    DEST.mkdir(exist_ok=True)

    (DEST / CHECK_NAME).write_bytes(encrypt(key, CHECK_PLAIN))
    print(f"{CHECK_NAME:34} Prüfdatei")

    for name in FILES:
        source = SRC / name
        if not source.exists():
            print(f"FEHLT: {source}")
            return 1
        out = DEST / f"{name}.enc"
        out.write_bytes(encrypt(key, source.read_bytes()))
        print(f"{out.name:34} {source.stat().st_size:>7} -> {out.stat().st_size:>7} Byte")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
