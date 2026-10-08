// Notifications sur le téléphone des joueurs (place libérée, match lancé sur une machine).
// - { action: "key" }   : renvoie la clé publique VAPID dont le téléphone a besoin pour s'abonner
// - { action: "test", subscription } : notification d'essai envoyée au seul téléphone demandeur (page test.html)
// - { action: "flush" } : envoie les messages en attente (appelée par la base dès qu'un message est ajouté,
//                         et toutes les 5 minutes en filet de sécurité). Sans danger si quelqu'un l'appelle :
//                         elle n'envoie que ce que la base a préparé, une seule fois.
// Les clés VAPID sont créées automatiquement au premier appel et gardées dans la table push_keys.
import { admin, cors } from "../_shared/http.ts";
import { generateVapidKeys, sendPush } from "../_shared/webpush.js";

const SUBJECT = Deno.env.get("PUSH_SUBJECT") ?? "https://www.vandb.fr/nos-magasins/v-and-b-montpellier-lattes";

async function vapid(db: ReturnType<typeof admin>) {
  const { data } = await db.from("push_keys").select("*").eq("id", 1).maybeSingle();
  if (data) return { publicKey: data.public_key, privateJwk: data.private_jwk };
  const k = await generateVapidKeys();
  await db.from("push_keys").insert({ id: 1, public_key: k.publicKey, private_jwk: k.privateJwk });
  // si deux appels ont créé une clé en même temps, on garde celle enregistrée
  const { data: kept } = await db.from("push_keys").select("*").eq("id", 1).single();
  return { publicKey: kept.public_key, privateJwk: kept.private_jwk };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors({});
  try {
    const { action, subscription } = await req.json().catch(() => ({ action: "flush" }));
    const db = admin();
    const keys = await vapid(db);
    if (action === "key") return cors({ publicKey: keys.publicKey });
    // page de test : envoie une notification d'essai au téléphone qui la demande (à lui seul)
    if (action === "test") {
      const ep = String(subscription?.endpoint ?? "");
      if (!/^https:\/\//.test(ep) || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return cors({ error: "Abonnement invalide" }, 400);
      const status = await sendPush(subscription, { title: "Notification de test ✔", body: "Les notifications fonctionnent sur ce téléphone. Vous serez prévenu quand une place se libère et quand votre match commence.", url: "./test.html", tag: "test" }, keys, SUBJECT, 300);
      return cors({ status, ok: status < 300 });
    }

    // réserve les messages (sent_at posé avant l'envoi : deux appels simultanés n'envoient pas deux fois)
    const { data: pending } = await db.from("push_outbox").select("*").is("sent_at", null)
      .gt("created_at", new Date(Date.now() - 6 * 3600e3).toISOString()).order("id").limit(100);
    let sent = 0, gone = 0;
    for (const m of pending ?? []) {
      const { data: claimed } = await db.from("push_outbox").update({ sent_at: new Date().toISOString() }).eq("id", m.id).is("sent_at", null).select("id");
      if (!claimed?.length) continue;
      const { data: subs } = await db.from("push_subscriptions").select("*").eq("registration_id", m.registration_id);
      for (const s of subs ?? []) {
        try {
          const status = await sendPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            { title: m.title, body: m.body, url: m.url, tag: m.tag }, keys, SUBJECT);
          if (status === 404 || status === 410) { await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint); gone++; }
          else if (status < 300) sent++;
          else console.warn("push", status, new URL(s.endpoint).host);
        } catch (e) { console.warn("push", String(e)); }
      }
    }
    return cors({ sent, expired: gone });
  } catch (e) {
    console.error(e);
    return cors({ error: String(e) }, 500);
  }
});
