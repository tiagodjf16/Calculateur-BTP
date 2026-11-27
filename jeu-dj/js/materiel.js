// Catalogue du matériel : vrais modèles du commerce, classés en trois gammes. Les prix sont indicatifs (ordre de grandeur
// du neuf en France) et servent à l'économie du jeu. Les noms de marques appartiennent à leurs propriétaires ; le jeu
// n'en reproduit ni les logos ni les dessins.

export const GAMMES = ['', 'Entrée de gamme', 'Milieu de gamme', 'Haut de gamme'];
export const CATEGORIES = [
  ['platines', 'Platines et table de mixage'], ['casque', 'Casque'], ['sono', 'Sonorisation'], ['lumieres', 'Jeux de lumière'],
  ['pupitre', 'Commande des lumières'], ['fumee', 'Machine à fumée ou à brouillard'], ['effets', 'Effets spéciaux'], ['micro', 'Micro'],
];

const m = (id, cat, gamme, nom, prix, desc, eff) => ({ id, cat, gamme, nom, prix, desc, eff });
export const MATERIEL = [
  // ---- platines : la précision du curseur de tempo et le confort grandissent avec la gamme
  m('flx4', 'platines', 1, 'Pioneer DJ DDJ-FLX4', 299, 'Contrôleur 2 voies pour débuter. Sans écran : les formes d\'onde s\'affichent sur l\'ordinateur. Curseur de tempo court, peu précis.', { modele: ['DDJ-FLX4 · contrôleur', 'DDJ-FLX4 · section mixage'], ecrans: 'ordinateur', pasTempo: 0.004, prestige: 0 }),
  m('mixtrack', 'platines', 1, 'Numark Mixtrack Platinum FX', 249, 'Contrôleur 4 voies d\'initiation, petits afficheurs dans les molettes. Curseur de tempo court.', { modele: ['Mixtrack Platinum FX', 'Mixtrack · section mixage'], ecrans: 'ordinateur', pasTempo: 0.004, prestige: 0 }),
  m('rx3', 'platines', 2, 'Pioneer DJ XDJ-RX3', 2099, 'Tout-en-un autonome à écran tactile : la même logique que le matériel de club. Curseur de tempo long.', { modele: ['XDJ-RX3 · lecteur', 'XDJ-RX3 · table'], ecrans: 'integres', pasTempo: 0.001, prestige: 1 }),
  m('prime4', 'platines', 2, 'Denon DJ Prime 4+', 2199, 'Tout-en-un 4 voies autonome, grand écran, diffusion en ligne intégrée. Curseur de tempo long.', { modele: ['Prime 4+ · lecteur', 'Prime 4+ · table'], ecrans: 'integres', pasTempo: 0.001, prestige: 1 }),
  m('cdj3000', 'platines', 3, '2 × Pioneer DJ CDJ-3000 + DJM-A9', 8400, 'Le standard des cabines de club du monde entier. Curseur de tempo au centième, grandes molettes.', { modele: ['CDJ-3000', 'DJM-A9'], ecrans: 'integres', pasTempo: 0.0002, prestige: 3 }),
  m('sl1210', 'platines', 3, '2 × Technics SL-1210MK7 + Rane Seventy-Two MKII', 4300, 'Platines vinyles à entraînement direct et table de scratch, pilotées en vinyle numérique. Pour les puristes.', { modele: ['SL-1210MK7', 'Seventy-Two MKII'], ecrans: 'ordinateur', pasTempo: 0.0002, prestige: 3, vinyle: true }),
  // ---- casques : meilleure isolation, calage plus sûr
  m('cue1', 'casque', 1, 'Pioneer DJ HDJ-CUE1', 69, 'Casque d\'initiation. Isole peu : difficile d\'entendre la pré-écoute quand la sono est forte.', { isolation: 0.5 }),
  m('hd25', 'casque', 2, 'Sennheiser HD 25', 149, 'Le casque de DJ le plus répandu : léger, solide, très isolant.', { isolation: 0.8 }),
  m('x10', 'casque', 3, 'Pioneer DJ HDJ-X10', 349, 'Casque de club haut de gamme, large bande passante, grande isolation.', { isolation: 1 }),
  // ---- sonorisation : puissance = public que l'on peut sonoriser correctement ; qualité = tolérance et clarté
  m('ts408', 'sono', 1, '2 × Alto TS408', 420, 'Deux petites enceintes amplifiées 8 pouces. Suffisant pour un salon ou une petite salle, peu de graves.', { puissance: 50, qualite: 0.7 }),
  m('b112d', 'sono', 1, '2 × Behringer Eurolive B112D', 480, 'Deux enceintes amplifiées 12 pouces bon marché. Du volume, mais ça sature vite.', { puissance: 80, qualite: 0.65 }),
  m('art912', 'sono', 2, '2 × RCF ART 912-A + caisson SUB 8003-AS II', 2500, 'Système actif avec caisson de basses : son net et puissant pour une salle des fêtes ou un mariage.', { puissance: 220, qualite: 0.88 }),
  m('dxr12', 'sono', 2, '2 × Yamaha DXR12mkII + caisson DXS15mkII', 2700, 'Système actif réputé pour sa fiabilité et sa clarté, avec caisson de basses.', { puissance: 220, qualite: 0.9 }),
  m('prx900', 'sono', 3, '2 × JBL PRX915 + 2 × JBL PRX918XLF', 5600, 'Deux têtes 15 pouces et deux caissons 18 pouces : de quoi sonoriser 400 personnes sans forcer.', { puissance: 450, qualite: 1 }),
  m('hdl6', 'sono', 3, 'RCF HDL 6-A (8 éléments) + 2 × SUB 8006-AS', 12500, 'Petit système en ligne de tournée : portée et homogénéité d\'une vraie scène.', { puissance: 900, qualite: 1 }),
  // ---- lumières : projecteurs fournis par chaque ensemble
  m('kls180', 'lumieres', 1, 'Eurolite LED KLS-180', 250, 'Barre de quatre projecteurs PAR à LED sur pied. De la couleur, pas de mouvement.', { pars: 4, lyres: 0, derbys: 0, laser: 0, strobo: 0, aveuglants: 0 }),
  m('gigbar', 'lumieres', 1, 'Chauvet DJ GigBAR 2', 480, 'Barre tout-en-un : deux PAR, deux effets rotatifs, un laser et un stroboscope.', { pars: 2, lyres: 0, derbys: 2, laser: 1, strobo: 1, aveuglants: 0 }),
  m('spot260', 'lumieres', 2, '4 × Chauvet DJ Intimidator Spot 260X + 4 × SlimPAR Pro Q + ADJ Mega Flash', 2600, 'Quatre lyres à faisceau, quatre PAR et un stroboscope : un vrai spectacle de soirée.', { pars: 4, lyres: 4, derbys: 0, laser: 0, strobo: 1, aveuglants: 0 }),
  m('focus', 'lumieres', 2, '4 × ADJ Focus Spot 4Z + 6 × ADJ Mega Par Profile + Laserworld EL-230RGB', 3400, 'Quatre lyres à zoom, six PAR et un laser couleur.', { pars: 6, lyres: 4, derbys: 0, laser: 1, strobo: 0, aveuglants: 0 }),
  m('pointe', 'lumieres', 3, '6 × Robe Pointe + 8 × Martin MAC Aura XB + 2 × Martin Atomic 3000 LED', 38000, 'Le parc d\'une scène professionnelle : faisceaux puissants, lyres à couleur, stroboscopes de concert.', { pars: 8, lyres: 6, derbys: 0, laser: 1, strobo: 2, aveuglants: 2 }),
  // ---- commande des lumières
  m('auto', 'pupitre', 1, 'Mode automatique des projecteurs', 0, 'Sans pupitre : les projecteurs suivent le son tout seuls. Vous choisissez seulement une couleur, ou le noir.', { niveau: 1 }),
  m('obey70', 'pupitre', 2, 'Chauvet DJ Obey 70', 190, 'Pupitre DMX : scènes, couleurs, vitesse, stroboscope à la main.', { niveau: 2 }),
  m('soundswitch', 'pupitre', 2, 'SoundSwitch Control One', 320, 'Pilotage des lumières calé sur le tempo des platines.', { niveau: 3 }),
  m('mq50', 'pupitre', 3, 'ChamSys MagicQ MQ50', 4600, 'Console lumière de tournée : tout, à la main ou au tempo.', { niveau: 4 }),
  m('grandma', 'pupitre', 3, 'MA Lighting grandMA3 onPC command wing', 6200, 'La référence des grandes scènes.', { niveau: 4 }),
  // ---- fumée
  m('hurricane', 'fumee', 1, 'Chauvet DJ Hurricane 700', 65, 'Petite machine à fumée : bouffées courtes, longue remise en chauffe.', { debit: 0.5, pause: 9, brouillard: false }),
  m('z1000', 'fumee', 2, 'Antari Z-1000 III', 330, 'Machine à fumée 1 000 W : bouffées généreuses, chauffe rapide.', { debit: 1, pause: 4, brouillard: false }),
  m('z350', 'fumee', 2, 'Antari Z-350 Fazer', 420, 'Brouillard fin et continu : les faisceaux se dessinent sans nuage.', { debit: 0.7, pause: 2, brouillard: true }),
  m('unique', 'fumee', 3, 'Look Solutions Unique 2.1', 1350, 'Machine à brouillard de scène : voile régulier, réglable, très discret.', { debit: 1, pause: 0, brouillard: true }),
  // ---- effets spéciaux (on peut en posséder plusieurs)
  m('boule', 'effets', 1, 'Boule à facettes 30 cm, moteur et 2 pinspots', 85, 'Indispensable pour les slows et les ouvertures de bal.', { boule: 1 }),
  m('uv', 'effets', 1, 'Eurolite LED PARty UV', 110, 'Lumière noire : le blanc et le fluo s\'allument.', { uv: 1 }),
  m('funfetti', 'effets', 2, 'Chauvet DJ Funfetti Shot', 320, 'Canon à confettis : un tir par soirée, au bon moment.', { confettis: 1 }),
  m('co2', 'effets', 2, 'MagicFX CO2 Jet', 690, 'Jet de CO₂ : colonne blanche glacée au moment du refrain.', { co2: 1 }),
  m('sparkular', 'effets', 3, '2 × Showven Sparkular', 2100, 'Fontaines d\'étincelles froides : sans flamme, parfaites pour la première danse.', { etincelles: 1 }),
  // ---- micros
  m('sm58', 'micro', 1, 'Shure SM58', 109, 'Le micro de scène le plus répandu au monde. Avec fil.', { micro: 1 }),
  m('blx', 'micro', 2, 'Shure BLX24/SM58', 380, 'SM58 sans fil : pour animer au milieu des invités.', { micro: 2 }),
  m('ewd', 'micro', 3, 'Sennheiser EW-D 835-S', 720, 'Système sans fil numérique : aucune coupure, voix très claire.', { micro: 3 }),
];

