// Annonce du prochain concours aux anciens participants qui l'ont accepté (consentement "annonces").
// Réservée au staff : le jeton de session est vérifié et l'e-mail doit figurer dans la table staff.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { admin, cors, esc, frDate, layout, sendEmail, SITE_URL } from "../_shared/mail.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors({});
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: isStaff } = await userClient.rpc("is_staff");
  if (!isStaff) return cors({ error: "réservé au staff" }, 403);

  const { contest_id } = await req.json();
  const db = admin();
  const { data: k } = await db.from("contests").select("*").eq("id", contest_id).single();
  if (!k || k.status !== "ouvert") return cors({ error: "concours non ouvert aux inscriptions" }, 400);
  if (k.announced_at) return cors({ error: "annonce déjà envoyée le " + k.announced_at.slice(0, 10) }, 409);
  const { data: venue } = await db.from("venues").select("*").eq("id", 1).single();

  const { data: players } = await db.from("players").select("email, first_name, unsub_token").eq("consent_news", true).not("email", "is", null).is("erased_at", null);
  const seen = new Set<string>();
  const hour = k.start_time.slice(0, 5).replace(":", "h");
  const lots = (k.prizes?.podium ?? []).filter(Boolean);
  let sent = 0;
  for (const p of players ?? []) {
    if (seen.has(p.email)) continue;
    seen.add(p.email);
    const unsub = `${SITE_URL}/gerer.html?u=${p.unsub_token}`;
    const html = layout(`Prochain concours : ${frDate(k.date)}`, `
      <p>Bonjour ${esc(p.first_name)},</p>
      <p>Le prochain concours de fléchettes aura lieu le <b>${esc(frDate(k.date))} à ${hour}</b> au ${esc(venue.name)}.</p>
      <ul><li>Gratuit, en équipe de 2 (inscription solo possible)</li><li>Débutants bienvenus</li><li>Lots pour le podium${lots.length ? " (" + esc(lots[0]) + ")" : ""} et prix de consolation</li><li>${k.max_teams} équipes maximum</li></ul>
      <p><a href="${SITE_URL}/?c=${k.id}" style="display:inline-block;background:#b71c27;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Inscrire mon équipe</a></p>`,
      `Vous recevez cet e-mail car vous avez accepté les annonces. <a href="${unsub}">Ne plus recevoir les annonces</a>`);
    try { await sendEmail(p.email, `Concours de fléchettes – ${frDate(k.date)}`, html); sent++; } catch (e) { console.error(e); }
  }
  await db.from("contests").update({ announced_at: new Date().toISOString() }).eq("id", k.id);
  return cors({ sent });
});
