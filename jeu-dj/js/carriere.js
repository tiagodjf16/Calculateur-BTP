// Mode carrière : l'histoire, le déroulement et la notation des soirées, la boutique de matériel.
import { MATERIEL, CATEGORIES, GAMMES, DEPART, MAISON, fiche, installation } from './materiel.js';
import { LIEUX } from './salle.js';
import { $, $$, clamp, creer, euros, echapper } from './outils.js';
import { annoncer, dialogue, paragraphes } from './interface.js';

const CLE = 'platines-carriere-v1';
const H = 'House', DH = 'Deep house', T = 'Techno', DF = 'Disco / Funk', PD = 'Pop / Dance', A8 = 'Années 80', HH = 'Hip-hop / R&B', LA = 'Latino', DB = 'Drum & bass', TR = 'Trance', SL = 'Slow', RK = 'Rock';
const etoiles = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const TITRES = [[65, 'Tête d\'affiche'], [40, 'DJ résident'], [20, 'Valeur sûre'], [8, 'DJ du coin'], [0, 'Débutant']];

/** Les soirées de la carrière, dans l'ordre. */
export const SOIREES = [
  { id: 'chambre', chap: 'Chapitre 1 · La chambre', titre: 'Dans ta chambre', genre: 'Leçon de mixage', lieu: 'chambre', public: 0, duree: 0, cachet: 0, poids: 0,
    qui: 'Karim, ton meilleur ami',
    intro: ['« Alors ça y est, tu l\'as déballé, ton contrôleur ? Depuis le temps que tu m\'en parles… »',
      '« Écoute : ma petite sœur Inès fête ses 18 ans samedi à la salle des fêtes, et le DJ prévu vient de se désister. Montre-moi que tu sais enchaîner deux morceaux, et je te fais engager. »'],
    bien: ['« Franchement ? Propre. J\'appelle ma mère : samedi, 21 h 30, salle des fêtes. 180 € — ton premier cachet. Ne me fais pas honte ! »'],
    lecons: [
      ['Ouvrez l\'onglet « Ordinateur » (en haut) et chargez un morceau sur la platine A avec le bouton bleu A.', (m) => !!m.platines[0].morceau],
      ['Lancez la platine A avec ▶ / ❚❚. C\'est ce morceau que le public entend.', (m) => m.platines[0].lecture && m.presence(0) > 0.3],
      ['Chargez un autre morceau sur la platine B (bouton orange B). Dans la liste, un BPM écrit en vert ou en jaune se mélange bien avec le morceau en cours.', (m) => !!m.platines[1].morceau],
      ['Sur la table de mixage, baissez tout en bas le grand curseur de droite (voie B) : le public n\'entendra pas B pendant que vous le préparez.', (m) => m.voies[1].fader < 0.06],
      ['Appuyez sur SYNC de la platine B (son tempo se cale sur A), puis sur son bouton ▶ / ❚❚.', (m) => { const [a, b] = m.platines; if (!b.lecture || !a.morceau) return false; const r = b.bpm / a.bpm; return [0.5, 1, 2].some((k) => Math.abs(r / k - 1) < 0.012); }],
      ['Montez doucement le curseur de la voie B, puis baissez celui de la voie A jusqu\'en bas : c\'est un enchaînement.', (m) => m.presence(1) > 0.7 && m.presence(0) < 0.04],
    ] },

  { id: 'ines18', chap: 'Chapitre 2 · Premiers cachets', titre: 'Les 18 ans d\'Inès', genre: 'Anniversaire', lieu: 'fetes', public: 35, duree: 300, de: 21.5, a: 25.5, cachet: 180, poids: 1,
    qui: 'Karim',
    intro: ['« Trente-cinq invités, tous entre 17 et 20 ans. Pop, hip-hop, latino : c\'est ça qu\'ils veulent. Démarre tranquille pendant qu\'ils arrivent, et envoie le gros après le gâteau. »',
      '« Et s\'ils viennent te demander un morceau, écoute-les : c\'est leur soirée, pas la tienne. »'],
    bien: ['« Inès a dansé jusqu\'au bout, et elle a déjà donné ton nom à trois copines. Tiens, ton enveloppe : tu l\'as méritée. »'],
    moyen: ['« Bon… ça a dansé par moments. Inès est contente, mais je t\'ai connu plus inspiré dans ta chambre. »'],
    gouts: { [PD]: 1, [HH]: 1, [LA]: 0.9, [H]: 0.8, [DB]: 0.6, [DF]: 0.5, [DH]: 0.5, [T]: 0.45, [TR]: 0.45, [A8]: 0.4, [RK]: 0.35, [SL]: 0.2 },
    courbe: [[0, 2.5], [0.3, 3.5], [0.65, 4.5], [1, 4]],
    objectifs: [{ t: 0.16, type: 'genre', genre: HH, qui: 'Le cousin d\'Inès', texte: '« T\'aurais pas du hip-hop ? »' }, { t: 0.55, type: 'genre', genre: LA, qui: 'Inès', texte: '« Le gâteau est passé : mets-nous du latino ! »' }] },

  { id: 'patrick50', chap: 'Chapitre 2 · Premiers cachets', titre: 'Les 50 ans de Patrick', genre: 'Anniversaire', lieu: 'fetes', public: 60, duree: 320, de: 20.5, a: 25, cachet: 260, poids: 1,
    qui: 'Nathalie, la femme de Patrick',
    intro: ['« Bonsoir ! C\'est une copine d\'Inès qui m\'a donné votre numéro. Mon mari a 50 ans ce soir : il a grandi avec les années 80, le disco et un peu de rock. »',
      '« Les jeunes réclameront leur musique, donnez-leur-en un peu… mais ce soir, la vedette, c\'est Patrick. Et gardez-moi un slow, j\'y tiens. »'],
    bien: ['« Patrick a dansé comme à vingt ans. Mme Ferrand, la présidente du comité des fêtes, était parmi les invités : elle veut vous parler. »'],
    gouts: { [A8]: 1, [DF]: 1, [RK]: 0.85, [PD]: 0.7, [LA]: 0.65, [SL]: 0.5, [H]: 0.5, [DH]: 0.4, [HH]: 0.35, [TR]: 0.2, [T]: 0.15, [DB]: 0.1 },
    courbe: [[0, 2.5], [0.35, 3.5], [0.7, 4], [1, 3.5]],
    objectifs: [{ t: 0.15, type: 'genre', genre: RK, qui: 'Jacky, le frère de Patrick', texte: '« Un bon rock, c\'est possible ? »' }, { t: 0.45, type: 'genre', genre: SL, qui: 'Nathalie', texte: '« C\'est le moment : notre slow, s\'il vous plaît. »' },
      { t: 0.74, type: 'genre', genre: A8, qui: 'Patrick', texte: '« Remettez-moi les années 80 ! »' }] },

  { id: 'comite', chap: 'Chapitre 2 · Premiers cachets', titre: 'Le bal du comité des fêtes', genre: 'Bal populaire', lieu: 'fetes', public: 120, duree: 360, de: 21, a: 26, cachet: 380, poids: 1,
    qui: 'Mme Ferrand, présidente du comité des fêtes', exige: ['lumieres'],
    intro: ['« Jeune DJ, on m\'a dit du bien de vous. Samedi, c\'est le bal annuel : cent vingt personnes, de 7 à 77 ans. Il faut que chacun danse au moins une fois. »',
      '« Et je vous préviens : un bal sans jeux de lumière, ce n\'est pas un bal. Venez équipé. »'],
    bien: ['« Toute la salle a dansé, même mon mari — et ça, ça n\'était pas arrivé depuis 1998. Une dame vous cherche : Sonia Marchetti. Elle organise des mariages. »'],
    gouts: { [DF]: 1, [A8]: 1, [PD]: 0.9, [LA]: 0.9, [RK]: 0.8, [H]: 0.6, [SL]: 0.55, [HH]: 0.5, [DH]: 0.45, [TR]: 0.25, [T]: 0.2, [DB]: 0.1 },
    courbe: [[0, 2.5], [0.3, 3.5], [0.6, 4], [1, 4]],
    objectifs: [{ t: 0.14, type: 'genre', genre: LA, qui: 'Le club de zumba', texte: '« Du latino, s\'il vous plaît ! »' }, { t: 0.44, type: 'genre', genre: SL, qui: 'Mme Ferrand', texte: '« C\'est l\'heure du quart d\'heure américain : un slow ! »' },
      { t: 0.72, type: 'genre', genre: RK, qui: 'Le président des boulistes', texte: '« Un rock, jeune homme, qu\'on montre aux gamins ! »' }] },

  { id: 'mariage1', chap: 'Chapitre 3 · Le premier mariage', titre: 'Le mariage de Camille et Julien', genre: 'Mariage', lieu: 'mariage', public: 90, duree: 400, de: 20, a: 27, cachet: 800, poids: 2,
    qui: 'Sonia Marchetti, organisatrice de mariages', exige: ['micro1', 'sono80'], maries: true,
    intro: ['« Je vous ai vu au bal du comité : vous savez lire une salle. Mon DJ habituel me lâche pour un mariage dans trois semaines. Quatre-vingt-dix invités. »',
      '« Un mariage, c\'est du sérieux : vous annoncez l\'entrée des mariés au micro, vous lancez l\'ouverture de bal sur un slow, et ensuite la piste ne doit plus désemplir. »'],
    bien: ['« Camille a pleuré pendant le slow et dansé pieds nus jusqu\'à la fin. Je vous garde dans mon carnet. En attendant, allez voir Tony, au bar Le Phare : il cherche quelqu\'un pour ses jeudis. »'],
    gouts: { [PD]: 1, [DF]: 1, [A8]: 0.9, [LA]: 0.9, [H]: 0.7, [RK]: 0.6, [HH]: 0.6, [SL]: 0.5, [DH]: 0.5, [TR]: 0.3, [T]: 0.2, [DB]: 0.15 },
    courbe: [[0, 2], [0.3, 2.5], [0.45, 3.5], [0.75, 4.5], [1, 4]],
    objectifs: [{ t: 0.05, type: 'annonce', qui: 'Sonia', texte: 'Annoncez l\'entrée des mariés : maintenez le bouton « Micro ».', replique: '« Mesdames et messieurs, levez-vous pour accueillir les mariés : Camille et Julien ! »' },
      { t: 0.28, type: 'genre', genre: SL, qui: 'Sonia', texte: 'L\'ouverture de bal : lancez un slow pour les mariés.', poids: 9 },
      { t: 0.58, type: 'genre', genre: LA, qui: 'La tante de Camille', texte: '« Vous avez du latino ? Toute la famille vient d\'Espagne ! »' }, { t: 0.8, type: 'genre', genre: A8, qui: 'Le père de la mariée', texte: '« Un tube des années 80, pour les parents ! »' }] },

  { id: 'bar1', chap: 'Chapitre 4 · Le Phare', titre: 'Jeudi étudiant au Phare', genre: 'Bar', lieu: 'bar', maison: 'bar', public: 70, duree: 330, de: 21, a: 25, cachet: 240, poids: 1, pourboire: 18,
    qui: 'Tony, patron du bar Le Phare',
    intro: ['« Sonia m\'a parlé de toi. Mon bar, c\'est petit, ça transpire, et le jeudi c\'est plein d\'étudiants. La sono est à moi, tu amènes tes platines. »',
      '« Un conseil : ne tape pas trop fort trop tôt. S\'ils dansent dès 21 h, ils ne commandent rien. Fais monter doucement, et finis en feu. »'],
    bien: ['« Meilleur jeudi de l\'année, et la caisse est d\'accord. Je te confie le samedi. »'],
    gouts: { [H]: 1, [HH]: 1, [PD]: 0.9, [LA]: 0.8, [T]: 0.75, [DB]: 0.7, [DH]: 0.7, [DF]: 0.6, [TR]: 0.6, [RK]: 0.5, [A8]: 0.4, [SL]: 0.1 },
    courbe: [[0, 2], [0.3, 3], [0.6, 4.2], [1, 5]],
    objectifs: [{ t: 0.22, type: 'genre', genre: HH, qui: 'Une étudiante', texte: '« Tu passes du hip-hop ? C\'est mon anniversaire ! »' }, { t: 0.66, type: 'genre', genre: DB, qui: 'Un grand en sweat à capuche', texte: '« De la drum and bass ! Allez ! »' }] },

  { id: 'bar2', chap: 'Chapitre 4 · Le Phare', titre: 'Samedi soir au Phare', genre: 'Bar', lieu: 'bar', maison: 'bar', public: 90, duree: 360, de: 22, a: 26, cachet: 320, poids: 1, pourboire: 22,
    qui: 'Tony',
    intro: ['« Le samedi, c\'est plus mélangé : des habitués, des gens de passage, tous les âges. »',
      '« Et ouvre l\'œil : il paraît que quelqu\'un du Hangar vient te voir jouer. Le Hangar, tu connais ? Le club de la zone industrielle. »'],
    bien: ['« Tu vois le grand type en veste noire, au bout du comptoir ? C\'est Vortex, le résident du Hangar. Il t\'a regardé toute la soirée sans sourire. Chez lui, c\'est bon signe. »'],
    gouts: { [H]: 1, [DF]: 0.9, [PD]: 0.9, [HH]: 0.85, [LA]: 0.8, [T]: 0.7, [DH]: 0.7, [A8]: 0.6, [RK]: 0.6, [TR]: 0.5, [DB]: 0.5, [SL]: 0.1 },
    courbe: [[0, 2.5], [0.35, 3.5], [0.7, 4.5], [1, 4.5]],
    objectifs: [{ t: 0.18, type: 'genre', genre: DF, qui: 'Un habitué', texte: '« Du disco, comme au bon vieux temps ! »' }, { t: 0.48, type: 'genre', genre: LA, qui: 'Une tablée entière', texte: '« Latino ! Latino ! »' },
      { t: 0.76, type: 'genre', genre: T, qui: 'Un homme en veste noire, au bout du comptoir', texte: '« Tu as de la techno, ou tu ne fais que les mariages ? »' }] },

  { id: 'club1', chap: 'Chapitre 5 · Le Hangar', titre: 'Première partie au Hangar', genre: 'Club', lieu: 'club', maison: 'club', public: 200, duree: 340, de: 23, a: 25, cachet: 350, poids: 2, plafond: true,
    qui: 'Vortex, DJ résident du Hangar',
    intro: ['« Alors c\'est toi, le DJ des mariages. Maud, la directrice, veut te tester en première partie. Tout le matériel est sur place : tu n\'amènes que ton casque. »',
      '« Règle numéro un : tu chauffes la salle, tu ne la brûles pas. Deep house, house, rien au-dessus de trois sur cinq en énergie. Si tu me voles ma soirée, tu ne remets plus les pieds ici. »'],
    bien: ['Maud, la directrice : « Une première partie qui prépare la salle sans la fatiguer, c\'est rare. Vortex ne te le dira jamais, mais il a souri. Une fois. »'],
    gouts: { [DH]: 1, [H]: 1, [DF]: 0.65, [T]: 0.6, [TR]: 0.4, [PD]: 0.35, [LA]: 0.3, [HH]: 0.3, [A8]: 0.2, [DB]: 0.2, [RK]: 0.1, [SL]: 0 },
    courbe: [[0, 2], [0.5, 2.6], [1, 3.2]],
    objectifs: [{ t: 0.12, type: 'genre', genre: DH, qui: 'Maud, la directrice', texte: '« Commence en deep house, que les gens s\'installent. »' }, { t: 0.6, type: 'bouton', bouton: 'brouillard', qui: 'Maud', texte: '« Mets un peu de brouillard, qu\'on voie les faisceaux. »' }] },

  { id: 'club2', chap: 'Chapitre 5 · Le Hangar', titre: 'Heure de pointe au Hangar', genre: 'Club', lieu: 'club', maison: 'club', public: 350, duree: 420, de: 25, a: 28, cachet: 900, poids: 2,
    qui: 'Maud, directrice du Hangar',
    intro: ['« Vortex vient d\'appeler : il est « souffrant ». Entre nous, je crois surtout qu\'il espère te voir te planter devant trois cent cinquante personnes. »',
      '« C\'est ton heure de pointe. Techno, house, trance : fais monter, tiens-les en haut, et envoie le CO₂ quand ça explose. Montre-moi que j\'ai eu raison. »'],
    bien: ['« Trois cent cinquante personnes les bras en l\'air. Vortex a regardé la vidéo ce matin ; il paraît qu\'il a cassé une tasse. Tu reviens quand tu veux. »'],
    gouts: { [T]: 1, [H]: 1, [TR]: 0.95, [DB]: 0.6, [DH]: 0.55, [DF]: 0.4, [PD]: 0.3, [HH]: 0.25, [LA]: 0.2, [A8]: 0.1, [RK]: 0.1, [SL]: 0 },
    courbe: [[0, 3.5], [0.3, 4.2], [0.6, 5], [1, 4.6]],
    objectifs: [{ t: 0.3, type: 'bouton', bouton: 'laser', qui: 'Maud', texte: '« Allume le laser ! »' }, { t: 0.55, type: 'effet', effet: 'co2', qui: 'Maud', texte: '« Maintenant ! Envoie le CO₂ ! »' },
      { t: 0.75, type: 'genre', genre: TR, qui: 'Les habitués', texte: 'Le premier rang réclame de la trance.' }] },

  { id: 'mariage2', chap: 'Chapitre 6 · Les grands contrats', titre: 'Le grand mariage du Domaine des Oliviers', genre: 'Mariage', lieu: 'mariage', public: 150, duree: 450, de: 19.5, a: 28, cachet: 1500, poids: 2,
    qui: 'Sonia Marchetti', exige: ['micro1', 'sono200', 'boule'], maries: true,
    intro: ['« Cent cinquante invités, un domaine au milieu des oliviers, et des mariés qui veulent « la soirée parfaite ». C\'est mon plus gros contrat de l\'année. »',
      '« Il me faut une sono qui porte jusqu\'au fond de la salle et une boule à facettes pour l\'ouverture de bal. Pour le reste, je vous fais confiance. »'],
    bien: ['« Les mariés m\'ont déjà demandé votre nom pour le baptême, les anniversaires et probablement leurs noces d\'or. Une certaine Claire Dumont, de la société Altéa, était invitée. Elle va vous appeler. »'],
    gouts: { [PD]: 1, [DF]: 1, [A8]: 0.9, [LA]: 0.9, [H]: 0.75, [RK]: 0.6, [HH]: 0.6, [SL]: 0.5, [DH]: 0.5, [TR]: 0.3, [T]: 0.25, [DB]: 0.15 },
    courbe: [[0, 2], [0.25, 2.5], [0.4, 3.5], [0.75, 4.6], [1, 4.2]],
    objectifs: [{ t: 0.04, type: 'annonce', qui: 'Sonia', texte: 'Annoncez l\'entrée des mariés : maintenez le bouton « Micro ».', replique: '« Mesdames et messieurs, faites un triomphe aux mariés ! »' },
      { t: 0.22, type: 'bouton', bouton: 'boule', qui: 'Sonia', texte: 'Allumez la boule à facettes pour l\'ouverture de bal (onglet Lumières).' }, { t: 0.24, type: 'genre', genre: SL, qui: 'Sonia', texte: 'L\'ouverture de bal : un slow pour les mariés.', poids: 9 },
      { t: 0.5, type: 'annonce', qui: 'Sonia', texte: 'La pièce montée arrive : annoncez-la au micro.', replique: '« Et maintenant, sous vos applaudissements : la pièce montée ! »' },
      { t: 0.52, type: 'effet', effet: 'etincelles', qui: 'Sonia', texte: 'Allumez les fontaines d\'étincelles pour la pièce montée.' },
      { t: 0.68, type: 'genre', genre: DF, qui: 'Les témoins', texte: '« Du disco ! On a préparé une chorégraphie ! »' }, { t: 0.86, type: 'genre', genre: PD, qui: 'La mariée', texte: '« Un dernier tube pour finir en beauté ! »' }] },

  { id: 'entreprise', chap: 'Chapitre 6 · Les grands contrats', titre: 'Le gala de la société Altéa', genre: 'Soirée d\'entreprise', lieu: 'entreprise', public: 200, duree: 420, de: 19, a: 25, cachet: 2200, poids: 2, strict: true, sansFumee: 0.34,
    qui: 'Claire Dumont, directrice de la communication d\'Altéa', exige: ['micro2', 'sono200'],
    intro: ['« Deux cents collaborateurs, une remise de trophées, puis soirée dansante. Notre directeur prendra votre micro : il le veut sans fil. »',
      '« Je serai franche : pas de saturation, pas de blanc, pas de fumée pendant les discours. De la tenue. »'],
    bien: ['« Impeccable. Je ne vous l\'avais pas dit : je programme aussi la grande scène des Nuits du Rhône. Il me manque un nom pour la clôture. Ça vous tente ? »'],
    gouts: { [PD]: 1, [DF]: 1, [A8]: 0.9, [H]: 0.8, [LA]: 0.8, [DH]: 0.7, [RK]: 0.6, [HH]: 0.5, [SL]: 0.3, [T]: 0.3, [TR]: 0.3, [DB]: 0.1 },
    courbe: [[0, 1.8], [0.3, 2.2], [0.42, 3.2], [0.75, 4.2], [1, 4]],
    objectifs: [{ t: 0.1, type: 'annonce', qui: 'Claire Dumont', texte: 'Appelez le directeur sur scène pour la remise des trophées (bouton « Micro »).', replique: '« Merci d\'accueillir le directeur général d\'Altéa pour la remise des trophées ! »' },
      { t: 0.34, type: 'annonce', qui: 'Claire Dumont', texte: 'Annoncez l\'ouverture de la piste de danse.', replique: '« La piste est ouverte : à vous de jouer ! »' },
      { t: 0.56, type: 'genre', genre: DF, qui: 'Le service comptabilité', texte: '« Du disco ! C\'est la seule fois de l\'année où on danse. »' }, { t: 0.8, type: 'genre', genre: A8, qui: 'Le directeur', texte: '« Vous auriez un bon vieux tube des années 80 ? »' }] },

  { id: 'festival', chap: 'Chapitre 7 · Les Nuits du Rhône', titre: 'Clôture des Nuits du Rhône', genre: 'Festival', lieu: 'festival', maison: 'festival', public: 2000, duree: 480, de: 24, a: 26, cachet: 5000, poids: 3,
    qui: 'Claire Dumont, programmatrice des Nuits du Rhône',
    intro: ['« Deux mille personnes devant la grande scène. Vortex joue juste avant vous — et oui, il a très mal pris que vous soyez programmé après lui. »',
      '« Vous avez tout : le son, les lumières, le CO₂, les confettis, les étincelles. Faites-en une clôture dont on parlera encore l\'an prochain. »'],
    bien: ['Au premier rang, vous reconnaissez Karim et Inès, Nathalie et Patrick, et même Mme Ferrand qui danse. En coulisses, Vortex vous tend la main : « Bien joué. L\'an prochain, la clôture, on la fait à deux ? »',
      'Vous êtes parti d\'une chambre et d\'un contrôleur à 299 €. Toutes les soirées restent rejouables pour améliorer vos notes, et le mix libre vous attend.'],
    gouts: { [T]: 1, [TR]: 1, [H]: 1, [DB]: 0.9, [DH]: 0.5, [DF]: 0.4, [PD]: 0.4, [HH]: 0.3, [LA]: 0.3, [RK]: 0.3, [A8]: 0.15, [SL]: 0 },
    courbe: [[0, 4], [0.4, 4.6], [0.7, 5], [1, 5]],
    objectifs: [{ t: 0.18, type: 'effet', effet: 'co2', qui: 'Le régisseur', texte: '« Jets de CO₂ quand tu veux ! »' }, { t: 0.42, type: 'genre', genre: DB, qui: 'Le public', texte: 'Deux mille personnes scandent : « Drum and bass ! »' },
      { t: 0.66, type: 'effet', effet: 'etincelles', qui: 'Le régisseur', texte: '« Les fontaines d\'étincelles sont prêtes. »' }, { t: 0.9, type: 'effet', effet: 'confettis', qui: 'Le régisseur', texte: '« C\'est le final : envoie les confettis ! »' }] },
];

