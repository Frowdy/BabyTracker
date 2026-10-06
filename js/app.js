
import { BABY as baby, AFBOUW_FASES, KOLFTIJDEN, OVERSLAAN_VOLGORDE, VOEDING } from './config.js?v=6';
import { store, zetFoutmelder, volgEvents, volgAfbouw, stopVolgen } from './store.js?v=6';
import { bewaakSessie } from './auth.js?v=6';
import { sdScore, gewichtBijSd, MIN_LEEFTIJD, MAX_LEEFTIJD, BRON } from './groeicurve.js?v=6';

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
const mmIn = d => melkNaam(d) === 'moedermelk'   ? (d.ml || 0) : 0;
const kvIn = d => melkNaam(d) === 'kunstvoeding' ? (d.ml || 0) : 0;

/* Standaard de melk van de laatste fles, zodat het ook op de andere telefoon meeloopt. */
function laatsteMelk(){
  const fles = store.events
    .filter(e => e.type === 'voeding' && e.detail && e.detail.bron === 'fles')
    .sort((a,b) => new Date(b.start) - new Date(a.start))[0];
  return fles ? melkNaam(fles.detail) : 'moedermelk';
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
    b.setAttribute('aria-selected', ['vandaag','historie','groei','voeding','afbouw'][i] === t));
  teken();
}

