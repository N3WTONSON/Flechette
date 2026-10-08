// Tableau « en miroir » pour l'écran TV : la moitié haute du tableau à gauche, la moitié basse à droite,
// la finale au centre (comme les tableaux des championnats télévisés). S'adapte au nombre d'équipes (2 à 64).
import { esc } from './util.js';
import { NONE, phaseLabel, finalMatch } from './engine.js';
import { tname } from './views.js';

/** « 4-2 », « 2/1 »… : le plus grand nombre va au vainqueur */
function split(m) {
  const x = String(m.score || '').match(/^\s*(\d{1,3})\s*[-–:/à]\s*(\d{1,3})\s*$/);
  if (!x || m.status !== 'done') return null;
  const hi = Math.max(+x[1], +x[2]), lo = Math.min(+x[1], +x[2]);
  return { [m.winner]: hi, [m.loser]: lo };
}

function row(c, m, s, sc) {
  const id = m[s];
  if (id == null) return '<div class="tr tbd"><span class="nm">&nbsp;</span></div>';
  if (id === NONE) return '<div class="tr tbd"><span class="nm">exempt</span></div>';
  const st = m.status === 'done' ? (m.winner === id ? ' w' : ' l') : '';
  const val = sc ? sc[id] : m.status === 'done' && m.winner === id && !m.bye ? '✓' : '';
  return `<div class="tr${st}"><span class="nm">${esc(tname(c, id))}</span><span class="sc num">${val ?? ''}</span></div>`;
}

export function matchCard(c, m, extra = '') {
  if (!m) return '<div class="mc ghost"><div class="tr tbd"><span class="nm">&nbsp;</span></div><div class="tr tbd"><span class="nm">&nbsp;</span></div></div>';
  const sc = split(m);
  const tag = m.status === 'live' ? `<span class="mtag">● Machine ${m.machine || 1}</span>` : '';
  const loose = m.status === 'done' && m.score && !sc ? `<div class="mscore">${esc(m.score)}</div>` : '';
  return `<div class="mc${m.status === 'live' ? ' live' : ''}${m.bye ? ' bye' : ''} ${extra}">${tag}${row(c, m, 'a', sc)}${row(c, m, 'b', sc)}${loose}</div>`;
}

const roundName = (c, ph, r, R) => {
  if (ph === 'conso') return r === R ? 'Finale consolante' : r === R - 1 ? 'Demi-finales' : 'Consolante';
  const left = 2 ** (R - r + 1);
  return r === R ? 'Finale' : left === 4 ? 'Demi-finales' : left === 8 ? 'Quarts de finale' : left === 16 ? 'Huitièmes de finale' : left === 32 ? 'Seizièmes de finale' : `1er tour`;
};

/** Colonnes d'un côté : liste de rounds r (1..R-1), slots du côté (gauche = première moitié) */
function side(c, ms, R, which) {
  let html = '';
  const rounds = [];
  for (let r = 1; r < R; r++) rounds.push(r);
  if (which === 'right') rounds.reverse();
  for (const r of rounds) {
    const all = ms.filter((m) => m.r === r).sort((a, b) => a.slot - b.slot), half = all.length / 2;
    const mine = which === 'left' ? all.slice(0, half) : all.slice(half);
    const last = r === R - 1, first = r === 1;
    let body = '';
    if (last) body = `<div class="slot single">${matchCard(c, mine[0])}</div>`;
    else for (let i = 0; i < mine.length; i += 2) body += `<div class="pair"><div class="slot">${matchCard(c, mine[i])}</div><div class="slot">${matchCard(c, mine[i + 1])}</div></div>`;
    html += `<div class="bcolumn${first ? ' first' : ''}"><h4>${esc(roundName(c, ms[0].ph, r, R))}</h4><div class="bbody">${body}</div></div>`;
  }
  return `<div class="bside ${which}">${html}</div>`;
}

