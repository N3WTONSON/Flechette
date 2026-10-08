// Onglet « Mode d'emploi » de l'espace staff : explications simples, sans termes techniques.
const S = (title, body, open = false) => `<details class="panel guide"${open ? ' open' : ''}><summary><h3>${title}</h3></summary><div class="gbody">${body}</div></details>`;

export function guideHTML() {
  return `<div class="stack">
  <section class="panel"><h2>Mode d’emploi</h2>
    <p>Tout ce qu’il faut pour organiser un concours de fléchettes au bar : le créer, inscrire les équipes, faire tourner les machines et afficher les scores sur la télé. Touchez un titre pour l’ouvrir.</p>
    <div class="facts"><div class="fact"><span>Avant</span><b>Créer le concours, l’annoncer</b></div><div class="fact"><span>Jusqu’au début</span><b>Inscriptions</b></div><div class="fact"><span>Le soir même</span><b>Pointage, tirage, matchs</b></div><div class="fact"><span>À la fin</span><b>Podium, lots, photo</b></div></div>
  </section>

  ${S('1. Les trois écrans', `
    <ul>
      <li><b>Espace staff</b> (cet écran) : pour tout gérer. Il s’ouvre directement, sans identifiant ni code : sur la tablette en scannant le <b>QR code staff</b>, sur l’ordinateur avec le <b>lien staff</b> (tous deux dans l’onglet Réglages).</li>
      <li><b>Page joueurs</b> : ce que voient les clients sur leur téléphone. Ils s’y inscrivent, suivent le tableau et déclarent leurs résultats. Ils n’ont <b>aucun accès</b> à l’espace staff.</li>
      <li><b>Écran TV</b> : le tableau du tournoi en direct, à afficher sur la télé ou le projecteur. On n’y touche pas, il se met à jour tout seul.</li>
      <li><b>Écran comptoir</b> : une version simplifiée pour la tablette posée près des machines (inscription sur place, pointage, machines). Il n’affiche aucun bouton vers l’espace staff : pour en sortir, <b>restez appuyé 3 secondes sur l’heure</b> en haut à droite.</li>
    </ul>
    <p class="muted small">L’adresse de l’espace staff n’apparaît nulle part côté joueurs. Ne l’affichez pas à la vue des clients : elle ouvre tout l’espace staff.</p>`, true)}

  ${S('2. Créer un concours', `
    <ol>
      <li>Onglet <b>Concours</b>, bouton <b>+ Nouveau concours</b>.</li>
      <li>Choisissez la <b>date</b>, l’<b>heure de début</b> et l’<b>heure limite d’inscription</b> en ligne (par exemple 15 minutes avant le début).</li>
      <li><b>Équipes max</b> : le nombre de places. Au-delà, les équipes passent automatiquement en liste d’attente. Sous le formulaire, l’application indique combien d’équipes tiennent dans le créneau avant la fermeture.</li>
      <li><b>Format</b> :
        <ul><li><b>Élimination directe + consolante</b> : un match perdu, on sort ; les perdants du premier tour jouent une petite compétition « consolante » sur un jeu de fête.</li>
        <li><b>Poules puis élimination</b> : chaque équipe joue 2 ou 3 matchs dans sa poule, les 2 premiers de chaque poule vont au tableau final. Plus de matchs pour tout le monde, mais plus long.</li></ul></li>
      <li><b>Jeux</b> : le jeu des matchs (301 conseillé), celui de la finale et celui de la consolante.</li>
      <li><b>Lots</b> : écrivez le lot des 3 premiers et ajoutez des prix de consolation (gagnant de la consolante ou tirage au sort).</li>
      <li><b>Statut</b> : laissez <b>Brouillon</b> tant que ce n’est pas prêt (personne ne le voit), puis passez à <b>Inscriptions ouvertes</b> et Enregistrez.</li>
    </ol>
    <p>Le concours ne peut pas être créé un dimanche, un jour de fermeture ou en dehors des heures d’ouverture : l’application le refuse avec un message. Un avertissement apparaît aussi s’il tombe pendant l’happy hour ou une autre animation.</p>
    <p><b>Astuce :</b> <b>Dupliquer pour la semaine suivante</b> recrée le même concours 7 jours plus tard, en brouillon.</p>`)}

  ${S('3. Annoncer le concours', `
    <ul>
      <li>Onglet <b>Communication</b> : un texte prêt pour Instagram (date, lots, places restantes, mention santé). Touchez <b>Copier la légende</b> et collez-la dans votre publication ou votre story.</li>
      <li>Le <b>QR code d’inscription</b> s’y télécharge : imprimez-le pour le comptoir et les tables, ou ajoutez-le à la story.</li>
      <li>Idéalement, annoncez au moins une semaine avant, puis rappelez la veille et le jour même.</li>
    </ul>`)}

  ${S('4. Les inscriptions', `
    <p><b>Sur leur téléphone</b> (QR code ou lien Instagram) : les joueurs donnent le nom de l’équipe, leurs prénoms, leur niveau et le numéro de téléphone du capitaine. Ils voient tout de suite s’ils sont inscrits ou en liste d’attente.</p>
    <p><b>Au comptoir</b> : onglet <b>Équipes</b> (ou écran comptoir), formulaire « Inscription sur place ». Le numéro de téléphone est facultatif au comptoir.</p>
    <ul>
      <li><b>Code d’équipe</b> : chaque équipe inscrite reçoit un code à 4 chiffres, affiché sur son téléphone. Vous le voyez aussi à côté du nom de l’équipe, pour le redonner à un joueur qui l’a perdu.</li>
      <li><b>Liste d’attente</b> : quand c’est complet, les équipes suivantes attendent. Si une équipe se désinscrit, la première en attente prend sa place automatiquement et reçoit une notification sur son téléphone.</li>
      <li><b>Désinscrire</b> une équipe : bouton à côté de son nom (onglet Équipes).</li>
      <li><b>Joueurs seuls</b> : ils peuvent s’inscrire en solo. Avant le tirage, touchez <b>Associer les solos</b> : l’application les met par deux (un joueur confirmé avec un débutant quand c’est possible).</li>
      <li><b>Même équipe d’une semaine à l’autre</b> : avec le même numéro de téléphone, l’équipe garde son nom et ses points s’additionnent au classement de la saison.</li>
    </ul>`)}

  ${S('5. Le soir du concours', `
    <ol>
      <li><b>Pointage</b> (onglet <b>Jour J</b>) : touchez <b>Absente</b> pour passer l’équipe en <b>Présente</b> quand elle arrive. Seules les équipes présentes sont tirées au sort.</li>
      <li><b>Tirage au sort</b> : bouton <b>Lancer le tirage</b>, puis confirmez. Les inscriptions se ferment et le tableau apparaît partout (staff, téléphones, télé). Le bouton reste grisé si le tournoi risque de finir après la fermeture : réduisez le nombre d’équipes ou choisissez un jeu plus court.</li>
      <li><b>Les machines</b> : l’écran montre une case par machine DARTSLIVE.
        <ul><li>Une machine libre propose le prochain match : touchez <b>Lancer sur la machine 1</b> (ou 2) et lancez sur la machine le jeu indiqué. Les deux équipes sont appelées sur leur téléphone (si elles ont activé les notifications).</li>
        <li>Une même équipe n’est jamais sur les deux machines à la fois ; l’application choisit le bon ordre.</li></ul></li>
      <li><b>Fin d’un match</b> : deux façons, au choix.
        <ul><li>Les <b>joueurs déclarent</b> eux-mêmes le résultat sur leur téléphone (onglet Mon match). Vous voyez « déclaré par les joueurs » dans les derniers résultats.</li>
        <li>Ou <b>vous touchez l’équipe gagnante</b> sur la case de la machine, ajoutez le score si vous voulez (ex. 3-1), puis <b>Valider</b>.</li></ul>
        Le tableau avance tout seul et le match suivant se lance sur la machine libérée.</li>
      <li><b>Poules</b> : quand toutes les poules sont jouées, touchez <b>Générer le tableau final</b>.</li>
    </ol>
    <p><b>Chrono</b> : en haut du Jour J, le temps restant avant la fermeture et l’heure de fin estimée. En rouge, il faut accélérer (finale ou consolante sur un jeu plus court, dans l’onglet Concours).</p>
    <p><b>Erreur de résultat ?</b> Dans « Derniers résultats », touchez <b>Annuler</b> à côté du match, puis saisissez le bon gagnant. <b>Équipe pas prête ou machine en panne ?</b> Touchez <b>Remettre en attente</b> : le match repartira plus tard.</p>`)}

  ${S('6. L’écran TV (tableau des scores)', `
    <ul>
      <li>Sur la télé ou le projecteur, ouvrez l’<b>Écran TV</b> (bouton en haut de l’espace staff) et mettez-le en plein écran.</li>
      <li><b>Avant le tirage</b> : la liste des équipes inscrites, les places libres et un QR code pour s’inscrire.</li>
      <li><b>Pendant le tournoi</b> : le tableau complet, la moitié gauche et la moitié droite qui se rejoignent sur la finale au centre. Les matchs en cours sont entourés en orange avec le numéro de la machine, les gagnants en gras avec leur score. En bas : ce qui se joue sur chaque machine, les prochains matchs et les derniers résultats.</li>
      <li>Le tableau s’adapte tout seul au nombre d’équipes, et alterne toutes les 20 secondes avec la consolante (ou les poules).</li>
      <li><b>À la fin</b> : le vainqueur au centre et le podium en bas de l’écran.</li>
    </ul>`)}

  ${S('7. Fin du concours', `
    <ul>
      <li>Onglet <b>Résultats</b> : le podium et les lots.</li>
      <li><b>Prix tirés au sort</b> : touchez <b>Tirer au sort</b>, l’application choisit une équipe présente (hors podium).</li>
      <li><b>Photo du podium</b> : prenez la photo, cochez que les personnes sont d’accord, puis <b>Publier la photo</b>.</li>
      <li>Onglet <b>Communication</b> : la légende des résultats est prête à copier pour Instagram.</li>
      <li>Les points de la saison sont comptés automatiquement.</li>
    </ul>`)}

  ${S('8. Saison et record de la semaine', `
    <ul>
      <li><b>Classement de la saison</b> : participation 1 point, chaque victoire 1 point, 3e 3 points, 2e 5 points, 1re 8 points. Le barème se change dans Réglages.</li>
      <li><b>Record de la semaine</b> (onglet Saison &amp; record) : un client fait un Count-Up ou un Big Bull seul sur la machine ; notez son prénom et le score affiché (photo de l’écran facultative). Le meilleur de la semaine gagne 2 points.</li>
    </ul>`)}

  ${S('9. Questions fréquentes', `
    <dl class="faq">
      <dt>Un joueur a perdu son code d’équipe</dt><dd>Il est affiché à côté du nom de l’équipe dans Équipes ou Jour J. Donnez-le-lui.</dd>
      <dt>Un client n’a pas de téléphone</dt><dd>Inscrivez l’équipe au comptoir, sans numéro. Vous saisirez ses résultats vous-même.</dd>
      <dt>Une équipe arrive après le tirage</dt><dd>Elle ne peut plus entrer dans le tableau. Proposez-lui le record de la semaine ou le prochain concours.</dd>
      <dt>Une seule machine marche</dt><dd>Réglages, « Machines de fléchettes » : mettez 1. Les matchs passeront un par un et l’heure de fin se recalcule.</dd>
      <dt>Le tournoi va dépasser la fermeture</dt><dd>Onglet Concours : jeu plus court pour la finale ou la consolante (par exemple 301 au lieu de Medley).</dd>
      <dt>Ouvrir l’espace staff sur un nouvel appareil</dt><dd>Réglages › Accès staff : scannez le QR code (tablette, téléphone) ou ouvrez le lien (ordinateur).</dd>
      <dt>S’entraîner avant un vrai concours</dt><dd>Réglages › Concours de test : un faux concours avec 12 équipes pour tout essayer, puis « Effacer le concours de test ». La page test téléphone vérifie qu’un téléphone de joueur fonctionne.</dd>
      <dt>Les horaires du bar ont changé</dt><dd>Rien à faire : ils sont repris chaque matin de la fiche du magasin sur vandb.fr (bouton « Mettre à jour maintenant » dans Réglages).</dd>
    </dl>`)}

  ${S('10. Les règles à respecter', `
    <ul>
      <li>Concours <b>réservé aux majeurs</b> : les joueurs le confirment à l’inscription.</li>
      <li>Les points et les lots ne sont <b>jamais liés à une consommation</b>.</li>
      <li>La photo du podium n’est publiée qu’avec l’accord des personnes.</li>
      <li>La mention « L’abus d’alcool est dangereux pour la santé, à consommer avec modération » figure sur toutes les pages et dans les légendes : ne la retirez pas de vos publications.</li>
    </ul>`)}
  </div>`;
}

export const GUIDE_CSS = `
details.guide{padding:0}
details.guide summary{list-style:none;cursor:pointer;padding:16px 18px;display:flex;justify-content:space-between;align-items:center}
details.guide summary::-webkit-details-marker{display:none}
details.guide summary::after{content:'+';font:800 24px var(--body);color:var(--muted)}
details.guide[open] summary::after{content:'–'}
details.guide .gbody{padding:0 18px 16px;line-height:1.6}
details.guide li{margin:4px 0}
.faq dt{font-weight:800;margin-top:10px}.faq dd{margin:2px 0 0}
`;