const EXIGENCES = {
  lumieres: ['un jeu de lumière', (i) => i.lumieres.pars + i.lumieres.lyres + i.lumieres.derbys > 0],
  micro1: ['un micro', (i) => i.micro >= 1],
  micro2: ['un micro sans fil', (i) => i.micro >= 2],
  sono80: ['une sonorisation pour 80 personnes au moins', (i) => i.sono.puissance >= 80],
  sono200: ['une sonorisation pour 200 personnes au moins', (i) => i.sono.puissance >= 200],
  boule: ['une boule à facettes', (i) => !!i.effets.boule],
};

/** Ce que le public entend en ce moment : platine dominante, morceau, présences. */
export function ecoute(m) {
  const [a, b] = m.platines, pa = a.morceau ? m.presence(0) : 0, pb = b.morceau ? m.presence(1) : 0, i = pa >= pb ? 0 : 1, pres = Math.max(pa, pb);
  return { i, pres, p: m.platines[i], mo: pres > 0.06 ? m.platines[i].morceau : null, pa, pb };
}
const heure = (h) => Math.floor(h % 24) + ' h ' + String(Math.floor((h % 1) * 60)).padStart(2, '0');
const points = (n) => '●'.repeat(clamp(Math.round(n), 0, 5)) + '○'.repeat(5 - clamp(Math.round(n), 0, 5));

