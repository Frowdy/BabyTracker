
import { BABY as baby, AFBOUW_FASES, KOLFTIJDEN, OVERSLAAN_VOLGORDE } from './config.js?v=2';
import { store, zetFoutmelder, volgEvents, volgAfbouw, stopVolgen } from './store.js?v=2';
import { bewaakSessie } from './auth.js?v=2';

/* ---------- hulpjes ---------- */
const KLEUR = { voeding:'var(--voeding)', luier:'var(--luier)', slaap:'var(--slaap)', kolven:'var(--kolven)' };
const $ = s => document.querySelector(s);

const klok = d => new Date(d).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
const dagsleutel = d => new Date(d).toLocaleDateString('sv-SE');

function geleden(d){
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if(m < 1) return 'net';
  if(m < 60) return m + 'm';
  const u = Math.floor(m/60);
  return u < 24 ? u + 'u ' + (m%60) + 'm' : Math.floor(u/24) + 'd';
}

function duur(ms){
  const m = Math.round(ms/60000);
  return m < 60 ? m + ' min' : Math.floor(m/60) + 'u ' + String(m%60).padStart(2,'0');
}

function dagnaam(sleutel){
  const vandaag = dagsleutel(new Date());
  const gisteren = dagsleutel(new Date(Date.now() - 864e5));
  if(sleutel === vandaag) return 'Vandaag';
  if(sleutel === gisteren) return 'Gisteren';
  return new Date(sleutel).toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'});
}

/* Flesvoedingen van vóór de keuze hebben geen melk-veld: dat was moedermelk. */
const melkNaam = d => d.melk === 'kunstvoeding' ? 'kunstvoeding' : 'moedermelk';

/* Standaard de melk van de laatste fles, zodat het ook op de andere telefoon meeloopt. */
function laatsteMelk(){
  const fles = store.events
    .filter(e => e.type === 'voeding' && e.detail && e.detail.bron === 'fles')
    .sort((a,b) => new Date(b.start) - new Date(a.start))[0];
  return fles && fles.detail.melk === 'kunstvoeding' ? 'kunstvoeding' : 'moedermelk';
}

function omschrijf(e){
  const d = e.detail || {};
  if(e.type === 'voeding'){
    if(d.bron === 'fles') return { titel:'Fles', sub: d.ml + ' ml · ' + melkNaam(d) };
    return { titel:'Borst ' + (d.kant === 'links' ? 'links' : 'rechts'), sub: d.minuten + ' min' };
  }
  if(e.type === 'luier') return { titel:{nat:'Luier — plas',poep:'Luier — poep',beide:'Luier — plas en poep'}[d.soort], sub:'' };
  if(e.type === 'slaap'){
    return e.eind
      ? { titel:'Slaap', sub: duur(new Date(e.eind) - new Date(e.start)) + ' · tot ' + klok(e.eind) }
      : { titel:'Slaapt nu', sub:'sinds ' + klok(e.start) };
  }
  if(e.type === 'kolven') return { titel:'Kolven', sub: d.ml + ' ml' };
  return { titel:e.type, sub:'' };
}

/* ---------- kop en tellers ---------- */
function tekenKop(){
  const dagen = Math.floor((Date.now() - baby.geboren) / 864e5);
  const wk = Math.floor(dagen/7);
  $('#naam').textContent = baby.naam;
  $('#leeftijd').innerHTML = dagen + ' dagen<br>' + (wk ? wk + ' wk ' + (dagen%7) + ' d' : 'eerste week');
}

function tekenTellers(){
  const laatste = t => store.events.filter(e => e.type === t).sort((a,b)=>new Date(b.start)-new Date(a.start))[0];
  const cel = (t, wat) => {
    const e = laatste(t);
    const w = e ? geleden(e.eind || e.start) : '—';
    return `<div class="teller ${e?'':'leeg'}">
      <div class="waarde" style="color:${e?KLEUR[t]:''}">${w}</div>
      <div class="wat">${wat}</div></div>`;
  };
  $('#tellers').innerHTML = cel('voeding','sinds voeding') + cel('luier','sinds luier') + cel('kolven','sinds kolven');

  const slaapt = store.events.find(e => e.type === 'slaap' && !e.eind);
  $('#slaapknop').classList.toggle('loopt', !!slaapt);
  $('#slaaptekst').innerHTML = slaapt
    ? 'Wakker maken<span class="sub">slaapt ' + duur(Date.now() - new Date(slaapt.start)) + '</span>'
    : 'Slaap';
}

/* ---------- tabs ---------- */
let tab = 'vandaag';

function naarTab(t){
  tab = t;
  document.querySelectorAll('nav button').forEach((b,i) =>
    b.setAttribute('aria-selected', ['vandaag','historie','groei','afbouw'][i] === t));
  teken();
}

async function tekenInhoud(){
  if(tab === 'vandaag') return tekenVandaag();
  if(tab === 'historie') return tekenHistorie();
  if(tab === 'afbouw') return tekenAfbouw();
  return tekenGroei();
}

function tekenVandaag(){
  const vandaag = store.events.filter(e => dagsleutel(e.start) === dagsleutel(new Date()));
  const voedingen = vandaag.filter(e => e.type === 'voeding');
  const luiers = vandaag.filter(e => e.type === 'luier');
  const slaapMs = vandaag.filter(e => e.type === 'slaap')
    .reduce((s,e) => s + ((e.eind ? new Date(e.eind) : new Date()) - new Date(e.start)), 0);
  const ml = voedingen.reduce((s,e) => s + (e.detail.ml || 0), 0);

  let uit = `<div class="paneel">
    <h2>Vandaag tot nu toe</h2>
    <div class="dagcijfers">
      <div><div class="n" style="color:var(--voeding)">${voedingen.length}</div><div class="l">voedingen${ml?' · '+ml+' ml':''}</div></div>
      <div><div class="n" style="color:var(--luier)">${luiers.length}</div><div class="l">luiers</div></div>
      <div><div class="n" style="color:var(--slaap)">${slaapMs ? duur(slaapMs) : '0'}</div><div class="l">geslapen</div></div>
    </div>
  </div>`;

  uit += lijstHtml(vandaag, 'Nog niets vandaag. Tik hierboven op een knop zodra er iets gebeurt.');
  $('#inhoud').innerHTML = uit;
}

