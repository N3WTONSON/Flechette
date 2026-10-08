# Concours de fléchettes – V and B Montpellier Lattes

Application web installable (PWA) pour les concours de fléchettes du bar, hébergée sur **GitHub Pages** avec une base **Supabase**.
**Aucun e-mail, aucun mot de passe, aucun SQL à exécuter** : tout se déploie depuis GitHub.

- **Concours** : création, duplication à J+7, contrôle des horaires d'ouverture et des fermetures (bloqué par la base), alerte de conflit, estimation de l'heure de fin sur les deux machines.
- **Inscriptions** : page joueurs par lien ou QR code, en moins d'une minute, avec le **numéro de téléphone** du capitaine (une inscription par numéro et par concours). Inscription sur place par le staff, liste d'attente automatique, annulation, joueurs solo associés par niveau.
- **Notifications sur le téléphone** : « une place s'est libérée » pour les équipes en liste d'attente, « à vous de jouer sur la machine 2 » quand un match est lancé.
- **Jour J** : pointage, tirage (élimination directe + consolante, ou poules puis tableau), deux machines DARTSLIVE 2, match suivant lancé automatiquement, **résultats déclarés par les joueurs** depuis leur téléphone ou saisis par le staff en deux touches.
- **Résultats, saison, record de la semaine, légendes Instagram, QR code**, onglet **Contact** synchronisé avec vandb.fr, écran TV.

