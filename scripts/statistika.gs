/**
 * Vesmír na dosah – zber anonymnej štatistiky do Google Sheets
 *
 * NASTAVENIE (raz):
 * 1. Vytvor novú tabuľku Google Sheets, napr. „VR štatistika KHaP MH“.
 * 2. Rozšírenia → Apps Script. Zmaž obsah a vlož celý tento súbor. Ulož (Ctrl+S).
 * 3. Nasadiť → Nové nasadenie → typ: Webová aplikácia
 *      Spustiť ako: Ja
 *      Kto má prístup: Ktokoľvek
 *    → Nasadiť → povoľ prístup → skopíruj „URL webovej aplikácie“ (končí na /exec).
 * 4. V repozitári otvor public/content/stats.json a URL vlož do "url". Commit.
 *
 * Do hárku „data“ pribúda riadok za každého návštevníka a každý navštívený modul.
 * Prehľad: Vložiť → Kontingenčná tabuľka (riadky: modul, hodnoty: počet a priemer sekúnd).
 */
function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('data') || ss.insertSheet('data');
  if (sh.getLastRow() === 0) {
    sh.appendRow(['čas', 'zariadenie', 'návštevník č.', 'udalosť', 'modul', 'sekundy', 'kvíz', 'jazyk', 'režim', 'ovládanie']);
    sh.setFrozenRows(1);
  }
  const rows = JSON.parse(e.postData.contents || '[]').map(r => [
    new Date(r.t), r.dev, r.vis, r.ev, r.mod || '', r.sec || '', r.score != null ? r.score + ' / ' + r.of : '', r.lang, r.mode, r.input
  ]);
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return ContentService.createTextOutput('ok');
}
