// Synchronise horaires, fermetures exceptionnelles et coordonnées avec la fiche magasin vandb.fr.
// Appelée chaque matin par la tâche planifiée de la base (pg_cron), ou par le staff depuis Réglages (« Mettre à jour maintenant »).
// Sans clé secrète : hors staff, elle ne relit la page qu'une fois toutes les 6 heures au plus.
import { admin, asCaller, cors } from "../_shared/http.ts";
import { parseStore } from "../_shared/store_parser.js";

const STORE_URL = Deno.env.get("STORE_URL") ?? "https://www.vandb.fr/nos-magasins/v-and-b-montpellier-lattes";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors({});
  const staff = req.headers.get("Authorization") ? (await asCaller(req).rpc("is_staff")).data : false;
  if (!staff) {
    const { data: v } = await admin().from("venues").select("settings").eq("id", 1).single();
    const last = Date.parse(v?.settings?.syncedAt ?? "") || 0;
    if (Date.now() - last < 6 * 3600e3) return cors({ updated: false, reason: "Déjà vérifié il y a moins de 6 heures." });
  }
  try {
    const res = await fetch(STORE_URL, { headers: { "User-Agent": "Mozilla/5.0 (fléchettes V and B Lattes ; synchro horaires)", "Accept-Language": "fr-FR" } });
    if (!res.ok) throw new Error(`vandb.fr a répondu ${res.status}`);
    const parsed = parseStore(await res.text());
    // garde-fou : si la page a changé de forme, on ne touche à rien plutôt que d'effacer des horaires valides
    if (!parsed.ok) return cors({ updated: false, reason: "Horaires introuvables sur la page : rien n’a été modifié." }, 422);
    const db = admin();
    const { data: v } = await db.from("venues").select("*").eq("id", 1).single();
    const contact = { ...(v.settings?.contact ?? {}), ...Object.fromEntries(Object.entries(parsed.contact).filter(([, x]) => x)) };
    const settings = { ...v.settings, contact, syncedAt: new Date().toISOString(), storeUrl: STORE_URL };
    const changes = [];
    if (JSON.stringify(v.hours) !== JSON.stringify(parsed.hours)) changes.push("horaires");
    if (JSON.stringify(v.closures) !== JSON.stringify(parsed.closures)) changes.push("fermetures exceptionnelles");
    if (JSON.stringify(v.settings?.contact ?? {}) !== JSON.stringify(contact)) changes.push("coordonnées");
    const { error } = await db.from("venues").update({ hours: parsed.hours, closures: parsed.closures, address: contact.addr ?? v.address, settings }).eq("id", 1);
    if (error) throw error;
    return cors({ updated: true, changes, hours: parsed.hours, closures: parsed.closures, contact });
  } catch (e) {
    console.error(e);
    return cors({ updated: false, reason: String(e) }, 500);
  }
});