## Les trois pages
| Page | Fichier | Pour qui |
|---|---|---|
| Joueurs | `index.html` (+ `gerer.html`) | Téléphones : inscription, **Mon match** (code d'équipe, résultat), **Mes scores**, tableau, résultats, saison, contact |
| Test téléphone | `test.html` | Vérifier qu'un téléphone gère tout avant un concours |
| Staff | `staff.html` (écran comptoir : `comptoir.html`) | Ouvert par le QR code ou le lien staff : jour J, équipes, concours, réglages |
| TV | `suivi.html` (ancien mode : `bar.html`) | Télévision ou projecteur : tableau du tournoi en miroir (moitié gauche, moitié droite, finale au centre), en direct, adapté au nombre d'équipes, sans rien toucher |

## Mise en ligne (une seule fois, environ 10 minutes)
Le dépôt GitHub et GitHub Pages sont déjà en place. Il reste :

1. **Source de GitHub Pages** : dans le dépôt, **Settings › Pages › Build and deployment › Source** = **GitHub Actions** (et non « Deploy from a branch »).
2. **Un secret GitHub** : **Settings › Secrets and variables › Actions**, onglet **Secrets**, **New repository secret** :
   - `SUPABASE_ACCESS_TOKEN` : sur supabase.com, **Account › Access Tokens › Generate new token**, copiez le jeton.
3. **Lancer le déploiement** : onglet **Actions › Déployer › Run workflow** (il se relance aussi tout seul à chaque modification du dépôt). Il :
   - crée ou met à jour les tables, les règles d'accès et les tâches planifiées de la base (fichiers de `supabase/migrations`, chacun appliqué une seule fois) ;
   - active l'ouverture directe de l'espace staff et désactive la connexion par e-mail ;
   - déploie les fonctions `report`, `push` et `sync-store` ;
   - écrit la clé publique du projet dans `web/config.js` et publie le site.
4. **Espace staff** : `https://VOTRE-COMPTE.github.io/VOTRE-DEPOT/staff.html`. Il s'ouvre directement ; son QR code est dans **Réglages › Accès staff**.

## Accès du staff : direct, sans identifiant ni code
- **Tablette ou téléphone** : scanner le **QR code staff** (Réglages › Accès staff). **Ordinateur** : ouvrir le lien `…/staff.html` (à mettre en favori).
- L'espace staff s'ouvre directement. Aucun bouton n'y mène depuis les pages joueurs, l'écran TV ou l'écran comptoir.
- Attention : toute personne qui connaît l'adresse `staff.html` accède à l'espace staff (concours, résultats, numéros de téléphone des joueurs). Ne l'affichez pas à la vue des clients.

## Les joueurs
1. **Inscription** sur le téléphone : prénoms, niveaux, numéro de téléphone du capitaine. Le numéro n'est jamais affiché ; seul le staff le voit.
   - **Le numéro identifie l'équipe d'un concours à l'autre.** Le téléphone retient le numéro, les prénoms et le nom d'équipe : le formulaire est déjà rempli la fois suivante. Sans nom saisi, la base reprend le dernier nom utilisé avec ce numéro.
   - Un nom d'équipe appartient au numéro qui l'a utilisé en premier : un autre numéro ne peut pas le prendre. Les points s'additionnent ainsi dans le classement de la saison.
   - L'onglet **Mes scores** montre tous les concours joués avec ce numéro : place, points, chaque match (adversaire, victoire ou défaite, score) et les totaux de la saison.
2. **Équipe confirmée** : le **code d'équipe à 4 chiffres** s'affiche sur le téléphone et y reste enregistré (jamais envoyé ailleurs).
   **Liste d'attente** : pas de code ; le téléphone indique qu'il n'y a plus de place. Dès qu'une place se libère, l'équipe passe inscrite et le code apparaît dans **Mon match**.
3. **Notifications** : le bouton **Activer les notifications** (après l'inscription, dans **Mon match** ou sur la page de gestion) abonne le téléphone. Il reçoit alors :
   - « Une place s'est libérée ! » quand son équipe sort de la liste d'attente ;
   - « À vous de jouer : machine 2 » quand son match est lancé.
   Android (Chrome, Firefox, Samsung Internet) : directement dans le navigateur. **iPhone** (iOS 16.4 ou plus) : il faut d'abord **Partager › Sur l'écran d'accueil**, puis ouvrir l'application depuis l'icône ; la page l'explique au joueur et garde son inscription dans l'icône.
4. **Pendant le concours**, onglet **Mon match** : la machine et l'adversaire, puis **Nous avons gagné / Nous avons perdu**. Le tableau, l'écran TV et le comptoir se mettent à jour aussitôt ; le match suivant est lancé sur la machine libérée. Le staff voit « déclaré par les joueurs » et peut annuler une erreur.

Les notifications utilisent le standard Web Push : ni e-mail, ni SMS, ni application à télécharger, aucun compte chez un prestataire. Les clés d'envoi sont créées automatiquement par la fonction `push` au premier usage.

## Page test téléphone
`test.html` sert à vérifier qu'un téléphone gère tout avant un concours. Son QR code est dans **Staff › Réglages**.
- **Vérifications automatiques** : configuration du site, connexion à la base, concours visibles, mises à jour en direct, fonctions du serveur, mémoire du téléphone, installation, notifications.
- **Notification de test** : un bouton envoie une vraie notification à ce téléphone seulement.
- **Parcours complet** à cocher, sur le concours de test : inscription, notifications, place libérée (avec 2 téléphones), code dans Mon match, « À vous de jouer », déclaration du résultat, Mes scores, nom d'équipe gardé.
- **Remettre ce téléphone à zéro** pour refaire le parcours comme un nouveau joueur.

## Concours de test
**Staff › Réglages › Concours de test › Créer ou remettre à zéro** crée un concours « (test) » au prochain jour d'ouverture.
- 12 équipes d'exemple sur **13 places**, dont 10 présentes : le premier téléphone testeur est inscrit, le suivant passe en liste d'attente.
- Inscriptions ouvertes jusqu'à la fermeture du bar. Codes d'équipe : 1001 (Les Flèches) à 1012 (180 Club).
- Il ne compte jamais dans le classement de la saison. **Effacer le concours de test** le supprime, avec les équipes des testeurs.

## Contact synchronisé avec vandb.fr
L'onglet **Contact** (horaires, fermetures exceptionnelles, téléphone, adresse) est repris de https://www.vandb.fr/nos-magasins/v-and-b-montpellier-lattes chaque matin par une tâche planifiée de la base, ou à la demande (**Réglages › Mettre à jour maintenant**). Si la page change de forme, rien n'est modifié. Les horaires servent aussi aux contrôles des concours.

## Architecture
```
.github/workflows/deploy.yml   déploiement complet à chaque push (base, fonctions, site)
scripts/deploy-supabase.mjs    applique les migrations par l'API Supabase, sans SQL manuel
supabase/
  migrations/                  tables, règles d'accès, fonctions SQL, déclencheurs, tâches planifiées
  functions/report             résultat déclaré par les joueurs (même moteur que le staff)
  functions/push               notifications Web Push (place libérée, match lancé)
  functions/sync-store         synchro de la fiche vandb.fr
  functions/_shared            moteur de tournoi, chiffrement Web Push, lecture de la fiche magasin
web/                           le site publié (aucune donnée stockée sur GitHub)
```
- Les données personnelles (prénoms, téléphone) ne sont lisibles que par les appareils du staff. Le public passe par des vues et des fonctions qui ne les exposent pas.
- Les notifications partent de la base : quand une équipe sort de la liste d'attente ou qu'un match passe « en cours », un déclencheur prépare le message et appelle la fonction `push` ; une tâche planifiée renvoie toutes les 5 minutes ce qui serait resté en attente.
- Les fichiers volumineux (logo, photos, vidéos) sont dans Supabase Storage (bucket `assets`), pas dans le dépôt : **Réglages › Fichiers du site**. Le logo est `Flechettes/Images/logo.png`.
- Le dépôt peut être public : il ne contient aucun secret (la clé « anon » est publique par conception).

## Au bar
- **Mode d'emploi** : onglet de l'espace staff qui explique simplement la création d'un concours, les inscriptions, le soir du concours, l'écran TV et les questions fréquentes.
- **Aucun bouton vers l'espace staff** côté joueurs. Sur l'écran comptoir (tablette utilisée par les clients pour s'inscrire), le staff en sort par un appui de 3 secondes sur l'heure.
- **Télévision** : `suivi.html` en plein écran, mise à jour automatique.
- **Écran comptoir** (tablette près des machines) : `comptoir.html` sur un appareil autorisé. Inscription sur place, pointage, puis les deux machines avec saisie du gagnant.
- **Instagram** : lien du site en bio, sticker lien en story. QR code dans l'onglet **Communication**.

## Règles métier
- **Horaires** : pas de concours le dimanche, un jour de fermeture ou hors des heures d'ouverture (refusé par la base). Happy hour 17h–19h signalée.
- **Fin estimée** : matchs × (durée du jeu + changement d'équipe), répartis sur les machines ; tirage bloqué si la fin dépasse la fermeture.
- **Deux machines** : jamais la même équipe sur les deux à la fois ; match suivant lancé sur la machine libérée.
- **Consolante** : perdants du premier tour, sur un jeu de fête.
- **Barème de saison** (modifiable) : participation 1, victoire 1, 3e 3, 2e 5, 1re 8, record de la semaine 2.
- Jeux écartés : **Yum Yum** (points boisson) et **Cut Throat** (trois camps minimum).

## RGPD et alcool
- Données : prénoms ou pseudos, niveaux, numéro de téléphone du capitaine. Aucun e-mail.
- La page de gestion (lien affiché après l'inscription) permet d'annuler et de supprimer ses données (effacement immédiat, abonnements aux notifications compris).
- Majorité obligatoire. Mention sanitaire sur chaque page et chaque légende. Les points ne sont jamais liés à une consommation. Photo du podium publiée seulement avec l'accord des personnes.

## Ce qui a été testé
- Le schéma a été appliqué sur PostgreSQL 16. Testés :
  - accès staff : ouverture directe de la page staff, actions staff refusées aux pages joueurs ;
  - inscription par téléphone : numéro obligatoire, normalisé, une équipe par numéro ;
  - nom d'équipe repris avec le même numéro, refusé à un autre numéro, suivi « Mes scores » ;
  - liste d'attente : promotion, message « place libérée » et appel de la fonction `push` ;
  - message « machine 2 » au lancement d'un match ;
  - concours de test : création et effacement ;
  - refus des actions staff pour le public.
- Le chiffrement Web Push a été vérifié en déchiffrant de façon indépendante des messages produits sous Node et sous Deno. Les fonctions passent la vérification de types Deno.
- Les pages (staff, joueurs, Mes scores, page test) ont été parcourues dans Chromium avec une base simulée.
- Pas encore vérifié sur le vrai projet Supabase. Faites un concours de test et une notification d'essai sur un Android et un iPhone avant la première vraie date.
