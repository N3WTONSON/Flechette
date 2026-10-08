// Espace staff : concours, équipes, jour J (pointage, tirage, file des machines, saisie en deux touches), résultats, communication.
import { sb, loadVenue, toEngine, matchRows } from './sb.js';
import { SITE_URL, ASSETS_DIR, LOGO_PATH } from '../config.js';
import * as E from './engine.js';
import { guideHTML, GUIDE_CSS } from './guide.js';
document.head.insertAdjacentHTML('beforeend', `<style>${GUIDE_CSS}</style>`);
import { card, bracketHTML, poolsHTML, tname } from './views.js';
import { $, esc, fmtDate, hhmm, hm, fmtHM, fmtDur, nowMin, today, addDays, weekMonday, LEVELS, STATUS, GAMES, PARTY, MENTION, pill, contestStatus, toast, slotChecks, notices, closedReason, hoursOf, copyText } from './util.js';

const main = $('#main'), tabsEl = $('#tabs'), topbar = $('#topbar');
const TABS = [['jourj', 'Jour J'], ['equipes', 'Équipes'], ['concours', 'Concours'], ['resultats', 'Résultats'], ['saison', 'Saison & record'], ['com', 'Communication'], ['reglages', 'Réglages'], ['aide', 'Mode d’emploi']];
let venue, settings, events = [], seasons = [], contests = [], cid = sessionStorage.getItem('vb-cid'), tab = sessionStorage.getItem('vb-tab') || 'jourj';
let regs = [], c = null, editing = null, confirmKey = null, pick = null, busy = false;

/* ---------- accès direct par QR code fixe (tablette) ou lien (PC) ----------
   Rien à saisir : le QR code / lien staff contient la clé d'accès. Ouvert une fois, l'appareil reste connecté. */
let me = null;
const STAFF_KEY_LS = 'vb-staff-key';
const deviceName = () => /iPad|Tablet|Android(?!.*Mobile)/i.test(navigator.userAgent) ? 'Tablette' : /Mobi|iPhone|Android/i.test(navigator.userAgent) ? 'Téléphone' : 'Ordinateur';
function staffKey() { const h = new URLSearchParams(location.hash.slice(1)).get('acces'); if (h) return h; try { return localStorage.getItem(STAFF_KEY_LS); } catch { return null; } }
async function boot() {
  const key = staffKey();
  let { data: { session } } = await sb.auth.getSession();
  let hello = session ? (await sb.rpc('staff_hello')).data : null;
  if (!hello && key) {
    main.innerHTML = '<div class="empty">Ouverture de l’espace staff…</div>';
    if (!session) { const r = await sb.auth.signInAnonymously(); if (r.error) return noAccess('Connexion impossible : ' + r.error.message); session = r.data?.session || (await sb.auth.getSession()).data.session; }
    const { error } = await sb.rpc('join_staff', { p_token: key, p_name: deviceName() });
    if (error) { try { localStorage.removeItem(STAFF_KEY_LS); } catch {} return noAccess('Ce lien staff n’est plus valable. Utilisez le QR code ou le lien staff à jour.'); }
    hello = (await sb.rpc('staff_hello')).data;
  }
  if (!hello) return noAccess();
  try { if (key) localStorage.setItem(STAFF_KEY_LS, key); } catch {}
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  me = { ...hello, uid: session.user.id };
  topbar.innerHTML = `<a class="btn ghost sm" href="comptoir.html" target="_blank" rel="noopener">Écran comptoir</a><a class="btn ghost sm" href="suivi.html" target="_blank" rel="noopener">Écran TV</a><a class="btn ghost sm" href="./" target="_blank" rel="noopener">Page joueurs</a><a class="btn ghost sm" href="test.html" target="_blank" rel="noopener">Page test téléphone</a>`;
  venue = await loadVenue(); settings = venue.settings;
  await reloadAll();
  sb.channel('staff').on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => { if (!busy) reloadContest().then(render); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => { if (!busy && !pick) reloadContest().then(render); }).subscribe();
  if (KIOSK) { try { await navigator.wakeLock?.request('screen'); } catch {} }
}
function noAccess(msg) {
  tabsEl.classList.add('hidden');
  main.innerHTML = `<section class="panel" style="max-width:560px"><h2>Espace staff</h2>${msg ? `<div class="notice bad">${esc(msg)}</div>` : ''}
    <p>Ouvrez l’espace staff avec le <b>QR code staff</b> (tablette, téléphone) ou le <b>lien staff</b> (ordinateur). Rien à saisir : l’appareil reste ensuite connecté.</p>
    <p class="muted small">Le QR code et le lien se trouvent dans l’espace staff, onglet Réglages, sur un appareil déjà ouvert.</p><div class="row"><a class="btn ghost" href="./">Page joueurs</a></div></section>`;
}
function staffLink() { const k = staffKey(); return k ? new URL('staff.html', location.href).href + '#acces=' + encodeURIComponent(k) : null; }

/* ---------- données ---------- */
async function reloadAll() {
  const [{ data: k }, { data: ev }, { data: se }] = await Promise.all([
    sb.from('contests').select('*').order('date', { ascending: false }),
    sb.from('events').select('*').gte('date', addDays(today(), -30)).order('date'),
    sb.from('seasons').select('*').order('starts_on', { ascending: false }),
  ]);
  contests = k || []; events = ev || []; seasons = se || [];
  if (!contests.find((x) => x.id === cid)) cid = (contests.find((x) => x.status === 'en_cours') || contests.slice().reverse().find((x) => x.date >= today()) || contests[0])?.id || null;
  await reloadContest(); render();
}
async function reloadContest() {
  if (!cid) { c = null; regs = []; return; }
  const [{ data: k }, { data: r }, { data: m }] = await Promise.all([
    sb.from('contests').select('*').eq('id', cid).single(),
    sb.from('registrations').select('*, teams(name, captain:players!teams_captain_id_fkey(*), mate:players!teams_mate_id_fkey(*))').eq('contest_id', cid).order('created_at'),
    sb.from('matches').select('*').eq('contest_id', cid),
  ]);
  regs = r || [];
  c = toEngine(k, m || [], regs.filter((x) => x.status === 'confirmee').map((x) => ({ id: x.id, name: x.teams.name })));
  contests = contests.map((x) => (x.id === k.id ? k : x));
}
const confirmed = () => regs.filter((r) => r.status === 'confirmee');
const waiting = () => regs.filter((r) => r.status === 'attente');

/** Enregistre l'état du tableau après une action du staff */
async function persist(msg) {
  busy = true;
  try {
    const patch = { status: c.status, phase: c.phase, pools: c.pools };
    if (c.status === 'termine' && !c.finished_at) patch.finished_at = new Date().toISOString();
    const { data, error } = await sb.rpc('apply_bracket', { p_contest: c.id, p_version: c.version, p_matches: matchRows(c), p_patch: patch });
    if (error) {
      if (String(error.message).includes('conflict')) { toast('Un résultat vient d’arriver d’un téléphone : tableau mis à jour, refaites votre action si besoin.'); await reloadContest(); busy = false; render(); return; }
      throw error;
    }
    c.version = data;
    if (c.status === 'termine') await writeResults();
    if (msg) toast(msg);
  } catch (e) { toast('Erreur d’enregistrement : ' + (e.message || e)); await reloadContest(); }
  busy = false; render();
}
async function writeResults() {
  const season = seasons.find((s) => s.id === c.season_id) || seasons[0];
  const present = regs.filter((r) => r.status === 'confirmee' && r.present).map((r) => r.id);
  const rows = E.seasonResults(c, present, season.points).map((x) => ({ contest_id: c.id, ...x }));
  await sb.from('results').upsert(rows);
}

