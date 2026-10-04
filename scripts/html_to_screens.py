"""Convertit les maquettes HTML en composants React (une fois)."""

from __future__ import annotations

import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / "Templates"
OUT = ROOT / "client" / "src" / "screens"

VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
}
ATTRS = {
    "class": "className",
    "for": "htmlFor",
    "tabindex": "tabIndex",
    "readonly": "readOnly",
    "maxlength": "maxLength",
    "minlength": "minLength",
    "colspan": "colSpan",
    "rowspan": "rowSpan",
    "stroke-width": "strokeWidth",
    "stroke-linecap": "strokeLinecap",
    "stroke-linejoin": "strokeLinejoin",
    "stroke-dasharray": "strokeDasharray",
    "fill-rule": "fillRule",
    "clip-rule": "clipRule",
    "clip-path": "clipPath",
    "fill-opacity": "fillOpacity",
    "stroke-opacity": "strokeOpacity",
    "font-family": "fontFamily",
    "font-size": "fontSize",
    "text-anchor": "textAnchor",
    "stop-color": "stopColor",
    "stop-opacity": "stopOpacity",
    "patternunits": "patternUnits",
    "viewbox": "viewBox",
    "preserveaspectratio": "preserveAspectRatio",
    "accent-height": "accentHeight",
    "alignment-baseline": "alignmentBaseline",
    "arabic-form": "arabicForm",
    "baseline-shift": "baselineShift",
    "cap-height": "capHeight",
    "clip-rule": "clipRule",
    "color-interpolation": "colorInterpolation",
    "color-interpolation-filters": "colorInterpolationFilters",
    "dominant-baseline": "dominantBaseline",
    "enable-background": "enableBackground",
    "flood-color": "floodColor",
    "flood-opacity": "floodOpacity",
    "font-size-adjust": "fontSizeAdjust",
    "font-stretch": "fontStretch",
    "font-style": "fontStyle",
    "font-variant": "fontVariant",
    "font-weight": "fontWeight",
    "glyph-orientation-horizontal": "glyphOrientationHorizontal",
    "glyph-orientation-vertical": "glyphOrientationVertical",
    "horiz-adv-x": "horizAdvX",
    "horiz-origin-x": "horizOriginX",
    "image-rendering": "imageRendering",
    "letter-spacing": "letterSpacing",
    "lighting-color": "lightingColor",
    "marker-end": "markerEnd",
    "marker-mid": "markerMid",
    "marker-start": "markerStart",
    "overline-position": "overlinePosition",
    "paint-order": "paintOrder",
    "panose-1": "panose1",
    "pointer-events": "pointerEvents",
    "rendering-intent": "renderingIntent",
    "shape-rendering": "shapeRendering",
    "stop-color": "stopColor",
    "strikethrough-position": "strikethroughPosition",
    "strikethrough-thickness": "strikethroughThickness",
    "stroke-dashoffset": "strokeDashoffset",
    "stroke-miterlimit": "strokeMiterlimit",
    "text-decoration": "textDecoration",
    "underline-position": "underlinePosition",
    "underline-thickness": "underlineThickness",
    "unicode-bidi": "unicodeBidi",
    "unicode-range": "unicodeRange",
    "units-per-em": "unitsPerEm",
    "v-alphabetic": "vAlphabetic",
    "v-hanging": "vHanging",
    "v-ideographic": "vIdeographic",
    "v-mathematical": "vMathematical",
    "vert-adv-y": "vertAdvY",
    "vert-origin-x": "vertOriginX",
    "vert-origin-y": "vertOriginY",
    "word-spacing": "wordSpacing",
    "writing-mode": "writingMode",
    "x-height": "xHeight",
    "xlink:href": "xlinkHref",
    "xml:space": "xmlSpace",
}
BOOLS = {"checked", "selected", "disabled", "required", "readOnly", "multiple", "hidden", "open", "autoFocus"}
DROP = {"onclick", "onsubmit", "onchange", "onload"}
ROUTES = {
    "accueil-institutionnel": "/",
    "dashboard": "/app",
    "dossier-agent": "/app/dossiers",
    "carrieres-mutations": "/app/carrieres",
    "action-sociale": "/app/action-sociale",
    "formation-continue": "/app/formation",
    "circuits-validation": "/app/circuits",
    "statistiques-rbac": "/app/circuits#rbac",
}
NAV_BASE = "flex items-center gap-3 px-3 py-2 rounded transition-colors"


