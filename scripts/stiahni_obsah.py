#!/usr/bin/env python3
"""
Vesmír na dosah – stiahnutie voľne dostupných obrázkov a modelov
Spustenie:   pip install pillow
             python stiahni_obsah.py
Stiahne panorámy (NASA, ESO), textúry planét (Solar System Scope)
a 3D model roveru Curiosity (NASA) do priečinka assets/ a zmenší ich
na veľkosť vhodnú pre Meta Quest 3.
"""
import os, sys, io, urllib.request

try:
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
except ImportError:
    print("Chýba knižnica Pillow. Spustite:  pip install pillow")
    sys.exit(1)

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")
UA = {"User-Agent": "KHaP-MH-VesmirNaDosah/1.0 (planetarium education project)"}
PANO_BUDGET = 18_000_000   # max. počet pixelov panorámy (cca 6000 x 3000)
PANO_MAXW = 8192

SSS = "https://www.solarsystemscope.com/textures/download/"
ITEMS = [
    # (cieľový súbor, [zdroje – skúšajú sa po poradí], typ)
    ("assets/pano/mars-jezero.jpg", [
        "https://d2pn8kiwq2w21t.cloudfront.net/original_images/jpegPIA24264.jpg",
        "https://photojournal.jpl.nasa.gov/jpeg/PIA24264.jpg",
        "https://photojournal.jpl.nasa.gov/jpeg/PIA24422.jpg"], "pano"),
    ("assets/pano/apollo17.jpg", [
        "https://commons.wikimedia.org/wiki/Special:FilePath/Apollo_17_Moon_Panorama.jpg"], "pano"),
    ("assets/pano/paranal.jpg", [
        "https://cdn.eso.org/images/large/165309674464e758889a6_eq-ext.jpg",
        "https://cdn.eso.org/images/publicationjpg/165309674464e758889a6_eq-ext.jpg"], "pano"),
    ("assets/pano/mliecna-cesta.jpg", [
        "https://cdn.eso.org/images/large/eso0932a.jpg",
        "https://cdn.eso.org/images/publicationjpg/eso0932a.jpg"], "pano"),
    ("assets/modely/curiosity.glb", [
        "https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/c/Curiosity_static.glb"], "raw"),
] + [
    (f"assets/planety/{n}", [SSS + n], "tex") for n in [
        "2k_sun.jpg", "2k_mercury.jpg", "2k_venus_atmosphere.jpg", "2k_earth_daymap.jpg",
        "2k_moon.jpg", "2k_mars.jpg", "2k_jupiter.jpg", "2k_saturn.jpg",
        "2k_saturn_ring_alpha.png", "2k_uranus.jpg", "2k_neptune.jpg"]
]

def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()

def save_image(data, dest, kind):
    im = Image.open(io.BytesIO(data))
    w, h = im.size
    if kind == "pano":
        scale = min(1.0, PANO_MAXW / w, (PANO_BUDGET / (w * h)) ** 0.5)
    else:
        scale = min(1.0, 2048 / w)
    if scale < 1.0:
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    if dest.lower().endswith(".png"):
        im.save(dest, optimize=True)
    else:
        im.convert("RGB").save(dest, "JPEG", quality=88, progressive=True, optimize=True)
    return im.size

def main():
    ok, fail = 0, []
    for rel, urls, kind in ITEMS:
        dest = os.path.join(HERE, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if os.path.exists(dest):
            print(f"[preskakujem] {rel} už existuje"); ok += 1; continue
        done = False
        for u in urls:
            try:
                print(f"[sťahujem]  {rel}\n            {u}")
                data = get(u)
                if kind == "raw":
                    open(dest, "wb").write(data); print(f"            hotovo, {len(data)//1024} kB")
                else:
                    size = save_image(data, dest, kind); print(f"            hotovo, {size[0]} x {size[1]} px")
                done = True; ok += 1; break
            except Exception as e:
                print(f"            chyba: {e}")
        if not done:
            fail.append(rel)
    print(f"\nHotovo: {ok} z {len(ITEMS)} súborov.")
    if fail:
        print("Nepodarilo sa stiahnuť (pozri ZDROJE.txt, kde ich nájdete ručne):")
        for f in fail: print("  -", f)
    print("\nVlastná 360° fotka hvezdárne: uložte ju ako assets/pano/khap.jpg")

if __name__ == "__main__":
    main()
