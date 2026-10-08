// Page publique : annonce du concours, inscription en moins d'une minute, tableau en direct, résultats, saison.
import { sb, loadVenue, loadContestFull } from './sb.js';
import { $, esc, fmtDate, hhmm, LEVELS, pill, contestStatus, toast, icsFile, weekMonday } from './util.js';
import { podium, consoWinner, lives, launchable, waitingMatches, machines } from './engine.js';
import { card, bracketHTML, poolsHTML, tname } from './views.js';
import { gamesPanel, gameCard } from './games.js';
import { pushPanel, enablePush } from './push.js';

const main = $('#main');
const params = new URLSearchParams(location.search);
let venue, contests = [], current = null, full = null, tab = params.get('tab') || 'concours', channel = null, done = null;


async function boot() {
  venue = await loadVenue();
  $('#venue').textContent = venue.name;
  const { data } = await sb.from('contests').select('*').neq('status', 'brouillon').order('date', { ascending: true });
  contests = data || [];
  const tok = params.get('t');
  if (tok) { const { data } = await sb.rpc('get_registration', { p_token: tok }); if (data) { rememberReg(data.contest.id, { token: tok, team: data.team }); if (!myProfile()?.token) saveProfile({ token: tok, team: data.team }); params.set('c', data.contest.id); } }
  const want = params.get('c');
  const upcoming = contests.filter((c) => c.status === 'en_cours')[0] || contests.find((c) => c.status === 'ouvert');
  await select(want && contests.find((c) => c.id === want) ? want : (upcoming || contests[contests.length - 1])?.id);
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; done = null; render(); }));
}

async function select(id) {
  current = contests.find((c) => c.id === id) || null;
  clearInterval(waitTimer); waitInfo = null;
  if (current && myReg() && !myTeam()) { checkWaiting(); waitTimer = setInterval(checkWaiting, 30000); }
  full = current ? await loadContestFull(current.id) : null;
  if (channel) sb.removeChannel(channel);
  if (current) {
    channel = sb.channel('c-' + current.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `contest_id=eq.${current.id}` }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contests', filter: `id=eq.${current.id}` }, refresh)
      .subscribe();
  }
  render();
}
let refreshTimer = null;
function refresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(async () => { full = await loadContestFull(current.id); if (tab !== 'concours' && !(tab === 'monmatch' && report)) render(); }, 400); }
setInterval(() => { if (current && tab === 'concours' && !done) refresh(); }, 60000);

function picker() {
  if (contests.length < 2) return '';
  return `<div class="field" style="max-width:440px"><label for="cpick">Concours</label><select id="cpick">${contests.map((c) => `<option value="${c.id}"${c.id === current?.id ? ' selected' : ''}>${esc(fmtDate(c.date))} · ${hhmm(c.start_time)}</option>`).join('')}</select></div>`;
}

function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  if (tab === 'contact') { main.innerHTML = viewContact(); return; }
  if (tab === 'scores') { main.innerHTML = '<div class="empty">Chargement…</div>'; viewScores(); return; }
  if (tab === 'monmatch') { main.innerHTML = picker() + `<div id="view" style="margin-top:12px">${viewMonMatch()}</div>`; $('#cpick')?.addEventListener('change', (e) => select(e.target.value)); bindMonMatch(); return; }
  if (!current) { main.innerHTML = '<div class="empty">Aucun concours annoncé pour le moment. Revenez bientôt !</div>'; return; }
  main.innerHTML = picker() + `<div id="view" style="margin-top:12px">${tab === 'tableau' ? viewTableau() : tab === 'resultats' ? viewResultats() : tab === 'saison' ? '<div class="empty">Chargement…</div>' : viewConcours()}</div>`;
  $('#cpick')?.addEventListener('change', (e) => { done = null; select(e.target.value); });
  if (tab === 'saison') viewSaison();
  if (tab === 'concours' && !done) bindForm();
}

function teamLine(t, i) {
  return `<li><span class="n num">${i + 1}</span><span class="who"><span class="tname">${esc(t.team_name)}</span><br><span class="muted small">${esc(t.captain_name)}<span class="lvl">${LEVELS[t.captain_level]}</span>${t.mate_name ? ` &amp; ${esc(t.mate_name)}<span class="lvl">${LEVELS[t.mate_level]}</span>` : ' · <i>cherche un coéquipier</i>'}</span></span></li>`;
}