async function tekenInhoud(){
  if(tab === 'vandaag') return tekenVandaag();
  if(tab === 'historie') return tekenHistorie();
  if(tab === 'voeding'){ await store.laadAfbouw(); return tekenVoeding(); }
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
    { sleutel:'lengte',  titel:'Lengte',      kleur:'var(--luier)',   eenheid:'cm', deel:1,    dec:1, dDec:1, dEenheid:'cm' },
    { sleutel:'hoofd',   titel:'Hoofdomtrek', kleur:'var(--kolven)',  eenheid:'cm', deel:1,    dec:1, dDec:1, dEenheid:'cm' }
  ];

  let uit = groeicurvePaneel() + reeksen.map(r => {
    const punten = m.filter(x => x[r.sleutel])
                    .map(x => ({ x:new Date(x.datum), y:x[r.sleutel] }));
    return `<div class="paneel">${grafiekblok(punten, r)}</div>`;
  }).join('');

  const perWeging = Object.fromEntries(wegingen().map((p, i) => [p.id, i ? p : { ...p, geboorte:true }]));
  const extra = x => {
    const p = perWeging[x.id];
    if(!p) return '';
    const delen = [p.geboorte ? 'geboortegewicht' : '', p.z !== null ? sdTekst(p.z) : '',
      p.pct !== null ? (p.pct >= 0 ? '+' : '−') + Math.abs(p.pct) + '% t.o.v. geboorte' : ''].filter(Boolean);
    return delen.length ? `<small>${delen.join(' · ')}</small>` : '';
  };

  uit += '<div class="paneel"><h2>Alle metingen</h2>';
  uit += m.length
    ? [...m].reverse().map(x => `<div class="meetrij">
        <span class="d">${new Date(x.datum).toLocaleDateString('nl-NL',{day:'numeric',month:'short'})}${extra(x)}</span>
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

/* ---------- groeicurve gewicht ----------
   Wegingen tegen de Nederlandse SD-lijnen (TNO 2009, zie groeicurve.js).
   Het geboortegewicht is de eerste weging in de app. */
const SD_LIJNEN = [-2.5, -2, -1, 0, 1, 2, 2.5];
const BEREIKEN = {
  '3m':  { naam:'0–3 mnd',  tot:0.25, stappen:[0, 1, 2, 3],            eenheid:'mnd', perJaar:12 },
  '15m': { naam:'0–15 mnd', tot:1.25, stappen:[0, 3, 6, 9, 12, 15],    eenheid:'mnd', perJaar:12 },
  '4j':  { naam:'0–4 jaar', tot:4,    stappen:[0, 1, 2, 3, 4],         eenheid:'jaar', perJaar:1 }
};
let groeiBereik = '15m';

const sdTekst = z => {
  const r = Math.round(z * 10) / 10;
  return (r < 0 ? '−' : r > 0 ? '+' : '') + getal(Math.abs(r), 1) + ' SD';
};
const lijnNaam = z => (z < 0 ? '−' : z > 0 ? '+' : '') + getal(Math.abs(z), z % 1 ? 1 : 0);

// alle wegingen op volgorde, met leeftijd, SD-score en % van het geboortegewicht
function wegingen(){
  const geboren = dagsleutel(baby.geboren);
  const w = store.metingen.filter(x => x.gewicht).map(x => {
    const d = String(x.datum).slice(0,10);
    const dagen = dagenTussen(geboren, d);
    const kg = x.gewicht / 1000;
    return { id:x.id, d, dagen, jaar:dagen / 365.25, kg, z:sdScore(dagen / 365.25, kg) };
  }).sort((a,b) => a.d < b.d ? -1 : 1);
  const geboorte = w[0];
  w.forEach(p => {
    p.pct = geboorte && p !== geboorte && p.dagen <= 42 ? Math.round((p.kg / geboorte.kg - 1) * 100) : null;
  });
  return w;
}

/* Signaal: de laatste weging (vanaf 2 weken oud) ligt meer dan 1 SD van
   een eerdere weging van hooguit 6 weken ervoor (ook vanaf 2 weken oud).
   Geen diagnose; alleen een reden om het te bespreken. */
function sdSignaal(w){
  const laatste = w[w.length - 1];
  if(!laatste || laatste.z === null || laatste.dagen < 14) return null;
  const kandidaten = w.filter(p => p !== laatste && p.z !== null && p.dagen >= 14
    && laatste.dagen - p.dagen > 0 && laatste.dagen - p.dagen <= 42
    && Math.abs(laatste.z - p.z) > 1);
  if(!kandidaten.length) return null;
  const p = kandidaten.reduce((a,b) => Math.abs(laatste.z - b.z) > Math.abs(laatste.z - a.z) ? b : a);
  return `Het gewicht is tussen ${korteDatum(p.d)} en ${korteDatum(laatste.d)} van ${sdTekst(p.z)} naar ${sdTekst(laatste.z)}
    ${laatste.z > p.z ? 'gestegen' : 'gedaald'}: meer dan 1 SD-lijn. Een goed punt om met het consultatiebureau te bespreken.`;
}

function groeicurvePaneel(){
  const w = wegingen();
  const b = BEREIKEN[groeiBereik];
  const knoppen = Object.entries(BEREIKEN).map(([k, v]) =>
    `<button aria-pressed="${k === groeiBereik}" onclick="zetBereik('${k}')">${v.naam}</button>`).join('');
  const kop = `<div class="grafiekkop"><h2 style="margin:0">Gewicht naar leeftijd</h2></div>`;

  if(!w.length)
    return `<div class="paneel">${kop}<div class="leegmelding" style="padding:14px 0 4px">Nog niet gewogen.</div></div>`;

  const laatste = w[w.length - 1], vorige = w[w.length - 2];
  let sub = laatste.z !== null ? sdTekst(laatste.z) : laatste === w[0] ? 'geboortegewicht' : 'SD-score vanaf 1 week';
  if(vorige){
    const dg = Math.round((laatste.kg - vorige.kg) * 1000), dd = Math.max(1, laatste.dagen - vorige.dagen);
    sub += ` · ${dg >= 0 ? '+' : '−'}${Math.abs(dg)} g in ${dd} ${dd === 1 ? 'dag' : 'dagen'}`;
  }
  if(laatste.pct !== null) sub += ` · ${laatste.pct >= 0 ? '+' : '−'}${Math.abs(laatste.pct)}% t.o.v. geboorte`;

  const signaal = sdSignaal(w);
  return `<div class="paneel">
    ${kop}
    <div class="nuwaarde">${getal(laatste.kg, 3)}<span> kg</span></div>
    <div class="fasetekst"><small>${sub}</small></div>
    <div class="bereik">${knoppen}</div>
    ${groeicurveSvg(w, b)}
    ${signaal ? `<div class="melding zacht">${signaal}</div>` : ''}
    <div class="bronregel">SD-lijnen −2,5 tot +2,5, meisjes. Bron: ${BRON}</div>
  </div>`;
}

function groeicurveSvg(w, b){
  const B = 320, H = 240, lm = 30, rm = 30, tm = 18, bm = 22;
  const x1 = b.tot;
  const zichtbaar = w.filter(p => p.jaar <= x1 + 1e-9);

  // y-bereik: de buitenste lijnen plus de wegingen, afgerond op een nette stap
  let lo = gewichtBijSd(MIN_LEEFTIJD, -2.5), hi = gewichtBijSd(Math.min(x1, MAX_LEEFTIJD), 2.5);
  zichtbaar.forEach(p => { lo = Math.min(lo, p.kg); hi = Math.max(hi, p.kg); });
  // hele of halve kilo's als stap, zodat de aslabels exact kloppen
  const stap = [0.5, 1, 2, 5, 10].find(s => s >= (hi - lo) / 6) || 10;
  const y0 = Math.floor(lo / stap) * stap, y1 = Math.ceil(hi / stap) * stap;

  const px = x => lm + x / x1 * (B - lm - rm);
  const py = kg => H - bm - (kg - y0) / (y1 - y0) * (H - tm - bm);

  let raster = '';
  for(let v = y0; v <= y1 + 1e-9; v += stap){
    const y = py(v).toFixed(1);
    raster += `<line x1="${lm}" y1="${y}" x2="${B - rm}" y2="${y}" stroke="var(--lijn)" stroke-width="1"/>
      <text x="${lm - 6}" y="${(+y + 3.5).toFixed(1)}" fill="var(--gedempt)" font-size="9.5" text-anchor="end"
        font-family="Outfit">${getal(v, stap < 1 ? 1 : 0)}</text>`;
  }
  b.stappen.forEach((s, i) => {
    const x = px(s / b.perJaar).toFixed(1);
    raster += `<line x1="${x}" y1="${tm}" x2="${x}" y2="${H - bm}" stroke="var(--lijn)" stroke-width="1" opacity=".6"/>
      <text x="${x}" y="${H - 6}" fill="var(--gedempt)" font-size="9.5" text-anchor="middle"
        font-family="Outfit">${s}${i === b.stappen.length - 1 ? ' ' + b.eenheid : ''}</text>`;
  });
  raster += `<text x="${lm - 6}" y="9" fill="var(--gedempt)" font-size="9" text-anchor="end" font-family="Outfit">kg</text>`;

  // de SD-lijnen, bemonsterd vanaf 1 week (waar de tabel begint)
  const xEind = Math.min(x1, MAX_LEEFTIJD), n = 90;
  const xs = Array.from({ length:n + 1 }, (_, i) => MIN_LEEFTIJD + (xEind - MIN_LEEFTIJD) * i / n);
  const pad = z => xs.map((x, i) => (i ? 'L' : 'M') + px(x).toFixed(1) + ' ' + py(gewichtBijSd(x, z)).toFixed(1)).join(' ');
  const band = pad(2) + ' ' + [...xs].reverse().map(x => 'L' + px(x).toFixed(1) + ' ' + py(gewichtBijSd(x, -2)).toFixed(1)).join(' ') + ' Z';
  // labels rechts; liggen lijnen dicht bij elkaar, dan schuiven de labels uit elkaar
  const labelY = SD_LIJNEN.map(z => py(gewichtBijSd(xEind, z)) + 3);       // van onder (−2,5) naar boven
  for(let i = labelY.length - 2; i >= 0; i--) labelY[i] = Math.max(labelY[i], labelY[i+1] + 9);
  const lijnen = SD_LIJNEN.map((z, i) => {
    const stijl = z === 0 ? 'stroke="var(--tekst)" stroke-width="1.4" opacity=".55"'
      : Math.abs(z) === 2.5 ? 'stroke="var(--gedempt)" stroke-width="1" stroke-dasharray="3 3" opacity=".7"'
      : 'stroke="var(--gedempt)" stroke-width="1" opacity=".7"';
    return `<path d="${pad(z)}" fill="none" ${stijl}/>
      <text x="${B - rm + 4}" y="${labelY[i].toFixed(1)}" fill="var(--gedempt)" font-size="8.5"
        font-family="Outfit">${lijnNaam(z)}</text>`;
  }).join('');

  // haar wegingen
  const co = zichtbaar.map(p => [px(p.jaar), py(p.kg)]);
  const verloop = co.length > 1
    ? `<path d="${co.map((c,i) => (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ')}"
        fill="none" stroke="var(--groei)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : '';
  const stippen = zichtbaar.map((p, i) => {
    const laatst = i === zichtbaar.length - 1;
    return `<circle cx="${co[i][0].toFixed(1)}" cy="${co[i][1].toFixed(1)}" r="${laatst ? 4 : 2.8}"
      fill="${laatst ? 'var(--groei)' : 'var(--paneel)'}" stroke="var(--groei)" stroke-width="1.8">
      <title>${korteDatum(p.d)}: ${getal(p.kg, 3)} kg${p.z !== null ? ' · ' + sdTekst(p.z) : ''}</title></circle>`;
  }).join('');

  return `<svg class="grafiek" viewBox="0 0 ${B} ${H}" role="img" aria-label="Gewicht naar leeftijd met SD-lijnen">
    ${raster}
    <path d="${band}" fill="var(--groei)" opacity=".07"/>
    ${lijnen}${verloop}${stippen}
  </svg>`;
}