const TARGET = `<svg class="target" viewBox="0 0 64 64" aria-hidden="true"><circle cx="30" cy="34" r="26" fill="#fbba00"/><circle cx="30" cy="34" r="19" fill="#1d1d1b"/><circle cx="30" cy="34" r="13" fill="#fff"/><circle cx="30" cy="34" r="7" fill="#2e7a72"/><circle cx="30" cy="34" r="3" fill="#d9532b"/><path d="M31 33 L56 8" stroke="#1d1d1b" stroke-width="3" stroke-linecap="round"/><path d="M52 4 L60 4 L56 10 Z M60 4 L60 12 L54 8 Z" fill="#2e7a72"/></svg>`;

/** Tableau complet en miroir pour la phase « main » ou « conso » */
export function mirrorBracket(c, ph) {
  const ms = c.matches.filter((m) => m.ph === ph);
  if (!ms.length) return '';
  const R = Math.max(...ms.map((m) => m.r));
  const fin = ph === 'main' ? finalMatch(c) : ms.find((m) => m.r === R);
  const p3 = ph === 'main' ? c.matches.find((m) => m.ph === 'p3') : null;
  const champ = fin?.status === 'done' && fin.winner && fin.winner !== NONE ? tname(c, fin.winner) : null;
  const rows = Math.max(1, ms.filter((m) => m.r === 1).length / 2);   // cartes dans la colonne la plus chargée d'un côté
  const center = `<div class="bcenter"><h4>${ph === 'conso' ? 'Finale consolante' : 'Finale'}</h4><div class="bbody">
      <div class="fwrap"><div class="slot single fin"><div class="fincard">${champ ? `<div class="champ"><span>${ph === 'conso' ? 'Vainqueur de la consolante' : 'Vainqueur'}</span><b>${esc(champ)}</b></div>` : TARGET}
      ${matchCard(c, fin, 'final')}
      ${p3 ? `<div class="p3"><h5>Match pour la 3e place</h5>${matchCard(c, p3)}</div>` : ''}</div></div></div></div></div>`;
  return `<div class="mirror rows-${Math.min(16, rows)}${R > 1 ? '' : ' solo'}" style="--rows:${rows}">${R > 1 ? side(c, ms, R, 'left') : ''}${center}${R > 1 ? side(c, ms, R, 'right') : ''}</div>`;
}