function tekenHistorie(){
  const per = {};
  store.events.forEach(e => (per[dagsleutel(e.start)] ??= []).push(e));
  const dagen = Object.keys(per).sort().reverse();

  if(!dagen.length){
    $('#inhoud').innerHTML = '<div class="leegmelding">Nog geen historie.</div>';
    return;
  }

  $('#inhoud').innerHTML = dagen.map(d => {
    const v = per[d].filter(e => e.type === 'voeding').length;
    return `<div class="dagkop"><span>${dagnaam(d)}</span><span>${v} voedingen</span></div>`
      + lijstHtml(per[d], '');
  }).join('');
}

function lijstHtml(events, leeg){
  const gesorteerd = [...events].sort((a,b) => new Date(b.start) - new Date(a.start));
  if(!gesorteerd.length) return leeg ? `<div class="leegmelding">${leeg}</div>` : '';
  return gesorteerd.map(e => {
    const o = omschrijf(e);
    return `<div class="rij" style="--kleur:${KLEUR[e.type]}">
      <div class="tijd">${klok(e.start)}</div>
      <div class="omschr">${o.titel}${o.sub ? '<small>' + o.sub + '</small>' : ''}</div>
      <button class="weg" onclick="wisEvent('${e.id}')" aria-label="Verwijderen">&times;</button>
    </div>`;
  }).join('');
}

async function tekenGroei(){
  const m = await store.lijstMetingen();

  const reeksen = [
    { sleutel:'gewicht', titel:'Gewicht',     kleur:'var(--groei)',   eenheid:'kg', deel:1000, dec:3, dDec:0, dEenheid:'g'  },
    { sleutel:'lengte',  titel:'Lengte',      kleur:'var(--luier)',   eenheid:'cm', deel:1,    dec:1, dDec:1, dEenheid:'cm' },
    { sleutel:'hoofd',   titel:'Hoofdomtrek', kleur:'var(--kolven)',  eenheid:'cm', deel:1,    dec:1, dDec:1, dEenheid:'cm' }
  ];

  let uit = reeksen.map(r => {
    const punten = m.filter(x => x[r.sleutel])
                    .map(x => ({ x:new Date(x.datum), y:x[r.sleutel] }));
    return `<div class="paneel">${grafiekblok(punten, r)}</div>`;
  }).join('');

  uit += '<div class="paneel"><h2>Alle metingen</h2>';
  uit += m.length
    ? [...m].reverse().map(x => `<div class="meetrij">
        <span class="d">${new Date(x.datum).toLocaleDateString('nl-NL',{day:'numeric',month:'short'})}</span>
        <span class="v">${x.gewicht ? getal(x.gewicht/1000, 3) + ' kg' : ''}
          ${x.lengte ? '<span>' + getal(x.lengte,1) + ' cm</span>' : ''}
          ${x.hoofd ? '<span>' + getal(x.hoofd,1) + ' cm</span>' : ''}
          <button class="weg" onclick="wisMeting('${x.id}')" aria-label="Verwijderen">&times;</button>
        </span></div>`).join('')
    : '<div class="leegmelding" style="padding:16px 0">Nog niets gemeten.</div>';
  uit += '</div>';

  uit += '<button class="knop vol" onclick="opdracht(\'meting\')">Meting toevoegen</button>';
  $('#inhoud').innerHTML = uit;
}

const getal = (n, d) => n.toFixed(d).replace('.', ',');

function grafiekblok(punten, r){
  const kop = `<div class="grafiekkop">
    <h2 style="margin:0">${r.titel}</h2>`;

  if(!punten.length)
    return kop + '</div><div class="leegmelding" style="padding:14px 0 4px">Nog niet gemeten.</div>';

  const laatste = punten[punten.length - 1];
  const vorige  = punten[punten.length - 2];
  let verschil = '';
  if(vorige){
    const dv = laatste.y - vorige.y;
    const dagen = Math.max(1, Math.round((laatste.x - vorige.x) / 864e5));
    verschil = `<span class="delta" style="color:${r.kleur}">
      ${dv >= 0 ? '+' : '−'}${getal(Math.abs(dv), r.dDec)} ${r.dEenheid}
      <small>in ${dagen} ${dagen === 1 ? 'dag' : 'dagen'}</small></span>`;
  }

  const nu = `<div class="nuwaarde">${getal(laatste.y / r.deel, r.dec)}<span> ${r.eenheid}</span></div>`;

  return kop + verschil + '</div>' + nu +
    (punten.length > 1
      ? grafiek(punten, r)
      : '<div class="leegmelding" style="padding:10px 0 4px">Vanaf de tweede meting verschijnt hier de lijn.</div>');
}