/** Installation de démonstration pour le mix libre : tout le matériel haut de gamme (matériel de débutant dans la chambre). */
export function installationLibre(lieu) {
  if (lieu === 'chambre') return installation({ equipe: { platines: 'flx4', casque: 'hd25', sono: 'ts408', lumieres: 'gigbar', pupitre: 'obey70', fumee: 'hurricane' }, possede: ['boule', 'uv'] });
  const tout = { equipe: { platines: 'cdj3000', casque: 'x10', sono: lieu === 'bar' ? 'art912' : 'prx900', lumieres: lieu === 'bar' ? 'focus' : 'pointe', pupitre: 'grandma', fumee: 'z1000', micro: 'ewd' }, possede: MATERIEL.filter((x) => x.cat === 'effets').map((x) => x.id) };
  const inst = installation(tout, lieu === 'festival' ? 'festival' : null);
  if (lieu === 'club') inst.sono = { ...MAISON.club.sono };
  return inst;
}

/** Mix libre : aucun enjeu, le public suit simplement la musique. */
export class Libre {
  constructor(jeu, lieu) {
    this.j = jeu; this.lieu = lieu; this.inst = installationLibre(lieu); this.extras = {}; this.ambiance = 25; this.phase = 0; this.libre = true;
    this.nbScene = { chambre: 0, fetes: 60, mariage: 110, bar: 60, club: 300, entreprise: 150, festival: 700 }[lieu];
  }
  demarrer() {
    $('#b-lieu').textContent = 'Mix libre'; $('#b-heure').textContent = LIEUX[this.lieu].nom;
    $('#b-info').textContent = 'Aucun enjeu : essayez les platines, les effets, les lumières et la fumée. Vos propres fichiers audio s\'ajoutent depuis l\'onglet Ordinateur.';
  }
  maj(dt) {
    const E = ecoute(this.j.moteur), e = E.mo ? (E.mo.energie || 3) / 5 : 0;
    this.ambiance += ((E.mo ? 48 + e * 50 : 6) - this.ambiance) * (1 - Math.exp(-dt / 6));
    this.phase = E.mo ? E.p.temps : this.phase + dt * 2;
    $('#b-ambiance i').style.width = Math.round(this.ambiance) + '%';
    return { ambiance: this.ambiance, energie: e, phase: this.phase, musique: !!E.mo };
  }
  effet() { this.j.salle.acclamer(3); }
  micro() {}
  async quitter() { return true; }
}

