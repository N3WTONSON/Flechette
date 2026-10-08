// Rien à modifier à la main : la publication GitHub (workflow « Déployer ») remplace la clé ci-dessous
// par la clé publique « anon » du projet Supabase. Cette clé est publique par conception :
// la sécurité repose sur les règles de la base (RLS) et les fonctions.
export const SUPABASE_URL = 'https://ifjiysdhxmidiswcsiuq.supabase.co';
export const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__';
// Adresse publique du site (liens et QR codes) : déduite de l'adresse de la page, GitHub Pages ou domaine perso.
export const SITE_URL = new URL('.', location.href).href.replace(/\/$/, '');
// Fichiers volumineux (logo, images, vidéos) : bucket public « assets » de Supabase Storage, pas dans le dépôt GitHub.
export const ASSETS_URL = `${SUPABASE_URL}/storage/v1/object/public/assets`;
// Dossier des images dans le bucket « assets » (le logo est Flechettes/Images/logo.png)
export const ASSETS_DIR = 'Flechettes/Images';
export const LOGO_PATH = `${ASSETS_DIR}/logo.png`;