function zetBereik(b){ groeiBereik = b; tekenGroei(); }

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
    moedermelk: fles.reduce((s,e) => s + mmIn(e.detail), 0),
    kunstvoeding: fles.reduce((s,e) => s + kvIn(e.detail), 0),
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
    // verlichting telt niet als kolfbeurt, maar vaak verlichten is wel een signaal
    const gisteren = plusDagen(vandaagSleutel(), -1);
    const g = gisteren >= plan.fase_start ? kolfSplitsing(gisteren, f.kolven) : null;
    const vandaagVerlicht = kolfSplitsing(vandaagSleutel(), f.kolven).verlichting.length;
    const volgende = AFBOUW_FASES[f.nr];
    if(g && g.gepland.length > f.kolven)
      hint = `Gisteren kolfde je ${g.gepland.length} keer, meer dan de ${f.kolven} van deze fase. Overweeg de fase te verlengen.`;
    else if((g && g.verlichting.length >= 2) || vandaagVerlicht >= 2)
      hint = `${vandaagVerlicht >= 2 ? 'Vandaag al ' + vandaagVerlicht : 'Gisteren ' + g.verlichting.length}× verlichting nodig gehad.
        Dat mag, maar is het vaak nodig, overweeg dan de fase te verlengen.`;
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

/* Vaste tijden van vandaag op volgorde. Elk moment krijgt de logs die
   dichter bij hem liggen dan bij zijn buren, zodat een kolfbeurt of fles
   wat te vroeg of te laat nog bij het goede moment hoort. */
