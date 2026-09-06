/* =====================================================================
   OPSLAGLAAG
   Nu: alles in het geheugen. Straks: dezelfde vier functies, maar dan
   met Supabase erachter. De rest van de app hoeft dan niet te wijzigen.
   ===================================================================== */
const store = {
  events: [],
  metingen: [],

  async lijstEvents(){ return this.events; },

  async voegEventToe(e){
    e.id = crypto.randomUUID();
    this.events.push(e);
    // straks: await sb.from('baby_events').insert(e)
    return e;
  },

  async wijzigEvent(id, velden){
    const e = this.events.find(x => x.id === id);
    if(e) Object.assign(e, velden);
    // straks: await sb.from('baby_events').update(velden).eq('id', id)
    return e;
  },

  async verwijderEvent(id){
    this.events = this.events.filter(e => e.id !== id);
    // straks: await sb.from('baby_events').delete().eq('id', id)
  },

  async lijstMetingen(){
    return [...this.metingen].sort((a,b) => new Date(a.datum) - new Date(b.datum));
  },

  async voegMetingToe(m){
    m.id = crypto.randomUUID();
    this.metingen.push(m);
    return m;
  },

  async verwijderMeting(id){
    this.metingen = this.metingen.filter(m => m.id !== id);
  }
};

const baby = { naam:'Emily', geboren:new Date(Date.now() - 19*864e5) };

/* ---------- voorbeelddata ----------
   Hoort bij de opslaglaag: straks komen deze rijen uit Supabase.
   ----------------------------------- */
(function seed(){
  const nu = Date.now();
  const uur = h => new Date(nu - h*36e5).toISOString();

  [1.2, 4.1, 7.3, 10.5, 13.8, 17.2, 20.6, 24.4, 27.8].forEach((h,i) => {
    store.events.push({
      id:crypto.randomUUID(), type:'voeding', start:uur(h), eind:null,
      detail: i % 3 === 2 ? { bron:'fles', ml:80 + i*5 }
                          : { bron:'borst', kant: i % 2 ? 'rechts' : 'links', minuten:12 + (i%4)*3 }
    });
  });

  [0.6, 3.4, 6.8, 11.1, 15.5, 19.9, 25.2].forEach((h,i) => {
    store.events.push({
      id:crypto.randomUUID(), type:'luier', start:uur(h), eind:null,
      detail:{ soort:['nat','beide','nat','poep'][i%4] }
    });
  });

  [[2.4,1.5],[5.6,2.1],[9.2,1.4],[14.5,2.6],[21.3,1.8],[26.1,2.2]].forEach(([h,d]) => {
    store.events.push({
      id:crypto.randomUUID(), type:'slaap', start:uur(h), eind:uur(h - d), detail:{}
    });
  });

  store.events.push({ id:crypto.randomUUID(), type:'kolven', start:uur(8.4), eind:null, detail:{ ml:95 } });

  [[19,3410],[16,3280],[12,3390],[7,3620],[2,3880]].forEach(([d,g]) => {
    store.metingen.push({
      id:crypto.randomUUID(),
      datum:new Date(nu - d*864e5).toLocaleDateString('sv-SE'),
      gewicht:g,
      lengte: 50 + (19-d)*0.18,
      hoofd: 34.5 + (19-d)*0.09
    });
  });
})();
