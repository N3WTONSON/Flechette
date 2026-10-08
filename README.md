# Concours de fléchettes – V and B Montpellier Lattes

Application web installable (PWA) pour les concours de fléchettes du bar. Elle couvre le MVP du cahier des charges :

- **Concours** : création, duplication à J+7, statuts, contrôle des horaires d'ouverture et des fermetures exceptionnelles (bloqué par la base), alerte en cas de conflit avec une autre animation, estimation de l'heure de fin sur les deux machines.
- **Inscriptions** : page publique par lien ou QR code, formulaire en moins d'une minute, sans compte. Inscription sur place par le staff, places restantes, liste d'attente automatique, désinscription en un clic, joueurs solo associés par niveau.
- **Jour J** : pointage, tirage (élimination directe + consolante, ou poules puis tableau), file d'attente sur les deux machines DARTSLIVE 2 (lancement automatique du match suivant sur la machine libérée), saisie du gagnant en deux touches, chrono jusqu'à la fermeture, mode bar en temps réel.
- **Résultats** : podium, prix de consolation (vainqueur de la consolante ou tirage au sort), photo du podium avec accord, page publique partageable.
- **Saison** : classement des équipes et des joueurs calculé depuis les résultats, record de la semaine (Count-Up, Big Bull).
- **Notifications** : confirmation immédiate avec fichier agenda, rappels la veille et le jour même, « place libérée », annonce du concours suivant aux anciens participants qui l'ont accepté.
- **Communication** : légendes Instagram prêtes à copier avec la mention sanitaire, QR code téléchargeable.

Pas encore inclus (versions 2 et 3 du cahier) : espace joueur avec historique personnel, génération des visuels 1080 × 1920, SMS/WhatsApp, rating DARTSLIVE dans le tirage, tableaux par niveau.

## Architecture

