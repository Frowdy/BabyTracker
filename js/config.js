/* ---------------------------------------------------------------------
   Verbinding en vaste gegevens.
   Deze twee sleutels zijn publiek en mogen in de broncode staan; de
   werkelijke afscherming zit in de row level security van Supabase.
   --------------------------------------------------------------------- */
export const SUPABASE_URL = 'https://ykiyocqfytgbgptzyzhi.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_mtnezdH-9jUBXI_BbuNQ7w_8j1Zvz5b';

// Voorlopig hier; later uit een eigen tabel.
export const BABY = {
  naam: 'Emily',
  geboren: new Date('2026-09-18T17:19:00')
};

/* Afbouwplan: kolfmomenten per dag en hoeveel dagen een fase standaard duurt.
   De laatste fase (0 keer kolven) heeft geen duur: dan ben je gestopt.
   Aanpassen mag; een lopend plan houdt gewoon zijn fasenummer. */
export const AFBOUW_FASES = [
  { kolven:7, dagen:3 },
  { kolven:6, dagen:3 },
  { kolven:5, dagen:3 },
  { kolven:4, dagen:4 },
  { kolven:3, dagen:4 },
  { kolven:2, dagen:4 },
  { kolven:1, dagen:4 },
  { kolven:0, dagen:null }
];

/* De vaste kolfmomenten van vóór het plan (8 per dag, jullie gemiddelde
   tijden; kolven mag een halfuur eerder of later), en de volgorde waarin
   ze vervallen. Heeft een fase 5 kolfmomenten, dan worden de eerste drie
   uit OVERSLAAN_VOLGORDE overgeslagen en vervangen door kunstvoeding.

   De volgorde: beginnen met 14:00, dan zo lang mogelijk nog een kolfmoment
   tussen twee overgeslagen momenten (laagste opbrengst eerst); daarna de
   rest, laagste opbrengst eerst. */
export const KOLFTIJDEN = ['01:30', '04:45', '08:00', '11:00', '14:00', '17:00', '20:00', '23:00'];
export const OVERSLAAN_VOLGORDE = [
  '14:00',   // gem. 74 ml
  '23:00',   // gem. 76 ml
  '04:45',   // gem. 77 ml  → tot hier zit er steeds een kolfmoment tussen
  '11:00',   // gem. 75 ml
  '20:00',   // gem. 83 ml
  '17:00',   // gem. 84 ml
  '01:30',   // gem. 86 ml
  '08:00'    // gem. 87 ml, blijft het langst
];
