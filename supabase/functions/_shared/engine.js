// COPIE de web/js/engine.js pour les fonctions Supabase : gardez les deux fichiers identiques (cp web/js/engine.js supabase/functions/_shared/engine.js).
// Moteur de concours : tirage, poules, tableau à élimination, consolante, file d'attente sur une machine.
// Pur JavaScript, sans dépendance. Même logique que l'application de démonstration.
// Un concours "c" contient : format ('elim'|'poules'), status, phase, pools, teams [{id,name}], matches [...]
export const NONE = '-';

export const machines = (settings) => Math.max(1, Math.min(4, +(settings?.machines || 1)));
export function pow2(n) { let s = 1; while (s < n) s *= 2; return s; }
export function poolPlan(n) {
  if (n < 3) return [n];
  let g = Math.ceil(n / 4);
  if (n / g < 3) g = Math.max(1, Math.floor(n / 3));
  return Array.from({ length: g }, (_, i) => Math.floor(n / g) + (i < n % g ? 1 : 0));
}
export function qualifiers(sizes) { return sizes.length === 1 ? Math.min(4, sizes[0]) : 2 * sizes.length; }

/** Nombre de matchs et durée estimée (minutes) pour n équipes */
export function plan(c, n, settings) {
  const dur = (g) => +(settings.durations[g] ?? 10) + (+settings.changeMin || 0);
  let reg = 0, conso = 0, fin = 0;
  if (n < 2) return { reg, conso, fin, total: 0, min: 0 };
  if (c.format === 'poules' && n >= 3) {
    const sz = poolPlan(n); sz.forEach((k) => { reg += k * (k - 1) / 2; });
    const q = qualifiers(sz); reg += Math.max(0, q - 2) + (q >= 4 ? 1 : 0); fin = 1;
  } else {
    const S = pow2(n); reg = n - 2 + (n >= 4 ? 1 : 0); fin = 1;
    conso = n > 2 ? Math.max(0, n - S / 2 - 1) : 0;
  }
  // les matchs se répartissent sur les machines ; la finale se joue seule à la fin
  const min = (reg * dur(c.game) + conso * dur(c.conso_game)) / machines(settings) + fin * dur(c.final_game);
  return { reg, conso, fin, total: reg + conso + fin, min };
}

