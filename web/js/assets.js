// Charge les fichiers hébergés dans Supabase Storage (bucket « assets ») et l'illustration de l'en-tête.
import { ASSETS_URL, LOGO_PATH } from '../config.js';
import { DART_ART } from './art.js';

export const assetUrl = (name) => `${ASSETS_URL}/${name.split('/').map(encodeURIComponent).join('/')}`;

document.querySelectorAll('[data-asset]').forEach((el) => { el.src = assetUrl(el.dataset.asset === 'logo' ? LOGO_PATH : el.dataset.asset); });
const art = document.getElementById('art');
if (art) art.innerHTML = DART_ART;