/* ---------- rendu ---------- */
function render() {
  if (KIOSK) {
    document.body.classList.add('kiosk-mode'); tabsEl.classList.add('hidden');
    if (c?.status !== 'en_cours') { const run = contests.find((x) => x.status === 'en_cours'); if (run && run.id !== cid) { cid = run.id; reloadContest().then(render); return; } }
    main.innerHTML = vKiosk(); restoreDraft(); return;
  }
  sessionStorage.setItem('vb-tab', tab); if (cid) sessionStorage.setItem('vb-cid', cid);
  tabsEl.classList.remove('hidden');
  tabsEl.innerHTML = TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join('');
  const pickerHtml = contests.length ? `<div class="row" style="align-items:flex-end;margin-bottom:12px"><div class="field" style="flex:1;max-width:440px"><label for="cpick">Concours</label><select id="cpick">${contests.map((x) => `<option value="${x.id}"${x.id === cid ? ' selected' : ''}>${esc(fmtDate(x.date))} · ${hhmm(x.start_time)} · ${STATUS[x.status]}</option>`).join('')}</select></div><button class="btn sm" data-act="newContest">+ Nouveau concours</button></div>` : '';
  const views = { jourj: vJourJ, equipes: vEquipes, concours: vConcours, resultats: vResultats, saison: vSaison, com: vCom, reglages: vReglages, aide: guideHTML };
  main.innerHTML = (['reglages', 'saison', 'aide'].includes(tab) ? '' : pickerHtml) + ((!c && !['concours', 'reglages', 'saison', 'aide'].includes(tab)) ? '<div class="empty">Aucun concours. Créez-en un dans l’onglet Concours.</div>' : views[tab]());
  if (tab === 'com') drawQR();
  if (tab === 'reglages') { loadAssets(); drawSettingsQR(); }
}
tabsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; confirmKey = null; pick = null; render(); } });
main.addEventListener('input', (e) => { if (KIOSK && e.target.closest('#teamForm')) stashDraft(); });
main.addEventListener('change', async (e) => { if (e.target.id === 'cpick') { cid = e.target.value; editing = null; confirmKey = null; pick = null; await reloadContest(); render(); } });