/** Une soirée de la carrière : l'horloge, l'humeur du public, les demandes, la notation. */
export class Soiree {
  constructor(jeu, d, inst, surFin) {
    this.j = jeu; this.d = d; this.inst = inst; this.surFin = surFin; this.lieu = d.lieu;
    this.nbScene = Math.min(d.public, d.lieu === 'festival' ? 700 : 400);
    this.extras = d.maries ? { roles: [{ haut: 0xfafafa, bas: 0xfafafa, taille: 0.95 }, { haut: 0x14151c, bas: 0x14151c, taille: 1.04 }] } : {};
  }

  demarrer() {
    const d = this.d, L = this.j.lumieres;
    Object.assign(this, { t: 0, ambiance: d.public ? 26 : 0, phase: 0, fini: false, silence: 0, enveloppe: 0, rougeRecent: 0, elan: 0, tr: null, joues: new Map(), domId: null, domDepuis: 0, repete: false,
      tirs: {}, microOuvert: false, conseils: {}, tAffiche: 0, lecon: 0, enBlanc: false, stroboSuite: 0 });
    this.s = { ambSomme: 0, ambTemps: 0, propres: 0, passables: 0, rates: 0, oreille: 0, coupes: 0, blancs: 0, tRouge: 0, tGalop: 0, repetitions: 0, objOk: 0, objTotal: 0, pourboires: 0, lumSomme: 0, lumTemps: 0 };
    this.objectifs = (d.objectifs || []).map((o) => ({ ...o, vu: false, actif: false, acc: 0 }));
    this.plafondSono = d.public > this.inst.sono.puissance ? clamp(0.55 + (0.45 * this.inst.sono.puissance) / d.public, 0, 1) : 1;
    $('#demandes').innerHTML = '';
    $('#b-lieu').textContent = d.titre; $('#b-heure').textContent = d.lecons ? 'Leçon de mixage' : heure(d.de);
    if (d.lecons) this._carteLecon();
    else annoncer('Les invités arrivent : lancez votre premier morceau depuis l\'onglet Ordinateur.', '', 8);
    if (this.plafondSono < 0.95) annoncer('Votre sonorisation est trop petite pour ' + d.public + ' personnes : le fond de la salle entend mal.', 'mauvais', 9);
    this.aime = Object.entries(d.gouts || {}).sort((x, y) => y[1] - x[1]).filter((x) => x[1] >= 0.85).slice(0, 4).map((x) => x[0]).join(', ');
    void L;
  }