/** Matériel de départ : ce qu'on a dans sa chambre. */
export const DEPART = { possede: ['flx4', 'cue1', 'ts408', 'auto'], equipe: { platines: 'flx4', casque: 'cue1', sono: 'ts408', pupitre: 'auto' } };
/** Matériel fourni par les établissements (clubs, festivals) : le DJ n'apporte que son casque. */
export const MAISON = {
  club: { platines: 'cdj3000', sono: { nom: 'Funktion-One Evo 6 + caissons F121', puissance: 800, qualite: 1 }, lumieres: 'pointe', pupitre: 'grandma', fumee: 'unique', effets: ['co2', 'uv'], micro: 'blx' },
  bar: { sono: { nom: 'Bose RoomMatch (installation du bar)', puissance: 120, qualite: 0.85 } },
  festival: { platines: 'cdj3000', sono: { nom: 'L-Acoustics K2 + caissons KS28', puissance: 5000, qualite: 1 }, lumieres: 'pointe', pupitre: 'grandma', fumee: 'unique', effets: ['co2', 'confettis', 'etincelles', 'uv'], micro: 'ewd' },
};

export const fiche = (id) => MATERIEL.find((x) => x.id === id);

/**
 * Installation complète pour une soirée : le matériel du joueur, remplacé par celui de l'établissement quand il en fournit.
 * Renvoie { cabine, casque, sono, lumieres, pupitre, fumee, effets, micro, noms }.
 */
