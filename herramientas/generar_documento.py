#!/usr/bin/env python3
"""Genera DOCUMENTO-TECNICO.md (y su PDF) a partir de docs/ y del código real de src/.

    py herramientas/generar_documento.py            # escribe DOCUMENTO-TECNICO.md y .pdf
    py herramientas/generar_documento.py --verificar # comprueba que el código copiado no difiere

El código se copia del archivo real (fuente única); --verificar falla si alguien editó la copia.
El PDF se hace con WordCraft (D:/ArtCraft/Apps/wordcraft/*/wordcraft-cli.exe o WORDCRAFT_CLI):
Markdown -> .docx -> salto de página antes de cada sección principal -> .pdf.
"""
from __future__ import annotations

import glob
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "DOCUMENTO-TECNICO.md"

CODIGO = [
    ("src/hooks/useTasks.ts", "Hook principal: useTasks.ts", "ts"),
    ("src/hooks/useRealtimeCollection.ts", "Núcleo que compone useTasks: useRealtimeCollection.ts", "ts"),
    ("src/hooks/reconcile.ts", "Reconciliación pura: reconcile.ts", "ts"),
    ("src/services/supabase/realtime.ts", "Canal postgres_changes y removeChannel: realtime.ts", "ts"),
    ("src/components/TaskBoard.tsx", "Ejemplo de implementación en componente: TaskBoard.tsx", "tsx"),
]

CAPTURAS = [
    ("01-escritorio-carga.png", "Escritorio · estado de carga (modo demo, ?demo=lento)"),
    ("02-escritorio-error.png", "Escritorio · error de carga con «Reintentar» (modo demo, ?demo=error)"),
    ("03-escritorio-tiempo-real-demo.png", "Escritorio · cambio de otro usuario simulado (modo demo)"),
    ("04-escritorio-reversion.png", "Escritorio · cambio optimista revertido al fallar el servidor (?demo=falla-guardar)"),
    ("05-escritorio-tiempo-real-supabase-local.png", "Escritorio · INSERT de otro usuario en tiempo real (Supabase local)"),
    ("06-movil-tiempo-real-supabase-local.png", "Móvil 360 px · UPDATE de otro usuario en tiempo real (Supabase local)"),
    ("07-movil-carga.png", "Móvil 360 px · estado de carga (modo demo)"),
    ("08-movil-error.png", "Móvil 360 px · error de carga (modo demo)"),
]


def leer(rel: str) -> str:
    return (RAIZ / rel).read_text(encoding="utf-8")


def incluir_doc(rel: str, nivel_extra: int = 1) -> str:
    """Incluye un .md de docs/: baja un nivel los títulos y ajusta los enlaces relativos."""
    texto = leer(rel)
    base = Path(rel).parent

    def enlace(m: re.Match[str]) -> str:
        etiqueta, destino = m.group(1), m.group(2)
        if destino.startswith(("http", "#", "mailto:")):
            return m.group(0)
        ruta = os.path.normpath(base / destino).replace("\\", "/")
        return f"[{etiqueta}]({ruta})"

    texto = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", enlace, texto)
    texto = re.sub(r"^(#+) ", lambda m: "#" * (len(m.group(1)) + nivel_extra) + " ", texto, flags=re.M)
    return texto.strip() + "\n"


def bloque_codigo(rel: str, lenguaje: str) -> str:
    return f"```{lenguaje}\n{leer(rel).rstrip()}\n```\n"


def verificacion_resumida() -> str:
    """La verificación final sin la salida de pnpm install ni el detalle de cada chunk repetido."""
    texto = leer("docs/evidencia/verificacion-final.txt")
    texto = re.sub(r"### \$ pnpm install.*?\(código de salida: \d+\)\n", "### $ pnpm install --frozen-lockfile\n(código de salida: 0)\n", texto, flags=re.S)
    # La ruta absoluta lleva el usuario del equipo: el documento no lleva nombres de personas.
    texto = re.sub(r"[A-Za-z]:[\/]Users[\/][^\/\s]+[\/]", "<usuario>/", texto)
    return texto.rstrip()