  voulue(prog) {
    const c = this.d.courbe;
    for (let k = 1; k < c.length; k++) if (prog <= c[k][0]) { const [x0, y0] = c[k - 1], [x1, y1] = c[k]; return y0 + ((y1 - y0) * (prog - x0)) / Math.max(1e-6, x1 - x0); }
    return c[c.length - 1][1];
  }

  _conseil(cle, texte, classe = '', pause = 40) {
    if (this.t - (this.conseils[cle] ?? -999) < pause) return;
    this.conseils[cle] = this.t;
    annoncer(texte, classe);
  }

  effet(nom) { this.tirs[nom] = this.t; this.ambiance = clamp(this.ambiance + 3, 0, 100); this.j.salle.acclamer(3); }
  micro(actif) { this.microOuvert = actif; }

  // ------------------------------------------------------------------ leçon (chambre)
  _carteLecon() {
    const L = this.d.lecons, z = $('#demandes');
    z.innerHTML = '';
    if (this.lecon >= L.length) return;
    const c = creer('div', 'dem', '<b>Leçon ' + (this.lecon + 1) + ' sur ' + L.length + '</b>' + echapper(L[this.lecon][0]));
    z.appendChild(c);
  }

  // ------------------------------------------------------------------ demandes et moments de la soirée
  _ouvrir(o) {
    const L = this.j.lumieres, B = this.j.biblio;
    o.vu = true;
    if (o.type === 'effet' && !(L.dispo[o.effet] && L.tirs[o.effet] > 0)) return;
    if (o.type === 'bouton' && !L.dispo[o.bouton]) return;
    o.actif = true; o.acc = 0;
    o.delai = o.delai || { genre: 95, annonce: 35, effet: 25, bouton: 40 }[o.type]; o.reste = o.delai;
    o.tenir = o.tenir ?? { genre: 12, annonce: 3, effet: 0, bouton: 2 }[o.type];
    this.s.objTotal++;
    o.carte = creer('div', 'dem', '<b>' + echapper(o.qui) + '</b>' + echapper(o.texte) + '<div class="barre"><i style="width:100%"></i></div>');
    $('#demandes').appendChild(o.carte);
    if (o.type === 'genre') { for (const m of B.morceaux) m.demande = m.genre === o.genre; this.j.pc.rendre(); this.j.alerte('pc'); }
    else if (o.type !== 'annonce') this.j.alerte('pupitre');
    if (o.type === 'annonce' && !this.inst.micro) this._clore(o, false, 'Sans micro, impossible de faire l\'annonce.');
  }

  _clore(o, ok, raison) {
    o.actif = false;
    o.carte.classList.add(ok ? 'fait' : 'rate');
    const carte = o.carte;
    setTimeout(() => carte.remove(), 5000);
    if (o.type === 'genre') { const reste = this.objectifs.find((x) => x.actif && x.type === 'genre'); for (const m of this.j.biblio.morceaux) m.demande = !!reste && m.genre === reste.genre; this.j.pc.rendre(); }
    if (ok) {
      this.s.objOk++;
      this.ambiance = clamp(this.ambiance + (o.poids || 6), 0, 100);
      const pb = o.type === 'genre' ? (this.d.pourboire || 0) : 0;
      this.s.pourboires += pb;
      if (o.replique) annoncer(o.replique, 'parle', 6);
      else annoncer(o.type === 'genre' ? o.qui + ' est aux anges' + (pb ? ' : ' + euros(pb) + ' de pourboire.' : '.') : 'Parfait, juste au bon moment.', 'bon');
      this.j.salle.acclamer(o.type === 'genre' ? 2.5 : 4);
    } else {
      this.ambiance = clamp(this.ambiance - 5, 0, 100);
      annoncer(raison || (o.type === 'genre' ? o.qui + ' repart déçu : la demande n\'a pas été satisfaite.' : 'Trop tard : le moment est passé.'), 'mauvais');
    }
  }

  _condition(o, E) {
    if (o.type === 'genre') return !!E.mo && E.mo.genre === o.genre && E.pres > 0.45;
    if (o.type === 'annonce') return this.microOuvert;
    if (o.type === 'effet') return this.t - (this.tirs[o.effet] ?? -99) < 1.5;
    if (o.type === 'bouton') return !!this.j.lumieres.e[o.bouton];
    return false;
  }

  _finTransition(vers) {
    const tr = this.tr, S = this.s;
    this.tr = null;
    if (vers === tr.de) return;                                        // le second morceau est reparti : ce n'était qu'un essai
    if (tr.duree < 1.2) { S.coupes++; return; }                        // coupe franche : ni bonus, ni faute
    const moy = tr.ecart / tr.duree, part = tr.galop / tr.duree;
    if (part < 0.2 && moy < 45) {
      S.propres++; this.elan = 25; this.ambiance = clamp(this.ambiance + 4, 0, 100); this.j.salle.acclamer(2);
      if (!tr.sync) { S.oreille++; annoncer('Enchaînement calé à l\'oreille, sans SYNC : chapeau !', 'bon'); } else annoncer('Bel enchaînement : les deux morceaux tombaient ensemble.', 'bon');
    } else if (part > 0.5) { S.rates++; this.ambiance = clamp(this.ambiance - 7, 0, 100); annoncer('Enchaînement raté : les temps des deux morceaux ne tombaient pas ensemble.', 'mauvais'); }
    else { S.passables++; annoncer('Enchaînement passable : quelques temps décalés.'); }
    if (tr.graves > 6) this._conseil('graves', 'Conseil : pendant un enchaînement, coupez les graves (bouton BAS) d\'un des deux morceaux, puis échangez.', '', 120);
  }