function verdeelOverTijden(lijst, logs){
  const tijden = [...lijst].sort((a,b) => minuten(a) - minuten(b));
  const opMin = logs.map(e => { const d = new Date(e.start); return { e, m:d.getHours() * 60 + d.getMinutes() }; });
  return tijden.map((t, i) => {
    const m = minuten(t);
    const van = i ? (minuten(tijden[i-1]) + m) / 2 : 0;
    const tot = i < tijden.length - 1 ? (m + minuten(tijden[i+1])) / 2 : 1440;
    return { tijd:t, m, logs:opMin.filter(x => x.m >= van && x.m < tot).map(x => x.e) };
  });
}

function dagschema(kolven, logs){
  const weg = overgeslagen(kolven);
  return verdeelOverTijden(KOLFTIJDEN, logs).map(s => ({ ...s, kolven:!weg.has(s.tijd) }));
}

/* De kolfbeurten van een dag gesplitst: bij een gepland moment, of bij een
   overgeslagen moment. Die laatste zijn verlichting en tellen niet als
   kolfbeurt. Gaat uit van de huidige fase. */
function kolfSplitsing(sleutel, kolven){
  const schema = dagschema(kolven, dagTotalen(sleutel).kolf);
  return {
    gepland:     schema.filter(s => s.kolven).flatMap(s => s.logs),
    verlichting: schema.filter(s => !s.kolven).flatMap(s => s.logs)
  };
}