function grafiek(punten, r){
  const B = 320, H = 132, lm = 40, rm = 10, tm = 12, bm = 22;   // marges
  const xs = punten.map(p => +p.x), ys = punten.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);

  // y-bereik afronden op een nette stap, zodat de aslabels leesbare getallen zijn
  const ruw = Math.max(...ys) - Math.min(...ys) || Math.max(...ys) * .05;
  const stap = netteStap(ruw / 2);
  const y0 = Math.floor((Math.min(...ys) - ruw * .25) / stap) * stap;
  const y1 = Math.ceil((Math.max(...ys) + ruw * .25) / stap) * stap;

  const px = v => lm + (x1 === x0 ? (B - lm - rm) / 2 : (v - x0) / (x1 - x0)) * (B - lm - rm);
  const py = v => H - bm - (y1 === y0 ? 0 : (v - y0) / (y1 - y0)) * (H - tm - bm);

  // horizontale hulplijnen met waarde ervoor
  let assen = '';
  for(let v = y0; v <= y1 + 1e-9; v += stap){
    const y = py(v).toFixed(1);
    assen += `<line x1="${lm}" y1="${y}" x2="${B - rm}" y2="${y}" stroke="var(--lijn)" stroke-width="1"/>
      <text x="${lm - 7}" y="${(+y + 3.5).toFixed(1)}" fill="var(--gedempt)" font-size="9.5"
        text-anchor="end" font-family="Outfit">${getal(v / r.deel, r.dec === 3 ? 2 : r.dec)}</text>`;
  }

  const co = punten.map(p => [px(+p.x), py(p.y)]);
  const lijn = co.map((c,i) => (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
  const vlak = `M${co[0][0].toFixed(1)} ${(H - bm).toFixed(1)} ` +
               co.map(c => 'L' + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ') +
               ` L${co[co.length-1][0].toFixed(1)} ${(H - bm).toFixed(1)} Z`;

  const stippen = co.map((c,i) =>
    `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${i === co.length-1 ? 4 : 2.8}"
      fill="${i === co.length-1 ? r.kleur : 'var(--paneel)'}" stroke="${r.kleur}" stroke-width="1.8"/>`).join('');

  const datum = d => new Date(d).toLocaleDateString('nl-NL',{day:'numeric',month:'short'});
  const id = 'v' + Math.random().toString(36).slice(2,8);

  return `<svg class="grafiek" viewBox="0 0 ${B} ${H}" role="img"
      aria-label="${r.titel} over tijd">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${r.kleur}" stop-opacity=".22"/>
      <stop offset="100%" stop-color="${r.kleur}" stop-opacity="0"/>
    </linearGradient></defs>
    ${assen}
    <path d="${vlak}" fill="url(#${id})"/>
    <path d="${lijn}" fill="none" stroke="${r.kleur}" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/>
    ${stippen}
    <text x="${lm}" y="${H - 6}" fill="var(--gedempt)" font-size="9.5" font-family="Outfit">${datum(x0)}</text>
    <text x="${B - rm}" y="${H - 6}" fill="var(--gedempt)" font-size="9.5"
      text-anchor="end" font-family="Outfit">${datum(x1)}</text>
  </svg>`;
}

// eerstvolgende "ronde" stap: 1, 2, 2,5 of 5 maal een macht van tien
function netteStap(ruw){
  const macht = Math.pow(10, Math.floor(Math.log10(Math.abs(ruw) || 1)));
  const rest = ruw / macht;
  return (rest <= 1 ? 1 : rest <= 2 ? 2 : rest <= 2.5 ? 2.5 : rest <= 5 ? 5 : 10) * macht;
}

/* ---------- afbouwplan ----------
   Het plan schuift nooit vanzelf door: de app rekent alleen uit waar je
   staat en geeft een suggestie. De knoppen beslissen. */
const vandaagSleutel = () => dagsleutel(new Date());
const dagenTussen = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);   // twee dagsleutels
const plusDagen = (sleutel, n) => { const d = new Date(sleutel); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0,10); };
const korteDatum = s => new Date(s + 'T12:00').toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'});
const esc = t => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const SIGNALEN = [
  { veld:'gespannen', naam:'Gespannen borsten' },
  { veld:'hard_plek', naam:'Harde/pijnlijke plek' },
  { veld:'roodheid',  naam:'Roodheid' },
  { veld:'koorts',    naam:'Koorts/grieperig' }
];

function faseInfo(plan){
  const nr = Math.min(Math.max(plan.fase, 1), AFBOUW_FASES.length);
  const f = AFBOUW_FASES[nr - 1];
  const totaal = f.dagen === null ? null : f.dagen + (plan.extra_dagen || 0);
  return {
    nr, kolven:f.kolven, totaal,
    dag: dagenTussen(plan.fase_start, vandaagSleutel()) + 1,
    laatste: nr === AFBOUW_FASES.length,
    tot: totaal === null ? null : plusDagen(plan.fase_start, totaal - 1)
  };
}

// Wat er op één dag gelogd is: kolven en flessen, uit de bestaande events.
function dagTotalen(sleutel){
  const op = store.events.filter(e => dagsleutel(e.start) === sleutel);
  const kolf = op.filter(e => e.type === 'kolven');
  const fles = op.filter(e => e.type === 'voeding' && e.detail && e.detail.bron === 'fles');
  const som = l => l.reduce((s,e) => s + (e.detail.ml || 0), 0);
  return {
    kolf: kolf.sort((a,b) => new Date(a.start) - new Date(b.start)),
    kolfMl: som(kolf),
    moedermelk: som(fles.filter(e => melkNaam(e.detail) === 'moedermelk')),
    kunstvoeding: som(fles.filter(e => melkNaam(e.detail) === 'kunstvoeding')),
    borst: op.filter(e => e.type === 'voeding' && e.detail && e.detail.bron === 'borst').length
  };
}

const signalenOp = sleutel => store.signalen.find(s => s.datum === sleutel) || {};

async function tekenAfbouw(){
  await store.laadAfbouw();
  tekenAfbouwNu();
}

function tekenAfbouwNu(){
  // niet hertekenen terwijl iemand een notitie typt: dan raak je de tekst kwijt
  if(document.activeElement && document.activeElement.id === 'notitie') return;
  const plan = store.plan;
  const uit = plan ? [
    meldingenHtml(),
    fasePaneel(plan),
    vandaagPaneel(plan),
    signalenPaneel(),
    schemaPaneel(plan),
    geschiedenisHtml(plan)
  ] : [startPaneel()];
  $('#inhoud').innerHTML = uit.join('');
}

