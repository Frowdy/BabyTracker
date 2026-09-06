/* =====================================================================
   OPSLAGLAAG — Supabase
   De zeven publieke functies houden dezelfde namen en signatures als de
   geheugenversie. Daarnaast houdt deze laag een spiegel bij (events en
   metingen), zodat app.js de gegevens synchroon kan blijven lezen.
   ===================================================================== */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- foutafhandeling ----------
   app.js registreert hier één functie; die zet het strookje bovenin. */
let melder = boodschap => console.error(boodschap);
export function zetFoutmelder(fn){ melder = fn; }

/* Elke databaseaanroep loopt hierlangs: één plek voor try/catch.
   Geeft het volledige antwoord terug, of null als er iets misging. */
async function vraag(wat, uitvoeren){
  try{
    const antwoord = await uitvoeren();
    if(antwoord.error) throw antwoord.error;
    return antwoord;
  }catch(fout){
    melder(wat + ' mislukt: ' + (fout && fout.message ? fout.message : fout));
    return null;
  }
}

export const store = {
  // Spiegel van wat er in de database staat.
  events: [],
  metingen: [],

  async lijstEvents(){
    const a = await vraag('Gegevens ophalen', () =>
      sb.from('baby_events').select('*').order('start', { ascending:false }));
    if(a) this.events = a.data || [];
    return this.events;
  },

  // id en gebruiker worden door de database gevuld, dus die sturen we niet mee.
  async voegEventToe(e){
    const a = await vraag('Opslaan', () =>
      sb.from('baby_events')
        .insert({ type:e.type, start:e.start, eind:e.eind, detail:e.detail })
        .select().single());
    if(!a) return null;
    this.events.unshift(a.data);
    return a.data;
  },

  async wijzigEvent(id, velden){
    const a = await vraag('Bijwerken', () =>
      sb.from('baby_events').update(velden).eq('id', id).select().single());
    if(!a) return null;
    const bestaand = this.events.find(x => x.id === id);
    if(bestaand) Object.assign(bestaand, a.data);
    return a.data;
  },

  async verwijderEvent(id){
    const a = await vraag('Verwijderen', () =>
      sb.from('baby_events').delete().eq('id', id));
    if(a) this.events = this.events.filter(e => e.id !== id);
  },

  async lijstMetingen(){
    const a = await vraag('Metingen ophalen', () =>
      sb.from('baby_metingen').select('*').order('datum', { ascending:true }));
    if(a) this.metingen = a.data || [];
    return this.metingen;
  },

  async voegMetingToe(m){
    const a = await vraag('Meting opslaan', () =>
      sb.from('baby_metingen')
        .insert({ datum:m.datum, gewicht:m.gewicht, lengte:m.lengte, hoofd:m.hoofd })
        .select().single());
    if(!a) return null;
    this.metingen.push(a.data);
    this.metingen.sort((x,y) => new Date(x.datum) - new Date(y.datum));
    return a.data;
  },

  async verwijderMeting(id){
    const a = await vraag('Meting verwijderen', () =>
      sb.from('baby_metingen').delete().eq('id', id));
    if(a) this.metingen = this.metingen.filter(m => m.id !== id);
  }
};

/* ---------- realtime ----------
   Elke wijziging in baby_events, ook die van de partner, komt hier binnen.
   We halen de lijst opnieuw op: eenvoudiger dan bijwerken per rij en bij
   deze hoeveelheid gegevens ruim snel genoeg. */
let kanaal = null;

export function volgEvents(bijWijziging){
  stopVolgen();
  kanaal = sb.channel('baby-events')
    .on('postgres_changes', { event:'*', schema:'public', table:'baby_events' },
        async () => { await store.lijstEvents(); bijWijziging(); })
    .subscribe();
}

export function stopVolgen(){
  if(kanaal){ sb.removeChannel(kanaal); kanaal = null; }
}