function viewConcours() {
  const c = current, conf = full.teams.filter((t) => t.status === 'confirmee'), wait = full.teams.filter((t) => t.status === 'attente');
  const st = contestStatus(full, conf.length), left = Math.max(0, c.max_teams - conf.length);
  const deadline = new Date(`${c.date}T${hhmm(c.deadline_time)}:00`);
  const open = (st === 'ouvert' || st === 'complet') && new Date() < deadline;
  const prizes = c.prizes || { podium: [], conso: [] };
  if (done) return confirmation();
  return `<div class="cols"><section class="panel"><div class="row">${pill(st)}</div><h2>${esc(fmtDate(c.date, true))} à ${hhmm(c.start_time).replace(':', 'h')}</h2>
    <div class="facts"><div class="fact"><span>Format</span><b>${c.format === 'poules' ? 'Poules + tableau' : 'Élimination directe'}</b></div><div class="fact"><span>Jeu</span><b>${esc(c.game)}</b></div>
    <div class="fact"><span>Places restantes</span><b class="num">${st === 'en_cours' || st === 'termine' ? '–' : `${left} / ${c.max_teams}`}</b></div><div class="fact"><span>Inscription jusqu’à</span><b>${hhmm(c.deadline_time).replace(':', 'h')}</b></div></div>
    <div class="tags"><span class="pill">Gratuit</span><span class="pill">Équipes de 2</span><span class="pill">Débutants bienvenus</span><span class="pill">Solo accepté</span></div>
    <p>Finale en ${esc(c.final_game)}${c.format === 'elim' ? `, consolante en ${esc(c.conso_game)} pour les perdants du premier tour` : ''}. Les matchs se jouent sur les ${machines(venue.settings) > 1 ? machines(venue.settings) + ' machines' : 'la machine'} DARTSLIVE 2 du bar.</p>
    <h3>Lots</h3><ul style="margin:0;padding-left:18px">${prizes.podium.map((l, i) => l ? `<li><b>${i + 1}${i ? 'e' : 're'} place :</b> ${esc(l)}</li>` : '').join('')}${(prizes.conso || []).map((k) => `<li>${esc(k.label)}</li>`).join('')}</ul></section>
    <div class="stack">${open ? form(st === 'complet') : `<div class="notice">${st === 'en_cours' ? 'Le concours est en cours : suivez-le dans l’onglet Tableau.' : st === 'termine' ? 'Concours terminé : voir l’onglet Résultats.' : 'Les inscriptions en ligne sont closes. Demandez au comptoir s’il reste de la place.'}</div>`}
    <section class="panel"><div class="row" style="justify-content:space-between"><h3>Équipes inscrites</h3><span class="muted num">${conf.length} / ${c.max_teams}</span></div>
    ${conf.length ? `<ul class="tlist">${conf.map(teamLine).join('')}</ul>` : '<div class="empty">Aucune équipe pour l’instant. Soyez les premiers !</div>'}
    ${wait.length ? `<p class="muted small">${wait.length} équipe(s) en liste d’attente.</p>` : ''}</section></div></div>${gamesPanel(c)}`;
}

