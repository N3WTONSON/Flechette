// Résultat déclaré par les joueurs depuis leur téléphone (page joueurs, onglet « Mon match »).
// Le code d'équipe (4 chiffres) prouve l'appartenance à l'équipe. Le tableau est recalculé avec le même moteur
// que l'espace staff : propagation des vainqueurs, tableau final après les poules, match suivant lancé sur la machine libérée.
import { admin, cors } from "../_shared/http.ts";
import * as E from "../_shared/engine.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors({});
  try {
    const { contest_id, match_id, pin, won, score } = await req.json();
    if (!/^[0-9]{4}$/.test(String(pin ?? ""))) return cors({ error: "Code d’équipe invalide." }, 400);
    const db = admin();

    for (let attempt = 0; attempt < 5; attempt++) {
      const [{ data: k }, { data: regs }, { data: rows }, { data: venue }] = await Promise.all([
        db.from("contests").select("*").eq("id", contest_id).single(),
        db.from("registrations").select("id, pin, present, status, teams(name)").eq("contest_id", contest_id).eq("status", "confirmee"),
        db.from("matches").select("*").eq("contest_id", contest_id),
        db.from("venues").select("settings").eq("id", 1).single(),
      ]);
      if (!k || k.status !== "en_cours") return cors({ error: "Aucun concours en cours." }, 400);
      const c: any = { ...k, teams: (regs ?? []).map((r: any) => ({ id: r.id, name: r.teams.name })), matches: rows ?? [], pools: k.pools };
      const m = c.matches.find((x: any) => x.id === match_id);
      if (!m) return cors({ error: "Match introuvable." }, 404);
      const me = (regs ?? []).find((r: any) => r.pin === String(pin) && (r.id === m.a || r.id === m.b));
      if (!me) { await sleep(1000); return cors({ error: "Ce code ne correspond à aucune équipe de ce match." }, 403); }
      if (m.status === "done") {
        const name = c.teams.find((t: any) => t.id === m.winner)?.name ?? "";
        return cors({ already: true, winner: name, message: `Résultat déjà enregistré : victoire de ${name}. En cas d’erreur, voyez le comptoir.` });
      }
      if (m.status !== "live") return cors({ error: "Ce match n’a pas encore été lancé sur une machine." }, 400);

      const winner = won ? me.id : (m.a === me.id ? m.b : m.a);
      Object.assign(m, { winner, loser: m.a === winner ? m.b : m.a, score: String(score ?? "").slice(0, 20), status: "done", played_at: new Date().toISOString(), reported_by: "joueurs" });
      E.resolve(c);
      if (c.phase === "pools" && E.poolsDone(c)) E.buildFinalFromPools(c);
      E.autoFill(c, venue?.settings);

      const matches = c.matches.map((x: any) => ({ ...x, machine: x.status === "live" ? (x.machine || 1) : null, live_at: x.status === "live" ? (x.live_at || new Date().toISOString()) : null }));
      const patch: Record<string, unknown> = { status: c.status, phase: c.phase, pools: c.pools };
      if (c.status === "termine") patch.finished_at = new Date().toISOString();
      const { error } = await db.rpc("apply_bracket", { p_contest: contest_id, p_version: k.version, p_matches: matches, p_patch: patch });
      if (error) {
        if (String(error.message).includes("conflict")) { await sleep(150 + Math.random() * 300); continue; }  // quelqu'un a écrit en même temps : on recommence
        throw error;
      }
      if (c.status === "termine") {
        const { data: season } = await db.from("seasons").select("points").eq("id", k.season_id).single();
        const present = (regs ?? []).filter((r: any) => r.present).map((r: any) => r.id);
        await db.from("results").upsert(E.seasonResults(c, present, season?.points ?? { part: 1, win: 1, p1: 8, p2: 5, p3: 3 }).map((x: any) => ({ contest_id, ...x })));
      }
      const next = E.lives(c).find((x: any) => x.a === me.id || x.b === me.id);
      return cors({ ok: true, won: winner === me.id, finished: c.status === "termine", next: next ? { machine: next.machine } : null });
    }
    return cors({ error: "Beaucoup de résultats arrivent en même temps : réessayez dans quelques secondes." }, 409);
  } catch (e) {
    console.error(e);
    return cors({ error: "Erreur serveur. Donnez votre résultat au comptoir." }, 500);
  }
});