const fmtPhone = (p) => String(p).replace(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5');
function teamLine(r, i, extra = '') {
  const t = r.teams, cap = t.captain, mate = t.mate;
  return `<li><span class="n num">${i + 1}</span><span class="who"><span class="tname">${esc(t.name)}</span>${r.pin && r.status === 'confirmee' ? ` <span class="lvl" title="Code d’équipe pour déclarer les résultats">Code ${esc(r.pin)}</span>` : ''}<br><span class="muted small">${esc(cap.first_name)}<span class="lvl">${LEVELS[cap.level]}</span>${mate ? ` &amp; ${esc(mate.first_name)}<span class="lvl">${LEVELS[mate.level]}</span>` : ' · <i>solo</i>'}${cap.phone ? ` · ${esc(fmtPhone(cap.phone))}` : ''} · ${r.source === 'sur_place' ? 'sur place' : 'en ligne'}</span></span>${extra}</li>`;
}

/* ---------- Écran comptoir : inscription + suivi des scores sur un écran tactile du bar ---------- */
const KIOSK = new URLSearchParams(location.search).has('comptoir');
const DRAFT = ['tName', 'p1', 'l1', 'p2', 'l2', 'phone'];
function stashDraft() { const d = {}; DRAFT.forEach((id) => { const el = $('#' + id); if (el) d[id] = el.value; }); sessionStorage.setItem('vb-draft', JSON.stringify(d)); }
function restoreDraft() { try { const d = JSON.parse(sessionStorage.getItem('vb-draft') || 'null'); if (d) DRAFT.forEach((id) => { const el = $('#' + id); if (el && d[id] != null) el.value = d[id]; }); } catch {} }
function vKiosk() {
  if (!c) return '<div class="empty">Aucun concours à l’affiche.</div>';
  const conf = confirmed(), pres = conf.filter((r) => r.present).length, run = c.status === 'en_cours';
  const played = c.matches.filter((m) => m.status === 'done' && !m.bye).length, total = c.matches.filter((m) => !(m.status === 'done' && m.bye)).length;
  const h = hoursOf(venue, c.date), end = run ? (c.date === today() ? Math.max(nowMin(), hm(c.start_time)) : hm(c.start_time)) + E.remainingMin(c, settings) : null;
  const bar = `<div class="kbar"><div><div class="eyebrow">Comptoir · ${esc(fmtDate(c.date))} · ${hhmm(c.start_time).replace(':', 'h')}</div>${pill(contestStatus(c, conf.length))}</div>
    <div class="kstats"><div><b class="num">${conf.length}/${c.max_teams}</b><span>inscrites</span></div><div><b class="num">${pres}</b><span>présentes</span></div>
    ${run ? `<div><b class="num">${played}/${total}</b><span>matchs joués</span></div><div><b class="num"${h && end > h.close ? ' style="color:var(--orange)"' : ''}>${fmtHM(end)}</b><span>fin estimée</span></div>` : ''}
    <div id="kexit" style="user-select:none;-webkit-user-select:none;touch-action:none"><b class="num" id="kclock">${fmtHM(nowMin())}</b><span>heure</span></div></div>
</div>`;
  let left, right;
  if (c.status === 'brouillon' || c.status === 'ouvert') {
    const recent = regs.filter((r) => r.status !== 'annulee').slice(-6).reverse();
    left = teamForm(true) + `<section class="panel"><h3>Dernières inscriptions</h3>${recent.length ? `<ul class="tlist">${recent.map((r, i) => teamLine(r, i, `<button class="btn ghost sm toggle" data-act="presence" data-id="${r.id}" aria-pressed="${r.present}"${r.status !== 'confirmee' ? ' disabled' : ''}>${r.status === 'attente' ? 'Attente' : r.present ? 'Présente' : 'Absente'}</button>`)).join('')}</ul>` : '<div class="empty">Les équipes inscrites ici apparaissent dans cette liste.</div>'}</section>`;
  } else left = `<section class="panel"><h2>Inscriptions fermées</h2><p class="muted">Le tirage est fait.</p></section>${c.phase === 'pools' ? poolsHTML(c) : ''}${c.matches.some((m) => m.ph === 'main') ? `<section class="panel"><h3>Tableau</h3>${bracketHTML(c, 'main')}</section>` : ''}`;
  if (run) right = machineBlock();
  else if (c.status === 'termine') right = '<section class="panel"><h2>Concours terminé</h2><p>Podium, lots et légende dans l’espace staff, onglet Résultats.</p></section>';
  else {
    const nP = pres, est = E.plan(c, Math.max(2, nP), settings), chk = slotChecks(venue, events, c, Math.max(2, nP), est), blocked = chk.some((x) => x.lvl === 'bad');
    right = `<section class="panel"><h2>Suivi des scores</h2><p class="muted">Les machines s’affichent ici dès le tirage au sort. Pointez les équipes à leur arrivée (bouton Présente), puis lancez le tirage.</p>${notices(chk)}
      ${confirmKey === 'draw' ? `<div class="confirmRow"><span>Tirer au sort ${nP} équipes présentes ? Les inscriptions seront fermées.</span><button class="btn red" data-act="draw">Confirmer</button><button class="btn ghost" data-act="cancel">Annuler</button></div>` : `<button class="btn red xl" data-act="ask" data-k="draw"${nP >= 2 && !blocked ? '' : ' disabled'}>Lancer le tirage (${nP} équipes)</button>`}</section>`;
  }
  return `<div class="kiosk">${bar}<div class="kgrid"><div class="stack">${left}</div><div class="stack">${right}</div></div></div>`;
}
setInterval(() => { const el = $('#kclock'); if (el) el.textContent = fmtHM(nowMin()); }, 20000);
/* Écran comptoir utilisé par les clients : aucun bouton vers l'espace staff. Le staff en sort par un appui long (3 s) sur l'heure. */
if (KIOSK) {
  let hold = null;
  const stop = () => { clearTimeout(hold); hold = null; };
  main.addEventListener('pointerdown', (e) => { if (e.target.closest('#kexit')) hold = setTimeout(() => { location.href = 'staff.html'; }, 3000); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => main.addEventListener(ev, stop));
  main.addEventListener('contextmenu', (e) => { if (e.target.closest('#kexit')) e.preventDefault(); });
}

/* ---------- Jour J ---------- */
function vJourJ() {
  const conf = confirmed();
  if (c.status === 'brouillon' || c.status === 'ouvert') {
    const nP = conf.filter((r) => r.present).length;
    const est = E.plan(c, Math.max(2, nP), settings);
    const chk = slotChecks(venue, events, c, Math.max(2, nP), est), blocked = chk.some((x) => x.lvl === 'bad');
    return `<div class="stack"><section class="panel"><div class="row" style="justify-content:space-between"><h2>1 · Pointage</h2><span class="muted num">${nP} présentes sur ${conf.length}</span></div>
      ${conf.length ? `<ul class="tlist">${conf.map((r, i) => teamLine(r, i, `<button class="btn ghost sm toggle" data-act="presence" data-id="${r.id}" aria-pressed="${r.present}">${r.present ? 'Présente' : 'Absente'}</button>`)).join('')}</ul>` : '<div class="empty">Aucune équipe confirmée.</div>'}</section>
      <section class="panel"><h2>2 · Tirage au sort</h2><p>${c.format === 'poules' ? 'Poules de 3 ou 4 équipes, puis tableau final avec les 2 premiers de chaque poule.' : `Élimination directe ; les perdants du 1er tour jouent la consolante en ${esc(c.conso_game)}.`}</p>${notices(chk)}
      ${confirmKey === 'draw' ? `<div class="confirmRow"><span>Tirer au sort ${nP} équipes ? Les inscriptions seront fermées.</span><button class="btn red" data-act="draw">Confirmer le tirage</button><button class="btn ghost" data-act="cancel">Annuler</button></div>`
        : `<div class="row"><button class="btn red xl" data-act="ask" data-k="draw"${nP >= 2 && !blocked ? '' : ' disabled'}>Lancer le tirage</button>${blocked && nP >= 2 ? '<span class="muted small">Format trop long pour l’heure de fermeture : réduisez le nombre d’équipes ou choisissez un jeu plus court dans Concours.</span>' : ''}</div>`}</section></div>`;
  }
  const ready = E.queue(c).filter((m) => m.status === 'ready'), free = E.launchable(c), N = E.machines(settings);
  const h = hoursOf(venue, c.date), close = h ? h.close : 0, isToday = c.date === today();
  const rem = E.remainingMin(c, settings), endEst = (isToday ? Math.max(nowMin(), hm(c.start_time)) : hm(c.start_time)) + rem, late = c.status === 'en_cours' && endEst > close;
  let o = `<div class="stack"><section class="panel"><div class="row" style="justify-content:space-between;align-items:flex-end"><div><div class="eyebrow">Chrono · fermeture ${fmtHM(close)}</div><div class="clock" id="clock">${isToday ? fmtDur(close - nowMin()) : '–'}</div><span class="muted small">avant la fermeture</span></div>
    <div style="text-align:right"><div class="eyebrow">Fin estimée</div><div class="clock" style="font-size:28px;color:${late ? 'var(--red)' : 'inherit'}">${c.status === 'termine' ? 'Terminé' : fmtHM(endEst)}</div><span class="muted small">${fmtDur(rem)} de jeu restant</span></div></div>
    ${late ? `<div class="notice bad">Risque de dépasser la fermeture : passez la consolante en jeu de fête court ou la finale en ${esc(c.game)} (onglet Concours).</div>` : ''}</section>`;
  if (c.status === 'termine') o += '<div class="notice good">Concours terminé. Podium, lots et légende dans l’onglet Résultats.</div>';
  o += machineBlock();
  const done = c.matches.filter((m) => m.status === 'done' && !m.bye).sort((a, b) => String(b.played_at).localeCompare(String(a.played_at)));
  if (done.length) o += `<section class="panel"><h3>Derniers résultats</h3>${done.slice(0, 6).map((m) => `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0"><span><b>${esc(tname(c, m.winner))}</b> bat ${esc(tname(c, m.loser))}${m.score ? ` (${esc(m.score)})` : ''}<br><span class="muted small">${esc(E.phaseLabel(c, m))}${m.reported_by === 'joueurs' ? ' · déclaré par les joueurs' : ''}</span></span>${E.canUndo(c, m) ? `<button class="x" data-act="undo" data-mid="${m.id}">Annuler</button>` : ''}</div>`).join('')}</section>`;
  if (c.pools && c.phase === 'pools') o += poolsHTML(c);
  if (c.matches.some((m) => m.ph === 'main')) o += `<section class="panel"><h3>Tableau</h3>${bracketHTML(c, 'main')}</section>`;
  if (c.matches.some((m) => m.ph === 'conso')) o += `<section class="panel"><h3>Consolante</h3>${bracketHTML(c, 'conso')}</section>`;
  o += `<details class="help panel"><summary>Rappel DARTSLIVE 2 pour le staff</summary><ul><li>Toutes les options : bouton <b>START jaune</b> pendant la partie, menu « Playing option ».</li><li><b>Freeze</b> : recommandé en 01 à deux équipes de 2. Une équipe ne peut finir que si le reste de son partenaire est inférieur au total de l’équipe adverse.</li><li><b>Handicap</b> (jeux 01) : à régler en début de partie si les niveaux sont trop écartés.</li><li><b>Switch the order</b> : changer l’ordre de passage sans réinsérer les cartes (début de partie).</li><li><b>Reverse-a-round</b> : revenir sur une volée lancée dans le mauvais ordre.</li><li><b>Medley</b> : au cork, appuyer sur le BULL lance un pile ou face pour décider qui commence.</li><li><b>Big Bull</b> nécessite la cible LED, présente sur la DARTSLIVE 2.</li></ul></details>`;
  return o + '</div>';
}
setInterval(() => { const el = $('#clock'); if (el && c) { const h = hoursOf(venue, c.date); el.textContent = fmtDur(h.close - nowMin()); } }, 30000);

function machineBlock() {
  const ready = E.queue(c).filter((m) => m.status === 'ready'), free = E.launchable(c), N = E.machines(settings);
  let o = '';
  let fi = 0, mach = '';
  for (let k = 1; k <= N; k++) {
    const lv = E.onMachine(c, k), ttl = N > 1 ? `Machine ${k}` : 'Sur la machine';
    if (lv) {
      const pk = pick?.mid === lv.id ? pick : null;
      mach += `<section class="panel"><h2>${ttl}</h2>${card(c, lv)}${pk
        ? `<div class="confirmRow" style="flex-direction:column;align-items:stretch"><b>Victoire de ${esc(tname(c, pk.w))}</b><div class="field"><label for="scoreIn">Score (facultatif)</label><input id="scoreIn" placeholder="ex. 2-1" maxlength="20"></div><div class="win2"><button class="btn green xl" data-act="confirmWin">Valider</button><button class="btn ghost xl" data-act="cancelPick">Annuler</button></div></div>`
        : `<p class="eyebrow">Touchez l’équipe gagnante</p><div class="win2"><button class="btn xl" data-act="pickWin" data-mid="${lv.id}" data-w="${lv.a}">${esc(tname(c, lv.a))}</button><button class="btn xl" data-act="pickWin" data-mid="${lv.id}" data-w="${lv.b}">${esc(tname(c, lv.b))}</button></div>`}
        <div class="row"><button class="btn ghost sm" data-act="unlive" data-mid="${lv.id}">Remettre en attente</button></div></section>`;
    } else if (free[fi]) {
      const m = free[fi++];
      mach += `<section class="panel"><h2>${ttl} · libre</h2>${card(c, m)}<button class="btn red xl" data-act="golive" data-mid="${m.id}" data-k="${k}">Lancer sur la machine ${k}</button><p class="muted small">Sur la DARTSLIVE ${k} : lancer <b>${esc(E.gameFor(c, m))}</b>.</p></section>`;
    } else if (c.status === 'en_cours') mach += `<section class="panel"><h2>${ttl} · libre</h2><p class="muted">${ready.length ? 'Les prochains matchs attendent une équipe encore en jeu.' : 'Aucun match prêt pour l’instant.'}</p></section>`;
  }
  if (mach) o += `<div class="grid2">${mach}</div>`;
  if (E.poolsDone(c) && !E.lives(c).length) o += `<section class="panel"><h2>Poules terminées</h2>${poolsHTML(c)}<button class="btn red xl" data-act="finalDraw">Générer le tableau final</button></section>`;
  const rest = free.slice(fi).concat(E.waitingMatches(c)), busy = E.busyTeams(c);
  if (rest.length) o += `<section class="panel"><h3>File d’attente</h3>${rest.slice(0, 6).map((m) => `${busy.has(m.a) || busy.has(m.b) ? '<div class="eyebrow">Attend la fin d’un match en cours</div>' : ''}${card(c, m)}`).join('')}${rest.length > 6 ? `<p class="muted small">+ ${rest.length - 6} autres matchs</p>` : ''}</section>`;
  return o;
}

/* ---------- Équipes ---------- */
function teamForm(kiosk) {
  const conf = confirmed();
  const lv = (id) => `<select id="${id}">${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}"${k === 'occasionnel' ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
  return `<form class="panel${kiosk ? ' kform' : ''}" id="teamForm"><h2>${kiosk ? 'Inscription' : 'Inscription sur place'}</h2>
    <div class="field"><label for="tName">Nom de l’équipe</label><input id="tName" maxlength="30" placeholder="Vide = prénoms des joueurs"></div>
    <div class="grid2"><div class="field"><label for="p1">Capitaine</label><input id="p1" required maxlength="25"></div><div class="field"><label for="l1">Niveau</label>${lv('l1')}</div>
    <div class="field"><label for="p2">Coéquipier</label><input id="p2" maxlength="25" placeholder="Vide = joueur solo"></div><div class="field"><label for="l2">Niveau</label>${lv('l2')}</div></div>
    <div class="field"><label for="phone">Téléphone du capitaine (facultatif sur place)</label><input id="phone" type="tel" inputmode="tel" autocomplete="off" maxlength="20"></div>
    <div class="consent">${kiosk ? '<label class="check big"><input type="checkbox" id="kPresent" checked> <span>Équipe présente au bar (pointée)</span></label>' : ''}<label class="check"><input type="checkbox" id="cAdult"> <span>Les joueurs confirment être majeurs.</span></label></div>
    <div class="row"><button class="btn${kiosk ? ' red xl' : ''}" type="submit">Inscrire</button><span class="muted small num">${conf.length} / ${c.max_teams}</span></div></form>`;
}
function vEquipes() {
  const conf = confirmed(), wait = waiting(), locked = c.status === 'en_cours' || c.status === 'termine', solos = conf.filter((r) => !r.teams.mate);
  const lv = (id) => `<select id="${id}">${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}"${k === 'occasionnel' ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
  return `<div class="cols">${locked ? '<div class="notice">Le tirage est fait : les inscriptions sont fermées.</div>' : `${teamForm(false)}`}
    <div class="stack"><section class="panel"><div class="row" style="justify-content:space-between"><h3>Confirmées</h3><span class="muted num">${conf.length} / ${c.max_teams}</span></div>
    ${conf.length ? `<ul class="tlist">${conf.map((r, i) => teamLine(r, i, locked ? '' : `<button class="x" data-act="cancelReg" data-id="${r.id}">Désinscrire</button>`)).join('')}</ul>` : '<div class="empty">Aucune équipe.</div>'}
    ${solos.length >= 2 && !locked ? `<div class="notice"><b>${solos.length} joueurs solo.</b> Associez-les : un confirmé avec un débutant quand c’est possible.<div class="row" style="margin-top:8px"><button class="btn sm" data-act="pairSolos">Associer les solos</button></div></div>` : ''}</section>
    ${wait.length ? `<section class="panel"><h3>Liste d’attente</h3><ul class="tlist">${wait.map((r, i) => teamLine(r, i, locked ? '' : `<button class="x" data-act="cancelReg" data-id="${r.id}">Retirer</button>`)).join('')}</ul></section>` : ''}</div></div>`;
}

/* ---------- Concours ---------- */
function blankContest() { return { id: null, date: '', start_time: '19:00', deadline_time: '18:45', max_teams: 8, format: 'elim', game: '301', final_game: 'Medley 3 manches', conso_game: 'Lucky Balloon', status: 'brouillon', prizes: { podium: ['Sac V and B', 'Sac V and B', 'Sac V and B'], conso: [{ id: 'k' + Date.now(), label: 'Vainqueur de la consolante', rule: 'consolante', winner: null }] } }; }
const opts = (list, v) => list.map((g) => `<option${g === v ? ' selected' : ''}>${esc(g)}</option>`).join('');
function vConcours() {
  const e = editing || c;
  if (!e) return '<div class="empty">Aucun concours. <button class="btn sm" data-act="newContest">Créer le premier</button></div>';
  const locked = e.status === 'en_cours' || e.status === 'termine';
  const est = E.plan(e, e.max_teams, settings);
  const fit = (() => { const h = e.date && hoursOf(venue, e.date); if (!h) return 0; let n = 0; for (let k = 2; k <= 64; k++) { if (E.plan(e, k, settings).min <= h.close - hm(e.start_time)) n = k; else break; } return n; })();
  return `<form class="panel" id="contestForm"><h2>${e.id ? 'Concours du ' + esc(fmtDate(e.date)) : 'Nouveau concours'}</h2><div class="row">${e.id ? pill(e.status) : ''}</div>
    <div class="grid3">
      <div class="field"><label for="cDate">Date</label><input id="cDate" type="date" required value="${e.date}"${locked ? ' disabled' : ''}></div>
      <div class="field"><label for="cStart">Début</label><input id="cStart" type="time" required value="${hhmm(e.start_time)}"${locked ? ' disabled' : ''}></div>
      <div class="field"><label for="cDead">Limite d’inscription en ligne</label><input id="cDead" type="time" required value="${hhmm(e.deadline_time)}"></div>
      <div class="field"><label for="cMax">Équipes max</label><input id="cMax" type="number" min="2" max="64" value="${e.max_teams}"></div>
      <div class="field"><label for="cFormat">Format</label><select id="cFormat"${locked ? ' disabled' : ''}><option value="elim"${e.format === 'elim' ? ' selected' : ''}>Élimination directe + consolante</option><option value="poules"${e.format === 'poules' ? ' selected' : ''}>Poules puis élimination</option></select></div>
      <div class="field"><label for="cGame">Jeu des matchs</label><select id="cGame">${opts(GAMES, e.game)}</select></div>
      <div class="field"><label for="cFinal">Jeu de la finale</label><select id="cFinal">${opts(GAMES, e.final_game)}</select></div>
      <div class="field"><label for="cConso">Jeu de la consolante</label><select id="cConso">${opts(PARTY.concat(GAMES), e.conso_game)}</select></div>
      <div class="field"><label for="cStatus">Statut</label><select id="cStatus"${locked ? ' disabled' : ''}>${locked ? `<option>${STATUS[e.status]}</option>` : `<option value="brouillon"${e.status === 'brouillon' ? ' selected' : ''}>Brouillon (invisible)</option><option value="ouvert"${e.status === 'ouvert' ? ' selected' : ''}>Inscriptions ouvertes</option>`}</select></div>
    </div>
    ${e.date ? notices(slotChecks(venue, events, e, e.max_teams, est)) + (fit ? `<p class="muted small">Ce créneau permet au plus <b>${fit} équipes</b> avec ces jeux.</p>` : '') : ''}
    <div class="grid3">${[0, 1, 2].map((i) => `<div class="field"><label for="lp${i}">Lot ${i + 1}${i ? 'e' : 're'} place</label><input id="lp${i}" maxlength="80" value="${esc(e.prizes.podium[i] || '')}"></div>`).join('')}</div>
    <span class="flabel">Prix de consolation</span><div class="stack" id="consoList">${(e.prizes.conso || []).map(consoRow).join('')}</div>
    <div class="row"><button type="button" class="btn ghost sm" data-act="addConso">+ Ajouter un prix</button></div>
    <div class="err" id="cErr" role="alert"></div>
    <div class="row"><button class="btn" type="submit">Enregistrer</button>${e.id ? `<button type="button" class="btn ghost" data-act="dupContest">Dupliquer pour la semaine suivante</button>` : ''}${e.id && !locked && !regs.length ? '<button type="button" class="btn ghost" data-act="ask" data-k="del">Supprimer</button>' : ''}</div>
    ${confirmKey === 'del' ? '<div class="confirmRow"><span>Supprimer ce concours ?</span><button type="button" class="btn red" data-act="delContest">Supprimer</button><button type="button" class="btn ghost" data-act="cancel">Garder</button></div>' : ''}
    ${locked ? (confirmKey === 'reset' ? '<div class="confirmRow"><span>Effacer le tirage et tous les résultats ?</span><button type="button" class="btn red" data-act="resetContest">Effacer</button><button type="button" class="btn ghost" data-act="cancel">Garder</button></div>' : '<div class="row"><button type="button" class="btn ghost sm" data-act="ask" data-k="reset">Annuler le tirage et les résultats…</button></div>') : ''}
  </form>`;
}
const consoRow = (k) => `<div class="consoRow" data-kid="${esc(k.id)}"><input value="${esc(k.label)}" aria-label="Intitulé du prix" maxlength="80"><select aria-label="Attribution"><option value="consolante"${k.rule === 'consolante' ? ' selected' : ''}>Vainqueur de la consolante</option><option value="tirage"${k.rule === 'tirage' ? ' selected' : ''}>Tirage au sort</option></select><button type="button" class="x" data-act="rmConso">Retirer</button></div>`;

/* ---------- Résultats ---------- */
function vResultats() {
  if (c.status !== 'termine') return '<div class="empty">Disponible à la fin du concours.</div>';
  const pd = E.podium(c), cw = E.consoWinner(c), conso = c.prizes.conso || [];
  const nextK = conso.find((k) => k.rule === 'tirage' && !k.winner);
  const excl = new Set([...pd, cw, ...conso.map((k) => k.winner)].filter(Boolean));
  const pool = regs.filter((r) => r.status === 'confirmee' && r.present && !excl.has(r.id));
  return `<div class="cols"><section class="panel"><h2>Podium</h2>${[0, 1, 2].map((i) => `<div class="row" style="gap:12px;padding:8px 0;border-bottom:1px solid var(--line)"><span class="medal m${i + 1}">${i + 1}</span><b style="flex:1">${pd[i] ? esc(tname(c, pd[i])) : '–'}</b><span class="small">${esc(c.prizes.podium[i] || '')}</span></div>`).join('')}
    ${c.podium_photo_url ? `<img class="photo" src="${esc(c.podium_photo_url)}" alt="Photo du podium">` : ''}
    <form id="photoForm" class="stack"><div class="field"><label for="photo">Photo du podium</label><input id="photo" type="file" accept="image/*" capture="environment"></div><label class="check"><input type="checkbox" id="photoOk"> <span>Les personnes sur la photo acceptent sa publication.</span></label><button class="btn ghost" type="submit">Publier la photo</button></form></section>
    <section class="panel"><h3>Prix de consolation</h3>${conso.map((k) => { const w = k.rule === 'consolante' ? cw : k.winner; return `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${esc(k.label)}</b><br><span class="muted small">${w ? 'Gagné par <b>' + esc(tname(c, w)) + '</b>' : k.rule === 'tirage' ? 'À tirer au sort' : '–'}</span></div>`; }).join('') || '<p class="muted">Aucun.</p>'}
    ${nextK ? `<button class="btn red" data-act="drawConso"${pool.length ? '' : ' disabled'}>Tirer au sort : ${esc(nextK.label)}</button><p class="muted small">${pool.length} équipe(s) dans l’urne (hors podium et déjà récompensées).</p>` : ''}</section></div>`;
}

/* ---------- Saison & record ---------- */
function vSaison() {
  return `<div class="cols"><form class="panel" id="recForm"><h2>Record de la semaine</h2><p class="muted small">Semaine du ${esc(fmtDate(weekMonday()))}. Saisissez le score affiché par la machine.</p>
    <div class="grid3"><div class="field"><label for="rGame">Jeu</label><select id="rGame"><option>Count-Up</option><option>Big Bull</option></select></div><div class="field"><label for="rPlayer">Joueur</label><input id="rPlayer" required maxlength="30"></div><div class="field"><label for="rScore">Score</label><input id="rScore" type="number" inputmode="numeric" min="0" max="2000" required></div></div>
    <div class="field"><label for="rPhoto">Photo de l’écran (facultatif)</label><input id="rPhoto" type="file" accept="image/*" capture="environment"></div>
    <button class="btn" type="submit">Enregistrer le score</button></form>
    <section class="panel" id="recList"><h3>Scores de la semaine</h3><div class="empty">Chargement…</div></section></div>`;
}
async function loadRecords() {
  const { data } = await sb.from('records').select('*').eq('week_start', weekMonday()).order('score', { ascending: false });
  const el = $('#recList'); if (!el) return;
  el.innerHTML = '<h3>Scores de la semaine</h3>' + ((data || []).length ? `<ul class="tlist">${data.map((r, i) => `<li><span class="n num">${i + 1}</span><span class="who"><b>${esc(r.player_name)}</b> · ${esc(r.game)}</span><span class="num"><b>${r.score}</b></span><button class="x" data-act="rmRecord" data-id="${r.id}">Retirer</button></li>`).join('')}</ul>` : '<div class="empty">Aucun score cette semaine.</div>');
}

/* ---------- Communication ---------- */
function captionAnnonce() {
  const left = Math.max(0, c.max_teams - confirmed().length), lots = c.prizes.podium.filter(Boolean);
  return `🎯 Concours de fléchettes · ${fmtDate(c.date)} à ${hhmm(c.start_time).replace(':', 'h')}\n📍 ${venue.name}, ${venue.address}\n✅ Gratuit · en équipe de 2 · débutants bienvenus (inscription solo possible)\n🎮 ${c.format === 'poules' ? 'Poules puis tableau final' : 'Élimination directe + consolante'} · ${c.game}, finale en ${c.final_game}\n🏆 Lots pour le podium${lots.length ? ` (${lots[0]})` : ''} + prix de consolation\n📝 Inscription : lien en bio ou ${SITE_URL}/?c=${c.id} · jusqu’à ${hhmm(c.deadline_time).replace(':', 'h')} · ${left} places restantes\nRéservé aux majeurs.\n${MENTION}`;
}
function captionResultats() {
  const pd = E.podium(c), cw = E.consoWinner(c), lines = [`🏆 Résultats du concours de fléchettes du ${fmtDate(c.date)}`];
  ['🥇', '🥈', '🥉'].forEach((m, i) => { if (pd[i]) lines.push(`${m} ${tname(c, pd[i])}`); });
  (c.prizes.conso || []).forEach((k) => { const w = k.rule === 'consolante' ? cw : k.winner; if (w) lines.push(`🎁 ${k.label} : ${tname(c, w)}`); });
  const nx = contests.filter((x) => x.date > c.date && x.status === 'ouvert').sort((a, b) => a.date.localeCompare(b.date))[0];
  lines.push('Merci à toutes les équipes !'); if (nx) lines.push(`Prochain concours : ${fmtDate(nx.date)} à ${hhmm(nx.start_time).replace(':', 'h')}. Inscription : lien en bio.`);
  lines.push(MENTION); return lines.join('\n');
}
function vCom() {
  const days = Math.round((new Date(c.date + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 864e5);
  return `<div class="cols"><section class="panel"><h2>Annonce</h2>${days >= 0 && days < 7 ? `<div class="notice warn">Le concours a lieu dans ${days} jour(s). Objectif : annoncer au moins 7 jours avant.</div>` : ''}
    <pre class="copyText" id="txtAnn">${esc(captionAnnonce())}</pre><div class="row"><button class="btn" data-act="copy" data-src="txtAnn">Copier la légende</button></div>
    <p class="muted small">Story avec sticker lien, puis « à la une » pour qu’elle reste visible. Rappel la veille et le jour même.</p>
    ${c.status === 'termine' ? `<h2>Résultats</h2><pre class="copyText" id="txtRes">${esc(captionResultats())}</pre><div class="row"><button class="btn" data-act="copy" data-src="txtRes">Copier la légende</button></div>` : ''}</section>
    <section class="panel" style="align-items:center"><h3>QR code d’inscription</h3><div class="qrBox" id="qr"></div><div class="linkLine">${esc(SITE_URL)}/?c=${c.id}</div><button class="btn ghost" data-act="dlQR">Télécharger le QR code</button></section></div>`;
}
function drawQR() { const el = $('#qr'); if (!el || typeof QRCode === 'undefined') return setTimeout(drawQR, 300); el.innerHTML = ''; new QRCode(el, { text: `${SITE_URL}/?c=${c.id}`, width: 1024, height: 1024, correctLevel: QRCode.CorrectLevel.M }); }

/* ---------- Réglages ---------- */
function vReglagesBase() {
  const season = seasons[0];
  return `<div class="cols"><form class="panel" id="durForm"><h2>Machines et durée des matchs</h2><p class="muted small">En minutes, à mesurer et ajuster après chaque concours.</p><div class="grid3">
    ${Object.entries(settings.durations).map(([g, v], i) => `<div class="field"><label for="d${i}">${esc(g)}</label><input id="d${i}" data-g="${esc(g)}" type="number" min="1" max="90" value="${v}"></div>`).join('')}
    <div class="field"><label for="dMach">Machines de fléchettes</label><input id="dMach" type="number" min="1" max="4" value="${E.machines(settings)}"></div>
    <div class="field"><label for="dChange">Changement d’équipe</label><input id="dChange" type="number" min="0" max="15" value="${settings.changeMin}"></div></div><button class="btn" type="submit">Enregistrer</button></form>
    <div class="stack"><form class="panel" id="evForm"><h3>Autres animations</h3><p class="muted small">Match diffusé, happy hour… pour repérer les conflits.</p><div class="grid3"><div class="field"><label for="eDate">Date</label><input id="eDate" type="date" required></div><div class="field"><label for="eTime">Heure</label><input id="eTime" type="time" required></div><div class="field"><label for="eLabel">Animation</label><input id="eLabel" required maxlength="50"></div></div><button class="btn sm" type="submit">Ajouter</button>
    ${events.length ? `<ul class="tlist">${events.map((e) => `<li><span class="who">${esc(fmtDate(e.date))} · ${hhmm(e.time)} · ${esc(e.label)}</span><button type="button" class="x" data-act="rmEvent" data-id="${e.id}">Retirer</button></li>`).join('')}</ul>` : ''}</form>
    ${season ? `<form class="panel" id="seasonForm"><h3>${esc(season.name)} · barème</h3><div class="grid3">${[['part', 'Participation'], ['win', 'Victoire'], ['p1', '1re place'], ['p2', '2e place'], ['p3', '3e place'], ['rec', 'Record semaine']].map(([k, l]) => `<div class="field"><label for="pt${k}">${l}</label><input id="pt${k}" type="number" min="0" max="50" value="${season.points[k]}"></div>`).join('')}</div><button class="btn sm" type="submit">Enregistrer</button></form>` : ''}</div></div>`;
}


function vReglages() {
  const sy = venue.settings?.syncedAt ? new Date(venue.settings.syncedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'jamais';
  const link = staffLink(), testUrl = new URL('test.html', location.href).href;
  return `<div class="cols" style="margin-bottom:18px"><section class="panel"><h2>Accès staff</h2>
    ${link ? `<p class="small"><b>Tablette ou téléphone :</b> scannez ce QR code avec l’appareil photo. <b>Ordinateur :</b> ouvrez le lien. Rien à saisir, l’appareil reste connecté.</p>
    <div class="row" style="align-items:flex-start;gap:16px"><div class="qrBox" id="staffQR" style="width:180px"></div><div class="stack" style="flex:1;min-width:200px"><span class="linkLine" id="staffLink">${esc(link)}</span>
    <div class="row"><button type="button" class="btn ghost sm" data-act="copy" data-src="staffLink">Copier le lien</button><button type="button" class="btn ghost sm" data-act="dlStaffQR">Télécharger le QR code</button></div>
    <p class="muted small">Gardez-les hors de la vue des clients : ils donnent accès à tout l’espace staff.</p></div></div>` : '<p class="muted small">Cet appareil a été ouvert avant la mise en place du lien fixe : ouvrez-le une fois avec le lien staff pour afficher ici le QR code.</p>'}</section>
    <section class="panel"><h2>Page test téléphone</h2><p class="small">Pour vérifier qu’un téléphone gère tout (connexion, direct, notifications, inscription, Mon match, Mes scores). Scannez avec le téléphone à tester :</p>
    <div class="row" style="align-items:flex-start;gap:16px"><div class="qrBox" id="testQR" style="width:150px"></div><div class="stack" style="flex:1;min-width:180px"><span class="linkLine">${esc(testUrl)}</span><p class="muted small">Créez d’abord le concours de test plus bas pour pouvoir faire le parcours complet.</p></div></div></section></div>`
    + vReglagesBase() + `<section class="panel" style="margin-top:18px"><h2>Concours de test</h2><p class="muted small">Crée un concours d’essai « (test) » avec 12 équipes (10 présentes) pour s’entraîner : tirage, machines, page joueurs (codes d’équipe 1001 à 1012) et écran TV. Il ne compte jamais dans le classement de la saison ; effacez-le après l’essai.</p>
    <div class="row"><button class="btn" data-act="testCreate">Créer ou remettre à zéro</button><button class="btn ghost" data-act="testDelete">Effacer le concours de test</button></div></section>`
    + `<section class="panel" style="margin-top:18px"><h2>Fiche magasin vandb.fr</h2><p class="muted small">Horaires, fermetures exceptionnelles et coordonnées sont repris chaque matin de la fiche du magasin sur vandb.fr. Dernière mise à jour : ${esc(sy)}.</p><div class="row"><button class="btn" data-act="syncStore">Mettre à jour maintenant</button></div></section>`
    + `<section class="panel" style="margin-top:18px"><h2>Fichiers du site</h2>
    <p class="muted small">Les fichiers volumineux sont stockés dans Supabase (bucket « assets »), pas sur GitHub : logo, images, vidéos pour l’écran du bar. 50 Mo maximum par fichier.</p>
    <form id="assetForm" class="grid2"><div class="field"><label for="aFile">Fichier</label><input id="aFile" type="file" accept="image/*,video/mp4,video/webm,font/woff2,application/pdf" required></div>
    <div class="field"><label for="aName">Enregistrer sous</label><select id="aName"><option value="logo">Logo du bar (Flechettes/Images/logo.png, affiché en tête des pages)</option><option value="">Nom d’origine du fichier</option></select></div>
    <div class="row"><button class="btn" type="submit">Envoyer</button></div></form>
    <div id="assetList"><div class="empty">Chargement…</div></div></section>`;
}
function drawSettingsQR() {
  if (typeof QRCode === 'undefined') return setTimeout(drawSettingsQR, 300);
  const put = (id, text, size) => { const el = $('#' + id); if (!el || !text) return; el.innerHTML = ''; new QRCode(el, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M }); };
  put('staffQR', staffLink(), 720); put('testQR', new URL('test.html', location.href).href, 600);
}
async function loadAssets() {
  const el = $('#assetList'); if (!el) return;
  const { data, error } = await sb.storage.from('assets').list(ASSETS_DIR, { limit: 200, sortBy: { column: 'name', order: 'asc' } });
  if (error) { el.innerHTML = `<div class="notice bad">${esc(error.message)}</div>`; return; }
  const files = (data || []).filter((f) => f.id);
  el.innerHTML = files.length ? `<ul class="tlist">${files.map((f) => { const url = sb.storage.from('assets').getPublicUrl(`${ASSETS_DIR}/${f.name}`).data.publicUrl; const kb = Math.round((f.metadata?.size || 0) / 1024);
    return `<li><span class="who"><b>${esc(f.name)}</b><br><span class="muted small">${kb > 1024 ? (kb / 1024).toFixed(1) + ' Mo' : kb + ' Ko'} · <a href="${esc(url)}" target="_blank" rel="noopener">ouvrir</a></span></span>${confirmKey === 'asset:' + f.name ? `<button type="button" class="btn red sm" data-act="rmAsset" data-name="${esc(ASSETS_DIR + '/' + f.name)}">Confirmer</button><button type="button" class="x" data-act="cancel">Garder</button>` : `<button type="button" class="x" data-act="ask" data-k="asset:${esc(f.name)}">Supprimer</button>`}</li>`; }).join('')}</ul>` : '<div class="empty">Aucun fichier pour l’instant.</div>';
}

/* ---------- actions ---------- */
async function rpcErr(p) { const { data, error } = await p; if (error) { toast(error.message.replace(/^.*?: /, '')); throw error; } return data; }
const A = {
  ask: (t) => { confirmKey = t.dataset.k; render(); },
  cancel: () => { confirmKey = null; render(); },
  presence: async (t) => { const r = regs.find((x) => x.id === t.dataset.id); r.present = !r.present; render(); const { error } = await sb.from('registrations').update({ present: r.present }).eq('id', r.id); if (error) { toast('Pointage non enregistré'); r.present = !r.present; render(); } },
  draw: async () => {
    const present = confirmed().filter((r) => r.present).map((r) => r.id);
    c.teams = confirmed().map((r) => ({ id: r.id, name: r.teams.name }));
    E.draw(c, present); confirmKey = null; busy = true;
    await sb.from('matches').delete().eq('contest_id', c.id);
    await persist('Tirage effectué');
    await sb.from('contests').update({ started_at: new Date().toISOString() }).eq('id', c.id);
  },
  finalDraw: () => { E.buildFinalFromPools(c); persist('Tableau final généré'); },
  golive: (t) => { const k = +t.dataset.k || 1, m = c.matches.find((x) => x.id === t.dataset.mid), b = E.busyTeams(c); if (!m || m.status !== 'ready' || E.onMachine(c, k) || b.has(m.a) || b.has(m.b)) return; Object.assign(m, { status: 'live', machine: k, live_at: new Date().toISOString() }); persist(`Match lancé sur la machine ${k}`); },
  unlive: (t) => { Object.assign(c.matches.find((m) => m.id === t.dataset.mid), { status: 'ready', machine: null }); persist(); },
  pickWin: (t) => { pick = { mid: t.dataset.mid, w: t.dataset.w }; render(); $('#scoreIn')?.focus(); },
  cancelPick: () => { pick = null; render(); },
  confirmWin: () => {
    const m = c.matches.find((x) => x.id === pick.mid); const score = ($('#scoreIn')?.value || '').trim().slice(0, 20);
    Object.assign(m, { winner: pick.w, loser: m.a === pick.w ? m.b : m.a, score, status: 'done', played_at: new Date().toISOString(), reported_by: 'staff' });
    pick = null; E.resolve(c); E.autoFill(c, settings);
    persist('Victoire enregistrée');
  },
  undo: (t) => { const m = c.matches.find((x) => x.id === t.dataset.mid); if (!E.canUndo(c, m)) return; E.undo(c, m, settings); E.resolve(c); sb.from('results').delete().eq('contest_id', c.id).then(() => persist('Résultat annulé')); },
  cancelReg: async (t) => {
    const r = regs.find((x) => x.id === t.dataset.id);
    const promoted = await rpcErr(sb.rpc('cancel_registration', { p_token: r.cancel_token }));
    toast(promoted ? 'Équipe retirée : la première équipe en attente prend la place (prévenue sur son téléphone si elle a activé les notifications)' : 'Équipe retirée'); await reloadContest(); render();
  },
  pairSolos: async () => { const n = await rpcErr(sb.rpc('pair_solos', { p_contest: c.id })); toast(`${n} équipe(s) formée(s)`); await reloadContest(); render(); },
  newContest: () => { editing = blankContest(); tab = 'concours'; render(); },
  addConso: () => { const l = $('#consoList'); l.insertAdjacentHTML('beforeend', consoRow({ id: 'k' + Date.now(), label: '', rule: 'tirage' })); l.lastElementChild.querySelector('input').focus(); },
  rmConso: (t) => t.closest('.consoRow').remove(),
  dupContest: async () => {
    const src = c; let d = addDays(src.date < today() ? today() : src.date, 7), g = 0; while (closedReason(venue, d) && g++ < 10) d = addDays(d, 1);
    const copy = { date: d, start_time: src.start_time, deadline_time: src.deadline_time, max_teams: src.max_teams, format: src.format, game: src.game, final_game: src.final_game, conso_game: src.conso_game, status: 'brouillon', prizes: { podium: src.prizes.podium, conso: (src.prizes.conso || []).map((k) => ({ ...k, winner: null })) } };
    const { data, error } = await sb.from('contests').insert(copy).select().single(); if (error) return toast(error.message);
    cid = data.id; editing = null; toast('Concours dupliqué en brouillon'); await reloadAll();
  },
  delContest: async () => { const { error } = await sb.from('contests').delete().eq('id', c.id); if (error) return toast(error.message); cid = null; confirmKey = null; toast('Concours supprimé'); await reloadAll(); },
  resetContest: async () => { await sb.from('results').delete().eq('contest_id', c.id); await sb.from('matches').delete().eq('contest_id', c.id); const conso = (c.prizes.conso || []).map((k) => ({ ...k, winner: null })); await sb.from('contests').update({ status: 'ouvert', phase: null, pools: null, started_at: null, finished_at: null, prizes: { ...c.prizes, conso } }).eq('id', c.id); confirmKey = null; toast('Tirage effacé'); await reloadContest(); render(); },
  drawConso: async () => {
    const pd = E.podium(c), cw = E.consoWinner(c), conso = c.prizes.conso.map((k) => ({ ...k }));
    const k = conso.find((x) => x.rule === 'tirage' && !x.winner); const excl = new Set([...pd, cw, ...conso.map((x) => x.winner)].filter(Boolean));
    const pool = regs.filter((r) => r.status === 'confirmee' && r.present && !excl.has(r.id)); if (!k || !pool.length) return;
    k.winner = pool[Math.floor(Math.random() * pool.length)].id;
    const { error } = await sb.from('contests').update({ prizes: { ...c.prizes, conso } }).eq('id', c.id); if (error) return toast(error.message);
    toast(`${k.label} : ${tname(c, k.winner)}`); await reloadContest(); render();
  },
  syncStore: async () => { toast('Lecture de vandb.fr…'); const { data, error } = await sb.functions.invoke('sync-store', { body: {} }); if (error || !data?.updated) { let m = data?.reason; try { m = m || (await error.context.json()).reason; } catch {} return toast('Mise à jour impossible : ' + (m || 'erreur')); } toast(data.changes.length ? 'Mis à jour : ' + data.changes.join(', ') : 'Déjà à jour'); venue = await loadVenue(); settings = venue.settings; render(); },
  dlStaffQR: () => { const img = $('#staffQR canvas') || $('#staffQR img'); if (!img) return; const a = document.createElement('a'); a.href = img.toDataURL ? img.toDataURL('image/png') : img.src; a.download = 'qr-staff-flechettes.png'; a.click(); },
  testCreate: async () => { const id = await rpcErr(sb.rpc('create_test_contest')); cid = id; toast('Concours de test prêt (12 équipes, codes 1001 à 1012)'); tab = 'jourj'; await reloadAll(); },
  testDelete: async () => { await rpcErr(sb.rpc('delete_test_contest')); if (cid === '7e570000-0000-4000-8000-000000000001') cid = null; toast('Concours de test effacé'); await reloadAll(); },
  rmAsset: async (t) => { const { error } = await sb.storage.from('assets').remove([t.dataset.name]); confirmKey = null; toast(error ? error.message : 'Fichier supprimé'); loadAssets(); },
  rmRecord: async (t) => { await sb.from('records').delete().eq('id', t.dataset.id); loadRecords(); },
  rmEvent: async (t) => { await sb.from('events').delete().eq('id', t.dataset.id); await reloadAll(); },
  copy: (t) => copyText($('#' + t.dataset.src).textContent),
  dlQR: () => { const img = $('#qr canvas') || $('#qr img'); if (!img) return; const a = document.createElement('a'); a.href = img.toDataURL ? img.toDataURL('image/png') : img.src; a.download = `qr-concours-${c.date}.png`; a.click(); },
};
main.addEventListener('click', (e) => { const t = e.target.closest('[data-act]'); if (!t) return; e.preventDefault(); A[t.dataset.act]?.(t); });

async function upload(file, path) {
  const { error } = await sb.storage.from('photos').upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error; return sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
}
main.addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target, v = (id) => ($('#' + id)?.value ?? '').trim();
  if (f.id === 'teamForm') {
    if (!v('p1')) return toast('Indiquez le capitaine'); if (!$('#cAdult').checked) return toast('Confirmez que les joueurs sont majeurs');
    const res = await rpcErr(sb.rpc('register_team', { p_contest: c.id, p_team_name: v('tName'), p_captain: v('p1'), p_phone: v('phone'), p_captain_level: $('#l1').value, p_mate: v('p2'), p_mate_level: $('#l2').value, p_adult: true, p_source: 'sur_place' }));
    const r = res?.[0];
    if (r && r.status === 'confirmee' && $('#kPresent')?.checked) await sb.from('registrations').update({ present: true }).eq('id', r.registration_id);
    sessionStorage.removeItem('vb-draft');
    toast(`${v('tName') || v('p1')} : ${r?.status === 'attente' ? 'en liste d’attente' : 'inscrite'}${r?.pin ? ` · code d’équipe ${r.pin}` : ''}`); await reloadContest(); render();
  }
  if (f.id === 'contestForm') {
    const e0 = editing || c, locked = e0.status === 'en_cours' || e0.status === 'termine';
    const conso = [...f.querySelectorAll('.consoRow')].map((r) => { const old = (e0.prizes.conso || []).find((k) => k.id === r.dataset.kid); const rule = r.querySelector('select').value; return { id: r.dataset.kid, label: r.querySelector('input').value.trim(), rule, winner: old && old.rule === rule ? old.winner : null }; }).filter((k) => k.label);
    const row = { deadline_time: v('cDead'), max_teams: Math.max(2, Math.min(64, +v('cMax') || 8)), game: v('cGame'), final_game: v('cFinal'), conso_game: v('cConso'), prizes: { podium: [0, 1, 2].map((i) => v('lp' + i)), conso } };
    if (!locked) Object.assign(row, { date: v('cDate'), start_time: v('cStart'), format: v('cFormat'), status: v('cStatus') });
    const q = e0.id ? sb.from('contests').update(row).eq('id', e0.id).select().single() : sb.from('contests').insert(row).select().single();
    const { data, error } = await q; if (error) { $('#cErr').textContent = error.message; return; }
    cid = data.id; editing = null; toast('Concours enregistré'); await reloadAll();
  }
  if (f.id === 'photoForm') {
    const file = $('#photo').files[0]; if (!file) return toast('Choisissez une photo'); if (!$('#photoOk').checked) return toast('L’accord des personnes est nécessaire');
    try { const url = await upload(file, `podium/${c.id}-${Date.now()}.jpg`); await sb.from('contests').update({ podium_photo_url: url }).eq('id', c.id); toast('Photo publiée'); await reloadContest(); render(); } catch (err) { toast('Envoi impossible : ' + err.message); }
  }
  if (f.id === 'recForm') {
    let photo_url = null; const file = $('#rPhoto').files[0];
    try { if (file) photo_url = await upload(file, `records/${weekMonday()}-${Date.now()}.jpg`); } catch { toast('Photo non envoyée, score enregistré quand même'); }
    const { error } = await sb.from('records').insert({ week_start: weekMonday(), game: v('rGame'), player_name: v('rPlayer'), score: +v('rScore'), photo_url });
    if (error) return toast(error.message); toast('Score enregistré'); f.reset(); loadRecords();
  }
  if (f.id === 'durForm') {
    const durations = {}; f.querySelectorAll('[data-g]').forEach((i) => { durations[i.dataset.g] = Math.max(1, Math.min(90, +i.value || 10)); });
    settings = { ...settings, durations, changeMin: Math.max(0, Math.min(15, +v('dChange') || 0)), machines: Math.max(1, Math.min(4, +v('dMach') || 1)) };
    const { error } = await sb.from('venues').update({ settings }).eq('id', 1); toast(error ? error.message : 'Durées enregistrées');
  }
  if (f.id === 'evForm') { const { error } = await sb.from('events').insert({ date: v('eDate'), time: v('eTime'), label: v('eLabel') }); if (error) return toast(error.message); toast('Animation ajoutée'); await reloadAll(); }
  if (f.id === 'assetForm') {
    const file = $('#aFile').files[0]; if (!file) return toast('Choisissez un fichier');
    if (file.size > 50 * 1024 * 1024) return toast('Fichier trop lourd (50 Mo maximum)');
    const name = $('#aName').value === 'logo' ? LOGO_PATH : `${ASSETS_DIR}/` + file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
    const { error } = await sb.storage.from('assets').upload(name, file, { upsert: true, contentType: file.type, cacheControl: name === LOGO_PATH ? '300' : '86400' });
    toast(error ? 'Envoi impossible : ' + error.message : `${name} envoyé`); f.reset(); loadAssets();
  }
  if (f.id === 'seasonForm') { const points = {}; ['part', 'win', 'p1', 'p2', 'p3', 'rec'].forEach((k) => { points[k] = Math.max(0, +v('pt' + k) || 0); }); const { error } = await sb.from('seasons').update({ points }).eq('id', seasons[0].id); toast(error ? error.message : 'Barème enregistré'); await reloadAll(); }
});
new MutationObserver(() => { if (tab === 'saison' && $('#recList')?.querySelector('.empty')) loadRecords(); }).observe(main, { childList: true });

boot().catch((e) => { console.error(e); main.innerHTML = '<div class="notice bad">Erreur de chargement. Vérifiez la connexion et la configuration (config.js).</div>'; });
