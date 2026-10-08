// Lit la fiche magasin vandb.fr (HTML) et en extrait horaires, fermetures exceptionnelles et coordonnées.
// Format observé le 08/10/2026 : « Lundi 14h00 - 20h00 », « Dimanche Fermé », « Fermeture Le 01/11/2026 »,
// téléphone « 0467659829 », e-mail « …@vandb.fr », adresse « 9 allée Du Levant, 34970, Lattes ».
const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;|&rsquo;/g, "'").replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è')
    .replace(/\s+/g, ' ');
}
const hhmm = (h, m) => `${String(h).padStart(2, '0')}:${m}`;

export function parseStore(html) {
  const text = htmlToText(html);
  const hours = {};
  const re = /(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s*((?:\d{1,2}\s*h\s*\d{2}\s*[-–à]\s*\d{1,2}\s*h\s*\d{2}\s*(?:[\/,et]+\s*)?)+|ferm[ée])/gi;
  let m;
  while ((m = re.exec(text))) {
    const iso = String(DAYS.indexOf(m[1].toLowerCase()) + 1);
    if (iso in hours || hours[`_${iso}`]) continue;           // la page peut répéter le bloc (mobile / ordinateur)
    if (/^ferm/i.test(m[2])) { hours[`_${iso}`] = true; continue; }
    const t = [...m[2].matchAll(/(\d{1,2})\s*h\s*(\d{2})/g)].map((x) => hhmm(x[1], x[2]));
    if (t.length >= 2) hours[iso] = [t[0], t[t.length - 1]];   // pause midi éventuelle : ouverture la plus tôt, fermeture la plus tard
  }
  const found = Object.keys(hours).length;
  for (const k of Object.keys(hours)) if (k.startsWith('_')) delete hours[k];
  const closures = [...new Set([...text.matchAll(/fermeture[^0-9]{0,40}?(\d{2})\/(\d{2})\/(\d{4})/gi)].map((x) => `${x[3]}-${x[2]}-${x[1]}`))].sort();
  const tel = (text.match(/0[1-9](?:[ .]?\d{2}){4}/) || [])[0];
  const mail = (text.match(/[a-z0-9._-]+@vandb\.fr/i) || [])[0];
  const addr = (text.match(/\d{1,4}\s+(?:all[ée]e|rue|avenue|av\.|bd|boulevard|chemin|place|route|impasse|quai|cours|zac|za)\b[^,]{1,60},\s*\d{5},?\s*[A-Za-zÀ-ÿ'-]+/i) || [])[0];
  return { ok: found >= 7, hours, closures, contact: { tel: tel ? tel.replace(/\D/g, '').replace(/(\d{2})(?=\d)/g, '$1 ') : null, mail: mail || null, addr: addr ? addr.trim() : null } };
}