function startPaneel(){
  return `<div class="paneel">
    <h2>Afbouwplan</h2>
    <p class="uitleg">Van kolven naar kunstvoeding, in stappen. Het plan schuift nooit vanzelf door:
      jullie bepalen wanneer de volgende fase begint. De kolfmomenten die je logt, tellen automatisch mee.</p>
  </div>
  ${schemaPaneel(null)}
  <button class="knop vol afbouwkleur" onclick="startPlan()">Start plan vandaag</button>`;
}

function meldingenHtml(){
  const s = signalenOp(vandaagSleutel());
  let uit = '';
  if(s.koorts || s.roodheid)
    uit += `<div class="melding sterk">Neem tempo terug en neem contact op met de huisarts bij koorts of een grieperig gevoel.</div>`;
  if(s.hard_plek)
    uit += `<div class="melding">Overweeg de fase te verlengen.</div>`;
  return uit;
}

function fasePaneel(plan){
  const f = faseInfo(plan);

  // suggestie, nooit een automatische stap
  let hint = '';
  if(!plan.actief){
    hint = 'Het plan is gepauzeerd. Bij hervatten gaat het verder waar het was.';
  } else if(!f.laatste){
    const gisteren = plusDagen(vandaagSleutel(), -1);
    const gisterenGekolfd = gisteren >= plan.fase_start ? dagTotalen(gisteren).kolf.length : null;
    const volgende = AFBOUW_FASES[f.nr];
    if(gisterenGekolfd !== null && gisterenGekolfd > f.kolven)
      hint = `Gisteren kolfde je ${gisterenGekolfd} keer, meer dan de ${f.kolven} van deze fase. Overweeg de fase te verlengen.`;
    else if(f.dag > f.totaal)
      hint = `De ${f.totaal} dagen van deze fase zijn voorbij. Klaar voor fase ${f.nr + 1}
        (${volgende.kolven ? volgende.kolven + '× kolven per dag' : 'stoppen met kolven'})? Jullie beslissen.`;
  }

  const balk = AFBOUW_FASES.map((_, i) =>
    `<span class="${i + 1 < f.nr ? 'klaar' : i + 1 === f.nr ? 'nu' : ''}"></span>`).join('');

  const knoppen = !plan.actief
    ? `<button class="knop vol afbouwkleur" onclick="hervatPlan()">Hervatten</button>`
    // links: volgende fase / stap terug; rechts: verlengen / inkorten
    : `<div class="knoppenrij">
        ${f.laatste ? '' : `<button class="knop vol afbouwkleur" onclick="volgendeFase()">Volgende fase</button>
        <button class="knop" onclick="verlengFase()">Fase verlengen <small>+1 dag</small></button>`}
        <button class="knop" onclick="stapTerug()" ${f.nr === 1 ? 'disabled' : ''}>Stap terug</button>
        ${f.laatste ? '' : `<button class="knop" onclick="inkortFase()" ${f.totaal <= 1 ? 'disabled' : ''}>Fase inkorten <small>−1 dag</small></button>`}
      </div>`;

  return `<div class="paneel">
    <div class="grafiekkop"><h2 style="margin:0">Afbouwplan${plan.actief ? '' : ' · gepauzeerd'}</h2>
      <span class="delta" style="color:var(--gedempt)">sinds ${korteDatum(plan.startdatum)}</span></div>
    <div class="nuwaarde">Fase ${f.nr}<span> van ${AFBOUW_FASES.length}</span></div>
    <div class="fasetekst">${f.laatste
      ? 'Gestopt met kolven'
      : `${f.kolven}× kolven per dag · dag ${f.dag} van ${f.totaal}${plan.extra_dagen > 0 ? ' (+' + plan.extra_dagen + ' verlengd)' : plan.extra_dagen < 0 ? ' (' + (-plan.extra_dagen) + ' ingekort)' : ''}
         <small>t/m ${korteDatum(f.tot)}</small>`}</div>
    <div class="fasebalk" aria-hidden="true">${balk}</div>
    ${hint ? `<div class="melding zacht">${hint}</div>` : ''}
    ${knoppen}
  </div>`;
}

const minuten = hm => { const [u,m] = hm.split(':').map(Number); return u * 60 + m; };

/* Een kolfmoment mag een halfuur eerder of later: '11:00' staat voor 10:30–11:30. */
const SPELING = 30;
const uurtekst = m => { m = (m + 1440) % 1440; return Math.floor(m / 60) + ':' + String(m % 60).padStart(2,'0'); };
const venster = t => uurtekst(minuten(t) - SPELING) + '–' + uurtekst(minuten(t) + SPELING);

/* Welke kolfmomenten vervallen bij een gepland aantal: de eerste uit de
   overslaan-volgorde. */
const overgeslagen = kolven =>
  new Set(OVERSLAAN_VOLGORDE.slice(0, Math.max(0, KOLFTIJDEN.length - kolven)));

/* De kolfmomenten van vandaag op tijd gesorteerd. Elk moment krijgt de
   kolf-logs die dichter bij hem liggen dan bij zijn buren, zodat een
   kolfbeurt wat te vroeg of te laat nog bij het goede moment hoort. */
function dagschema(kolven, logs){
  const weg = overgeslagen(kolven);
  const tijden = [...KOLFTIJDEN].sort((a,b) => minuten(a) - minuten(b));
  const opMin = logs.map(e => { const d = new Date(e.start); return { e, m:d.getHours() * 60 + d.getMinutes() }; });
  return tijden.map((t, i) => {
    const m = minuten(t);
    const van = i ? (minuten(tijden[i-1]) + m) / 2 : 0;
    const tot = i < tijden.length - 1 ? (m + minuten(tijden[i+1])) / 2 : 1440;
    return { tijd:t, m, kolven:!weg.has(t), logs:opMin.filter(x => x.m >= van && x.m < tot).map(x => x.e) };
  });
}