function vandaagPaneel(plan){
  const f = faseInfo(plan);
  const t = dagTotalen(vandaagSleutel());
  const { gepland, verlichting } = kolfSplitsing(vandaagSleutel(), f.kolven);
  const n = gepland.length;
  const verlichtMl = verlichting.reduce((x,e) => x + (e.detail.ml || 0), 0);

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
    ${verlichting.length ? `<div class="verlichtregel">+ ${verlichting.length}× verlichting · ${verlichtMl} ml</div>` : ''}
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

// de flessen die kunstvoeding worden als deze kolfmomenten vervallen
function flesBij(kolftijden){
  const flessen = VOEDING.tijden.filter(t => kolftijden.includes(VOEDING.kolfNa[t]));
  return flessen.length ? ' → fles ' + flessen.map(t => uurtekst(minuten(t))).join(', ') + ' kunstvoeding' : '';
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
      <span class="d">Fase ${i + 1}${nieuw.length && f.kolven ? `<small>${nieuw.map(t => uurtekst(minuten(t))).join(', ')} overslaan${flesBij(nieuw)}</small>` : ''}</span>
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
  const max = Math.max(...punten.map(p => p.v), r.doel || 0, 1);
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

  // optionele streeflijn, bijvoorbeeld de dagbehoefte
  const doel = r.doel ? `<line x1="${lm}" y1="${py(r.doel).toFixed(1)}" x2="${B - rm}" y2="${py(r.doel).toFixed(1)}"
      stroke="var(--tekst)" stroke-width="1.2" stroke-dasharray="4 3" opacity=".55"/>` : '';

  const datum = s => new Date(s + 'T12:00').toLocaleDateString('nl-NL',{day:'numeric',month:'short'});
  return kop + `<svg class="grafiek" viewBox="0 0 ${B} ${H}" role="img" aria-label="${r.titel}">
    ${assen}${staven}${doel}
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

/* ---------- voedingsschema ----------
   Dagbehoefte uit het laatste gewicht, de vaste tijden van VOEDING, en wat
   er vandaag nog nodig is verdeeld over de voedingen die nog komen. */
const rond5 = v => Math.round(v / 5) * 5;
const flessenOp = sleutel => store.events.filter(e =>
  e.type === 'voeding' && e.detail && e.detail.bron === 'fles' && dagsleutel(e.start) === sleutel);
const mlVan = l => l.reduce((s,e) => s + (e.detail.ml || 0), 0);
const laatsteDagen = n => Array.from({ length:n }, (_, i) => plusDagen(vandaagSleutel(), i - n + 1));

/* De flessen die volgens de huidige fase van het afbouwplan kunstvoeding
   zijn: die waarvan het kolfmoment erna wordt overgeslagen. Zonder plan
   is alles moedermelk. */
function kunstvoedingTijden(){
  if(!store.plan) return new Set();
  const weg = overgeslagen(faseInfo(store.plan).kolven);
  return new Set(VOEDING.tijden.filter(t => weg.has(VOEDING.kolfNa[t])));
}

function laatsteGewicht(){
  const m = store.metingen.filter(x => x.gewicht);
  return m.length ? m[m.length - 1] : null;
}

function tekenVoeding(){
  const w = laatsteGewicht();
  if(!w){
    $('#inhoud').innerHTML = `<div class="paneel"><h2>Voedingsschema</h2>
      <p class="uitleg">De dagbehoefte is ${VOEDING.mlPerKg} ml per kilo. Voeg eerst een gewicht toe.</p></div>
      <button class="knop vol" onclick="opdracht('meting')">Meting toevoegen</button>`;
    return;
  }
  const kg = w.gewicht / 1000;
  const behoefte = rond5(VOEDING.mlPerKg * kg);
  const perFles = rond5(behoefte / VOEDING.tijden.length);
  $('#inhoud').innerHTML = behoeftePaneel(w, kg, behoefte, perFles)
    + voedingVandaagPaneel(behoefte, perFles)
    + ritmePaneel()
    + `<div class="paneel">${staafgrafiek(laatsteDagen(7).map(d => ({ d, v:mlVan(flessenOp(d)) })),
        { titel:'Gedronken per dag', kleur:'var(--voeding)', eenheid:'ml', doel:behoefte })}
       <div class="uitleg">Stippellijn: de dagbehoefte bij het huidige gewicht.</div></div>`;
}

function behoeftePaneel(w, kg, behoefte, perFles){
  const gewogen = String(w.datum).slice(0,10);
  const oud = dagenTussen(gewogen, vandaagSleutel());
  return `<div class="paneel">
    <div class="grafiekkop"><h2 style="margin:0">Dagbehoefte</h2>
      <span class="delta" style="color:var(--gedempt)">${VOEDING.mlPerKg} ml × ${getal(kg, 2)} kg</span></div>
    <div class="nuwaarde">${behoefte}<span> ml per dag</span></div>
    <div class="fasetekst">${VOEDING.tijden.length} voedingen · ± ${perFles} ml per fles
      <small>gewogen ${oud === 0 ? 'vandaag' : oud === 1 ? 'gisteren' : korteDatum(gewogen)}</small></div>
    ${oud > 7 ? `<div class="melding zacht">De laatste weging is ${oud} dagen oud. Ze groeit snel: opnieuw wegen houdt de dagbehoefte kloppend.</div>` : ''}
  </div>`;
}

function voedingVandaagPaneel(behoefte, perFles){
  const flessen = flessenOp(vandaagSleutel());
  const gegeven = mlVan(flessen);
  const rest = Math.max(0, behoefte - gegeven);
  const nu = new Date().getHours() * 60 + new Date().getMinutes();
  const kv = kunstvoedingTijden();
  const melkVan = s => kv.has(s.tijd) ? 'kunstvoeding' : 'moedermelk';
  const maxFles = rond5(perFles * 1.25);
  const genoeg = perFles * .85;          // vanaf hier telt een voeding als volledig

  /* Per voeding: wat er gegeven is en tot wanneer hij open staat. Zonder
     fles sluit hij aan het eind van zijn venster. Na een tussenvoeding
     blijft hij open tot het venster van de volgende begint, zodat een
     aanvulling een uur later er nog bij hoort. */
  const schema = verdeelFlessen(flessen, genoeg).map((s, i, alle) => {
    const ml = mlVan(s.logs);
    const tot = i < alle.length - 1 ? alle[i+1].m - SPELING : 1440;
    const compleet = ml >= genoeg;
    const deels = ml > 0 && !compleet;
    return {
      ...s, ml, tot, compleet, deels,
      mm: s.logs.reduce((x,e) => x + mmIn(e.detail), 0),
      kv: s.logs.reduce((x,e) => x + kvIn(e.detail), 0),
      open: !compleet && (deels ? tot : s.m + SPELING) > nu,
      aanvullen: deels ? Math.max(5, rond5(perFles - ml)) : 0
    };
  });

  // eerst aanvullen wat half is, de rest gaat over de voedingen die nog komen
  const komend = schema.filter(s => s.open);
  const volgende = komend[0] || null;
  const heel = komend.filter(s => !s.deels);
  const restNaAanvullen = Math.max(0, rest - komend.reduce((x,s) => x + s.aanvullen, 0));
  const ruw = heel.length ? rond5(restNaAanvullen / heel.length) : 0;
  const advies = Math.min(ruw, maxFles);

  /* Het bolletje vult van onder naar boven tot wat er gegeven is, in de
     kleur van de melk: moedermelk onderin, kunstvoeding erbovenop. */
  const slots = schema.map(s => {
    const gemist = !s.open && !s.ml;
    const noemer = s.compleet ? s.ml : perFles;
    const a = Math.min(100, s.mm / noemer * 100).toFixed(0);
    const b = Math.min(100, (s.mm + s.kv) / noemer * 100).toFixed(0);
    const vulling = s.ml
      ? `background:linear-gradient(to top,var(--kolven) ${a}%,var(--voeding) ${a}% ${b}%,transparent ${b}%)` : '';
    const klasse = `slot voedslot ${kv.has(s.tijd) ? 'kv' : 'mm'}${s.deels ? ' deels' : ''}${gemist ? ' gemist' : ''}${s === volgende ? ' volgende' : ''}`;
    const titel = (s.mm && s.kv ? 'Gemengd: ' : '') + s.logs.map(e => klok(e.start) + ' · ' + e.detail.ml + ' ml ' + melkNaam(e.detail)).join(', ');
    const bol = s.open
      ? `<button class="bol" style="${vulling}" title="${titel}"
           onclick="opdracht('voeding','${melkVan(s)}',${s.deels ? s.aanvullen : advies})"
           aria-label="Fles ${melkVan(s)} van ${uurtekst(s.m)} loggen"></button>`
      : `<span class="bol" style="${vulling}" title="${titel}"></span>`;
    // moedermelk en kunstvoeding binnen één voeding: samen één gemengde voeding
    const soort = s.mm && s.kv ? '<br>MM+KV' : s.logs.length > 1 ? ' · ' + s.logs.length + '×' : '';
    const onder = s.deels && s.open ? `${s.ml} ml<br>nog ${s.aanvullen}`
      : s.ml ? s.ml + ' ml' + soort
      : gemist ? '—' : (kv.has(s.tijd) ? 'KV' : 'MM');
    return `<div class="${klasse}">${bol}<span class="slottijd">${uurtekst(s.m)}</span>
      <span class="slotsoort">${onder}</span></div>`;
  }).join('');

  let tekst;
  if(!rest)
    tekst = 'De dagbehoefte is gehaald. Heeft ze nog honger, geef dan gerust op verzoek.';
  else if(!volgende)
    tekst = `Nog ${rest} ml te gaan, maar de vaste tijden van vandaag zijn voorbij. Op verzoek bijgeven kan.`;
  else if(volgende.deels){
    const daarna = heel[0];
    tekst = `<strong>${uurtekst(volgende.m)} aanvullen</strong>: nog <strong>± ${volgende.aanvullen} ml ${melkVan(volgende)}</strong>
      (${volgende.ml} van ± ${perFles} ml gehad).
      <small>Telt mee tot ${uurtekst(volgende.tot)}.${daarna
        ? ` Daarna: ${uurtekst(daarna.m)}, ± ${advies} ml ${melkVan(daarna)}.` : ''}</small>`;
  } else {
    const loopt = volgende.m - SPELING <= nu;
    tekst = `${loopt ? 'Nu voeden' : 'Volgende fles'}: <strong>${uurtekst(volgende.m)}</strong>
      (${venster(volgende.tijd)}), <strong>± ${advies} ml ${melkVan(volgende)}</strong>.
      <small>Nog ${rest} ml over ${komend.length} ${komend.length === 1 ? 'voeding' : 'voedingen'}${ruw > maxFles
        ? '; niet meer dan ± ' + maxFles + ' ml per fles, liever op verzoek iets bijgeven' : ''}.</small>`;
  }

  const mmTotaal = flessen.reduce((x,e) => x + mmIn(e.detail), 0);
  const kvTotaal = flessen.reduce((x,e) => x + kvIn(e.detail), 0);
  const pct = Math.min(100, Math.round(gegeven / behoefte * 100));
  return `<div class="paneel">
    <h2>Vandaag</h2>
    <div class="kolfregel">
      <div class="nuwaarde">${gegeven}<span> / ${behoefte} ml</span></div>
      <div class="kolfml" style="color:var(--voeding)">${flessen.length} ${flessen.length === 1 ? 'fles' : 'flessen'}</div>
    </div>
    <div class="verhouding" role="img" aria-label="${pct}% van de dagbehoefte">
      <span style="width:${pct}%;background:var(--voeding)"></span></div>
    <div class="kolfschema" style="grid-template-columns:repeat(${schema.length},1fr)">${slots}</div>
    <div class="flesregel" style="margin-top:6px">
      <span><i style="background:var(--kolven)"></i>MM moedermelk ${mmTotaal} ml</span>
      <span><i style="background:var(--voeding)"></i>KV kunstvoeding ${kvTotaal} ml</span>
    </div>
    <div class="melding zacht">${tekst}</div>
    ${store.plan ? `<div class="uitleg">Afbouwplan fase ${faseInfo(store.plan).nr}:
      ${schema.length - kv.size} ${schema.length - kv.size === 1 ? 'fles' : 'flessen'} moedermelk,
      ${kv.size} kunstvoeding (± ${kv.size * perFles} ml per dag).</div>` : ''}
  </div>`;
}

/* Flessen bij de vaste tijden zetten, op volgorde van tijdstip. Een fles
   hoort bij de laatste voeding waarvan het venster al begonnen is. Is die
   voeding al compleet en zijn venster voorbij, dan is het geen aanvulling
   meer maar een (vroege) volgende voeding. */
function verdeelFlessen(flessen, genoeg){
  const slots = [...VOEDING.tijden].sort((a,b) => minuten(a) - minuten(b))
    .map(t => ({ tijd:t, m:minuten(t), logs:[] }));
  [...flessen].sort((a,b) => new Date(a.start) - new Date(b.start)).forEach(e => {
    const d = new Date(e.start), t = d.getHours() * 60 + d.getMinutes();
    let i = 0;
    while(i < slots.length - 1 && t >= slots[i+1].m - SPELING) i++;
    if(i < slots.length - 1 && t >= slots[i].m + SPELING && mlVan(slots[i].logs) >= genoeg) i++;
    slots[i].logs.push(e);
  });
  return slots;
}

/* Ritme: per dag een tijdlijn van 24 uur met een stip per fles (groter =
   meer ml) en de vaste tijden als stippellijnen. Laat zien of de flessen
   naar het schema toe schuiven en hoe lang de nachtpauze is. */
function ritmePaneel(){
  const dagen = laatsteDagen(7);
  const B = 320, lm = 44, rm = 8, tm = 6, rij = 22, bm = 18;
  const H = tm + rij * dagen.length + bm;
  const px = m => lm + m / 1440 * (B - lm - rm);

  const lijnen = VOEDING.tijden.map(t => `<line x1="${px(minuten(t)).toFixed(1)}" y1="${tm}"
      x2="${px(minuten(t)).toFixed(1)}" y2="${H - bm}" stroke="var(--lijn)" stroke-width="1" stroke-dasharray="2 3"/>`).join('');
  const uren = [0, 6, 12, 18, 24].map(u => `<text x="${px(u * 60).toFixed(1)}" y="${H - 5}" fill="var(--gedempt)"
      font-size="9.5" text-anchor="middle" font-family="Outfit">${u}</text>`).join('');

  const rijen = dagen.map((d, i) => {
    const y = tm + rij * i + rij / 2;
    const naam = d === vandaagSleutel() ? 'vandaag'
      : new Date(d + 'T12:00').toLocaleDateString('nl-NL',{weekday:'short',day:'numeric'});
    const stippen = flessenOp(d).map(e => {
      const t = new Date(e.start), m = t.getHours() * 60 + t.getMinutes();
      const r = 2.5 + Math.min(e.detail.ml || 0, 100) / 100 * 3.5;
      return `<circle cx="${px(m).toFixed(1)}" cy="${y}" r="${r.toFixed(1)}" fill="var(--voeding)" opacity=".85">
        <title>${klok(e.start)} · ${e.detail.ml} ml</title></circle>`;
    }).join('');
    return `<text x="0" y="${y + 3.5}" fill="var(--gedempt)" font-size="10" font-family="Outfit">${naam}</text>${stippen}`;
  }).join('');

  return `<div class="paneel">
    <h2>Ritme, laatste 7 dagen</h2>
    <svg class="grafiek" viewBox="0 0 ${B} ${H}" role="img" aria-label="Voedingstijden per dag">
      ${lijnen}${rijen}${uren}
    </svg>
    <div class="uitleg">Stippellijnen: de vaste tijden. Hoe groter de stip, hoe meer ml.</div>
  </div>`;
}

/* ---------- invoerschermen ---------- */
let concept = {};

const hhmm = d => String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');

function opdracht(soort, melk, ml){
  const nu = new Date();
  const tijdveld = `<div class="veldlabel">Tijdstip</div>
    <input type="time" id="tijd" value="${hhmm(nu)}">`;

  if(soort === 'voeding'){
    // vanuit het voedingsschema: fles, met de soort melk en hoeveelheid van dat moment
    const fles = !!melk;
    concept = { bron:fles ? 'fles' : 'borst', kant:'links', minuten:15, ml:ml || 90, melk:melk || laatsteMelk() };
    const kunst = concept.melk === 'kunstvoeding';
    open('Voeding', 'var(--voeding)', `
      <div class="veldlabel">Waarmee</div>
      <div class="keuzes" id="bron">
        <button class="keuze" aria-pressed="${!fles}" onclick="kies('bron','borst',this)">Borst</button>
        <button class="keuze" aria-pressed="${fles}" onclick="kies('bron','fles',this)">Fles</button>
      </div>
      <div id="borstvelden"${fles ? ' style="display:none"' : ''}>
        <div class="veldlabel">Kant</div>
        <div class="keuzes">
          <button class="keuze" aria-pressed="true" onclick="kies('kant','links',this)">Links</button>
          <button class="keuze" aria-pressed="false" onclick="kies('kant','rechts',this)">Rechts</button>
        </div>
        <div class="veldlabel">Duur in minuten</div>
        <input type="number" id="minuten" value="15" min="1" max="120" inputmode="numeric">
      </div>
      <div id="flesvelden"${fles ? '' : ' style="display:none"'}>
        <div class="veldlabel">Soort melk</div>
        <div class="keuzes">
          <button class="keuze" aria-pressed="${!kunst}" onclick="kies('melk','moedermelk',this)">Moedermelk</button>
          <button class="keuze" aria-pressed="${kunst}" onclick="kies('melk','kunstvoeding',this)">Kunstvoeding</button>
        </div>
        <div class="veldlabel">Hoeveelheid in ml</div>
        <input type="number" id="ml" value="${concept.ml}" min="5" max="400" step="5" inputmode="numeric">
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
  wisselSignaal, bewaarNotitie, zetBereik
});

/* ---------- starten ---------- */
zetFoutmelder(toonFout);

bewaakSessie({
  bijInloggen(){
    laadEerst();
    volgEvents(teken);          // wijziging van de partner: opnieuw tekenen
    volgAfbouw(() => { if(tab === 'afbouw') tekenAfbouwNu(); if(tab === 'voeding') tekenVoeding(); });
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
  if(tab === 'voeding') tekenVoeding();
  if(tab === 'afbouw') tekenAfbouwNu();
}, 30000);