function form(full) {
  const me = myProfile() || {}, val = (k) => esc(me[k] || '');
  const lv = (id) => `<select id="${id}">${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}"${k === (me[id] || 'occasionnel') ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
  return `<form class="panel" id="regForm" novalidate><h2>Inscrire mon équipe</h2>${full ? '<div class="notice warn">Complet : votre équipe sera placée en liste d’attente et prévenue si une place se libère.</div>' : ''}
    ${me.team ? `<div class="notice good">Bon retour ! Votre équipe <b>${esc(me.team)}</b> et votre numéro sont repris : vos scores s’ajoutent à votre suivi (onglet « Mes scores »).</div>` : ''}
    <div class="field"><label for="tName">Nom de l’équipe${me.team ? '' : ' (facultatif)'}</label><input id="tName" maxlength="30" autocomplete="off" value="${val('team')}"></div>
    <div class="grid2"><div class="field"><label for="p1">Votre prénom ou pseudo</label><input id="p1" required maxlength="25" autocomplete="given-name" value="${val('p1')}"></div><div class="field"><label for="l1">Votre niveau</label>${lv('l1')}</div>
    <div class="field"><label for="p2">Prénom du coéquipier</label><input id="p2" maxlength="25" placeholder="Vide si vous venez seul" value="${val('p2')}"></div><div class="field"><label for="l2">Son niveau</label>${lv('l2')}</div></div>
    <div class="field"><label for="phone">Votre numéro de téléphone</label><input id="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="06 12 34 56 78" required value="${val('phone')}"></div>
    <p class="muted small">Il identifie votre équipe d’un concours à l’autre : le nom d’équipe reste attaché à votre numéro et vos scores sont suivis sur la saison. Il n’est jamais affiché. Aucun e-mail ni SMS : la confirmation et votre code d’équipe s’affichent sur ce téléphone, et vous pourrez activer les notifications.</p>
    <div class="consent">
      <label class="check"><input type="checkbox" id="cAdult" required> <span>Nous sommes majeurs (obligatoire).</span></label>
    </div>
    <div class="err" id="regErr" role="alert"></div>
    <button class="btn red xl" type="submit">Inscrire mon équipe</button></form>`;
}

function bindForm() {
  const f = $('#regForm'); if (!f) return;
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); const err = $('#regErr'); err.textContent = '';
    const v = (id) => $('#' + id).value.trim();
    if (!v('p1')) return (err.textContent = 'Indiquez votre prénom ou pseudo.');
    const digits = v('phone').replace(/\D/g, '').replace(/^33(?=[1-9]\d{8}$)/, '0');
    if (!/^0[1-9]\d{8}$/.test(digits) && !/^\d{9,15}$/.test(digits)) return (err.textContent = 'Indiquez votre numéro de téléphone (10 chiffres).');
    if (!$('#cAdult').checked) return (err.textContent = 'Le concours est réservé aux majeurs.');
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Inscription…';
    const { data, error } = await sb.rpc('register_team', {
      p_contest: current.id, p_team_name: v('tName'), p_captain: v('p1'), p_phone: v('phone'),
      p_captain_level: $('#l1').value, p_mate: v('p2'), p_mate_level: $('#l2').value, p_adult: true,
    });
    if (error) { btn.disabled = false; btn.textContent = 'Inscrire mon équipe'; err.textContent = error.message.replace(/^.*?: /, ''); return; }
    const r = data[0];
    done = { ...r, team: v('tName') || (v('p2') ? `${v('p1')} & ${v('p2')}` : `Solo · ${v('p1')}`) };
    rememberReg(current.id, { token: r.cancel_token, team: done.team });
    saveProfile({ phone: v('phone'), p1: v('p1'), l1: $('#l1').value, p2: v('p2'), l2: $('#l2').value, team: /^Solo · /.test(done.team) ? '' : done.team, token: r.cancel_token });
    if (r.pin) savePin(current.id, { registration_id: r.registration_id, team: done.team, pin: r.pin });
    if (r.status === 'attente') { clearInterval(waitTimer); waitTimer = setInterval(checkWaiting, 30000); checkWaiting(); }
    full = await loadContestFull(current.id); render(); window.scrollTo(0, 0);
  });
}

function confirmation() {
  const c = current, manage = `gerer.html?t=${done.cancel_token}`, wait = done.status === 'attente';
  return `<section class="panel" style="max-width:640px"><div class="row">${wait ? '<span class="pill warn">Liste d’attente</span>' : '<span class="pill ok">Inscription confirmée</span>'}</div>
    <h2>${esc(done.team)}</h2>${wait
      ? `<div class="notice warn"><b>Il n’y a plus de place.</b> Votre équipe est en liste d’attente. Si une place se libère, vous êtes inscrits automatiquement et votre code d’équipe apparaîtra dans l’onglet « Mon match » de ce téléphone.</div>${pushPanel(done.cancel_token, true)}`
      : `<div class="notice good">Votre code d’équipe : <b style="font-size:26px;letter-spacing:.2em">${esc(done.pin)}</b><br><span class="small">Il est enregistré sur ce téléphone : l’onglet « Mon match » l’utilise automatiquement le jour du concours. Notez-le pour votre coéquipier.</span></div><p>C’est noté, à bientôt au bar !</p>${pushPanel(done.cancel_token, false)}`}
    <div class="facts"><div class="fact"><span>Quand</span><b>${esc(fmtDate(c.date))} · ${hhmm(c.start_time).replace(':', 'h')}</b></div><div class="fact"><span>Où</span><b>${esc(venue.name)}</b></div></div>
    <p class="muted">${esc(venue.address)} · pointage 15 minutes avant le début.</p>
    <div class="row">${wait ? '' : `<a class="btn" href="${icsFile(c, venue)}" download="concours-flechettes.ics">Ajouter à mon agenda</a>`}<a class="btn ghost" href="${manage}">Gérer ou annuler</a></div>
    <p class="muted small">Ce téléphone garde votre inscription. Lien pour la gérer ou l’annuler depuis un autre appareil :<br><span class="linkLine" style="display:inline-block;margin-top:6px">${esc(location.origin + location.pathname.replace(/[^/]*$/, '') + manage)}</span></p></section>`;
}

function viewTableau() {
  const c = full; if (!c.matches.length) return '<div class="empty">Le tableau sera publié au tirage au sort, le jour du concours.</div>';
  const lv = lives(c), nx = launchable(c).concat(waitingMatches(c));
  let h = '<div class="stack">';
  if (c.status === 'en_cours') h += `<div class="grid2"><section class="panel"><h3>Sur les machines</h3>${lv.map((m) => card(c, m)).join('') || '<p class="muted">Les prochains matchs vont commencer.</p>'}</section><section class="panel"><h3>À suivre</h3>${nx.slice(0, 3).map((m) => card(c, m)).join('') || '<p class="muted">Rien en attente.</p>'}</section></div>`;
  if (c.pools) h += '<h2>Poules</h2>' + poolsHTML(c);
  if (c.matches.some((m) => m.ph === 'main')) h += `<section class="panel"><h2>Tableau final</h2>${bracketHTML(c, 'main')}</section>`;
  if (c.matches.some((m) => m.ph === 'conso')) h += `<section class="panel"><h2>Consolante</h2>${bracketHTML(c, 'conso')}</section>`;
  return h + '<p class="muted small">Mise à jour automatique en direct.</p></div>';
}
function viewResultats() {
  const c = full; if (c.status !== 'termine') return '<div class="empty">Les résultats apparaîtront ici à la fin du concours.</div>';
  const pd = podium(c), cw = consoWinner(c), prizes = c.prizes || { podium: [], conso: [] };
  return `<div class="cols"><section class="panel"><h2>Podium</h2>${c.podium_photo_url ? `<img class="photo" src="${esc(c.podium_photo_url)}" alt="Photo du podium">` : ''}
    ${[0, 1, 2].map((i) => { const t = c.teams.find((x) => x.id === pd[i]); return `<div class="row" style="gap:12px;padding:8px 0;border-bottom:1px solid var(--line)"><span class="medal m${i + 1}">${i + 1}</span><div class="stack" style="gap:2px;flex:1"><b>${t ? esc(t.team_name) : '–'}</b>${t ? `<span class="muted small">${esc(t.captain_name)}${t.mate_name ? ' &amp; ' + esc(t.mate_name) : ''}</span>` : ''}${prizes.podium[i] ? `<span class="small">Lot : ${esc(prizes.podium[i])}</span>` : ''}</div></div>`; }).join('')}
    <div class="row"><button class="btn" id="share">Partager les résultats</button></div></section>
    <section class="panel"><h3>Prix de consolation</h3>${(prizes.conso || []).map((k) => { const w = k.rule === 'consolante' ? cw : k.winner; return `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${esc(k.label)}</b><br><span class="muted small">${w ? 'Gagné par <b>' + esc(tname(c, w)) + '</b>' : '–'}</span></div>`; }).join('') || '<p class="muted">Aucun.</p>'}</section></div>`;
}
document.addEventListener('click', async (e) => {
  if (e.target.id !== 'share') return;
  const data = { title: 'Résultats du concours de fléchettes', url: location.origin + location.pathname + `?c=${current.id}&tab=resultats` };
  if (navigator.share) navigator.share(data).catch(() => {}); else { await navigator.clipboard?.writeText(data.url); toast('Lien copié'); }
});
async function viewSaison() {
  const sid = current.season_id;
  const [{ data: teams }, { data: players }, { data: recs }, { data: season }] = await Promise.all([
    sb.from('season_team_standings').select('*').eq('season_id', sid).order('points', { ascending: false }).order('wins', { ascending: false }),
    sb.from('season_player_standings').select('*').eq('season_id', sid).order('points', { ascending: false }).order('wins', { ascending: false }).limit(50),
    sb.from('records').select('*').eq('week_start', weekMonday()).order('score', { ascending: false }),
    sb.from('seasons').select('*').eq('id', sid).single(),
  ]);
  const tbl = (rows, label, key) => rows?.length ? `<div class="tscroll"><table class="std"><thead><tr><th>#</th><th class="l">${label}</th><th>Concours</th><th>Victoires</th><th>Pts</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td class="rk">${i < 3 ? `<span class="medal m${i + 1}">${i + 1}</span>` : i + 1}</td><td class="l">${esc(r[key])}</td><td>${r.contests}</td><td>${r.wins}</td><td class="pts">${r.points}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Le classement démarre avec le premier concours terminé.</div>';
  const best = (g) => recs?.find((r) => r.game === g);
  const P = season?.points || {};
  $('#view').innerHTML = `<div class="stack"><div class="cols"><section class="panel"><h2>${esc(season?.name || 'Saison')} · équipes</h2>${tbl(teams, 'Équipe', 'team_name')}</section>
    <div class="stack"><section class="panel"><h3>Record de la semaine</h3><p class="muted small">Défi solo du lundi au samedi sur Count-Up ou Big Bull. Demandez au staff de noter votre score.</p><div class="games">${gameCard('Count-Up')}${gameCard('Big Bull')}</div>
    ${['Count-Up', 'Big Bull'].map((g) => `<div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:8px"><span><b>${g}</b><br><span class="muted small">${best(g) ? esc(best(g).player_name) : 'Pas encore de score'}</span></span><span class="clock" style="font-size:30px">${best(g)?.score ?? '–'}</span></div>`).join('')}</section>
    <section class="panel"><h3>Barème</h3><p class="small">Participation ${P.part} pt · victoire ${P.win} pt · 3e ${P.p3} · 2e ${P.p2} · 1re ${P.p1} · record de la semaine ${P.rec} (joueur). Égalité : victoires.</p></section></div></div>
    <section class="panel"><h2>Joueurs</h2>${tbl(players, 'Joueur', 'player_name')}</section></div>`;
}

/* ---------- Profil du téléphone : numéro, équipe et prénoms retenus pour les prochains concours ---------- */
function myProfile() { try { return JSON.parse(localStorage.getItem('vb-me') || 'null'); } catch { return null; } }
function saveProfile(v) { try { localStorage.setItem('vb-me', JSON.stringify({ ...(myProfile() || {}), ...v })); } catch {} }

/* ---------- Mon match : les joueurs déclarent leur résultat depuis leur téléphone ---------- */
let report = null, sending = false;
const pinKey = (cid = current?.id) => 'vb-pin-' + cid;
const regKey = (cid = current?.id) => 'vb-reg-' + cid;
function myTeam() { try { return JSON.parse(localStorage.getItem(pinKey()) || 'null'); } catch { return null; } }
function myReg() { try { return JSON.parse(localStorage.getItem(regKey()) || 'null'); } catch { return null; } }
function savePin(cid, v) { try { localStorage.setItem(pinKey(cid), JSON.stringify(v)); } catch {} }
function rememberReg(cid, v) { try { localStorage.setItem(regKey(cid), JSON.stringify(v)); } catch {} }
/* Équipe inscrite depuis ce téléphone mais en liste d'attente : on vérifie régulièrement si une place s'est libérée */
let waitInfo = null, waitTimer = null;
async function checkWaiting() {
  const reg = myReg(); if (!reg || myTeam()) { waitInfo = null; return; }
  const { data } = await sb.rpc('get_registration', { p_token: reg.token });
  if (!data) { waitInfo = null; return; }
  if (data.status === 'confirmee' && data.pin) { savePin(data.contest.id, { registration_id: data.id, team: data.team, pin: data.pin }); waitInfo = null; toast('Une place s’est libérée : vous êtes inscrits !'); }
  else waitInfo = data;
  if (tab === 'monmatch' && !report) render();
}
function viewMonMatch() {
  if (!current) return '<div class="empty">Aucun concours en cours.</div>';
  const me = myTeam();
  if (!me && waitInfo?.status === 'attente') return `<section class="panel" style="max-width:560px"><h2>${esc(waitInfo.team)}</h2><div class="notice warn"><b>Il n’y a plus de place pour l’instant.</b> Votre équipe est en liste d’attente. Si une place se libère, vous serez inscrits automatiquement et votre code d’équipe apparaîtra ici.</div>${pushPanel(myReg().token, true)}<p class="muted small">Cette page vérifie toute seule toutes les 30 secondes.</p></section>`;
  if (!me && waitInfo?.status === 'annulee') return '<div class="notice">Votre inscription a été annulée.</div>';
  if (!me) return `<form class="panel" id="pinForm" style="max-width:520px"><h2>Mon match</h2><p>Entrez le code de votre équipe (4 chiffres) pour voir votre prochain match et déclarer vos résultats. Le code s’affiche sur le téléphone qui a fait l’inscription ; sinon, demandez-le au comptoir.</p>
    <div class="field"><label for="pin">Code d’équipe</label><input id="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="one-time-code" required style="font-size:28px;letter-spacing:.3em;text-align:center"></div>
    <div class="err" id="pinErr" role="alert"></div><button class="btn red xl" type="submit">Valider</button></form>`;
  const c = full, id = me.registration_id, N = machines(venue.settings);
  const head = `<div class="row" style="justify-content:space-between"><div><div class="eyebrow">Mon équipe</div><h2>${esc(me.team)}</h2></div><button class="btn ghost sm" data-act="forget">Changer d’équipe</button></div>`;
  const reg = myReg(), bell = reg && c.status !== 'termine' ? pushPanel(reg.token, false) : '';
  if (c.status !== 'en_cours' && c.status !== 'termine') return `<section class="panel" style="max-width:640px">${head}<p>Le tirage n’a pas encore eu lieu. Revenez ici quand le concours commence : votre match s’affichera tout seul.</p>${bell}</section>`;
  if (c.status === 'termine') { const p = podium(c).indexOf(id); return `<section class="panel" style="max-width:640px">${head}<p>${p >= 0 ? `Bravo, vous terminez <b>${['1ers', '2es', '3es'][p]}</b> !` : 'Le concours est terminé. Merci d’avoir joué !'} Résultats dans l’onglet Résultats.</p></section>`; }
  const live = lives(c).find((m) => m.a === id || m.b === id);
  const other = (m) => tname(c, m.a === id ? m.b : m.a);
  if (live) {
    const conf = report && report.mid === live.id;
    return `<section class="panel" style="max-width:640px">${head}<div class="notice good"><b>Vous jouez sur la machine ${live.machine || 1}</b>${N > 1 ? '' : ''} contre <b>${esc(other(live))}</b>.</div>${card(c, live)}
      ${conf ? `<div class="confirmRow" style="flex-direction:column;align-items:stretch"><b>${report.won ? 'Vous avez gagné' : 'Vous avez perdu'} contre ${esc(other(live))} ?</b>
          <div class="field"><label for="score">Score (facultatif)</label><input id="score" placeholder="ex. 2-1" maxlength="20"></div>
          <div class="win2"><button class="btn green xl" data-act="send"${sending ? ' disabled' : ''}>${sending ? 'Envoi…' : 'Confirmer'}</button><button class="btn ghost xl" data-act="cancel">Annuler</button></div></div>`
        : `<p class="eyebrow">Fin du match : quel est le résultat ?</p><div class="win2"><button class="btn red xl" data-act="won">Nous avons gagné</button><button class="btn xl" data-act="lost">Nous avons perdu</button></div>`}
      <p class="muted small">Une seule déclaration suffit, par l’une ou l’autre équipe. Le tableau se met à jour aussitôt. En cas d’erreur, voyez le comptoir.</p></section>`;
  }
  const nx = launchable(c).concat(waitingMatches(c)).find((m) => m.a === id || m.b === id);
  const left = c.matches.some((m) => m.status !== 'done' && (m.a === id || m.b === id || m.a == null || m.b == null));
  const last = c.matches.filter((m) => m.status === 'done' && !m.bye && (m.a === id || m.b === id)).sort((a, b) => String(b.played_at).localeCompare(String(a.played_at)))[0];
  return `<section class="panel" style="max-width:640px">${head}
    ${last ? `<div class="notice ${last.winner === id ? 'good' : ''}">Dernier match : ${last.winner === id ? 'victoire' : 'défaite'} contre ${esc(tname(c, last.winner === id ? last.loser : last.winner))}${last.score ? ` (${esc(last.score)})` : ''}.</div>` : ''}
    ${nx ? `<h3>Prochain match</h3>${card(c, nx)}<p class="muted">Restez près des machines : vous serez appelés dès qu’une machine se libère.</p>` : left && c.phase === 'pools' ? '<p>Votre poule est jouée. Le tableau final sera tiré à la fin des poules.</p>' : last && last.winner !== id ? '<p>Votre parcours s’arrête ici. Merci d’avoir joué, restez pour la tombola des lots de consolation !</p>' : '<p>Pas de match pour l’instant : votre prochain adversaire est encore en train de jouer.</p>'}
    ${bell}<p class="muted small">Cette page se met à jour toute seule.</p></section>`;
}
function bindMonMatch() {
  $('#pinForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const pin = $('#pin').value.trim();
    const { data } = await sb.rpc('team_by_pin', { p_contest: current.id, p_pin: pin });
    if (!data) { $('#pinErr').textContent = 'Code inconnu pour ce concours.'; return; }
    localStorage.setItem(pinKey(), JSON.stringify({ ...data, pin })); render();
  });
}
main.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-push]'); if (!b) return;
  b.disabled = true; b.textContent = 'Activation…';
  try { await enablePush(b.dataset.push); toast('Notifications activées'); } catch (err) { toast(err.message || 'Activation impossible'); }
  render();
});
main.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]'); if (!t || tab !== 'monmatch') return;
  const me = myTeam(), act = t.dataset.act;
  if (act === 'forget') { localStorage.removeItem(pinKey()); report = null; return render(); }
  if (act === 'cancel') { report = null; return render(); }
  if (act === 'won' || act === 'lost') { const live = lives(full).find((m) => m.a === me.registration_id || m.b === me.registration_id); report = { mid: live.id, won: act === 'won' }; return render(); }
  if (act === 'send' && report && !sending) {
    sending = true; const score = ($('#score')?.value || '').trim(); render();
    const { data, error } = await sb.functions.invoke('report', { body: { contest_id: current.id, match_id: report.mid, pin: me.pin, won: report.won, score } });
    sending = false; report = null;
    let msg = data?.message || data?.error;
    if (error) { try { msg = (await error.context.json()).error; } catch { msg = 'Envoi impossible. Donnez votre résultat au comptoir.'; } }
    toast(msg || (data?.won ? 'Victoire enregistrée, bravo !' : 'Résultat enregistré.'));
    full = await loadContestFull(current.id); render();
  }
});

/* ---------- Mes scores : suivi de l'équipe d'un concours à l'autre, par le numéro de téléphone ---------- */
async function viewScores() {
  const me = myProfile();
  if (!me?.token) { main.innerHTML = '<section class="panel" style="max-width:560px"><h2>Mes scores</h2><p>Inscrivez votre équipe une première fois depuis ce téléphone : ensuite, tous vos concours, matchs et points de la saison s’affichent ici, retrouvés grâce à votre numéro.</p></section>'; return; }
  const { data, error } = await sb.rpc('my_scores', { p_token: me.token });
  if (tab !== 'scores') return;
  if (error || !data) { main.innerHTML = '<div class="notice">Suivi indisponible pour l’instant (inscription supprimée ou connexion absente).</div>'; return; }
  const T = data.totals, real = data.contests.filter((k) => !k.test);
  const place = (k) => (k.place ? ['1re place', '2e place', '3e place'][k.place - 1] || `${k.place}e` : k.contest_status === 'termine' ? '' : k.status === 'attente' ? 'liste d’attente' : k.contest_status === 'en_cours' ? 'en cours' : 'inscrits');
  const row = (k) => `<section class="panel"><div class="row" style="justify-content:space-between"><div><div class="eyebrow">${esc(fmtDate(k.date, true))}${k.test ? ' · test' : ''}</div><h3 style="margin:2px 0">${esc(k.team)}</h3></div><div style="text-align:right">${k.place && k.place <= 3 ? `<span class="medal m${k.place}">${k.place}</span>` : ''}<div class="muted small">${esc(place(k))}${k.points ? ` · ${k.points} pts` : ''}</div></div></div>
    ${k.matches.length ? `<ul class="tlist">${k.matches.map((m) => `<li><span class="who">${m.won ? '<b>Victoire</b>' : 'Défaite'} contre ${esc(m.opponent || '–')}${m.score ? ` <span class="muted">(${esc(m.score)})</span>` : ''}<br><span class="muted small">${m.phase === 'pool' ? 'Poule' : m.phase === 'conso' ? 'Consolante' : m.phase === 'p3' ? 'Petite finale' : 'Tableau'}</span></span></li>`).join('')}</ul>` : '<p class="muted small">Pas encore de match joué.</p>'}</section>`;
  main.innerHTML = `<div class="stack"><section class="panel"><div class="eyebrow">Suivi lié au ${esc(data.phone)}</div><h2>${esc(data.teams.join(' · ') || me.team || 'Mon équipe')}</h2>
    <div class="facts"><div class="fact"><span>Concours</span><b class="num">${T.contests}</b></div><div class="fact"><span>Victoires</span><b class="num">${T.wins}</b></div><div class="fact"><span>Défaites</span><b class="num">${T.losses}</b></div><div class="fact"><span>Points saison</span><b class="num">${T.points}</b></div><div class="fact"><span>Podiums</span><b class="num">${T.podiums}</b></div></div>
    <p class="muted small">Gardez le même nom d’équipe et le même numéro à chaque inscription : tout s’additionne ici et dans le classement de la saison.</p></section>
    ${real.concat(data.contests.filter((k) => k.test)).map(row).join('') || '<div class="empty">Aucun concours pour l’instant.</div>'}</div>`;
}

/* ---------- Contact ---------- */
function viewContact() {
  const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'], today = (new Date().getDay() + 6) % 7;
  const rows = days.map((d, i) => { const h = venue.hours[String(i + 1)]; return `<tr${i === today ? ' class="q"' : ''}><td class="l">${d}${i === today ? ' <span class="pill">Aujourd’hui</span>' : ''}</td><td>${h ? `${h[0].replace(':', 'h')} – ${h[1].replace(':', 'h')}` : 'Fermé'}</td></tr>`; }).join('');
  const ct = { tel: '04 67 65 98 29', mail: 'montpellierlattes@vandb.fr', ...(venue.settings?.contact || {}) };
  const synced = venue.settings?.syncedAt ? new Date(venue.settings.syncedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : null;
  const closures = (venue.closures || []).filter((d) => d >= new Date().toISOString().slice(0, 10)).map((d) => `<li>${esc(fmtDate(d, true))}</li>`).join('');
  return `<div class="cols"><section class="panel"><h2>${esc(venue.name)}</h2><p class="muted">Cave et bar · Click &amp; Collect disponible</p>
    <div><div class="flabel">Adresse</div><div class="row" style="justify-content:space-between"><span>${esc(venue.address)}</span><a class="btn ghost sm" href="https://www.openstreetmap.org/search?query=9%20all%C3%A9e%20du%20Levant%2034970%20Lattes" target="_blank" rel="noopener">Voir le plan</a></div></div>
    <div><div class="flabel">Téléphone</div><a href="tel:${esc(ct.tel.replace(/\s/g, ''))}" style="font-weight:700;text-decoration:none">${esc(ct.tel)}</a></div>
    <div><div class="flabel">E-mail</div><a href="mailto:${esc(ct.mail)}" style="font-weight:700">${esc(ct.mail)}</a></div>
    <div class="row"><a class="btn ghost" href="https://www.instagram.com/vandbmontpellierlattes/" target="_blank" rel="noopener">Instagram ↗</a><a class="btn ghost" href="https://www.facebook.com/VandBLattes" target="_blank" rel="noopener">Facebook ↗</a><a class="btn red" href="https://www.vandb.fr/nos-magasins/v-and-b-montpellier-lattes" target="_blank" rel="noopener">Fiche du magasin ↗</a></div>
    <p class="muted small">Horaires et coordonnées repris automatiquement de la fiche vandb.fr${synced ? ` (dernière mise à jour : ${synced})` : ''}.</p></section>
    <div class="stack"><section class="panel"><h3>Horaires d’ouverture</h3><table class="std"><tbody>${rows}</tbody></table></section>
    ${closures ? `<section class="panel"><h3>Fermetures exceptionnelles</h3><ul style="margin:0;padding-left:18px">${closures}</ul></section>` : ''}</div></div>`;
}

boot().catch((e) => { console.error(e); main.innerHTML = '<div class="notice bad">Impossible de charger les concours. Vérifiez votre connexion puis rechargez la page.</div>'; });
