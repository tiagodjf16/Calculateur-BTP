// Assemblage : menu, démarrage du son, écran de jeu, boucle principale.
import { Moteur } from './audio/moteur.js';
import { Bibliotheque } from './audio/bibliotheque.js';
import { Cabine } from './cabine.js';
import { Pc } from './pc.js';
import { Lumieres } from './lumieres.js';
import { Salle, LIEUX, VUES } from './salle.js';
import { Carriere, Libre, ecoute } from './carriere.js';
import { $, $$, echapper } from './outils.js';
import { annoncer, dialogue, dialogueOuvert } from './interface.js';

const AIDE = `
<h2>Comment ça marche</h2>
<div class="cols">
<div>
<h3>Enchaîner deux morceaux</h3>
<ul>
<li><b>Ordinateur</b> : chargez un morceau sur la platine A ou B. Un BPM en vert (tempo et ton compatibles) ou en jaune (tempo compatible) se mélange bien avec le morceau en cours.</li>
<li><b>▶ / ❚❚</b> lance ou arrête la platine. <b>CUE</b> revient au point de départ ; à l'arrêt, il joue tant qu'on le tient.</li>
<li><b>SYNC</b> cale le tempo sur l'autre platine et fait partir le morceau pile sur le temps. Sans SYNC, réglez le <b>curseur de tempo</b> jusqu'à lire le même BPM, lancez sur un temps fort, puis rattrapez à la <b>molette</b> (bord : calage) ou aux boutons <b>− / +</b>.</li>
<li>Faites entrer le nouveau morceau avec son <b>curseur de voie</b> ou le <b>crossfader</b>. Pendant le mélange, coupez les <b>BAS</b> d'un des deux morceaux, puis échangez.</li>
<li>La forme d'onde montre les parties du morceau (Intro, Couplet, Pause, Refrain, Fin). Un enchaînement se prépare pendant la fin de l'un et l'intro de l'autre.</li>
</ul>
<h3>Pré-écoute au casque</h3>
<ul>
<li><b>CUE</b> (table de mixage) envoie une voie dans le casque sans que le public l'entende.</li>
<li><b>Salle / Casque / Partagé</b> choisit ce que <em>vous</em> entendez : la salle, le casque (bouton CUE ◂▸ SALLE pour doser), ou une oreille chacun.</li>
</ul>
<h3>Platine</h3>
<ul>
<li><b>Repères 1 à 8</b> : un appui pose le repère, les suivants y sautent. « Effacer » puis un repère le retire.</li>
<li><b>Boucle</b> ½ à 16 temps ; un second appui en sort.</li>
<li><b>Molette</b> : main sur le dessus en mode Vinyle = scratch ; sur le bord = calage.</li>
<li><b>FILTRE</b> : à gauche il étouffe les aigus, à droite il coupe les graves.</li>
<li><b>EFFET</b> : écho, réverbération ou flanger, calés sur le tempo (¼ à 1 temps).</li>
</ul>
</div>
<div>
<h3>Lumières, fumée, effets</h3>
<ul>
<li>Onglet <b>Lumières</b> : scènes, couleurs, rythme, stroboscope, laser, boule à facettes, lumière noire.</li>
<li>Scènes calmes (Ambiance, Slow) pour l'accueil et les slows ; scènes vives (Pulsation, Poursuite, Balayage, Ciseaux) quand la piste est lancée.</li>
<li>La <b>fumée</b> rend les faisceaux visibles. Trop de fumée, et plus personne n'y voit rien.</li>
<li><b>CO₂, confettis, étincelles</b> : au bon moment seulement — les munitions sont comptées.</li>
<li>Bouton <b>Vue</b> : la salle vue de la cabine, de la piste, ou de haut.</li>
</ul>
<h3>Ce que le public attend</h3>
<ul>
<li>Jamais de <b>blanc</b> (silence) : c'est la faute la plus grave.</li>
<li>Les bons <b>styles</b> et la bonne <b>énergie</b> pour le moment de la soirée (indiqués en haut de l'écran).</li>
<li>Des enchaînements <b>calés</b>, pas de sortie <b>dans le rouge</b>, pas deux fois le même morceau.</li>
<li>Répondre aux <b>demandes</b> affichées à gauche avant la fin du délai.</li>
</ul>
<h3>Clavier</h3>
<p>Platine A : <kbd>A</kbd> CUE, <kbd>Z</kbd> lecture, <kbd>E</kbd> SYNC — Platine B : <kbd>K</kbd> CUE, <kbd>L</kbd> lecture, <kbd>M</kbd> SYNC.<br><kbd>←</kbd> <kbd>→</kbd> crossfader — <kbd>1</kbd> à <kbd>4</kbd> repères A — <kbd>7</kbd> <kbd>8</kbd> <kbd>9</kbd> <kbd>0</kbd> repères B.<br>Double-clic sur un bouton rotatif ou un curseur : retour au centre.</p>
<h3>Votre musique</h3>
<p>« Importer mes fichiers… » (onglet Ordinateur) ajoute vos MP3, WAV, OGG, FLAC ou M4A : le tempo est détecté tout seul. Les fichiers restent sur votre appareil. Les adresses YouTube ne peuvent pas être lues : YouTube ne laisse aucun site extérieur accéder au son de ses vidéos.</p>
</div>
</div>`;

