// Confirmation d'inscription immédiate, et e-mail "place libérée" pour une équipe sortie de la liste d'attente.
// Appelée par la page publique juste après register_team (avec le jeton reçu) ou après cancel_registration.
// Idempotente : chaque e-mail n'est envoyé qu'une fois (colonnes *_sent_at).
import { admin, cors, esc, frDate, ics, layout, sendEmail, SITE_URL } from "../_shared/mail.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors({});
  try {
    const { cancel_token, promoted_registration_id } = await req.json();
    const db = admin();
    const { data: venue } = await db.from("venues").select("*").eq("id", 1).single();

    let q = db.from("registrations").select("*, teams(name, captain:players!teams_captain_id_fkey(first_name,email,unsub_token), mate:players!teams_mate_id_fkey(first_name)), contests(*)");
    if (cancel_token) q = q.eq("cancel_token", cancel_token);
    else if (promoted_registration_id) q = q.eq("id", promoted_registration_id);
    else return cors({ error: "paramètre manquant" }, 400);
    const { data: r, error } = await q.single();
    if (error || !r) return cors({ error: "inscription introuvable" }, 404);

    const cap = r.teams.captain;
    if (!cap?.email) return cors({ sent: false, reason: "pas d'e-mail" });
    const k = r.contests;
    const manage = `${SITE_URL}/gerer.html?t=${r.cancel_token}`;
    const when = `${frDate(k.date)} à ${k.start_time.slice(0, 5).replace(":", "h")}`;
    const where = `${venue.name}, ${venue.address}`;
    const footer = `Modifier ou annuler : <a href="${manage}">${manage}</a>`;

    if (cancel_token && !r.confirmation_sent_at) {
      const waiting = r.status === "attente";
      const html = layout(waiting ? "Vous êtes en liste d'attente" : "Inscription confirmée", `
        <p>Bonjour ${esc(cap.first_name)},</p>
        <p>${waiting ? "Le concours est complet : votre équipe est <b>en liste d'attente</b>. Nous vous écrivons dès qu'une place se libère." : "Votre équipe est <b>inscrite</b>. À bientôt au bar !"}</p>
        <table style="border-collapse:collapse;font-size:15px">
          <tr><td style="padding:4px 12px 4px 0;color:#56645b">Équipe</td><td><b>${esc(r.teams.name)}</b></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#56645b">Quand</td><td>${esc(when)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#56645b">Où</td><td>${esc(where)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#56645b">Jeu</td><td>${esc(k.game)} · ${k.format === "poules" ? "poules puis tableau" : "élimination directe + consolante"}</td></tr>
        </table>
        <p>Le concours est gratuit. Présentez-vous 15 minutes avant le début pour le pointage.</p>
        <p><a href="${manage}" style="display:inline-block;background:#131b16;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Gérer mon inscription</a></p>`, footer);
      await sendEmail(cap.email, waiting ? "Liste d'attente – concours de fléchettes" : `Inscription confirmée – ${when}`, html,
        waiting ? undefined : { name: "concours-flechettes.ics", content: ics(k, venue) });
      await db.from("registrations").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", r.id);
      return cors({ sent: true });
    }

    if (promoted_registration_id && r.status === "confirmee" && r.was_waitlisted && !r.promotion_sent_at) {
      const html = layout("Une place s'est libérée !", `
        <p>Bonjour ${esc(cap.first_name)},</p>
        <p>Bonne nouvelle : votre équipe <b>${esc(r.teams.name)}</b> passe de la liste d'attente à la liste des inscrits pour le concours du <b>${esc(when)}</b>.</p>
        <p>Si vous ne pouvez plus venir, libérez la place pour une autre équipe : <a href="${manage}">gérer mon inscription</a>.</p>`, footer);
      await sendEmail(cap.email, "Place libérée – vous êtes inscrits !", html, { name: "concours-flechettes.ics", content: ics(k, venue) });
      await db.from("registrations").update({ promotion_sent_at: new Date().toISOString() }).eq("id", r.id);
      return cors({ sent: true });
    }
    return cors({ sent: false });
  } catch (e) {
    console.error(e);
    return cors({ error: String(e) }, 500);
  }
});
