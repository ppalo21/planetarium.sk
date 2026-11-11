# Údržba appky Vesmír na dosah

Appka je postavená tak, aby vydržala roky bez zásahu: nemá server, databázu ani účty. Je to sada statických súborov
na GitHub Pages; okuliare si ich uložia a fungujú offline.

## Čo robiť pravidelne
| Kedy | Čo |
|---|---|
| Po každej aktualizácii Questu (alebo raz za štvrťrok) | Prejsť kontrolný zoznam nižšie. |
| Po nahratí zmien na GitHub | V okuliaroch otvoriť appku na Wi-Fi a stlačiť **Pripraviť offline**. |
| Raz ročne | Skontrolovať fakty v `public/content/*.json` (počty mesiacov, misie, dátumy). |

## Kontrolný zoznam (10 minút v okuliaroch)
1. Appka sa spustí a prejde do VR, prehrá sa úvod s logom.
2. Návod: štipnutie Zeme, tlačidlo „Rozumiem, poďme“.
3. Každý zážitok sa otvorí, šípky a Domov fungujú, nič neseká.
4. Od Zeme po galaxie: zoom dvoma rukami, Mliečna cesta zhora aj z boku.
5. Polárna žiara: všetkých 6 krokov.
6. Vypnúť Wi-Fi, appku zavrieť a otvoriť: všetko musí fungovať aj offline.
7. Režim obsluhy (5× ťuknúť na logo v ponuke): nastavenia sa uložia.

## Zmena obsahu bez programovania
Texty, kvíz, zastávky a zoznam modelov sú v `public/content/*.json` (vždy `sk` aj `en`). Po úprave stačí súbor nahrať na GitHub.
Hlasový komentár: nahrávky podľa `NAHRAVKY.md` do `public/audio/sk/` a `public/audio/en/`.

## Čo sa môže časom pokaziť a ako to opraviť
- **Prehliadač Questu zmení správanie WebXR.** Appka používa len štandardné rozhrania (WebXR, hand-tracking, hit-test).
  Ak niečo prestane fungovať, väčšinou stačí aktualizovať knižnicu three.js (`npm update three`, potom `npm run build` a vyskúšať).
- **Knižnice.** Verzie sú zamknuté v `package-lock.json`, takže zostavenie dá aj o roky rovnaký výsledok.
  Aktualizovať ich treba len pri probléme, nie preventívne.
- **GitHub Pages.** Ak by služba skončila, celý priečinok `dist/` (po `npm run build`) sa dá nahrať na ľubovoľný webhosting s HTTPS.
  V nainštalovanej appke (APK) by potom bolo treba zmeniť adresu a zostaviť ju znova.
- **Podpisový kľúč APK** (`android.keystore` + heslo): zálohovať na dve miesta. Bez neho sa nainštalovaná appka nedá aktualizovať.

## Štruktúra
- `src/core/` – jadro: spustenie VR, vstup (ruky, ovládače, myš), lišta, zvuk, nastavenia.
- `src/modules/` – jednotlivé zážitky; každý je samostatný súbor s funkciami `build`, `enter`, `exit`, `update`.
- `public/` – obsah, textúry, modely, písma, offline režim (`sw.js`).
- Nový zážitok = nový súbor v `src/modules/`, zápis v `src/main.ts` a položka v `src/modules/lobby.ts`.

## Verzie
Číslo je v `package.json`. Zobrazuje sa na úvodnej stránke, v Zdrojoch a v režime obsluhy – podľa neho sa dá overiť,
či okuliare majú poslednú verziu.
