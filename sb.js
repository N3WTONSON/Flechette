import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' },
});

/** Lignes de la table matches -> objets du moteur, et inverse */
export function toEngine(contest, rows, teams) {
  return {
    ...contest,
    teams,
    matches: rows.map((r) => ({ ...r, a_from: r.a_from || null, b_from: r.b_from || null })),
    pools: contest.pools || null,
  };
}
export function matchRows(c) {
  return c.matches.map((m) => ({
    contest_id: c.id, id: m.id, ph: m.ph, r: m.r, slot: m.slot, grp: m.grp ?? null,
    a: m.a, b: m.b, a_from: m.a_from, b_from: m.b_from, winner: m.winner, loser: m.loser,
    score: m.score || null, status: m.status, bye: !!m.bye, played_at: m.played_at || null, machine: m.status === 'live' ? (m.machine || 1) : null, live_at: m.status === 'live' ? (m.live_at || new Date().toISOString()) : null,
  }));
}

export async function loadVenue() {
  const { data } = await sb.from('venues').select('*').eq('id', 1).single();
  return data;
}
export async function loadContestFull(id) {
  const [{ data: contest }, { data: rows }, { data: teams }] = await Promise.all([
    sb.from('contests').select('*').eq('id', id).single(),
    sb.from('matches').select('*').eq('contest_id', id),
    sb.from('public_teams').select('*').eq('contest_id', id).order('created_at'),
  ]);
  if (!contest) return null;
  const t = (teams || []).map((x) => ({ id: x.registration_id, name: x.team_name, ...x }));
  return toEngine(contest, rows || [], t);
}
