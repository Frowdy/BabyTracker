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
  geboren: new Date('2026-08-18T00:00:00')
};
