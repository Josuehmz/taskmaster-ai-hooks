#!/usr/bin/env python3
"""Cuenta las palabras de docs/memoria-tecnica.md (sin el título ni los números de la lista).

    py herramientas/contar-palabras.py
"""
import re
from pathlib import Path

texto = (Path(__file__).resolve().parent.parent / "docs" / "memoria-tecnica.md").read_text(encoding="utf-8")
cuerpo = re.sub(r"[*`#]", "", texto.split("\n", 1)[1])
tokens = re.findall(r"[\wÁÉÍÓÚáéíóúñÑüÜ<>.=:\-()'/]+", cuerpo)
palabras = [t for t in tokens if re.search(r"[\wÁÉÍÓÚáéíóúñÑ]", t) and not re.fullmatch(r"\d+\.", t)]
print(f"Memoria técnica: {len(palabras)} palabras")
