# Vesmír na dosah – KHaP MH

WebXR aplikácia (VR + AR) pre Meta Quest. Verzia 2.1: TypeScript + Vite + three.js r186 + ostré písmo (troika).

## Štruktúra
```
public/content/*.json   ← TEXTY A OBSAH (upravuj tu, netreba programovať)
public/assets/          ← panorámy, textúry planét, 3D modely (stiahne skript)
public/intro/           ← úvodné video s logom (intro.mp4), návod je v CITAJ.txt
public/data/            ← katalóg hviezd pre modul Od Zeme po galaxie
public/fonts/           ← písmo Figtree (SIL Open Font License)
src/core/               ← jadro: scéna, ovládanie, tabule, zvuky, nastavenia
src/modules/            ← jednotlivé zážitky (lobby, cosmos, solar, aurora, trips, depth, planets, phases, gravity, machines, quiz),
                          visitor = návod a režim obsluhy, brand = úvodné video a zdroje
scripts/stiahni_obsah.py← stiahne voľne dostupné obrázky a modely do public/assets
.github/workflows/      ← automatické zostavenie a nasadenie na GitHub Pages
```

## Úprava obsahu
| súbor | čo obsahuje |
|---|---|
| `ui.json` | texty tlačidiel a panela |
| `trips.json` | 360° výlety (súbor, názov, popis, zdroj; `hfov`, `yaw` = natočenie) |
| `bodies.json` | planéty a Slnko (priemer, deň, rok, zaujímavosť) |
| `features.json` | miesta na povrchu (šírka, dĺžka, názov, popis) |
| `constellations.json` | súhvezdia (hviezdy, čiary, texty troch krokov) |
| `gravity.json`, `machines.json`, `quiz.json` | gravitácia, 3D modely, kvíz (`a` = index správnej odpovede od 0) |
| `solar.json`, `aurora.json` | zastávky letu Slnečnou sústavou a polárnej žiary (text + názov nahrávky) |
| `cosmos.json` | Od Zeme po galaxie: zastávky (`z` = mierka, log10 metrov na 1 m) a zaujímavosti |
| `credits.json` | zdroje a poďakovanie (tlačidlo Zdroje) |

Každý text je v tvare `{"sk": "...", "en": "..."}`. Po zmene stačí súbor nahrať na GitHub.

## Úvodné video s logom
Súbor `public/intro/intro.mp4` (H.264 + AAC, 1920×1080, 5–15 s, do 25 MB). V okuliaroch sa prehrá vo VR pred každým
návštevníkom (dá sa vypnúť v režime obsluhy: Znelka), na počítači raz pri otvorení stránky. Bez súboru sa úvod preskočí.

## Offline
Tlačidlo **Pripraviť offline** na úvodnej stránke stiahne do pamäte okuliarov všetko potrebné (skripty, textúry, panorámy,
modely, hlas, úvodné video). Potom appka funguje aj bez Wi-Fi. Po nahratí novej verzie ho stlačte znova:
stiahnu sa len súbory, ktoré sa zmenili.

## Verzia
Číslo verzie je v `package.json` (`version`) a zobrazuje sa na úvodnej stránke, v Zdrojoch a v režime obsluhy.

## Vývoj na počítači (voliteľné)
```
npm install
npm run dev
```
Vypíše adresu typu `https://192.168.x.x:5173`. Otvor ju v Queste (rovnaká Wi-Fi), potvrď varovanie o certifikáte
a každá zmena v kóde sa v okuliaroch prejaví hneď.

## Meranie výkonu
Do Questu nainštaluj **OVR Metrics Tool** (z obchodu Meta) a zapni prekrytie: ukáže fps a záťaž počas behu appky.
Cieľ: stabilných 72 fps.

## Štatistika (voliteľné)
Anonymné údaje o návštevách (moduly, čas, kvíz, jazyk, VR/AR) sa môžu zapisovať do Google Sheets.
Postup je na začiatku súboru `scripts/statistika.gs`. Adresu skriptu vlož do `public/content/stats.json`.
Bez internetu sa záznamy ukladajú v okuliaroch a odošlú sa, keď sa pripojí.

## 3D modely
`public/assets/modely/` – modely NASA (NASA 3D Resources, voľné dielo). Curiosity a Perseverance stiahne skript.
Nový model: pridaj .glb do priečinka a záznam do `public/content/machines.json`
(`size` = skutočný rozmer v metroch, `scaleBy` = `length` / `height` / `max`, `float: true` = vznáša sa).
Popisy dielov: v `machines.json` pole `parts` – `node` (názov dielu v .glb), `keys` (kľúčové slová v názvoch)
alebo `at` ([x, y, z] od 0 do 1 v rámci rozmerov modelu, bod sa prichytí k povrchu).
