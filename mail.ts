// Envoi d'e-mails transactionnels via Brevo (prestataire français, serveurs dans l'UE).
// Secrets requis : BREVO_API_KEY, MAIL_FROM (adresse validée dans Brevo), SITE_URL.
import { createClient } from "jsr:@supabase/supabase-js@2";

export const MENTION = "L'abus d'alcool est dangereux pour la santé, à consommer avec modération.";
export const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");

export function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

export function cors(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": SITE_URL || "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

export function frDate(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
}
export function parisToday(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 864e5);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now); // AAAA-MM-JJ
}

export function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Fichier .ics pour ajouter le concours à l'agenda */
export function ics(c: { id: string; date: string; start_time: string }, venue: { name: string; address: string }, minutes = 180) {
  const [y, m, d] = c.date.split("-");
  const [hh, mm] = c.start_time.split(":");
  const start = `${y}${m}${d}T${hh}${mm}00`;
  const endDate = new Date(Date.UTC(+y, +m - 1, +d, +hh, +mm + minutes));
  const end = endDate.toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "T") + "00";
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//VandB Lattes//Flechettes//FR", "BEGIN:VEVENT",
    `UID:${c.id}@flechettes-vandb-lattes`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;TZID=Europe/Paris:${start}`, `DTEND;TZID=Europe/Paris:${end}`,
    "SUMMARY:Concours de fléchettes – " + venue.name,
    "LOCATION:" + venue.address.replace(/,/g, "\\,"),
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

export function layout(title: string, body: string, footer = "") {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#edf1ec;font-family:Arial,sans-serif;color:#131b16">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="height:8px;background:repeating-linear-gradient(90deg,#b71c27 0 22px,#131b16 22px 24px,#0c6f47 24px 46px,#131b16 46px 48px);border-radius:2px"></div>
    <h1 style="font-size:24px;text-transform:uppercase;margin:18px 0 12px">${esc(title)}</h1>
    ${body}
    <p style="font-size:12px;color:#56645b;margin-top:28px">${footer}<br>Concours réservé aux majeurs. ${MENTION}</p>
  </div></body></html>`;
}

export async function sendEmail(to: string, subject: string, html: string, attachment?: { name: string; content: string }) {
  const key = Deno.env.get("BREVO_API_KEY");
  if (!key) throw new Error("BREVO_API_KEY manquant");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "V and B Lattes – Fléchettes", email: Deno.env.get("MAIL_FROM") },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      ...(attachment ? { attachment: [{ name: attachment.name, content: btoa(unescape(encodeURIComponent(attachment.content))) }] } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
}
