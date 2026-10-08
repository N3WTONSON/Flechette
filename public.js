// Page publique : annonce du concours, inscription en moins d'une minute, tableau en direct, résultats, saison.
import { sb, loadVenue, loadContestFull } from './sb.js';
import { $, esc, fmtDate, hhmm, LEVELS, pill, contestStatus, toast, icsFile, weekMonday } from './util.js';
import { podium, consoWinner, lives, launchable, waitingMatches, machines } from './engine.js';
import { card, bracketHTML, poolsHTML, tname } from './views.js';
import { gamesPanel, gameCard } from './games.js';

const main = $('#main');
const params = new URLSearchParams(location.search);
let venue, contests = [], current = null, full = null, tab = params.get('tab') || 'concours', channel = null, done = null;


async function boot() {
  venue = await loadVenue();
  $('#venue').textContent = `${venue.name} · ${venue.address}`;
  const { data } = await sb.from('contests').select('*').neq('status', 'brouillon').order('date', { ascending: true });
  contests = data || [];
  const want = params.get('c');
  const upcoming = contests.filter((c) => c.status === 'en_cours')[0] || contests.find((c) => c.status === 'ouvert');
  await select(want && contests.find((c) => c.id === want) ? want : (upcoming || contests[contests.length - 1])?.id);
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; done = null; render(); }));
}

async function select(id) {
  current = contests.find((c) => c.id === id) || null;
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
function refresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(async () => { full = await loadContestFull(current.id); if (tab !== 'concours') render(); }, 400); }
setInterval(() => { if (current && tab === 'concours' && !done) refresh(); }, 60000);

function picker() {
  if (contests.length < 2) return '';
  return `<div class="field" style="max-width:440px"><label for="cpick">Concours</label><select id="cpick">${contests.map((c) => `<option value="${c.id}"${c.id === current?.id ? ' selected' : ''}>${esc(fmtDate(c.date))} · ${hhmm(c.start_time)}</option>`).join('')}</select></div>`;
}

function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
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
  const lv = (id) => `<select id="${id}">${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}"${k === 'occasionnel' ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
  return `<form class="panel" id="regForm" novalidate><h2>Inscrire mon équipe</h2>${full ? '<div class="notice warn">Complet : votre équipe sera placée en liste d’attente et prévenue si une place se libère.</div>' : ''}
    <div class="field"><label for="tName">Nom de l’équipe (facultatif)</label><input id="tName" maxlength="30" autocomplete="off"></div>
    <div class="grid2"><div class="field"><label for="p1">Votre prénom ou pseudo</label><input id="p1" required maxlength="25" autocomplete="given-name"></div><div class="field"><label for="l1">Votre niveau</label>${lv('l1')}</div>
    <div class="field"><label for="p2">Prénom du coéquipier</label><input id="p2" maxlength="25" placeholder="Vide si vous venez seul"></div><div class="field"><label for="l2">Son niveau</label>${lv('l2')}</div></div>
    <div class="grid2"><div class="field"><label for="email">E-mail</label><input id="email" type="email" autocomplete="email" inputmode="email"></div><div class="field"><label for="phone">ou téléphone</label><input id="phone" type="tel" autocomplete="tel" inputmode="tel"></div></div>
    <p class="muted small">Un moyen de contact suffit. Il sert uniquement à ce concours et n’est jamais affiché.</p>
    <div class="consent">
      <label class="check"><input type="checkbox" id="cAdult" required> <span>Nous sommes majeurs (obligatoire).</span></label>
      <label class="check"><input type="checkbox" id="cRem" checked> <span>Recevoir la confirmation et les rappels de ce concours.</span></label>
      <label class="check"><input type="checkbox" id="cNews"> <span>Être prévenu des prochains concours (désinscription en un clic).</span></label>
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
    if (!v('email') && !v('phone')) return (err.textContent = 'Indiquez un e-mail ou un téléphone.');
    if (!$('#cAdult').checked) return (err.textContent = 'Le concours est réservé aux majeurs.');
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Inscription…';
    const { data, error } = await sb.rpc('register_team', {
      p_contest: current.id, p_team_name: v('tName'), p_captain: v('p1'), p_email: v('email'), p_phone: v('phone'),
      p_captain_level: $('#l1').value, p_mate: v('p2'), p_mate_level: $('#l2').value,
      p_consent_reminders: $('#cRem').checked, p_consent_news: $('#cNews').checked, p_adult: true,
    });
    if (error) { btn.disabled = false; btn.textContent = 'Inscrire mon équipe'; err.textContent = error.message.replace(/^.*?: /, ''); return; }
    const r = data[0];
    done = { ...r, team: v('tName') || (v('p2') ? `${v('p1')} & ${v('p2')}` : `Solo · ${v('p1')}`), email: v('email') };
    if (v('email') && $('#cRem').checked) sb.functions.invoke('notify', { body: { cancel_token: r.cancel_token } }).catch(() => {});
    full = await loadContestFull(current.id); render(); window.scrollTo(0, 0);
  });
}

function confirmation() {
  const c = current, manage = `gerer.html?t=${done.cancel_token}`, wait = done.status === 'attente';
  return `<section class="panel" style="max-width:640px"><div class="row">${wait ? '<span class="pill warn">Liste d’attente</span>' : '<span class="pill ok">Inscription confirmée</span>'}</div>
    <h2>${esc(done.team)}</h2><p>${wait ? 'Le concours est complet. Vous êtes en liste d’attente : nous vous prévenons dès qu’une place se libère.' : 'C’est noté, à bientôt au bar !'}</p>
    <div class="facts"><div class="fact"><span>Quand</span><b>${esc(fmtDate(c.date))} · ${hhmm(c.start_time).replace(':', 'h')}</b></div><div class="fact"><span>Où</span><b>${esc(venue.name)}</b></div></div>
    <p class="muted">${esc(venue.address)} · pointage 15 minutes avant le début.</p>
    <div class="row">${wait ? '' : `<a class="btn" href="${icsFile(c, venue)}" download="concours-flechettes.ics">Ajouter à mon agenda</a>`}<a class="btn ghost" href="${manage}">Gérer ou annuler</a></div>
    <p class="muted small">${done.email ? 'Un e-mail de confirmation vient de partir, avec ce lien.' : 'Gardez ce lien pour annuler : '}<br><span class="linkLine" style="display:inline-block;margin-top:6px">${esc(location.origin + location.pathname.replace(/[^/]*$/, '') + manage)}</span></p></section>`;
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

boot().catch((e) => { console.error(e); main.innerHTML = '<div class="notice bad">Impossible de charger les concours. Vérifiez votre connexion puis rechargez la page.</div>'; });