const DESCRIPTIONS = { chambre: 'Votre matériel de débutant, sans public. Idéal pour s\'entraîner.', fetes: 'Soixante invités, des ballons, une piste en parquet.', mariage: 'Cent dix invités sous les voilages du domaine.',
  bar: 'Petit, sombre, plein à craquer.', club: 'Trois cents personnes, le matériel de club, tous les effets.', entreprise: 'Cent cinquante personnes en tenue de gala.', festival: 'La grande scène, de nuit, devant la foule.' };

const moteur = new Moteur();
let salle;
try { salle = new Salle($('#scene')); } catch (err) { salle = { installer() {}, maj() {}, rendre() {}, redimensionner() {}, tir() {}, acclamer() {}, vue() {}, vueNom: 'cabine', dansants: 0, absente: true }; }

const jeu = {
  moteur, salle, biblio: null, cabine: null, pc: null, lumieres: null, session: null, actif: false, etat: { ambiance: 0, energie: 0, phase: 0, musique: false }, refId: null,

  /** Fait clignoter un onglet pour attirer l'œil (une demande vient d'arriver). */
  alerte(nom) { const b = $('#onglets [data-vue="' + nom + '"]'); if (b && !b.classList.contains('actif')) b.classList.add('alerte'); },
  arreterMusique() { if (!moteur.pret) return; for (const p of moteur.platines) p.pause(); moteur.reglerMicro(false); $('#b-micro').classList.remove('actif'); },
  versMenu() { this.actif = false; this.session = null; $('#jeu').hidden = true; $('#menu').hidden = false; },
  menuPrincipal() { menuPrincipal(); },

  /** Installe le lieu et le matériel d'une séance (soirée de carrière ou mix libre), puis l'affiche. */
  ouvrir(session) {
    const inst = session.inst, c = this.cabine;
    this.session = session;
    $('#menu').hidden = true; $('#jeu').hidden = false;
    c.vider(); c.remettreAPlat(); c.cmd.maitre.regler(0.8, true);
    c.equiper({ modele: inst.cabine.modele, ecrans: inst.cabine.ecrans });
    for (const p of moteur.platines) { p.pas = inst.cabine.pasTempo || 0; p.reglerVinyle(true); p.quantifier = true; }
    moteur.fuite = (1 - inst.casque.isolation) * 0.55;
    moteur.voies.forEach((v, i) => moteur.reglerVoie(i, 'cue', false));
    moteur.reglerCasque('salle'); moteur.reglerEffet({ actif: false }); moteur.reglerMicro(false);
    this.lumieres.installer(inst);
    salle.installer(session.lieu, inst, session.nbScene, session.extras);
    for (const m of this.biblio.morceaux) { m.demande = false; m.joue = 0; }
    this.pc.genre = ''; this.pc.etat('Cliquez sur A ou B pour charger un morceau sur une platine.'); this.pc.public(''); this.pc.rendre();
    $('#b-micro').hidden = !inst.micro; $('#b-ambiance').hidden = !session.nbScene;
    $('#annonces').innerHTML = ''; $('#demandes').innerHTML = ''; $('#b-info').textContent = '';
    for (const b of $$('#onglets .alerte')) b.classList.remove('alerte');
    session.demarrer();
    this.etat = { ambiance: session.ambiance || 0, energie: 0, phase: 0, musique: false };
    this.actif = true;
    vue(petit.matches ? 'platines' : 'salle');
    taille();
  },
};
const carriere = new Carriere(jeu);