class Builder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root: list = []
        self.stack: list[list] = [self.root]
        self.skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self.skip:
            self.skip += 1
            return
        if tag == "script":
            self.skip = 1
            return
        node = {"tag": tag, "attrs": attrs, "children": []}
        self.stack[-1].append(node)
        if tag not in VOID:
            self.stack.append(node["children"])

    def handle_endtag(self, tag: str) -> None:
        if self.skip:
            self.skip -= 1
            return
        if tag in VOID:
            return
        if len(self.stack) > 1:
            self.stack.pop()

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self.skip:
            return
        self.stack[-1].append({"tag": tag, "attrs": attrs, "children": []})

    def handle_data(self, data: str) -> None:
        if self.skip or not data:
            return
        self.stack[-1].append(data)

    def handle_comment(self, data: str) -> None:
        if self.skip:
            return
        text = data.strip()
        if text:
            self.stack[-1].append({"comment": text})


def camel(name: str) -> str:
    parts = name.split("-")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


def style_expr(value: str) -> str:
    obj: dict[str, str] = {}
    buf = ""
    quote = None
    for char in value:
        if char in "'\"" and quote is None:
            quote = char
            buf += char
        elif char == quote:
            quote = None
            buf += char
        elif char == ";" and quote is None:
            if buf.strip():
                key, _, raw = buf.partition(":")
                obj[camel(key.strip())] = raw.strip().strip("'\"")
            buf = ""
        else:
            buf += char
    if buf.strip() and ":" in buf:
        key, _, raw = buf.partition(":")
        obj[camel(key.strip())] = raw.strip().strip("'\"")
    return "{{ " + ", ".join(f"{key}: {json.dumps(val, ensure_ascii=False)}" for key, val in obj.items()) + " }}"


def text_node(data: str) -> str:
    if not data.strip():
        return '{" "}' if data.strip("\n\r") else ""
    escaped = data.replace("\\", "\\\\")
    if "{" in escaped or "}" in escaped or "<" in escaped:
        return "{" + json.dumps(data) + "}"
    return data


def attrs_of(node: dict) -> dict[str, str | None]:
    return {key: value for key, value in node["attrs"]}


def plain_text(node) -> str:
    if isinstance(node, str):
        return node
    if "comment" in node:
        return ""
    return "".join(plain_text(child) for child in node["children"])


def emit_attrs(node: dict, extra: list[str] | None = None) -> str:
    parts: list[str] = []
    for key, value in node["attrs"]:
        low = key.lower()
        if low in DROP or low == "data-path":
            continue
        name = ATTRS.get(low, key)
        if name in BOOLS or low in {"required", "checked", "selected", "disabled"}:
            parts.append(ATTRS.get(low, camel(low) if "-" in low else low))
            continue
        if value is None:
            parts.append(name)
            continue
        if low == "style":
            parts.append(f"style={style_expr(value)}")
            continue
        parts.append("{" + json.dumps(value, ensure_ascii=False) + "}")
        parts[-1] = f"{name}={parts[-1]}"
    if extra:
        parts.extend(extra)
    return (" " + " ".join(parts)) if parts else ""


def emit(node, indent: int, nav: bool) -> str:
    pad = "  " * indent
    if isinstance(node, str):
        rendered = text_node(node)
        return f"{pad}{rendered}\n" if rendered else ""
    if "comment" in node:
        comment = node["comment"].replace("*/", "* /")
        return f"{pad}{{/* {comment} */}}\n"
    tag = node["tag"]
    if tag in {"html", "head", "body"}:
        return "".join(emit(child, indent, nav) for child in node["children"])
    raw = attrs_of(node)
    path = raw.get("data-path")
    if tag == "a" and path in ROUTES and nav:
        route = ROUTES[path]
        end = " end" if route == "/app" else ""
        inner = "".join(emit(child, indent + 1, nav) for child in node["children"])
        return (
            f"{pad}<NavLink to={json.dumps(route)}{end}\n"
            f"{pad}  className={{({{ isActive }}) => `{NAV_BASE} ${{isActive ? \"bg-primary text-on-primary font-semibold shadow-sm\" : \"text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface\"}}`}}\n"
            f"{pad}>\n{inner}{pad}</NavLink>\n"
        )
    extra = []
    if tag == "button" and "type" not in {key.lower() for key, _ in node["attrs"]}:
        extra.append('type="button"')
    if tag == "button" and "Espace Sécurisé" in plain_text(node):
        extra.append('onClick={() => navigate("/connexion")}')
    if tag == "h2" and "Matrice" in plain_text(node):
        extra.append('id="rbac"')
    body = "".join(emit(child, indent + 1, nav) for child in node["children"])
    rendered_attrs = emit_attrs(node, extra)
    if tag in VOID:
        return f"{pad}<{tag}{rendered_attrs} />\n"
    if not body.strip():
        return f"{pad}<{tag}{rendered_attrs}></{tag}>\n"
    return f"{pad}<{tag}{rendered_attrs}>\n{body}{pad}</{tag}>\n"


