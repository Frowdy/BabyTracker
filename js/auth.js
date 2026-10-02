/* =====================================================================
   INLOGGEN
   Registreren gebeurt in Supabase zelf, dus hier alleen aanmelden,
   afmelden en het tonen of verbergen van de app.
   ===================================================================== */
import { sb } from './store.js?v=2';

const $ = s => document.querySelector(s);

// undefined, niet null: 'niemand ingelogd' moet de eerste keer wel doorkomen.
let vorigeGebruiker;

/* Roept bijInloggen zodra er een sessie is en bijUitloggen zodra die weg is.
   Een ververst token levert dezelfde gebruiker op; dan gebeurt er niets. */
export async function bewaakSessie({ bijInloggen, bijUitloggen }){
  $('#inlogformulier').addEventListener('submit', inloggen);
  $('#uitlogknop').addEventListener('click', uitloggen);

  sb.auth.onAuthStateChange((_gebeurtenis, sessie) =>
    pasSessieToe(sessie, bijInloggen, bijUitloggen));

  const { data } = await sb.auth.getSession();
  pasSessieToe(data.session, bijInloggen, bijUitloggen);
}

function pasSessieToe(sessie, bijInloggen, bijUitloggen){
  const gebruiker = sessie && sessie.user ? sessie.user.id : null;
  if(gebruiker === vorigeGebruiker) return;
  vorigeGebruiker = gebruiker;

  $('#app').hidden = !gebruiker;
  $('#inlogscherm').hidden = !!gebruiker;

  if(gebruiker) bijInloggen();
  else bijUitloggen();
}

async function inloggen(e){
  e.preventDefault();
  const knop = $('#inlogknop'), fout = $('#inlogfout');
  fout.hidden = true;
  knop.disabled = true;
  knop.textContent = 'Bezig met inloggen…';

  try{
    const { error } = await sb.auth.signInWithPassword({
      email: $('#email').value.trim(),
      password: $('#wachtwoord').value
    });
    if(error) throw error;
    $('#wachtwoord').value = '';
  }catch(f){
    const m = f && f.message ? f.message : String(f);
    fout.textContent = /invalid login credentials/i.test(m)
      ? 'E-mailadres of wachtwoord klopt niet.'
      : /email not confirmed/i.test(m)
        ? 'Dit e-mailadres is nog niet bevestigd.'
        : 'Inloggen mislukt: ' + m;
    fout.hidden = false;
  }finally{
    knop.disabled = false;
    knop.textContent = 'Inloggen';
  }
}

async function uitloggen(){
  await sb.auth.signOut();
}