function seedOrder(n) { let o = [1]; while (o.length < n) { const L = o.length * 2; o = o.flatMap((x) => [x, L + 1 - x]); } return o; }
export function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function mk(ph, r, slot, o = {}) {
  return { id: `${ph}${r}-${slot}`, ph, r, slot, grp: null, a: null, b: null, a_from: null, b_from: null, winner: null, loser: null, score: '', status: 'wait', bye: false, played_at: null, ...o };
}
function buildElim(seeds, ph, withP3) {
  const n = seeds.length, S = pow2(Math.max(2, n)), order = seedOrder(S), ms = [], R = Math.log2(S);
  for (let i = 0; i < S / 2; i++) {
    const sa = order[2 * i], sb = order[2 * i + 1];
    ms.push(mk(ph, 1, i, { a: sa <= n ? seeds[sa - 1] : NONE, b: sb <= n ? seeds[sb - 1] : NONE }));
  }
  for (let r = 2; r <= R; r++) for (let k = 0; k < S / 2 ** r; k++)
    ms.push(mk(ph, r, k, { a_from: { m: `${ph}${r - 1}-${2 * k}`, t: 'w' }, b_from: { m: `${ph}${r - 1}-${2 * k + 1}`, t: 'w' } }));
  if (withP3 && R >= 2) ms.push(mk('p3', R, 0, { id: 'p3', a_from: { m: `${ph}${R - 1}-0`, t: 'l' }, b_from: { m: `${ph}${R - 1}-1`, t: 'l' } }));
  return { ms, R, S };
}
function buildConso(count) {
  const feeders = Array.from({ length: count }, (_, i) => ({ m: `main1-${i}`, t: 'l' }));
  const S = pow2(Math.max(2, feeders.length)), R = Math.log2(S), ms = [];
  while (feeders.length < S) feeders.push(null);
  for (let k = 0; k < S / 2; k++) ms.push(mk('conso', 1, k, { a_from: feeders[2 * k], b_from: feeders[2 * k + 1], a: feeders[2 * k] ? null : NONE, b: feeders[2 * k + 1] ? null : NONE }));
  for (let r = 2; r <= R; r++) for (let j = 0; j < S / 2 ** r; j++)
    ms.push(mk('conso', r, j, { a_from: { m: `conso${r - 1}-${2 * j}`, t: 'w' }, b_from: { m: `conso${r - 1}-${2 * j + 1}`, t: 'w' } }));
  return ms;
}
export function finalMatch(c) {
  const mains = c.matches.filter((m) => m.ph === 'main'); if (!mains.length) return null;
  const R = Math.max(...mains.map((m) => m.r)); return mains.find((m) => m.r === R);
}
/** Propage gagnants/perdants, gère les exempts, détecte la fin du concours */
export function resolve(c) {
  const by = Object.fromEntries(c.matches.map((m) => [m.id, m]));
  let changed = true, guard = 0;
  while (changed && guard++ < 60) {
    changed = false;
    for (const m of c.matches) {
      if (m.status === 'done') continue;
      for (const s of ['a', 'b']) {
        const f = m[s + '_from'];
        if (f && m[s] == null) { const src = by[f.m]; if (src && src.status === 'done') { m[s] = (f.t === 'w' ? src.winner : src.loser) || NONE; changed = true; } }
      }
      if (m.a != null && m.b != null) {
        if (m.a === NONE || m.b === NONE) { m.status = 'done'; m.bye = true; m.winner = m.a === NONE ? m.b : m.a; m.loser = NONE; changed = true; }
        else if (m.status === 'wait') { m.status = 'ready'; changed = true; }
      }
    }
  }
  const fin = finalMatch(c);
  if (c.status === 'en_cours' && c.phase === 'bracket' && fin?.status === 'done' && c.matches.every((m) => m.status === 'done')) c.status = 'termine';
}
/** Tirage au sort parmi les équipes présentes */
export function draw(c, presentIds) {
  const seeds = shuffle(presentIds);
  c.matches = []; c.pools = null;
  if (c.format === 'poules' && seeds.length >= 3) {
    let k = 0; c.pools = [];
    poolPlan(seeds.length).forEach((sz, gi) => {
      const ids = seeds.slice(k, k + sz); k += sz; const L = String.fromCharCode(65 + gi);
      c.pools.push({ name: L, ids });
      const arr = ids.slice(); if (arr.length % 2) arr.push(null); const n = arr.length;
      for (let r = 0; r < n - 1; r++) {
        for (let i = 0; i < n / 2; i++) { const a = arr[i], b = arr[n - 1 - i]; if (a && b) c.matches.push(mk('pool', r + 1, gi * 10 + i, { id: `pool${L}${r + 1}-${i}`, a, b, grp: gi })); }
        arr.splice(1, 0, arr.pop());
      }
    });
    c.phase = 'pools';
  } else {
    const b = buildElim(seeds, 'main', true); c.matches = b.ms;
    if (seeds.length > 2) c.matches.push(...buildConso(b.S / 2));
    c.phase = 'bracket';
  }
  c.status = 'en_cours';
  resolve(c);
}
export function poolTable(c, gi) {
  const p = c.pools[gi], t = Object.fromEntries(p.ids.map((id) => [id, { id, J: 0, V: 0 }]));
  for (const m of c.matches) { if (m.ph !== 'pool' || m.grp !== gi || m.status !== 'done') continue; t[m.a].J++; t[m.b].J++; t[m.winner].V++; }
  const name = (id) => c.teams.find((x) => x.id === id)?.name ?? '';
  const h2h = (x, y) => { const m = c.matches.find((m) => m.ph === 'pool' && m.status === 'done' && ((m.a === x.id && m.b === y.id) || (m.a === y.id && m.b === x.id))); return m ? (m.winner === x.id ? -1 : 1) : 0; };
  return p.ids.map((id) => t[id]).sort((x, y) => (y.V - x.V) || h2h(x, y) || name(x.id).localeCompare(name(y.id), 'fr'));
}
export function poolsDone(c) { return c.phase === 'pools' && c.matches.filter((m) => m.ph === 'pool').every((m) => m.status === 'done'); }
export function buildFinalFromPools(c) {
  const tables = c.pools.map((_, gi) => poolTable(c, gi)); let seeds = [];
  if (tables.length === 1) seeds = tables[0].slice(0, Math.min(4, tables[0].length)).map((r) => r.id);
  else { tables.forEach((t) => seeds.push(t[0].id)); tables.slice().reverse().forEach((t) => { if (t[1]) seeds.push(t[1].id); }); }
  c.matches.push(...buildElim(seeds, 'main', true).ms); c.phase = 'bracket'; resolve(c);
}
/** File d'attente : matchs en cours d'abord, puis ordre de passage */
export function queue(c) {
  const mains = c.matches.filter((m) => m.ph === 'main'); const R = mains.length ? Math.max(...mains.map((m) => m.r)) : 0;
  const key = (m) => m.ph === 'pool' ? m.r * 100 + m.slot : m.ph === 'conso' ? 10000 + m.r * 200 + 100 + m.slot : m.ph === 'p3' ? 10000 + R * 200 - 1 : 10000 + m.r * 200 + m.slot;
  return c.matches.filter((m) => m.status === 'ready' || m.status === 'live').sort((x, y) => x.status === 'live' ? -1 : y.status === 'live' ? 1 : key(x) - key(y));
}
export function phaseLabel(c, m) {
  if (m.ph === 'pool') return 'Poule ' + c.pools[m.grp].name;
  if (m.ph === 'p3') return 'Match pour la 3e place';
  const R = Math.max(...c.matches.filter((x) => x.ph === m.ph).map((x) => x.r)), d = R - m.r;
  const base = d === 0 ? 'Finale' : d === 1 ? 'Demi-finale' : d === 2 ? 'Quart de finale' : m.r === 1 ? '1er tour' : 'Tour ' + m.r;
  return m.ph === 'conso' ? 'Consolante · ' + base : base;
}
export function gameFor(c, m) { if (m.ph === 'conso') return c.conso_game; return finalMatch(c)?.id === m.id ? c.final_game : c.game; }
export function remainingMin(c, settings) {
  const dur = (g) => +(settings.durations[g] ?? 10) + (+settings.changeMin || 0);
  let n = 0, fp = 0; const f = finalMatch(c);
  for (const m of c.matches) { if (m.status === 'done' || m.a === NONE || m.b === NONE) continue; if (f?.id === m.id) fp = dur(c.final_game); else n += dur(gameFor(c, m)); }
  if (c.phase === 'pools') { const q = qualifiers(c.pools.map((p) => p.ids.length)); n += (Math.max(0, q - 2) + (q >= 4 ? 1 : 0)) * dur(c.game); fp = dur(c.final_game); }
  return n / machines(settings) + fp;
}
export function podium(c) {
  if (c.status !== 'termine') return [];
  const f = finalMatch(c), p3 = c.matches.find((m) => m.ph === 'p3');
  return [f?.winner, f?.loser, p3?.status === 'done' ? p3.winner : null].map((x) => (x && x !== NONE ? x : null));
}
export function consoWinner(c) {
  const cm = c.matches.filter((m) => m.ph === 'conso'); if (!cm.length) return null;
  const R = Math.max(...cm.map((m) => m.r)); const f = cm.find((m) => m.r === R);
  return f?.status === 'done' && f.winner !== NONE ? f.winner : null;
}
/* ---------- plusieurs machines ---------- */
export const lives = (c) => c.matches.filter((m) => m.status === 'live').sort((a, b) => (a.machine || 1) - (b.machine || 1));
export const onMachine = (c, k) => lives(c).find((m) => (m.machine || 1) === k) || null;
export function busyTeams(c) { const b = new Set(); lives(c).forEach((m) => { b.add(m.a); b.add(m.b); }); return b; }
export function freeMachine(c, settings) { for (let k = 1; k <= machines(settings); k++) if (!onMachine(c, k)) return k; return null; }
/** Matchs prêts à lancer : aucune des deux équipes n'est déjà sur une machine */
export function launchable(c) { const b = busyTeams(c), out = []; for (const m of queue(c)) { if (m.status !== 'ready' || b.has(m.a) || b.has(m.b)) continue; out.push(m); b.add(m.a); b.add(m.b); } return out; }
export function waitingMatches(c) { const b = busyTeams(c); return queue(c).filter((m) => m.status === 'ready' && (b.has(m.a) || b.has(m.b))); }
/** Remplit chaque machine libre avec le prochain match jouable */
export function autoFill(c, settings) { let k; while ((k = freeMachine(c, settings))) { const nx = launchable(c)[0]; if (!nx) break; nx.status = 'live'; nx.machine = k; nx.live_at = new Date().toISOString(); } }
function downstream(c, id) { return c.matches.filter((x) => x.a_from?.m === id || x.b_from?.m === id); }
export function canUndo(c, m) {
  if (m.bye || (m.ph === 'pool' && c.phase === 'bracket')) return false;
  const ok = (id) => downstream(c, id).every((x) => x.status === 'live' ? false : x.status === 'done' && !x.bye ? false : x.status === 'done' ? ok(x.id) : true);
  return ok(m.id);
}
export function undo(c, m, settings) {
  const reset = (id) => downstream(c, id).forEach((x) => {
    if (x.a_from?.m === id) x.a = null; if (x.b_from?.m === id) x.b = null;
    const was = x.status === 'done'; Object.assign(x, { status: 'wait', bye: false, winner: null, loser: null }); if (was) reset(x.id);
  });
  reset(m.id);
  Object.assign(m, { winner: null, loser: null, score: '', status: 'ready', played_at: null, machine: null });
  if (c.status === 'termine') c.status = 'en_cours';
  const k = freeMachine(c, settings), b = busyTeams(c);
  if (k && !b.has(m.a) && !b.has(m.b)) Object.assign(m, { status: 'live', machine: k, live_at: new Date().toISOString() });
}
/** Points de saison par équipe pour un concours terminé */
export function seasonResults(c, presentIds, pts) {
  const pod = podium(c);
  return presentIds.map((id) => {
    const wins = c.matches.filter((m) => m.status === 'done' && !m.bye && m.winner === id).length;
    const place = pod.indexOf(id);
    const bonus = place === 0 ? pts.p1 : place === 1 ? pts.p2 : place === 2 ? pts.p3 : 0;
    return { registration_id: id, place: place >= 0 ? place + 1 : null, wins, points: pts.part + wins * pts.win + bonus };
  });
}