/** Démarre le son (il faut un clic) et construit la cabine, l'ordinateur et le pupitre à la première utilisation. */
async function preparer() {
  await moteur.demarrer();
  if (jeu.biblio) return;
  jeu.biblio = new Bibliotheque(moteur);
  jeu.cabine = new Cabine($('#cabine'), moteur, {});
  jeu.lumieres = new Lumieres($('#pupitre'), moteur);
  jeu.lumieres.surTir = (nom) => { salle.tir(nom); if (jeu.session) jeu.session.effet(nom); };
  jeu.pc = new Pc($('#pc'), jeu.biblio, moteur, jeu.cabine);
  $('#aide').innerHTML = AIDE;
}

// Petit écran (téléphone tenu à l'horizontale) : les platines occupent tout l'écran, la salle a son propre onglet.
const petit = matchMedia('(max-height: 520px)');

function vue(nom) {
  if (nom === 'platines' && !petit.matches) nom = 'salle';
  jeu.vue = nom;
  $('#jeu').dataset.vue = nom;
  for (const b of $$('#onglets [data-vue]')) { b.classList.toggle('actif', b.dataset.vue === nom); if (b.dataset.vue === nom) b.classList.remove('alerte'); }
  $('#pc').hidden = nom !== 'pc'; $('#pupitre').hidden = nom !== 'pupitre'; $('#aide').hidden = nom !== 'aide';
  if (nom === 'pc' && jeu.pc) jeu.pc.rendre();
}

function taille() {
  const bandeau = $('#bandeau').offsetHeight;
  const h = !jeu.actif ? innerHeight : petit.matches ? innerHeight - bandeau : Math.max(120, $('#cabine').getBoundingClientRect().top - bandeau);
  salle.redimensionner(innerWidth, Math.round(h));
}
function ecran() {
  for (const b of $$('#onglets [data-court]')) { if (!b.dataset.long) b.dataset.long = b.textContent; b.textContent = petit.matches ? b.dataset.court : b.dataset.long; }
  if (jeu.actif) vue(petit.matches ? (jeu.vue === 'salle' ? 'platines' : jeu.vue) : jeu.vue === 'platines' ? 'salle' : jeu.vue);
  taille();
}
addEventListener('resize', taille);
petit.addEventListener('change', ecran);