function vandaagPaneel(plan){
  const f = faseInfo(plan);
  const t = dagTotalen(vandaagSleutel());
  const n = t.kolf.length;

  const schema = dagschema(f.kolven, t.kolf);
  const nu = new Date().getHours() * 60 + new Date().getMinutes();
  // het moment waarvan het venster nog loopt of nog moet komen, en dat nog niet gelogd is
  const volgende = schema.find(s => s.m + SPELING > nu && !s.logs.length) || null;
  const loopt = volgende && volgende.m - SPELING <= nu;

  /* kolven: rand, gevuld zodra gelogd, tik om te loggen
     overslaan: fleskleur; toch gekolfd voor verlichting = half gevuld */
  const slots = schema.map(s => {
    const ml = s.logs.reduce((x,e) => x + (e.detail.ml || 0), 0);
    const info = s.logs.length ? `${klok(s.logs[0].start)} · ${ml} ml` : '';
    const klasse = `slot${s.kolven ? '' : ' weg'}${s.logs.length ? ' gedaan' : ''}${s === volgende ? ' volgende' : ''}`;
    const bol = s.logs.length || !s.kolven
      ? `<span class="bol" title="${info}"></span>`
      : `<button class="bol" onclick="opdracht('kolven')" aria-label="Kolfmoment ${venster(s.tijd)} loggen"></button>`;
    return `<div class="${klasse}">${bol}<span class="slottijd">${uurtekst(s.m)}</span>
      <span class="slotsoort">${s.kolven ? (s.logs.length ? ml + ' ml' : 'kolven') : (s.logs.length ? 'beetje' : 'fles')}</span></div>`;
  }).join('');

  let volgendeTekst;
  if(!f.kolven)
    volgendeTekst = 'Niet meer kolven. Druk of spanning? Een klein beetje kolven voor verlichting mag.';
  else if(volgende && !volgende.kolven)
    volgendeTekst = `<strong>${loopt ? 'Kolfmoment' : 'Volgende kolfmoment'} (${venster(volgende.tijd)}) overslaan</strong>:
      geef kunstvoeding. Druk of spanning? Een klein beetje kolven voor verlichting mag.`;
  else if(volgende)
    volgendeTekst = loopt
      ? `Nu kolven: <strong>tussen ${venster(volgende.tijd)}</strong>.`
      : `Volgende kolfmoment: <strong>${venster(volgende.tijd)}</strong>.`;
  else
    volgendeTekst = 'Alle momenten van vandaag zijn voorbij.';

  const fles = t.moedermelk + t.kunstvoeding;
  const deel = fles ? Math.round(t.moedermelk / fles * 100) : 0;

  return `<div class="paneel">
    <h2>Vandaag</h2>
    <div class="kolfregel">
      <div class="nuwaarde">${n}<span> / ${f.kolven} keer gekolfd</span></div>
      <div class="kolfml">${t.kolfMl} ml</div>
    </div>
    <div class="kolfschema" style="grid-template-columns:repeat(${schema.length},1fr)">${slots}</div>
    <div class="melding zacht">${volgendeTekst}</div>

    <div class="flesregel">
      <span><i style="background:var(--kolven)"></i>Moedermelk ${t.moedermelk} ml</span>
      <span><i style="background:var(--voeding)"></i>Kunstvoeding ${t.kunstvoeding} ml</span>
    </div>
    ${fles
      ? `<div class="verhouding" role="img" aria-label="${deel}% moedermelk">
           <span style="width:${deel}%;background:var(--kolven)"></span>
           <span style="width:${100 - deel}%;background:var(--voeding)"></span></div>`
      : '<div class="uitleg">Nog geen fles vandaag.</div>'}
    ${t.borst ? `<div class="uitleg">Aan de borst: ${t.borst} keer.</div>` : ''}
  </div>`;
}

function signalenPaneel(){
  const s = signalenOp(vandaagSleutel());
  return `<div class="paneel" style="--kleur:var(--kolven)">
    <h2>Hoe voelt het vandaag?</h2>
    <div class="keuzes signalen">
      ${SIGNALEN.map(x => `<button class="keuze" aria-pressed="${!!s[x.veld]}"
          onclick="wisselSignaal('${x.veld}')">${x.naam}</button>`).join('')}
    </div>
    <div class="veldlabel">Notitie</div>
    <textarea id="notitie" rows="2" placeholder="Optioneel" onchange="bewaarNotitie(this.value)">${esc(s.notitie || '')}</textarea>
  </div>`;
}

function schemaPaneel(plan){
  const nu = plan ? faseInfo(plan).nr : 0;
  return `<div class="paneel">
    <h2>Schema</h2>
    ${AFBOUW_FASES.map((f, i) => {
      // welke tijden er in deze fase bij komen als 'overslaan'
      const vorige = i ? overgeslagen(AFBOUW_FASES[i-1].kolven) : new Set();
      const nieuw = [...overgeslagen(f.kolven)].filter(x => !vorige.has(x)).sort((a,b) => minuten(a) - minuten(b));
      return `<div class="meetrij schemarij${i + 1 === nu ? ' nu' : i + 1 < nu ? ' klaar' : ''}">
      <span class="d">Fase ${i + 1}${nieuw.length && f.kolven ? `<small>${nieuw.map(t => uurtekst(minuten(t))).join(', ')} overslaan</small>` : ''}</span>
      <span class="v">${f.kolven ? f.kolven + '× per dag' : 'gestopt'}
        <span>${f.dagen ? f.dagen + ' dagen' : ''}</span></span></div>`;
    }).join('')}
  </div>`;
}