  // ------------------------------------------------------------------ à chaque image
  maj(dt) {
    const J = this.j, m = J.moteur, d = this.d, S = this.s, [A, B] = m.platines, E = ecoute(m), mo = E.mo, L = J.lumieres;
    if (this.fini) return { ambiance: this.ambiance, energie: 0, phase: this.phase, musique: false };
    this.t += dt;
    this.phase = mo ? E.p.temps : this.phase + dt * 2;
    const e = mo ? (mo.energie || 3) : 0;
    // ---- leçon : pas d'horloge, pas de public
    if (d.lecons) {
      if (this.lecon < d.lecons.length && d.lecons[this.lecon][1](m)) { this.lecon++; this._carteLecon(); if (this.lecon < d.lecons.length) annoncer('Bien ! Étape suivante.', 'bon', 3); else { annoncer('Votre premier enchaînement !', 'bon'); this.tFinLecon = this.t + 5; } }
      if (this.tFinLecon && this.t > this.tFinLecon) this._terminer();
      return { ambiance: 0, energie: e / 5, phase: this.phase, musique: !!mo };
    }
    const prog = clamp(this.t / d.duree, 0, 1), niv = m.niveaux(), voulue = this.voulue(prog);
    // ---- le son : blanc, niveau trop faible, saturation
    this.silence = niv.moyen < 0.006 ? this.silence + dt : 0;
    this.enveloppe = Math.max(niv.moyen, this.enveloppe - dt * 0.06);
    const blanc = this.silence > 2.2 && this.t > 30 && !this.microOuvert;
    if (blanc && !this.enBlanc) { S.blancs++; annoncer('Blanc ! Plus de musique : la piste se vide.', 'mauvais'); }
    this.enBlanc = blanc;
    if (niv.rouge) { S.tRouge += dt; this.rougeRecent = Math.min(4, this.rougeRecent + dt); } else this.rougeRecent = Math.max(0, this.rougeRecent - dt * 0.3);
    const sature = this.rougeRecent > 1.4, faible = !!mo && !blanc && this.enveloppe < 0.035 && !this.microOuvert;
    if (sature) this._conseil('rouge', 'Ça sature : la sortie est dans le rouge. Baissez les gains, les curseurs ou les graves.', 'mauvais', 30);
    if (faible) this._conseil('faible', 'On n\'entend presque rien dans la salle : montez le MASTER ou les curseurs.', 'mauvais', 30);
    // ---- le morceau dominant : déjà joué ce soir ?
    if (mo && mo.id !== this.domId) {
      if (this.domId != null && this.domDepuis > 20) this.joues.set(this.domId, this.t);
      this.domId = mo.id; this.domDepuis = 0;
      this.repete = this.joues.has(mo.id) && this.t - this.joues.get(mo.id) > 40;
      if (this.repete) { S.repetitions++; this.ambiance = clamp(this.ambiance - 6, 0, 100); annoncer('Ce morceau est déjà passé ce soir : le public s\'en est aperçu.', 'mauvais'); }
    }
    if (mo) this.domDepuis += dt;
    // ---- deux morceaux en même temps : sont-ils calés ?
    const deux = E.pa > 0.12 && E.pb > 0.12 && A.lecture && B.lecture && A.morceau.id !== B.morceau.id;
    let galop = false;
    if (deux) {
      const tr = this.tr || (this.tr = { duree: 0, ecart: 0, galop: 0, graves: 0, de: E.i, sync: false });
      const fa = A.bpm, fb = B.bpm, r = fa / fb;
      let dph = r > 1.5 ? A.temps - 2 * B.temps : r < 0.67 ? 2 * A.temps - B.temps : A.temps - B.temps;
      dph -= Math.round(dph);
      const ms = (Math.abs(dph) * 60000) / Math.max(fa, fb);
      tr.duree += dt; tr.ecart += ms * dt;
      if (ms > 70) tr.galop += dt;
      if (A.sync || B.sync) tr.sync = true;
      if (m.voies[0].bas > -0.35 && m.voies[1].bas > -0.35 && E.pa > 0.45 && E.pb > 0.45) tr.graves += dt;
      galop = ms > 70 && tr.galop > 2.5;
      if (galop) { S.tGalop += dt; this._conseil('galop', 'Les deux morceaux ne sont pas calés : ça galope ! Recalez (SYNC ou molette), ou coupez l\'un des deux.', 'mauvais', 25); }
    } else if (this.tr) this._finTransition(E.i);
    // ---- demandes et moments
    for (const o of this.objectifs) {
      if (!o.vu && prog >= o.t) this._ouvrir(o);
      if (!o.actif) continue;
      o.reste -= dt;
      if (this._condition(o, E)) o.acc += dt;
      if (o.acc >= o.tenir && (o.tenir > 0 || this._condition(o, E))) this._clore(o, true);
      else if (o.reste <= 0) this._clore(o, false);
      else $('i', o.carte).style.width = Math.round((o.reste / o.delai) * 100) + '%';
    }
    // ---- les lumières et la fumée : adaptées au moment ?
    let lum = -0.05, noteLum = 0;
    const sc = L.sortie.scene, calme = sc === 'ambiance' || sc === 'slow', dens = L.densite;
    this.stroboSuite = L.e.strobo ? this.stroboSuite + dt : 0;
    if (L.dispo.lumiere && !L.sortie.noir) {
      if (!L.dispo.scenes) { lum = 0.02; noteLum = 0.45; }
      else {
        const bon = mo ? (e <= 2 ? calme : e >= 4 ? !calme && sc !== 'plein' : sc !== 'plein') : calme;
        lum = bon ? 0.07 : sc === 'plein' ? -0.03 : 0.01; noteLum = bon ? 0.85 : 0.3;
        if (L.dispo.tempo && L.e.sync === 'tempo') { lum += 0.02; noteLum += 0.15; }
      }
      if (this.stroboSuite > 6) { lum -= 0.07; noteLum -= 0.4; this._conseil('strobo', 'Le stroboscope en continu fatigue tout le monde : par petites touches seulement.', 'mauvais', 30); }
    } else if (L.dispo.lumiere && this.t > 20) this._conseil('noir', 'La salle est dans le noir : rallumez une scène (onglet Lumières).', '', 45);
    if (L.inst.fumee) {
      if (d.sansFumee && prog < d.sansFumee && dens > 0.18) { lum -= 0.1; noteLum -= 0.4; this._conseil('fumee1', 'Pas de fumée pendant les discours !', 'mauvais', 30); }
      else if (dens > 0.85) { lum -= 0.09; noteLum -= 0.4; this._conseil('fumee2', 'On n\'y voit plus rien : trop de fumée !', 'mauvais', 30); }
      else if (dens > 0.1 && dens < 0.7 && L.dispo.lumiere) { lum += 0.04; noteLum += 0.15; }
    }
    S.lumSomme += clamp(noteLum, 0, 1) * dt; S.lumTemps += dt;
    // ---- l'humeur de la piste
    const demande = this.objectifs.find((o) => o.actif && o.type === 'genre' && mo && mo.genre === o.genre);
    const gout = !mo ? 0 : demande ? 1 : mo.source === 'fichier' ? 0.75 : (d.gouts[mo.genre] ?? 0.45);
    const ecart = mo ? e - voulue : 0, accord = !mo ? 0 : demande ? 1 : 1 - clamp(Math.abs(ecart) / 2.5, 0, 1);
    let q = 0.28 + 0.3 * gout + 0.24 * accord + lum + (this.elan > 0 ? 0.08 : 0);
    this.elan = Math.max(0, this.elan - dt);
    if (galop) q -= 0.3;
    if (sature) q -= d.strict ? 0.3 : 0.15;
    if (this.repete) q -= 0.15;
    if (d.plafond && mo && ecart > 0.9) { q -= 0.25; this._conseil('plafond', 'Vortex vous fusille du regard : c\'est une première partie, calmez le jeu !', 'mauvais', 35); }
    else if (mo && !demande && this.domDepuis > 12) {
      if (gout < 0.42) this._conseil('gout', 'Ce style ne plaît pas ici : regardez ce que le public aime, en haut de l\'écran.', '', 45);
      else if (ecart > 1.3) this._conseil('fort', 'Trop d\'énergie pour ce moment de la soirée : le public n\'est pas encore prêt.', '', 45);
      else if (ecart < -1.3) this._conseil('mou', 'La piste s\'ennuie : passez un morceau plus énergique.', '', 45);
    }
    if (faible) q = Math.min(q, 0.42);
    if (blanc || (!mo && this.t > 30)) q = 0;
    const cible = 100 * clamp(q, 0, 1) * this.plafondSono, tau = cible > this.ambiance ? 14 : blanc ? (d.strict ? 3 : 4.5) : 8;
    this.ambiance += (cible - this.ambiance) * (1 - Math.exp(-dt / tau));
    if (this.t > 30) { S.ambSomme += this.ambiance * dt; S.ambTemps += dt; }
    // ---- affichage (quatre fois par seconde)
    if ((this.tAffiche -= dt) <= 0) {
      this.tAffiche = 0.25;
      $('#b-heure').textContent = heure(d.de + (d.a - d.de) * prog) + '  ·  fin à ' + heure(d.a);
      $('#b-ambiance i').style.width = Math.round(this.ambiance) + '%';
      $('#b-info').textContent = 'Le public aime : ' + this.aime + '  ·  énergie attendue ' + points(voulue) + '  ·  ' + J.salle.dansants + ' sur la piste';
    }
    if (prog > 0.88) this._conseil('fin', 'La soirée touche à sa fin : soignez le dernier morceau.', '', 9999);
    if (prog >= 1) this._terminer();
    return { ambiance: this.ambiance, energie: e / 5, phase: this.phase, musique: !!mo && !blanc };
  }