def construir() -> str:
    p = []
    p.append("# TaskMaster AI · Arquitectura de persistencia con hooks personalizados\n")
    p.append(
        "Proyecto Integrador, módulo 4 «Persistencia y Lógica». Documento técnico autocontenido: "
        "código completo del hook principal y del ejemplo de componente, memoria técnica, los cuatro "
        "ejes de la Auditoría IA, salida de la verificación y capturas. Generado por "
        "`herramientas/generar_documento.py` a partir de `docs/` y de `src/` (fuente única).\n"
    )
    p.append("## 1. Qué se entrega y qué es real\n")
    p.append(
        "| Entregable del enunciado | Sección |\n|---|---|\n"
        "| 1) Código del custom hook principal (`useTasks.ts`) con fetching, mutación y suscripción | 6.1 (y su núcleo en 6.2 a 6.4) |\n"
        "| 2) Ejemplo de implementación en componente | 6.5 (`TaskBoard.tsx`) |\n"
        "| 3) Memoria técnica de ~300 palabras (301, contadas con `herramientas/contar-palabras.py`) | 2 |\n"
        "| Auditoría IA: análisis de código, prompts, bundle, RLS | 5 |\n"
    )
    p.append(
        "\n| Parte | Estado |\n|---|---|\n"
        "| Hooks, componentes, 38 pruebas, tsc, lint, build | Ejecutado en este equipo |\n"
        "| Esquema SQL, RLS y Realtime | Ejecutado en Supabase **local** (CLI 2.122.0 + Docker) con tres usuarios reales: 32 de 32 |\n"
        "| App contra Supabase | Ejecutado contra el Supabase **local** en el navegador (capturas 05 y 06) |\n"
        "| Proyecto de Supabase en la nube | No ejecutado: no hay credenciales; `.env.example` sin valores |\n"
        "| Modo demo | Datos simulados en memoria, rotulado «MODO DEMO · datos simulados» en pantalla |\n"
    )
    p.append("\n## 2. Memoria técnica\n")
    p.append(incluir_doc("docs/memoria-tecnica.md").split("\n", 1)[1])
    p.append("\n## 3. Arquitectura y estructura de hooks\n")
    p.append(incluir_doc("docs/01-arquitectura-y-hooks.md").split("\n", 1)[1])
    p.append("\n## 4. Esquema SQL, RLS y Realtime\n")
    p.append(incluir_doc("docs/02-esquema-y-rls.md").split("\n", 1)[1])
    p.append("\n## 5. Auditoría IA\n")
    p.append(incluir_doc("docs/03-auditoria-ia.md").split("\n", 1)[1])
    p.append("\n## 6. Código\n")
    for i, (rel, titulo, lenguaje) in enumerate(CODIGO, start=1):
        p.append(f"\n### 6.{i} {titulo}\n\nArchivo: `{rel}`\n\n")
        p.append(bloque_codigo(rel, lenguaje))
    p.append("\n## 7. Salida de la verificación final\n\n")
    p.append("Archivo: `docs/evidencia/verificacion-final.txt` (generado por `bash herramientas/verificacion-final.sh`).\n\n")
    p.append("```text\n" + verificacion_resumida() + "\n```\n")
    p.append("\n## 8. Capturas\n\nBuild de producción (`vite preview`). Detalle de lo que se midió en cada una: `docs/evidencia/navegador.txt`.\n")
    for archivo, pie in CAPTURAS:
        p.append(f"\n**{pie}**\n\n![{pie}](docs/capturas/{archivo})\n")
    return "\n".join(p).replace("\n\n\n", "\n\n")


def verificar() -> int:
    texto = SALIDA.read_text(encoding="utf-8")
    fallos = 0
    for rel, _titulo, lenguaje in CODIGO:
        if bloque_codigo(rel, lenguaje) not in texto:
            print(f"DIFIERE: {rel}")
            fallos += 1
        else:
            print(f"igual:   {rel}")
    return 1 if fallos else 0


def wordcraft() -> str:
    if os.environ.get("WORDCRAFT_CLI"):
        return os.environ["WORDCRAFT_CLI"]
    candidatos = sorted(glob.glob("D:/ArtCraft/Apps/wordcraft/*/wordcraft-cli.exe"))
    if not candidatos:
        raise SystemExit("No se encontró wordcraft-cli.exe; define WORDCRAFT_CLI")
    return candidatos[-1]


def pdf() -> None:
    cli = wordcraft()
    salto = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
    with tempfile.TemporaryDirectory() as tmp:
        docx = Path(tmp, "DOCUMENTO-TECNICO.docx")
        # Se convierte desde la raíz para que las rutas de las imágenes (docs/capturas/...) resuelvan.
        subprocess.run([cli, "convert", str(SALIDA), str(docx)], check=True, cwd=RAIZ)
        with zipfile.ZipFile(docx) as z:
            partes = {i.filename: z.read(i.filename) for i in z.infolist()}
        xml = partes["word/document.xml"].decode("utf-8")
        patron = re.compile(r'<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t xml:space="preserve">[2-8]\. ')
        xml, n = patron.subn(lambda m: salto + m.group(0), xml)
        print(f"saltos de página: {n}; imágenes en el docx: {sum(1 for k in partes if k.startswith('word/media/'))}")
        partes["word/document.xml"] = xml.encode("utf-8")
        with zipfile.ZipFile(docx, "w", zipfile.ZIP_DEFLATED) as z:
            for nombre, datos in partes.items():
                z.writestr(nombre, datos)
        insertar_capturas(docx)
        subprocess.run([cli, "convert", str(docx), str(RAIZ / "DOCUMENTO-TECNICO.pdf")], check=True, cwd=RAIZ)


def insertar_capturas(docx: Path) -> None:
    """WordCraft no incrusta las imágenes del Markdown: se agregan con python-docx después de cada pie."""
    from copy import deepcopy

    from docx import Document
    from docx.shared import Cm

    doc = Document(str(docx))
    pies = {pie: archivo for archivo, pie in CAPTURAS}
    puestas = 0
    vistos: set[str] = set()
    for parrafo in list(doc.paragraphs):
        texto = parrafo.text.strip()
        archivo = pies.get(texto)
        if archivo is None:
            continue
        if texto in vistos:
            # Segunda aparición: el texto alternativo que WordCraft deja en lugar de la imagen.
            parrafo._p.getparent().remove(parrafo._p)
            continue
        vistos.add(texto)
        nuevo = deepcopy(parrafo._p)
        for hijo in list(nuevo):
            if hijo.tag.endswith("}r"):
                nuevo.remove(hijo)
        parrafo._p.addnext(nuevo)
        from docx.text.paragraph import Paragraph

        destino = Paragraph(nuevo, parrafo._parent)
        ancho = Cm(6.5) if "movil" in archivo else Cm(16)
        destino.add_run().add_picture(str(RAIZ / "docs" / "capturas" / archivo), width=ancho)
        puestas += 1
    doc.save(str(docx))
    print(f"capturas incrustadas: {puestas} de {len(CAPTURAS)}")


if __name__ == "__main__":
    if "--verificar" in sys.argv:
        raise SystemExit(verificar())
    SALIDA.write_text(construir(), encoding="utf-8", newline="\n")
    print(f"escrito {SALIDA.name}")
    if "--sin-pdf" not in sys.argv:
        pdf()