def parse(html: str) -> list:
    match = re.search(r"<body[^>]*>(.*)</body>", html, flags=re.I | re.S)
    fragment = match.group(1) if match else html
    builder = Builder()
    builder.feed(fragment)
    builder.close()
    return builder.root


def find_tag(nodes: list, tag: str):
    for node in nodes:
        if isinstance(node, dict) and node.get("tag") == tag:
            return node
    return None


def write_component(path: Path, name: str, body: str, imports: list[str]) -> None:
    header = "\n".join(imports)
    path.write_text(f"{header}\n\nexport function {name}() {{\n{body}}}\n", encoding="utf-8")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    files = {
        "accueil": TEMPLATES / "accueil_institutionnel_sigrh_portefeuille_de_l_tat" / "code.html",
        "login": TEMPLATES / "connexion_s_curis_e_sigrh_c_te_d_ivoire" / "code.html",
        "dashboard": TEMPLATES / "tableau_de_bord_drh_sigrh_c_te_d_ivoire" / "code.html",
        "dossier": TEMPLATES / "dossier_agent_num_rique_sigrh_c_te_d_ivoire" / "code.html",
        "carrieres": TEMPLATES / "sd_gestion_des_carri_res_sigrh_c_te_d_ivoire" / "code.html",
        "circuits": TEMPLATES / "circuits_de_validation_matrice_rbac_sigrh" / "code.html",
    }
    parsed = {key: parse(path.read_text(encoding="utf-8")) for key, path in files.items()}

    dashboard = parsed["dashboard"]
    header = find_tag(dashboard, "header")
    aside = find_tag(dashboard, "aside")
    shell = emit(header, 2, True) + emit(aside, 2, True)
    footer = None
    main_node = None
    wrapper = None
    for node in dashboard:
        if isinstance(node, dict) and node.get("tag") == "div":
            wrapper = node
            main_node = find_tag(node["children"], "main")
            if main_node:
                footer = find_tag(main_node["children"], "footer")
    footer_jsx = emit(footer, 3, False) if footer else ""
    chrome = (
        "  return (\n"
        "    <div className=\"min-h-screen bg-background font-body-md text-body-md text-on-surface antialiased\">\n"
        f"{shell}"
        "      <div className=\"pl-72\">\n"
        "        <main className=\"relative pt-16 min-h-screen bg-background flex flex-col justify-between\">\n"
        "          {children}\n"
        f"{footer_jsx}"
        "        </main>\n"
        "      </div>\n"
        "    </div>\n"
        "  );\n"
    )
    (OUT / "AppChrome.tsx").write_text(
        'import type { ReactNode } from "react";\n'
        'import { NavLink } from "react-router-dom";\n\n'
        "export function AppChrome({ children }: { children: ReactNode }) {\n"
        f"{chrome}}}\n",
        encoding="utf-8",
    )

    def content_of(nodes: list) -> str:
        for node in nodes:
            if isinstance(node, dict) and node.get("tag") == "div":
                main = find_tag(node["children"], "main")
                if not main:
                    continue
                chunks = []
                for child in main["children"]:
                    if isinstance(child, dict) and child.get("tag") == "footer":
                        continue
                    chunks.append(emit(child, 3, False))
                return (
                    "  return (\n"
                    "    <AppChrome>\n"
                    f"{''.join(chunks)}"
                    "    </AppChrome>\n"
                    "  );\n"
                )
        raise SystemExit("contenu introuvable")

    pages = {
        "DashboardScreen": content_of(parsed["dashboard"]),
        "DossierScreen": content_of(parsed["dossier"]),
        "CarrieresScreen": content_of(parsed["carrieres"]),
        "CircuitsScreen": content_of(parsed["circuits"]),
    }
    for name, body in pages.items():
        write_component(
            OUT / f"{name}.tsx",
            name,
            body,
            ['import { AppChrome } from "./AppChrome";'],
        )

    home_body = "".join(emit(node, 2, False) for node in parsed["accueil"])
    needs_nav = "navigate(" in home_body
    home_imports = ['import { useNavigate } from "react-router-dom";'] if needs_nav else []
    hook = "  const navigate = useNavigate();\n" if needs_nav else ""
    write_component(
        OUT / "HomeScreen.tsx",
        "HomeScreen",
        hook + "  return (\n    <>\n" + home_body + "    </>\n  );\n",
        home_imports,
    )

    login_body = "".join(emit(node, 2, False) for node in parsed["login"])
    write_component(
        OUT / "LoginScreen.tsx",
        "LoginScreen",
        "  return (\n    <>\n" + login_body + "    </>\n  );\n",
        [],
    )
    print("ecrit", OUT)


if __name__ == "__main__":
    main()