export const TV_CSS = `
.mirror{flex:1;min-height:0;display:flex;align-items:stretch;gap:0;--cw:clamp(150px,13vw,250px);--gap:22px;--fs:clamp(13px,1.15vw,22px)}
.mirror.rows-8{--fs:clamp(12px,.95vw,18px)}.mirror.rows-16{--fs:clamp(10px,.72vw,14px)}
.bside{flex:1;display:flex;min-width:0}
.bcolumn,.bcenter{display:flex;flex-direction:column;flex:1;min-width:0;max-width:var(--cw)}
.bcenter{flex:1.25;max-width:calc(var(--cw) * 1.35)}
.bside.left{justify-content:flex-end}.bside.right{justify-content:flex-start}
.mirror h4{height:30px;margin:0;font:800 clamp(11px,.85vw,15px) var(--body);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bbody{flex:1;display:flex;flex-direction:column;min-height:0;position:relative}
.pair{flex:1;display:flex;flex-direction:column;position:relative}
.slot{flex:1;display:flex;align-items:center;position:relative;min-height:0}
.slot.single{flex:1}
/* traits du tableau, côté gauche : la carte sort à droite */
.bside.left .slot{padding:3px var(--gap) 3px 0}
.bside.left .bcolumn:not(.first) .slot{padding-left:var(--gap)}
.bside.left .slot::after{content:'';position:absolute;right:0;top:50%;width:var(--gap);border-top:2px solid #c9c9c4}
.bside.left .bcolumn:not(.first) .slot::before{content:'';position:absolute;left:0;top:50%;width:var(--gap);border-top:2px solid #c9c9c4}
.bside.left .pair::after{content:'';position:absolute;right:0;top:25%;bottom:25%;border-right:2px solid #c9c9c4}
.bside.left .pair .slot::after{width:var(--gap)}
/* côté droit : symétrique */
.bside.right .slot{padding:3px 0 3px var(--gap)}
.bside.right .bcolumn:not(.first) .slot{padding-right:var(--gap)}
.bside.right .slot::after{content:'';position:absolute;left:0;top:50%;width:var(--gap);border-top:2px solid #c9c9c4}
.bside.right .bcolumn:not(.first) .slot::before{content:'';position:absolute;right:0;top:50%;width:var(--gap);border-top:2px solid #c9c9c4}
.bside.right .pair::after{content:'';position:absolute;left:0;top:25%;bottom:25%;border-left:2px solid #c9c9c4}
/* finale */
.bcenter .bbody{justify-content:center}
.fwrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:stretch}
.fwrap .slot.fin{flex:none;padding:0 var(--gap)}
.fwrap .slot.fin::before,.fwrap .slot.fin::after{content:'';position:absolute;top:50%;width:var(--gap);border-top:2px solid #c9c9c4}
.fwrap .slot.fin::before{left:0}.fwrap .slot.fin::after{right:0}
.mirror.solo .fwrap .slot.fin::before,.mirror.solo .fwrap .slot.fin::after{display:none}
.fincard{position:relative;width:100%}
.fwrap .target{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(100% + 10px);width:clamp(54px,5vw,96px);height:auto}
.champ{position:absolute;left:0;right:0;bottom:calc(100% + 12px);text-align:center;background:var(--yellow);border-radius:10px;padding:8px 10px}
.champ span{display:block;font:800 11px var(--body);letter-spacing:.1em;text-transform:uppercase}
.champ b{display:block;font:900 clamp(18px,1.8vw,34px) var(--display);line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.p3{position:absolute;left:0;right:0;top:calc(100% + 16px)}
.p3 h5{margin:0 0 4px;font:800 11px var(--body);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);text-align:center}
/* cartes de match */
.mc{width:100%;background:#f3f3f0;border:1px solid #e2e2de;border-radius:8px;position:relative;font-size:var(--fs)}
.mc .tr{display:flex;align-items:center;gap:8px;padding:.32em .6em;min-height:1.9em}
.mc .tr+.tr{border-top:1px solid #e2e2de}
.mc .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;color:#1d1d1b}
.mc .sc{font-weight:800;min-width:1.2em;text-align:right}
.mc .tr.w{background:#fff;box-shadow:inset 4px 0 0 var(--yellow)}
.mc .tr.w .nm,.mc .tr.w .sc{font-weight:900}
.mc .tr.l .nm,.mc .tr.l .sc{color:#9a9a95;font-weight:600}
.mc .tr.tbd .nm{color:#b5b5b0;font-style:italic}
.mc.ghost{opacity:.6}
.mc.bye{opacity:.55}
.mc.live{background:#fff;border:2px solid var(--orange);box-shadow:0 0 0 4px rgba(217,83,43,.15);animation:tvpulse 2s ease-in-out infinite}
.mc.final{border-width:2px;border-color:#1d1d1b;font-size:calc(var(--fs) * 1.2)}
.mc.final.live{border-color:var(--orange)}
.mtag{position:absolute;top:-.85em;right:.5em;background:var(--orange);color:#fff;font:800 calc(var(--fs) * .62) var(--body);letter-spacing:.06em;text-transform:uppercase;padding:.15em .55em;border-radius:20px}
.mscore{font-size:.75em;color:var(--muted);padding:0 .7em .25em;text-align:right}
@keyframes tvpulse{50%{box-shadow:0 0 0 7px rgba(217,83,43,.05)}}
@media (prefers-reduced-motion:reduce){.mc.live{animation:none}}
`;
