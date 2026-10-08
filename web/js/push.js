// Notifications sur le téléphone du joueur : « une place s'est libérée », « à vous de jouer sur la machine 2 ».
// Web Push standard : ni e-mail, ni SMS, ni application à télécharger. Sur iPhone (iOS 16.4+), il faut d'abord
// ajouter la page à l'écran d'accueil, puis l'ouvrir depuis l'icône.
import { sb } from './sb.js';
import { esc } from './util.js';

const KEY = (token) => 'vb-push-' + token;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** 'on' | 'off' | 'denied' | 'install' (iPhone : ajouter à l'écran d'accueil d'abord) | 'unsupported' */
export function pushState(token) {
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!ok) return isIOS() && !standalone() ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  let on = false; try { on = localStorage.getItem(KEY(token)) === '1'; } catch {}
  return on && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Abonne ce téléphone aux notifications et renvoie l'abonnement. À appeler directement dans le gestionnaire du clic
    (les navigateurs exigent un geste de l'utilisateur pour demander l'autorisation). */
export async function subscribeDevice() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications refusées. Vous pourrez les autoriser plus tard dans les réglages du navigateur.');
  const reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  const { data, error } = await sb.functions.invoke('push', { body: { action: 'key' } });
  if (error || !data?.publicKey) throw new Error('Service de notifications indisponible, réessayez plus tard.');
  const appKey = Uint8Array.from(atob(data.publicKey.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - data.publicKey.length % 4) % 4)), (c) => c.charCodeAt(0));
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const cur = sub.options?.applicationServerKey && new Uint8Array(sub.options.applicationServerKey);
    if (cur && (cur.length !== appKey.length || cur.some((b, i) => b !== appKey[i]))) { await sub.unsubscribe(); sub = null; }
  }
  if (!sub) {
    try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey }); }
    catch { throw new Error('Ce navigateur n’a pas pu activer les notifications. Essayez avec Chrome, ou Safari après ajout à l’écran d’accueil.'); }
  }
  return sub.toJSON();
}

/** Active les notifications pour une inscription (jeton gardé sur le téléphone) */
export async function enablePush(token) {
  const j = await subscribeDevice();
  const { error } = await sb.rpc('save_push_subscription', { p_token: token, p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
  if (error) throw new Error(error.message.replace(/^.*?: /, ''));
  try { localStorage.setItem(KEY(token), '1'); } catch {}
}

/* iPhone : l'application ajoutée à l'écran d'accueil a sa propre mémoire, séparée de Safari.
   On place donc le jeton de l'inscription dans l'adresse de départ, pour que l'icône rouvre la bonne inscription. */
function prepareIOSInstall(token) {
  try {
    if (!/gerer\.html$/.test(location.pathname)) history.replaceState(null, '', `${location.pathname}?t=${encodeURIComponent(token)}&tab=monmatch`);
    const link = document.querySelector('link[rel="manifest"]'); if (!link) return;
    const base = new URL(link.href, location.href);
    fetch(base).then((r) => r.json()).then((m) => {
      m.start_url = location.href; m.scope = new URL('./', base).href;
      m.icons = (m.icons || []).map((i) => ({ ...i, src: new URL(i.src, base).href }));
      link.href = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }));
    }).catch(() => {});
  } catch {}
}

/** Encadré « Être prévenu sur ce téléphone » (bouton data-push = jeton de l'inscription) */
export function pushPanel(token, waiting) {
  const st = pushState(token);
  const why = waiting ? 'Soyez prévenu sur ce téléphone dès qu’une place se libère, puis quand votre match commence.' : 'Soyez prévenu sur ce téléphone quand votre match commence, avec le numéro de la machine.';
  if (st === 'on') return '<div class="notice good">🔔 Notifications activées sur ce téléphone.</div>';
  if (st === 'install') prepareIOSInstall(token);
  if (st === 'install') return `<div class="notice"><b>🔔 Être prévenu sur cet iPhone</b><br>${why}<br><span class="small">Touchez <b>Partager</b> <span aria-hidden="true">⎋</span> puis <b>Sur l’écran d’accueil</b>, ouvrez l’application depuis la nouvelle icône, puis revenez dans l’onglet « Mon match » pour activer les notifications.</span></div>`;
  if (st === 'denied') return '<div class="notice">Les notifications sont bloquées pour ce site dans les réglages du téléphone. Pensez à ouvrir l’onglet « Mon match » de temps en temps.</div>';
  if (st === 'unsupported') return '<p class="muted small">Ce navigateur ne gère pas les notifications : ouvrez l’onglet « Mon match » de temps en temps.</p>';
  return `<div class="notice ${waiting ? 'warn' : ''}"><b>🔔 Être prévenu sur ce téléphone</b><br><span class="small">${why}</span><div class="row" style="margin-top:8px"><button type="button" class="btn red" data-push="${esc(token)}">Activer les notifications</button></div></div>`;
}
