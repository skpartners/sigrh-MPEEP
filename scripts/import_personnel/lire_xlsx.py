import re
import sys
import zipfile
from xml.etree import ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def lire(chemin):
    z = zipfile.ZipFile(chemin)
    partages = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            partages.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    classeur = ET.fromstring(z.read("xl/workbook.xml"))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    feuilles = {}
    for f in classeur.find("m:sheets", NS):
        cible = rels[f.get(REL)]
        cible = cible if cible.startswith("xl/") else "xl/" + cible.lstrip("/")
        lignes = []
        for r in ET.fromstring(z.read(cible)).iter("{%s}row" % NS["m"]):
            ligne = {}
            for c in r.findall("m:c", NS):
                col = re.match(r"[A-Z]+", c.get("r")).group()
                v = c.find("m:v", NS)
                t = c.get("t")
                if t == "s" and v is not None:
                    val = partages[int(v.text)]
                elif t == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter("{%s}t" % NS["m"]))
                else:
                    val = v.text if v is not None else ""
                ligne[col] = val
            lignes.append(ligne)
        feuilles[f.get("name")] = lignes
    return feuilles


if __name__ == "__main__":
    for nom, lignes in lire(sys.argv[1]).items():
        print(f"== {nom} : {len(lignes)} lignes")
        for ligne in lignes[:4]:
            print(ligne)