| Brique | Choix | Pourquoi |
|---|---|---|
| Pages | HTML + JavaScript sans compilation (`web/`) | Hébergement statique, rien à installer |
| Base, comptes staff, photos, temps réel | [Supabase](https://supabase.com), région **UE (Paris, eu-west-3)** | Connexion staff par identifiant et mot de passe (ou lien par e-mail), règles d'accès en base, abonnement aux changements |
| E-mails | [Brevo](https://www.brevo.com) (France) | Plan gratuit de 300 e-mails/jour, serveurs dans l'UE |
| Rappels | `pg_cron` dans Supabase | Un appel par jour à la fonction `reminders` |

Les données personnelles (prénom, contact) ne sont lisibles que par le staff. Le public passe par des vues et des fonctions qui n'exposent ni e-mail ni téléphone.

```
supabase/
  migrations/20261008000001_schema.sql   tables, règles d'accès, fonctions d'inscription
  functions/notify      confirmation + « place libérée »
  functions/reminders   rappels veille / jour J (pg_cron)
  functions/announce    annonce aux anciens participants (staff)
  cron.sql              planification des rappels
web/
  index.html   page publique (concours, inscription, tableau, résultats, saison)
  gerer.html   lien reçu par e-mail : annuler, supprimer ses données, se désabonner
  staff.html   espace staff (connexion par lien magique)
  bar.html     mode bar plein écran pour la télévision
  comptoir.html  écran comptoir du staff : inscription sur place + suivi des scores
  suivi.html     écran de suivi pour une télé : équipes et matchs en direct, affichage seul
```

## Mise en route (environ 45 minutes)

### 1. Supabase
1. Créez un projet sur supabase.com en choisissant la région **West EU (Paris)**.
2. Dans **SQL Editor**, collez et exécutez `supabase/migrations/20261008000001_schema.sql`.
3. Créez le compte staff partagé (identifiant **staff**) :
   - **Authentication > Users > Add user > Create new user** : e-mail `staff@flechettes-lattes.fr`, mot de passe `Triple20-Lattes`, cochez **Auto Confirm User**.
   - Puis, dans **SQL Editor** :
     ```sql
     insert into staff (email, name) values ('staff@flechettes-lattes.fr', 'Staff du bar');
     ```
   - Au bar, on se connecte avec l'identifiant `staff` et le mot de passe `Triple20-Lattes`.
   - Vous pouvez créer d'autres identifiants de la même façon (`lea@flechettes-lattes.fr` → identifiant `lea`). Si vous changez le domaine, mettez à jour `STAFF_LOGIN_DOMAIN` dans `web/config.js`.
   - Changez le mot de passe quand une personne quitte l'équipe (**Authentication > Users**, menu du compte).
   - Dans **Authentication > Providers > Email**, désactivez **Allow new users to sign up** : seuls les comptes que vous créez peuvent se connecter.
4. **Authentication > URL Configuration** : mettez l'adresse du site dans *Site URL* et ajoutez `https://votre-site/staff.html` aux *Redirect URLs*.

### 2. E-mails (Brevo)
1. Créez un compte Brevo, validez l'adresse d'expédition (ex. `concours@votre-domaine.fr`) et créez une clé API.
2. Installez la [CLI Supabase](https://supabase.com/docs/guides/cli), puis :
   ```bash
   supabase link --project-ref VOTRE_REF
   supabase secrets set BREVO_API_KEY=... MAIL_FROM=concours@votre-domaine.fr SITE_URL=https://votre-site CRON_SECRET=$(openssl rand -hex 24)
   supabase functions deploy notify
   supabase functions deploy announce
   supabase functions deploy reminders --no-verify-jwt
   ```
3. Dans **SQL Editor**, exécutez `supabase/cron.sql` après y avoir remplacé `<PROJECT_REF>` et `<CRON_SECRET>`.

Les e-mails de connexion du staff partent par Supabase. Pour plus de fiabilité, branchez aussi le SMTP de Brevo dans **Authentication > SMTP Settings**.

### 3. Site
1. Renseignez `web/config.js` : URL du projet et clé `anon` (Settings > API), adresse publique du site.
2. Déposez le dossier `web/` sur un hébergement statique en HTTPS (OVHcloud, Scaleway, o2switch, Netlify…). Le site ne stocke aucune donnée : tout est dans Supabase.
3. Ouvrez `https://votre-site/staff.html`, connectez-vous avec l'identifiant `staff` et créez le premier concours.

### 4. Logo (facultatif)
Déposez le logo officiel du magasin sous le nom `web/logo.png`. Il s'affiche en tête de la page publique, de l'espace staff et du mode bar. Sans ce fichier, les pages s'affichent sans logo. Faites valider son usage par le franchiseur, comme le prévoit le cahier des charges.

### 5. Au bar
- **Télévision** : ouvrez `bar.html` en plein écran. Elle se met à jour toute seule.
- **Écran de suivi** (2e écran du bar) : ouvrez `suivi.html` en plein écran, sans compte. À gauche, les équipes et leur statut (présente, sur la machine 1 ou 2, prochain match, éliminée, podium) ; au centre, les deux machines avec le temps écoulé, la suite et les derniers résultats ; à droite, les poules ou le tableau. Il se met à jour tout seul.
- **Écran comptoir** (écran tactile ou tablette près des machines) : ouvrez `comptoir.html` et connectez-vous avec un compte staff. À gauche, l'inscription sur place (équipe pointée d'office) ; à droite, le pointage puis, après le tirage, les deux machines avec la saisie du gagnant en deux touches. L'écran suit automatiquement le concours en cours et ne se met pas en veille.
- **Tablette du staff** : ouvrez `staff.html` puis « Ajouter à l'écran d'accueil ».
- **Instagram** : lien du site dans la bio, sticker lien dans les stories. Le QR code se télécharge dans l'onglet Communication.

## Identité visuelle
La palette et la typographie reprennent l'esprit des affiches du bar : fond brun-noir, jaune, bleu-vert, orange et crème, titres en capitales grasses (Open Sans 800), illustration de cible à plat. Le thème est volontairement sombre, lisible sur la télévision du bar comme sur téléphone.

## Jeux DARTSLIVE 2
Les règles affichées aux joueurs sont résumées d'après le guide DARTSLIVE 2 (v3.0) : 301/501/701, Standard Cricket, Select-a-Cricket, Medley 3 manches, jeux de fête pour la consolante, Count-Up et Big Bull pour le record. Deux jeux sont volontairement écartés :
- **Yum Yum**, qui attribue des « points boisson » (contraire à la règle de ne pas lier la victoire à une consommation) ;
- **Cut Throat**, qui demande au moins trois camps alors que les matchs opposent deux équipes.

## Règles métier codées
- **Horaires** : un concours ne peut pas être créé un dimanche, un jour de fermeture ou hors des heures d'ouverture. La base le refuse.
- **Fin estimée** : nombre de matchs × (durée moyenne du jeu + changement d'équipe). Les durées se règlent dans l'onglet Réglages. Le tirage est bloqué si la fin estimée dépasse la fermeture, et l'application indique le nombre maximal d'équipes pour le créneau.
- **Happy hour** (17h–19h) : un concours qui la chevauche déclenche une alerte, comme les autres animations saisies.
- **Deux machines** (nombre réglable dans Réglages) : un match par machine, jamais la même équipe sur les deux à la fois. Après chaque victoire, le match suivant jouable est lancé sur la machine libérée. L'estimation de fin répartit les matchs sur les machines, la finale se jouant seule à la fin.
- **Consolante** : les perdants du premier tour du tableau principal, sur un jeu de fête.
- **Barème de saison** (modifiable) : participation 1, victoire 1, 3e 3, 2e 5, 1re 8, record de la semaine 2. En cas d'égalité, le nombre de victoires départage.

## RGPD et alcool
- Données collectées : prénom ou pseudo, niveau, un moyen de contact. Le consentement aux rappels et le consentement aux annonces sont deux cases distinctes.
- Le lien reçu par e-mail permet d'annuler, de supprimer ses données (effacement immédiat) et de se désabonner des annonces.
- La confirmation de majorité est obligatoire. La mention sanitaire figure sur chaque page, chaque e-mail et chaque légende. Les points ne sont jamais liés à une consommation.
- Une photo du podium n'est publiée qu'après avoir coché l'accord des personnes.

## Ce qui a été testé
- Le schéma SQL a été appliqué sur PostgreSQL 16. Testés en rôle public et en rôle staff : contrôle des horaires, inscriptions, liste d'attente, désinscription avec promotion, effacement, association des solos, refus des actions staff pour le public, classements de saison.
- Le moteur de tournoi a été simulé de bout en bout de 2 à 32 équipes dans les deux formats, avec des annulations de résultats aléatoires. Tous les concours se terminent avec un podium complet, et le nombre de matchs correspond à l'estimation.
- Les pages et les fonctions d'e-mail n'ont pas encore tourné sur un vrai projet Supabase et un vrai compte Brevo. Faites un concours d'essai avant la première vraie date.
