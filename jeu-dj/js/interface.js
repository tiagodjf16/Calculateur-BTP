// Messages à l'écran et boîtes de dialogue.
import { $, creer, echapper } from './outils.js';

/** Bandeau bref en haut de l'écran. classe : '', 'bon', 'mauvais' ou 'parle'. */
export function annoncer(texte, classe = '', duree = 5.5) {
  const z = $('#annonces'), d = creer('div', classe);
  d.textContent = texte;
  z.appendChild(d);
  while (z.children.length > 3) z.firstChild.remove();
  setTimeout(() => d.remove(), duree * 1000);
}

/** Boîte de dialogue ; la promesse est tenue avec la valeur du bouton choisi. boutons : [[libellé, valeur, classe]]. */
export function dialogue({ qui = '', titre = '', corps = '', boutons = [['Continuer', true]] }) {
  const d = $('#dialogue');
  d.innerHTML = '<div class="boite">' + (qui ? '<div class="qui">' + echapper(qui) + '</div>' : '') + (titre ? '<h2>' + echapper(titre) + '</h2>' : '') + corps
    + '<div class="actions">' + boutons.map(([l, , c], i) => '<button type="button" class="grand ' + (c != null ? c : i === boutons.length - 1 ? '' : 'second') + '" data-i="' + i + '">' + echapper(l) + '</button>').join('') + '</div></div>';
  d.hidden = false;
  return new Promise((ok) => {
    d.onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      d.hidden = true; d.onclick = null;                       // le contenu reste lisible par l'appelant (champ de saisie)
      ok(boutons[+b.dataset.i][1]);
    };
  });
}
export const dialogueOuvert = () => !$('#dialogue').hidden;
export const paragraphes = (t) => [].concat(t).map((x) => '<p>' + x + '</p>').join('');
