export const MENTION = 'L’abus d’alcool est dangereux pour la santé, à consommer avec modération.';
export const LEVELS = { debutant: 'Débutant', occasionnel: 'Occasionnel', confirme: 'Confirmé' };
export const STATUS = { brouillon: 'Brouillon', ouvert: 'Inscriptions ouvertes', complet: 'Complet', en_cours: 'En cours', termine: 'Terminé' };
export const GAMES = ['301', '501', '701', 'Standard Cricket', 'Select-a-Cricket', 'Medley 3 manches'];
// Yum Yum est écarté (« points boisson »), Cut Throat aussi (au moins 3 camps).
export const PARTY = ['Lucky Balloon', 'Castle Bomber', 'Survivor', 'Sevens Heaven', 'Under the Hat'];

export const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const hm = (s) => { const [h, m] = String(s || '0:0').split(':'); return +h * 60 + (+m || 0); };
export const fmtHM = (m) => { m = Math.round(m); const h = Math.floor(m / 60) % 24, mm = ((m % 60) + 60) % 60; return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); };
export const fmtDur = (m) => { m = Math.max(0, Math.round(m)); const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h ${String(r).padStart(2, '0')}` : `${r} min`; };
export const hhmm = (t) => String(t || '').slice(0, 5);
export const fmtDate = (d, long) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', long ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : { weekday: 'long', day: 'numeric', month: 'long' });
export const ymd = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
export const today = () => ymd(new Date());
export const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return ymd(x); };
export const weekMonday = (d = today()) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); };
export const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };

export function hoursOf(venue, d) { const iso = ((new Date(d + 'T12:00:00').getDay() + 6) % 7) + 1; const h = venue.hours[String(iso)]; return h ? { open: hm(h[0]), close: hm(h[1]) } : null; }
export function closedReason(venue, d) {
  if (!d) return 'Date manquante';
  if ((venue.closures || []).includes(d)) return 'Fermeture exceptionnelle du bar le ' + fmtDate(d);
  if (!hoursOf(venue, d)) return 'Le bar est fermé le dimanche';
  return null;
}
export function contestStatus(c, confirmedCount) { return c.status === 'ouvert' && confirmedCount >= c.max_teams ? 'complet' : c.status; }
export function pill(st) { const cls = st === 'en_cours' ? 'live' : st === 'termine' ? 'ok' : st === 'brouillon' ? 'warn' : ''; return `<span class="pill ${cls}">${STATUS[st]}</span>`; }

export function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }

export function icsFile(c, venue) {
  const [y, mo, d] = c.date.split('-'); const [h, mi] = hhmm(c.start_time).split(':');
  const end = new Date(Date.UTC(+y, +mo - 1, +d, +h + 3, +mi));
  const endStr = end.toISOString().slice(0, 16).replace(/[-:]/g, '') + '00';
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VandB Lattes//Flechettes//FR', 'BEGIN:VEVENT', `UID:${c.id}@flechettes-vandb-lattes`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART;TZID=Europe/Paris:${y}${mo}${d}T${h}${mi}00`, `DTEND;TZID=Europe/Paris:${endStr}`,
    'SUMMARY:Concours de fléchettes – ' + venue.name, 'LOCATION:' + venue.address.replace(/,/g, '\\,'), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  return URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
}

/** Contrôles horaires : fermeture, ouverture, fin estimée, animations concurrentes */
export function slotChecks(venue, events, c, n, est) {
  const out = []; const cr = closedReason(venue, c.date);
  if (cr) return [{ lvl: 'bad', msg: cr + '. Aucun concours possible ce jour-là.' }];
  const h = hoursOf(venue, c.date), st = hm(c.start_time), end = st + est.min;
  if (st < h.open) out.push({ lvl: 'bad', msg: `Le bar ouvre à ${fmtHM(h.open)} ce jour-là.` });
  if (end > h.close) out.push({ lvl: 'bad', msg: `Avec ${n} équipes, fin estimée à ${fmtHM(end)}, après la fermeture (${fmtHM(h.close)}).` });
  else out.push({ lvl: 'good', msg: `Avec ${n} équipes : ${est.total} matchs, fin estimée vers ${fmtHM(end)} (fermeture ${fmtHM(h.close)}).` });
  for (const e of events || []) { if (e.date !== c.date) continue; const t = hm(e.time); if (t >= st - 60 && t <= end + 30) out.push({ lvl: 'warn', msg: `Même jour : ${e.label} à ${hhmm(e.time)}.` }); }
  const hh = venue.settings?.happyHour;
  if (hh && st < hm(hh[1]) && end > hm(hh[0])) out.push({ lvl: 'warn', msg: `Le concours chevauche l’happy hour (${hh[0].replace(':', 'h')}–${hh[1].replace(':', 'h')}) : bar plus chargé, prévoyez l’accès aux machines.` });
  if (hm(c.deadline_time) > st) out.push({ lvl: 'warn', msg: 'L’heure limite d’inscription est après le début.' });
  return out;
}
export const notices = (list) => list.map((x) => `<div class="notice ${x.lvl}">${esc(x.msg)}</div>`).join('');

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copié'); } catch { toast('Copie impossible : sélectionnez le texte'); }
}