function geschiedenisHtml(plan){
  const vandaag = vandaagSleutel();
  const dagen = [];
  for(let d = plan.startdatum; d <= vandaag; d = plusDagen(d, 1)) dagen.push(d);
  const per = dagen.map(d => ({ d, ...dagTotalen(d) }));

  let uit = [
    { titel:'Kolfmomenten per dag', kleur:'var(--kolven)', eenheid:'',   v:x => x.kolf.length, geheel:true },
    { titel:'Gekolfd per dag',      kleur:'var(--kolven)', eenheid:'ml', v:x => x.kolfMl },
    { titel:'Kunstvoeding per dag', kleur:'var(--voeding)', eenheid:'ml', v:x => x.kunstvoeding }
  ].map(r => `<div class="paneel">${staafgrafiek(per.map(x => ({ d:x.d, v:r.v(x) })), r)}</div>`).join('');

  // eerdere dagen met een signaal of notitie, nieuwste eerst
  const eerder = store.signalen
    .filter(s => s.datum >= plan.startdatum && s.datum < vandaag &&
                 (SIGNALEN.some(x => s[x.veld]) || (s.notitie || '').trim()))
    .reverse();
  if(eerder.length){
    uit += `<div class="paneel"><h2>Eerdere signalen</h2>
      ${eerder.map(s => `<div class="signaalrij">
        <span class="d">${korteDatum(s.datum)}</span>
        <span>${SIGNALEN.filter(x => s[x.veld]).map(x => x.naam).join(', ')}
          ${(s.notitie || '').trim() ? `<small>${esc(s.notitie)}</small>` : ''}</span>
      </div>`).join('')}</div>`;
  }
  return uit;
}