  /** Le joueur veut partir avant la fin. */
  async quitter() {
    if (this.d.lecons) return true;
    const ok = await dialogue({ titre: 'Quitter la soirée ?', corps: '<p>Un DJ qui part avant la fin n\'est pas payé, et la soirée ne compte pas.</p>', boutons: [['Rester', false], ['Quitter sans être payé', true, 'second']] });
    if (ok) this.fini = true;
    return ok;
  }

  _terminer() {
    if (this.fini) return;
    this.fini = true;
    const S = this.s, d = this.d;
    for (const o of this.objectifs) if (o.actif) { o.actif = false; S.objTotal--; }
    if (d.lecons) { this.surFin({ lecon: true, etoiles: 3, note: 0, pourboires: 0 }); return; }
    const amb = S.ambTemps ? S.ambSomme / S.ambTemps : this.ambiance, nb = S.propres + S.passables + S.rates;
    const tech = nb ? (S.propres + 0.5 * S.passables) / nb : 0.4, dem = S.objTotal ? S.objOk / S.objTotal : 1, lum = S.lumTemps ? S.lumSomme / S.lumTemps : 0;
    const fautes = clamp(S.blancs * 0.3 * (d.strict ? 1.6 : 1) + (S.tRouge / 25) * (d.strict ? 1.6 : 1) + S.tGalop / 30 + S.repetitions * 0.15, 0, 1);
    const note = Math.round(20 * (0.5 * amb / 100 + 0.17 * tech + 0.15 * dem + 0.08 * lum + 0.1 * (1 - fautes)) * 10) / 10;
    const et = note >= 16 ? 5 : note >= 13.5 ? 4 : note >= 11 ? 3 : note >= 8 ? 2 : 1;
    this.surFin({ note, etoiles: et, amb, tech, dem, lum, fautes, ...S });
  }
}

/** L'état du joueur, l'écran de carrière (soirées, boutique) et l'enchaînement des soirées. */
export class Carriere {
  constructor(jeu) { this.j = jeu; this.e = null; this.onglet = 'soirees'; this.el = $('#menu'); this.charger(); }

  charger() { try { const t = localStorage.getItem(CLE); this.e = t ? JSON.parse(t) : null; } catch (err) { this.e = null; } if (this.e && !this.e.faits) this.e = null; }
  sauver() { try { localStorage.setItem(CLE, JSON.stringify(this.e)); } catch (err) { /* stockage indisponible : la partie dure le temps de la page */ } }
  get existe() { return !!this.e; }
  nouvelle(nom) { this.e = { nom: nom || 'DJ Nova', argent: 100, possede: [...DEPART.possede], equipe: { ...DEPART.equipe }, faits: {} }; this.sauver(); }
  get reputation() { return SOIREES.reduce((s, d) => s + (this.e.faits[d.id] ? this.e.faits[d.id].etoiles * d.poids : 0), 0); }
  get titre() { const r = this.reputation; return TITRES.find((t) => r >= t[0])[1]; }
  installation(d) { return installation(this.e, d.maison || null); }
  ouverte(k) { return k === 0 || (this.e.faits[SOIREES[k - 1].id] || {}).etoiles >= 2; }
  manques(d) { const inst = this.installation(d); return (d.exige || []).filter((x) => !EXIGENCES[x][1](inst)).map((x) => EXIGENCES[x][0]); }

