// Fragments d'affichage partagés : carte de match, tableau, poules.
import { esc } from './util.js';
import { phaseLabel, gameFor, poolTable, NONE } from './engine.js';

export const tname = (c, id) => c.teams.find((t) => t.id === id)?.name ?? '';

export function card(c, m) {
  return `<div class="qcard${m.status === 'live' ? ' live' : ''}"><div class="tA">${esc(tname(c, m.a))}</div><div class="vs">VS</div><div class="tB">${esc(tname(c, m.b))}</div><div class="meta"><span>${esc(phaseLabel(c, m))}</span><span>Jeu : <b>${esc(gameFor(c, m))}</b></span>${m.status === 'live' ? `<span class="pill live">Machine ${m.machine || 1}</span>` : ''}</div></div>`;
}

export function bracketHTML(c, ph) {
  const ms = c.matches.filter((m) => m.ph === ph); if (!ms.length) return '';
  const R = Math.max(...ms.map((m) => m.r)); let cols = '';
  const side = (m, s) => {
    const id = m[s];
    if (id == null) return '<div class="t"><span class="nm tbd">à déterminer</span></div>';
    if (id === NONE) return '<div class="t"><span class="nm tbd">exempt</span></div>';
    const cls = m.status === 'done' ? (m.winner === id ? ' w' : ' l') : '';
    return `<div class="t${cls}"><span class="nm">${esc(tname(c, id))}</span>${m.status === 'done' && m.winner === id && !m.bye ? '<span aria-label="vainqueur">✓</span>' : ''}</div>`;
  };
  const bm = (m) => `<div class="bm${m.status === 'live' ? ' live' : ''}">${side(m, 'a')}${side(m, 'b')}${m.score ? `<div class="t muted small">${esc(m.score)}</div>` : ''}</div>`;
  for (let r = 1; r <= R; r++) {
    const rm = ms.filter((m) => m.r === r).sort((a, b) => a.slot - b.slot);
    cols += `<div class="bcol"><h3>${esc(phaseLabel(c, rm[0]).replace('Consolante · ', ''))}</h3>${rm.map(bm).join('')}</div>`;
  }
  const p3 = ph === 'main' && c.matches.find((m) => m.ph === 'p3');
  if (p3) cols += `<div class="bcol"><h3>3e place</h3>${bm(p3)}</div>`;
  return `<div class="bracketWrap"><div class="bracket">${cols}</div></div>`;
}

export function poolsHTML(c) {
  if (!c.pools) return '';
  const q = c.pools.length === 1 ? Math.min(4, c.pools[0].ids.length) : 2;
  return `<div class="grid2">${c.pools.map((p, gi) => `<section class="panel"><h3>Poule ${p.name}</h3><div class="tscroll"><table class="std"><thead><tr><th>#</th><th class="l">Équipe</th><th>J</th><th>V</th></tr></thead><tbody>${poolTable(c, gi).map((r, i) => `<tr class="${i < q ? 'q' : ''}"><td class="rk">${i + 1}</td><td class="l">${esc(tname(c, r.id))}</td><td>${r.J}</td><td class="pts">${r.V}</td></tr>`).join('')}</tbody></table></div><p class="muted small">${q} premiers qualifiés · départage : victoires puis confrontation directe</p></section>`).join('')}</div>`;
}