function staafgrafiek(punten, r){
  const laatste = punten[punten.length - 1];
  const kop = `<div class="grafiekkop"><h2 style="margin:0">${r.titel}</h2>
    <span class="delta" style="color:${r.kleur}">vandaag ${laatste.v}${r.eenheid ? ' ' + r.eenheid : ''}</span></div>`;
  if(punten.length < 2)
    return kop + '<div class="leegmelding" style="padding:10px 0 4px">Vanaf morgen verschijnt hier het verloop.</div>';

  const B = 320, H = 120, lm = 34, rm = 8, tm = 10, bm = 22;
  const max = Math.max(...punten.map(p => p.v), 1);
  let stap = netteStap(max / 3);
  if(r.geheel) stap = Math.max(1, Math.ceil(stap));
  const top = Math.ceil(max / stap) * stap;
  const py = v => H - bm - v / top * (H - tm - bm);

  let assen = '';
  for(let v = 0; v <= top + 1e-9; v += stap){
    const y = py(v).toFixed(1);
    assen += `<line x1="${lm}" y1="${y}" x2="${B - rm}" y2="${y}" stroke="var(--lijn)" stroke-width="1"/>
      <text x="${lm - 7}" y="${(+y + 3.5).toFixed(1)}" fill="var(--gedempt)" font-size="9.5"
        text-anchor="end" font-family="Outfit">${getal(v, 0)}</text>`;
  }

  const vak = (B - lm - rm) / punten.length;
  const breed = Math.min(18, vak * .62);
  const staven = punten.map((p, i) => {
    const x = lm + vak * i + (vak - breed) / 2, y = py(p.v);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${breed.toFixed(1)}"
      height="${(H - bm - y).toFixed(1)}" rx="2" fill="${r.kleur}"
      opacity="${i === punten.length - 1 ? .55 : 1}"><title>${korteDatum(p.d)}: ${p.v}${r.eenheid ? ' ' + r.eenheid : ''}</title></rect>`;
  }).join('');

  const datum = s => new Date(s + 'T12:00').toLocaleDateString('nl-NL',{day:'numeric',month:'short'});
  return kop + `<svg class="grafiek" viewBox="0 0 ${B} ${H}" role="img" aria-label="${r.titel}">
    ${assen}${staven}
    <text x="${lm}" y="${H - 6}" fill="var(--gedempt)" font-size="9.5" font-family="Outfit">${datum(punten[0].d)}</text>
    <text x="${B - rm}" y="${H - 6}" fill="var(--gedempt)" font-size="9.5"
      text-anchor="end" font-family="Outfit">vandaag</text>
  </svg>`;
}

/* knoppen: elke stap zet de fase-start op vandaag en wist de verlenging */
const nieuweFase = nr => store.wijzigPlan({ fase:nr, fase_start:vandaagSleutel(), extra_dagen:0 });

async function startPlan(){ await store.startPlan(vandaagSleutel()); tekenAfbouwNu(); }
async function volgendeFase(){ await nieuweFase(Math.min(faseInfo(store.plan).nr + 1, AFBOUW_FASES.length)); tekenAfbouwNu(); }
async function stapTerug(){ await nieuweFase(Math.max(faseInfo(store.plan).nr - 1, 1)); tekenAfbouwNu(); }
async function verlengFase(){ await store.wijzigPlan({ extra_dagen:(store.plan.extra_dagen || 0) + 1 }); tekenAfbouwNu(); }
// inkorten mag tot een fase van één dag; extra_dagen wordt dan negatief
async function inkortFase(){
  if(faseInfo(store.plan).totaal <= 1) return;
  await store.wijzigPlan({ extra_dagen:(store.plan.extra_dagen || 0) - 1 });
  tekenAfbouwNu();
}
// er is geen pauzeknop meer; alleen een plan dat ooit gepauzeerd is, kan hiermee verder
async function hervatPlan(){ await store.wijzigPlan({ actief:true }); tekenAfbouwNu(); }

async function wisselSignaal(veld){
  const s = signalenOp(vandaagSleutel());
  await store.bewaarSignalen(vandaagSleutel(), { [veld]:!s[veld] });
  tekenAfbouwNu();
}

async function bewaarNotitie(tekst){
  await store.bewaarSignalen(vandaagSleutel(), { notitie:tekst.trim() || null });
}

/* ---------- invoerschermen ---------- */
let concept = {};

const hhmm = d => String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');

function opdracht(soort){
  const nu = new Date();
  const tijdveld = `<div class="veldlabel">Tijdstip</div>
    <input type="time" id="tijd" value="${hhmm(nu)}">`;

  if(soort === 'voeding'){
    concept = { bron:'borst', kant:'links', minuten:15, ml:90, melk:laatsteMelk() };
    const kunst = concept.melk === 'kunstvoeding';
    open('Voeding', 'var(--voeding)', `
      <div class="veldlabel">Waarmee</div>
      <div class="keuzes" id="bron">
        <button class="keuze" aria-pressed="true" onclick="kies('bron','borst',this)">Borst</button>
        <button class="keuze" aria-pressed="false" onclick="kies('bron','fles',this)">Fles</button>
      </div>
      <div id="borstvelden">
        <div class="veldlabel">Kant</div>
        <div class="keuzes">
          <button class="keuze" aria-pressed="true" onclick="kies('kant','links',this)">Links</button>
          <button class="keuze" aria-pressed="false" onclick="kies('kant','rechts',this)">Rechts</button>
        </div>
        <div class="veldlabel">Duur in minuten</div>
        <input type="number" id="minuten" value="15" min="1" max="120" inputmode="numeric">
      </div>
      <div id="flesvelden" style="display:none">
        <div class="veldlabel">Soort melk</div>
        <div class="keuzes">
          <button class="keuze" aria-pressed="${!kunst}" onclick="kies('melk','moedermelk',this)">Moedermelk</button>
          <button class="keuze" aria-pressed="${kunst}" onclick="kies('melk','kunstvoeding',this)">Kunstvoeding</button>
        </div>
        <div class="veldlabel">Hoeveelheid in ml</div>
        <input type="number" id="ml" value="90" min="5" max="400" step="5" inputmode="numeric">
      </div>
      ${tijdveld}`, bewaarVoeding);
  }

  if(soort === 'slaap'){
    open('Slaap achteraf', 'var(--slaap)', `
      <div class="tweekolom">
        <div><div class="veldlabel">Van</div>
          <input type="time" id="van" value="${hhmm(new Date(nu - 90*60000))}" oninput="werkSlaapduurBij()"></div>
        <div><div class="veldlabel">Tot</div>
          <input type="time" id="tot" value="${hhmm(nu)}" oninput="werkSlaapduurBij()"></div>
      </div>
      <div class="duurhint" id="duurhint"></div>`, bewaarSlaap);
    werkSlaapduurBij();
  }

  if(soort === 'luier'){
    concept = { soort:'nat' };
    open('Luier', 'var(--luier)', `
      <div class="veldlabel">Wat zat erin</div>
      <div class="keuzes">
        <button class="keuze" aria-pressed="true" onclick="kies('soort','nat',this)">Plas</button>
        <button class="keuze" aria-pressed="false" onclick="kies('soort','poep',this)">Poep</button>
        <button class="keuze" aria-pressed="false" onclick="kies('soort','beide',this)">Allebei</button>
      </div>
      ${tijdveld}`, async () => {
        await store.voegEventToe({ type:'luier', start:metTijd(), eind:null, detail:{ soort:concept.soort } });
      });
  }

  if(soort === 'kolven'){
    open('Kolven', 'var(--kolven)', `
      <div class="veldlabel">Hoeveelheid in ml</div>
      <input type="number" id="ml" value="80" min="5" max="400" step="5" inputmode="numeric">
      ${tijdveld}`, async () => {
        await store.voegEventToe({ type:'kolven', start:metTijd(), eind:null, detail:{ ml:+$('#ml').value } });
      });
  }

  if(soort === 'meting'){
    open('Meting', 'var(--groei)', `
      <div class="veldlabel">Datum</div>
      <input type="date" id="datum" value="${dagsleutel(new Date())}">
      <div class="tweekolom">
        <div><div class="veldlabel">Gewicht in gram</div>
          <input type="number" id="gewicht" placeholder="3450" inputmode="numeric"></div>
        <div><div class="veldlabel">Lengte in cm</div>
          <input type="number" id="lengte" placeholder="52" step="0.5" inputmode="decimal"></div>
      </div>
      <div class="veldlabel">Hoofdomtrek in cm</div>
      <input type="number" id="hoofd" placeholder="35" step="0.5" inputmode="decimal">`, async () => {
        const g = +$('#gewicht').value, l = +$('#lengte').value, h = +$('#hoofd').value;
        if(!g && !l && !h) return;
        await store.voegMetingToe({ datum:$('#datum').value, gewicht:g||null, lengte:l||null, hoofd:h||null });
      });
  }
}

function metTijd(){
  const v = $('#tijd');
  if(!v) return new Date().toISOString();
  const [u,m] = v.value.split(':').map(Number);
  const d = new Date();
  d.setHours(u, m, 0, 0);
  if(d > new Date()) d.setDate(d.getDate() - 1);   // ingevoerde tijd ligt in de toekomst → gisteravond
  return d.toISOString();
}

/* Beide tijden staan op vandaag. Ligt het einde in de toekomst, dan ging het
   om gisteren; is het einde niet later dan het begin, dan liep de slaap door
   middernacht heen en begon hij een dag eerder. */
function slaapPeriode(){
  const van = $('#van'), tot = $('#tot');
  if(!van || !tot || !van.value || !tot.value) return null;

  const opTijd = w => {
    const [u,m] = w.split(':').map(Number);
    const d = new Date();
    d.setHours(u, m, 0, 0);
    return d;
  };

  const nu = new Date();
  const start = opTijd(van.value), eind = opTijd(tot.value);
  if(eind > nu){ start.setDate(start.getDate() - 1); eind.setDate(eind.getDate() - 1); }
  if(eind <= start) start.setDate(start.getDate() - 1);
  return { start, eind };
}

function werkSlaapduurBij(){
  const hint = $('#duurhint');
  if(!hint) return;
  const p = slaapPeriode();
  if(!p){ hint.textContent = 'Vul beide tijden in.'; return; }
  const overNacht = dagsleutel(p.start) !== dagsleutel(p.eind);
  hint.innerHTML = '<strong>' + duur(p.eind - p.start) + '</strong> geslapen'
    + (overNacht ? ' · van ' + dagnaam(dagsleutel(p.start)).toLowerCase() + ' op '
                             + dagnaam(dagsleutel(p.eind)).toLowerCase() : '');
}

async function bewaarSlaap(){
  const p = slaapPeriode();
  if(!p) return;
  await store.voegEventToe({
    type:'slaap', start:p.start.toISOString(), eind:p.eind.toISOString(), detail:{}
  });
}

async function bewaarVoeding(){
  const detail = concept.bron === 'fles'
    ? { bron:'fles', melk:concept.melk, ml:+$('#ml').value }
    : { bron:'borst', kant:concept.kant, minuten:+$('#minuten').value };
  await store.voegEventToe({ type:'voeding', start:metTijd(), eind:null, detail });
}

function kies(veld, waarde, knop){
  concept[veld] = waarde;
  [...knop.parentElement.children].forEach(b => b.setAttribute('aria-pressed', b === knop));
  if(veld === 'bron'){
    $('#borstvelden').style.display = waarde === 'borst' ? '' : 'none';
    $('#flesvelden').style.display  = waarde === 'fles'  ? '' : 'none';
  }
}

let bewaarActie = null;

function open(titel, kleur, velden, actie){
  bewaarActie = actie;
  $('#sheet').style.setProperty('--kleur', kleur);
  $('#sheet').innerHTML = `<h3>${titel}</h3>${velden}
    <div class="sheetknoppen">
      <button class="annuleer" onclick="sluit()">Annuleren</button>
      <button class="bewaar" onclick="bewaar()">Opslaan</button>
    </div>`;
  $('#overlay').classList.add('open');
}

function sluit(){ $('#overlay').classList.remove('open'); bewaarActie = null; }

async function bewaar(){
  if(bewaarActie) await bewaarActie();
  sluit();
  teken();
}

/* ---------- slaap ---------- */
async function slaapWissel(){
  const loopt = store.events.find(e => e.type === 'slaap' && !e.eind);
  if(loopt) await store.wijzigEvent(loopt.id, { eind:new Date().toISOString() });
  else await store.voegEventToe({ type:'slaap', start:new Date().toISOString(), eind:null, detail:{} });
  teken();
}

async function wisEvent(id){ await store.verwijderEvent(id); teken(); }
async function wisMeting(id){ await store.verwijderMeting(id); teken(); }

/* ---------- tekenen ---------- */
function teken(){ tekenKop(); tekenTellers(); tekenInhoud(); }

/* ---------- thema ---------- */
const ZON  = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>';
const MAAN = '<svg viewBox="0 0 24 24"><path d="M20 14a8 8 0 0 1-10.6-10.4A8.2 8.2 0 1 0 20 14z"/></svg>';

function zetThema(t){
  document.documentElement.dataset.thema = t;
  document.querySelector('meta[name=theme-color]').content = t === 'donker' ? '#111823' : '#DCE2E7';
  $('#themaknop').innerHTML = t === 'donker' ? ZON : MAAN;
}

function themaWissel(){
  zetThema(document.documentElement.dataset.thema === 'donker' ? 'licht' : 'donker');
}

zetThema(matchMedia('(prefers-color-scheme: light)').matches ? 'licht' : 'donker');

/* ---------- meldingen ---------- */
let foutTimer = null;

function toonFout(boodschap){
  const strook = $('#foutstrook');
  strook.textContent = boodschap;
  strook.hidden = false;
  clearTimeout(foutTimer);
  foutTimer = setTimeout(() => { strook.hidden = true; }, 8000);
}

$('#foutstrook').addEventListener('click', () => { $('#foutstrook').hidden = true; });

/* ---------- eerste keer laden ---------- */
async function laadEerst(){
  tekenKop();
  $('#tellers').innerHTML = '';
  $('#inhoud').innerHTML = '<div class="leegmelding">Bezig met laden…</div>';
  await Promise.all([store.lijstEvents(), store.lijstMetingen()]);
  teken();
}

/* De knoppen in de HTML roepen deze functies via onclick aan; een module
   heeft geen globale scope, dus zetten we ze er zelf in. */
Object.assign(window, {
  naarTab, opdracht, kies, sluit, bewaar,
  slaapWissel, werkSlaapduurBij, wisEvent, wisMeting, themaWissel,
  startPlan, volgendeFase, verlengFase, inkortFase, stapTerug, hervatPlan,
  wisselSignaal, bewaarNotitie
});

/* ---------- starten ---------- */
zetFoutmelder(toonFout);

bewaakSessie({
  bijInloggen(){
    laadEerst();
    volgEvents(teken);          // wijziging van de partner: opnieuw tekenen
    volgAfbouw(() => { if(tab === 'afbouw') tekenAfbouwNu(); });
  },
  bijUitloggen(){
    stopVolgen();
    store.events = [];
    store.metingen = [];
    store.plan = null;
    store.signalen = [];
    tab = 'vandaag';
    sluit();
  }
});

setInterval(() => {
  if($('#app').hidden) return;
  tekenTellers();
  if(tab === 'vandaag') tekenVandaag();
  if(tab === 'afbouw') tekenAfbouwNu();
}, 30000);