export function installation(joueur, maison = null) {
  const h = (maison && MAISON[maison]) || {}, eq = joueur.equipe;
  const pick = (cat) => (h[cat] ? fiche(h[cat]) : eq[cat] ? fiche(eq[cat]) : null);
  const platines = pick('platines'), casque = eq.casque ? fiche(eq.casque) : null, lum = pick('lumieres'), pup = pick('pupitre'), fum = pick('fumee'), micro = pick('micro');
  const sono = h.sono || (eq.sono ? { nom: fiche(eq.sono).nom, ...fiche(eq.sono).eff } : { nom: 'Aucune sonorisation', puissance: 0, qualite: 0.5 });
  const effets = {};
  for (const id of h.effets || joueur.possede.filter((x) => fiche(x).cat === 'effets')) Object.assign(effets, (fiche(id) || { eff: { [id]: 1 } }).eff);
  return {
    cabine: platines.eff, casque: casque ? casque.eff : { isolation: 0.3 }, sono,
    lumieres: lum ? lum.eff : { pars: 0, lyres: 0, derbys: 0, laser: 0, strobo: 0, aveuglants: 0 }, pupitre: pup ? pup.eff : { niveau: 1 },
    fumee: fum ? fum.eff : null, effets, micro: micro ? micro.eff.micro : 0,
    noms: { platines: platines.nom, casque: casque ? casque.nom : 'Sans casque', sono: sono.nom, lumieres: lum ? lum.nom : 'Aucun jeu de lumière', pupitre: pup ? pup.nom : '—', fumee: fum ? fum.nom : 'Aucune', micro: micro ? micro.nom : 'Aucun' },
    fourni: !!maison && !!MAISON[maison] && Object.keys(h),
  };
}
