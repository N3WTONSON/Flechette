// Règles résumées d'après le guide DARTSLIVE 2 (v3.0)
import { esc } from './util.js';
const RULES_01='Partez du score indiqué et descendez exactement à zéro. Si une volée vous fait passer sous zéro (« bust »), elle est annulée et le score revient à celui d’avant.';
export const GAME_INFO={
 '301':{cat:'01',txt:RULES_01},'501':{cat:'01',txt:RULES_01},'701':{cat:'01',txt:RULES_01},
 'Standard Cricket':{cat:'cricket',txt:'On joue les numéros 20 à 15 et le Bull. Trois marques sur un numéro l’ouvrent (simple = 1, double = 2, triple = 3) ; ensuite il rapporte des points tant que l’adversaire ne l’a pas fermé à son tour. Meilleur score à la fin.'},
 'Select-a-Cricket':{cat:'cricket',txt:'Un cricket sur 7 numéros choisis par les joueurs. Pour débuter, choisissez des numéros voisins sur la cible.'},
 'Medley 3 manches':{cat:'match',txt:'Le vrai match : 501, puis Standard Cricket, et une 3e manche en cas d’égalité. Le « cork » (une fléchette au plus près du centre) désigne qui commence ; le perdant d’une manche commence la suivante.'},
 'Lucky Balloon':{cat:'fete',txt:'Le ballon gonfle avec les points marqués : celui qui le fait éclater perd. On choisit de lancer 1, 2 ou 3 fléchettes, sauf quand « UnLucky » s’affiche. Idéal tous niveaux.'},
 'Castle Bomber':{cat:'fete',txt:'Touchez les numéros des murs adverses pour les abattre, puis visez soldats et roi. Le Bull fait tomber tous les murs fissurés, les vôtres compris.'},
 'Survivor':{cat:'fete',txt:'Chacun démarre avec 300 points de vie. Toucher les numéros adverses leur en retire, toucher les vôtres vous soigne. Le Bull blesse tout le monde.'},
 'Sevens Heaven':{cat:'fete',txt:'Une machine à sous : faites apparaître un 7 au compteur pour encaisser les points, le jackpot va à qui affiche 777.'},
 'Under the Hat':{cat:'fete',txt:'Faites plus que le joueur précédent pour empiler votre chapeau, sinon vous perdez une vie.'},
 'Count-Up':{cat:'entrainement',txt:'On additionne tous les points sur 8 tours. Viser le Bull est la base ; pour débuter, visez d’abord 400.'},
 'Big Bull':{cat:'entrainement',txt:'Comme Count-Up, mais tout ce qui est à l’intérieur de l’anneau triple compte comme le Bull.'}
};
const CAT_COLOR={'01':'#d9532b',cricket:'#2e7a72',match:'#fbba00',fete:'#d9532b',entrainement:'#2e7a72'};
export function gameCard(g){var i=GAME_INFO[g];if(!i)return '';var col=CAT_COLOR[i.cat];
  return '<div class="game"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="'+col+'"/><circle cx="20" cy="20" r="11" fill="#1d1d1b"/><circle cx="20" cy="20" r="4" fill="#ffffff"/></svg><div><b>'+esc(g)+'</b><p>'+esc(i.txt)+'</p></div></div>'}
export function gamesPanel(c){var gs=[c.game,c.final_game];if(c.format==='elim')gs.push(c.conso_game);gs=gs.filter(function(g,i){return gs.indexOf(g)===i});
  return '<section class="panel" style="margin-top:18px"><h2>Les jeux de ce concours</h2><div class="games">'+gs.map(gameCard).join('')+'</div><p class="muted small">Sur la DARTSLIVE 2 : simple = valeur du numéro, double = ×2, triple = ×3. Le Bull vaut 50 points (25 pour l’anneau extérieur dans certains jeux).</p></section>'}
