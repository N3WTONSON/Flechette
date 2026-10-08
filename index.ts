// Rappels la veille et le jour même (déclenchée chaque matin par pg_cron, voir supabase/cron.sql).
// Protégée par l'en-tête x-cron-secret.
import { admin, cors, esc, frDate, layout, parisToday, sendEmail, SITE_URL } from "../_shared/mail.ts";

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return cors({ error: "interdit" }, 403);
  const db = admin();
  const { data: venue } = await db.from("venues").select("*").eq("id", 1).single();
  const today = parisToday(0), tomorrow = parisToday(1);
  const { data: contests } = await db.from("contests").select("*").in("date", [today, tomorrow]).eq("status", "ouvert");
  let sent = 0, failed = 0;

  for (const k of contests ?? []) {
    const eve = k.date === tomorrow;
    const col = eve ? "reminder_eve_at" : "reminder_day_at";
    const { data: regs } = await db.from("registrations")
      .select("id, cancel_token, teams(name, captain:players!teams_captain_id_fkey(first_name,email,consent_reminders))")
      .eq("contest_id", k.id).eq("status", "confirmee").is(col, null);
    for (const r of regs ?? []) {
      const cap = (r as any).teams.captain;
      if (!cap?.email || !cap.consent_reminders) continue;
      const manage = `${SITE_URL}/gerer.html?t=${r.cancel_token}`;
      const hour = k.start_time.slice(0, 5).replace(":", "h");
      const html = layout(eve ? "C'est demain !" : "C'est aujourd'hui !", `
        <p>Bonjour ${esc(cap.first_name)},</p>
        <p>Rappel : votre équipe <b>${esc((r as any).teams.name)}</b> joue au concours de fléchettes <b>${eve ? "demain" : "aujourd'hui"}, ${esc(frDate(k.date))} à ${hour}</b>.</p>
        <p>${esc(venue.name)}<br>${esc(venue.address)}</p>
        <p>Pointage 15 minutes avant le début. Un empêchement ? <a href="${manage}">Libérez votre place</a> pour une équipe en liste d'attente.</p>`,
        `Gérer mon inscription : <a href="${manage}">${manage}</a>`);
      try {
        await sendEmail(cap.email, eve ? `Demain ${hour} : concours de fléchettes` : `Aujourd'hui ${hour} : concours de fléchettes`, html);
        await db.from("registrations").update({ [col]: new Date().toISOString() }).eq("id", r.id);
        sent++;
      } catch (e) { console.error(e); failed++; }
    }
  }
  return cors({ sent, failed });
});