  // ------------------------------------------------------------------ écran de carrière
  afficher(onglet = this.onglet) {
    this.onglet = onglet;
    const e = this.e, el = this.el;
    this.j.versMenu();
    el.innerHTML = '<div class="carte"><div class="entete-carriere"><h2>' + echapper(e.nom) + '</h2><span class="stat">Argent <b>' + euros(e.argent) + '</b></span><span class="stat">Réputation <b>' + this.reputation + '</b> · ' + this.titre + '</span>'
      + '<button type="button" class="bouton" data-a="menu" style="margin-left:auto">Menu principal</button></div>'
      + '<div class="onglets-carriere"><button type="button" data-o="soirees" class="' + (onglet === 'soirees' ? 'actif' : '') + '">Soirées</button><button type="button" data-o="boutique" class="' + (onglet === 'boutique' ? 'actif' : '') + '">Boutique de matériel</button></div>'
      + '<div class="liste">' + (onglet === 'soirees' ? this._soirees() : this._boutique()) + '</div></div>';
    el.onclick = (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.o) this.afficher(b.dataset.o);
      else if (b.dataset.a === 'menu') this.j.menuPrincipal();
      else if (b.dataset.jouer) this.lancer(SOIREES.find((d) => d.id === b.dataset.jouer));
      else if (b.dataset.acheter) this.acheter(b.dataset.acheter);
      else if (b.dataset.equiper) { const f = fiche(b.dataset.equiper); e.equipe[f.cat] = f.id; this.sauver(); this.afficher(); }
    };
  }

  _soirees() {
    let h = '', chap = '';
    SOIREES.forEach((d, k) => {
      const f = this.e.faits[d.id], ouverte = this.ouverte(k), manques = ouverte ? this.manques(d) : [];
      if (d.chap !== chap) { chap = d.chap; h += '<div class="categorie">' + chap + '</div>'; }
      h += '<div class="fiche' + (ouverte ? '' : ' verrou') + (f ? ' fait' : '') + '"><span class="meta">' + d.genre + ' · ' + LIEUX[d.lieu].nom + '</span><h3>' + echapper(d.titre) + '</h3>'
        + '<p>' + (d.public ? d.public.toLocaleString('fr-FR') + ' personnes · cachet <span class="prix">' + euros(d.cachet) + '</span>' + (f ? ' (60 % si vous la rejouez)' : '') : 'Apprenez à enchaîner deux morceaux.') + '</p>'
        + (d.maison ? '<p class="meta">' + (d.maison === 'bar' ? 'Sonorisation fournie par le bar.' : 'Tout le matériel est fourni : vous n\'apportez que votre casque.') + '</p>' : '')
        + (f ? '<p class="meta">' + (d.lecons ? 'Leçon terminée' : etoiles(f.etoiles) + ' · meilleure note ' + String(f.note).replace('.', ',') + ' / 20') + '</p>' : '')
        + (manques.length ? '<p class="meta" style="color:#ffb4a8">Il vous faut : ' + manques.join(', ') + ' (voir la boutique).</p>' : '')
        + (!ouverte ? '<p class="meta">Réussissez la soirée précédente (2 étoiles au moins) pour l\'obtenir.</p>' : '')
        + '<button type="button" data-jouer="' + d.id + '"' + (ouverte && !manques.length ? '' : ' disabled') + '>' + (f ? 'Rejouer' : 'Jouer') + '</button></div>';
    });
    return h;
  }

  _boutique() {
    const e = this.e;
    let h = '';
    for (const [cat, nom] of CATEGORIES) {
      h += '<div class="categorie">' + nom + (cat === 'effets' ? ' — on peut en posséder plusieurs' : '') + '</div>';
      for (const x of MATERIEL.filter((y) => y.cat === cat)) {
        const a = e.possede.includes(x.id), eq = e.equipe[cat] === x.id;
        h += '<div class="fiche' + (eq ? ' equipe' : a ? ' possede' : '') + '"><span class="gamme g' + x.gamme + '">' + GAMMES[x.gamme] + '</span><h3>' + echapper(x.nom) + '</h3><p>' + echapper(x.desc) + '</p>'
          + '<p class="prix">' + (x.prix ? euros(x.prix) : 'Fourni avec les projecteurs') + '</p>'
          + (a ? (cat === 'effets' ? '<button type="button" disabled>Possédé</button>' : eq ? '<button type="button" disabled>Utilisé en soirée</button>' : '<button type="button" data-equiper="' + x.id + '">Utiliser en soirée</button>')
            : '<button type="button" data-acheter="' + x.id + '"' + (e.argent >= x.prix ? '' : ' disabled') + '>' + (e.argent >= x.prix ? 'Acheter' : 'Il vous manque ' + euros(x.prix - e.argent)) + '</button>') + '</div>';
      }
    }
    return h;
  }

  acheter(id) {
    const f = fiche(id), e = this.e;
    if (!f || e.possede.includes(id) || e.argent < f.prix) return;
    e.argent -= f.prix; e.possede.push(id);
    if (f.cat !== 'effets') e.equipe[f.cat] = id;
    this.sauver(); this.afficher();
  }

  // ------------------------------------------------------------------ une soirée, du contrat à la paie
  async lancer(d) {
    const inst = this.installation(d), N = inst.noms;
    const lignes = [['Platines', N.platines], ['Casque', N.casque], ['Sonorisation', N.sono], ['Lumières', N.lumieres + (N.pupitre !== '—' ? ' · ' + N.pupitre : '')], ['Fumée', N.fumee], ['Micro', N.micro]];
    const aime = d.gouts ? Object.entries(d.gouts).sort((x, y) => y[1] - x[1]).filter((x) => x[1] >= 0.85).map((x) => x[0]).join(', ') : '';
    const ok = await dialogue({ qui: d.qui, titre: d.titre, corps: paragraphes(d.intro) + (aime ? '<p><b>Le public aime :</b> ' + aime + '.</p>' : '')
      + '<table>' + lignes.map(([a, b]) => '<tr><td>' + a + '</td><td>' + echapper(b) + '</td></tr>').join('') + '</table>'
      + (d.public > inst.sono.puissance ? '<p style="color:#ffb4a8">Votre sonorisation est prévue pour ' + inst.sono.puissance + ' personnes : le fond de la salle entendra mal, et l\'ambiance en souffrira.</p>' : ''),
      boutons: [['Plus tard', false], ['C\'est parti', true]] });
    if (!ok) return;
    const soiree = new Soiree(this.j, d, inst, (r) => this.terminer(d, r));
    this.j.ouvrir(soiree);
  }

  async terminer(d, r) {
    const e = this.e, avant = e.faits[d.id], premiere = !avant, J = this.j;
    J.arreterMusique();
    if (r.lecon) {
      e.faits[d.id] = { etoiles: 3, note: 0, fois: (avant ? avant.fois : 0) + 1 };
      this.sauver();
      await dialogue({ qui: d.qui, titre: 'Leçon terminée', corps: paragraphes(d.bien) + (premiere ? '<p><b>Nouvelle soirée disponible :</b> ' + SOIREES[1].titre + '.</p>' : '') });
      this.afficher('soirees');
      return;
    }
    const paie = Math.round(d.cachet * [0.4, 0.7, 1, 1.1, 1.25][r.etoiles - 1] * (premiere ? 1 : 0.6)), total = paie + r.pourboires;
    e.argent += total;
    e.faits[d.id] = { etoiles: Math.max(r.etoiles, avant ? avant.etoiles : 0), note: Math.max(r.note, avant ? avant.note : 0), fois: (avant ? avant.fois : 0) + 1 };
    this.sauver();
    const pc = (x) => Math.round(x * 100) + ' %';
    await dialogue({ titre: d.titre + ' — le bilan', corps: '<div class="note-finale">' + String(r.note).replace('.', ',') + ' / 20 &nbsp;' + etoiles(r.etoiles) + '</div><table>'
      + '<tr><td>Ambiance moyenne de la piste</td><td>' + Math.round(r.amb) + ' / 100</td></tr>'
      + '<tr><td>Enchaînements</td><td>' + r.propres + ' réussi' + (r.propres > 1 ? 's' : '') + (r.oreille ? ' (dont ' + r.oreille + ' à l\'oreille)' : '') + ', ' + r.passables + ' passable' + (r.passables > 1 ? 's' : '') + ', ' + r.rates + ' raté' + (r.rates > 1 ? 's' : '') + (r.coupes ? ', ' + r.coupes + ' coupe' + (r.coupes > 1 ? 's' : '') + ' franche' + (r.coupes > 1 ? 's' : '') : '') + '</td></tr>'
      + '<tr><td>Demandes et moments réussis</td><td>' + r.objOk + ' sur ' + r.objTotal + '</td></tr>'
      + '<tr><td>Lumières et fumée</td><td>' + pc(r.lum) + '</td></tr>'
      + '<tr><td>Incidents</td><td>' + (r.blancs || r.tRouge > 3 || r.repetitions || r.tGalop > 3 ? [r.blancs ? r.blancs + ' blanc' + (r.blancs > 1 ? 's' : '') : '', r.tRouge > 3 ? Math.round(r.tRouge) + ' s de saturation' : '', r.tGalop > 3 ? Math.round(r.tGalop) + ' s de galop' : '', r.repetitions ? r.repetitions + ' morceau' + (r.repetitions > 1 ? 'x' : '') + ' répété' + (r.repetitions > 1 ? 's' : '') : ''].filter(Boolean).join(', ') : 'aucun') + '</td></tr>'
      + '<tr><td>Cachet' + (premiere ? '' : ' (soirée rejouée : 60 %)') + '</td><td>' + euros(paie) + '</td></tr>' + (r.pourboires ? '<tr><td>Pourboires</td><td>' + euros(r.pourboires) + '</td></tr>' : '')
      + '<tr><td><b>Total encaissé</b></td><td>' + euros(total) + '</td></tr></table>' });
    const k = SOIREES.indexOf(d), suivante = SOIREES[k + 1];
    const texte = r.etoiles >= 4 ? d.bien : r.etoiles >= 2 ? (d.moyen || ['Soirée correcte, sans plus. Le client vous paie, mais il ne vous recommandera pas les yeux fermés. Vous pouvez la rejouer pour améliorer votre note.'])
      : (d.mal || ['La piste est restée trop souvent vide et le client le fait savoir. Retravaillez vos enchaînements et le choix des morceaux, puis rejouez cette soirée.']);
    await dialogue({ qui: d.qui, titre: r.etoiles >= 4 ? 'Soirée réussie' : r.etoiles >= 2 ? 'Soirée passable' : 'Soirée ratée', corps: paragraphes(texte)
      + (premiere && r.etoiles >= 2 && suivante ? '<p><b>Nouvelle soirée disponible :</b> ' + echapper(suivante.titre) + '.</p>' : '') + (r.etoiles < 2 ? '<p>Il faut au moins 2 étoiles pour obtenir la soirée suivante.</p>' : '') });
    this.afficher('soirees');
  }
}