// ------------------------------------------------------------------ bandeau
$('#onglets').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.vue) vue(b.dataset.vue);
  else if (b.id === 'b-vue') { const k = (VUES.findIndex((v) => v[0] === salle.vueNom) + (jeu.vue === 'salle' ? 1 : 0)) % VUES.length; salle.vue(VUES[k][0]); annoncer(VUES[k][1], '', 2); vue('salle'); }
  else if (b.id === 'b-quitter') {
    const s = jeu.session;
    if (!s || !(await s.quitter())) return;
    jeu.arreterMusique();
    if (s.libre) menuPrincipal(); else carriere.afficher('soirees');
  }
});
{
  const mic = $('#b-micro'), parler = (actif) => { if (!moteur.pret) return; moteur.reglerMicro(actif); mic.classList.toggle('actif', actif); if (jeu.session) jeu.session.micro(actif); };
  mic.addEventListener('pointerdown', (e) => { e.preventDefault(); try { mic.setPointerCapture(e.pointerId); } catch (err) { /* sans importance */ } parler(true); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) mic.addEventListener(t, () => parler(false));
}

// ------------------------------------------------------------------ menus
function menuPrincipal() {
  jeu.versMenu();
  const el = $('#menu'), c = carriere.existe;
  el.innerHTML = '<div class="carte"><h1>Plat<span>i</span>nes</h1>'
    + '<p class="sous">Devenez DJ : de votre chambre à la grande scène d\'un festival. Deux platines et une table de mixage qui fonctionnent vraiment, des jeux de lumière, de la fumée — et un public à faire danser.</p>'
    + '<div class="choix">' + (c ? '<button type="button" class="grand" data-a="continuer">Continuer la carrière de ' + echapper(carriere.e.nom) + '</button>' : '')
    + '<button type="button" class="grand' + (c ? ' second' : '') + '" data-a="nouvelle">Nouvelle carrière</button><button type="button" class="grand second" data-a="libre">Mix libre</button></div>'
    + '<p class="notes">Musique : 24 morceaux fabriqués pour le jeu, dans douze styles, et vos propres fichiers audio (MP3, WAV, FLAC…) depuis l\'onglet Ordinateur. Les adresses YouTube ne peuvent pas être lues : YouTube ne laisse aucun site extérieur accéder au son de ses vidéos.<br>'
    + 'Le matériel porte les noms de vrais modèles du commerce, classés en entrée, milieu et haut de gamme ; ces marques appartiennent à leurs propriétaires, qui n\'ont aucun lien avec ce jeu.<br>'
    + 'Pour bien entendre les graves : un casque ou de vraies enceintes.' + (salle.absente ? '<br><b>La vue en 3D de la salle n\'est pas disponible sur cet appareil ; les platines fonctionnent quand même.</b>' : '') + '</p><p id="etat-menu" class="notes"></p></div>';
  el.onclick = async (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    try { await preparer(); } catch (err) { $('#etat-menu').textContent = 'Le son n\'a pas pu démarrer sur cet appareil : ' + (err.message || err); return; }
    const a = b.dataset.a;
    if (a === 'continuer') carriere.afficher('soirees');
    else if (a === 'libre') menuLibre();
    else if (a === 'nouvelle') {
      const ok = await dialogue({ titre: 'Nouvelle carrière', corps: (c ? '<p>La carrière en cours (' + echapper(carriere.e.nom) + ') sera effacée.</p>' : '') + '<p>Votre nom de scène :</p><p><input id="nom-dj" type="text" maxlength="22" value="DJ Nova" autocomplete="off"></p>', boutons: [['Annuler', false], ['Commencer', true]] });
      if (!ok) return;
      carriere.nouvelle(($('#nom-dj').value || '').trim().slice(0, 22));
      carriere.afficher('soirees');
    }
  };
}

function menuLibre() {
  const el = $('#menu');
  el.innerHTML = '<div class="carte"><div class="entete-carriere"><h2>Mix libre</h2><span class="stat">Choisissez un lieu. Tout le matériel haut de gamme est fourni, sans notation.</span><button type="button" class="bouton" data-a="menu" style="margin-left:auto">Retour</button></div><div class="liste">'
    + Object.entries(LIEUX).map(([id, L]) => '<div class="fiche"><h3>' + echapper(L.nom) + '</h3><p>' + DESCRIPTIONS[id] + '</p><button type="button" data-lieu="' + id + '">Jouer ici</button></div>').join('') + '</div></div>';
  el.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.a === 'menu') menuPrincipal();
    else if (b.dataset.lieu) jeu.ouvrir(new Libre(jeu, b.dataset.lieu));
  };
}

// ------------------------------------------------------------------ boucle principale
let dernier = performance.now();
function boucle(t) {
  requestAnimationFrame(boucle);
  const dt = Math.min(0.1, Math.max(0, (t - dernier) / 1000));
  dernier = t;
  if (!jeu.actif || !jeu.session) return;
  jeu.cabine.dessiner();
  const lum = jeu.lumieres.maj(dt);
  if (!dialogueOuvert()) { const e = jeu.session.maj(dt); if (e) jeu.etat = e; }
  if (!jeu.actif) return;                                       // la séance vient de se terminer
  salle.maj(dt, { lum, ...jeu.etat });
  if (!petit.matches || jeu.vue === 'salle' || jeu.vue === 'pupitre') salle.rendre();          // sur téléphone, la salle n'est dessinée que lorsqu'on la voit
  $('#haut').classList.toggle('avec-demandes', $('#demandes').childElementCount > 0);
  // la liste de l'ordinateur suit le morceau que le public entend (couleurs de compatibilité)
  const E = ecoute(moteur), id = E.mo ? E.mo.id : null;
  if (id !== jeu.refId) { jeu.refId = id; if (!$('#pc').hidden) jeu.pc.rendre(); }
}
requestAnimationFrame(boucle);

ecran();
menuPrincipal();
window.__dj = { jeu, moteur, salle, carriere, vue };
