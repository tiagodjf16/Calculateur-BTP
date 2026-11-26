// Prise en charge de la victime : tablette de bilan, matériel, gestes, évolution des constantes, notation.
import { LOTS, ONGLETS, GESTES, SOCLE } from './cas.js';
import { $, formatTemps } from './outils.js';

const POSITIONS = ['demi_assis', 'assis', 'allonger', 'jambes_flechies', 'pls'];
const NOM_POSITION = { demi_assis: 'demi-assise', assis: 'assise', allonger: 'allongée à plat dos', jambes_flechies: 'allongée, cuisses fléchies', pls: 'position latérale de sécurité', mid: 'immobilisée dans le matelas à dépression' };
const ALLER_RETOUR = 11;                 // secondes pour aller chercher un lot au VSAV

export class Intervention {
  constructor(ctx, cas, adresse) {
    this.ctx = ctx;
    this.cas = cas;
    this.adresse = adresse;
    this.t = 0;
    this.e = { ...cas.constantes };
    this.connu = {};
    this.faits = new Map();
    this.s = {};
    this.journal = [];
    this.erreurs = [];
    this.lots = Object.fromEntries(Object.entries(LOTS).map(([k, l]) => [k, l.lieu === 'emporte' ? 'place' : 'vsav']));
    this.encours = null;
    this.onglet = cas.lieu === 'route' ? 'securite' : 'bilan';
    this.position = null;
    this.phase = 'soins';                // soins -> brancard -> installe -> charge
    this.finie = false;
    this.ecran = $('#tablette');
    this._construire();
    this.note(cas.arrivee, 'scene');
  }

  get f() { return this.faits; }

  note(texte, type = '') {
    this.journal.unshift({ t: this.t, texte, type });
    this._journal();
  }

  // ------------------------------------------------------------------ interface
  _construire() {
    const c = this.cas;
    this.ecran.hidden = false;
    this.ecran.innerHTML = `
      <div class="tab-cadre">
        <header>
          <div><span class="tab-motif">${c.motif}</span><span class="tab-adresse">${this.adresse}</span></div>
          <div class="tab-droite"><span id="tab-chrono">00:00</span><button type="button" id="tab-voir" title="Regarder la scène">Voir la scène</button></div>
        </header>
        <div id="tab-vitales"></div>
        <div class="tab-corps">
          <section class="tab-victime">
            <h3>Victime</h3>
            <p class="tab-qui">${c.victime}</p>
            <div id="tab-etat"></div>
            <h3>Constantes relevées</h3>
            <dl id="tab-constantes"></dl>
            <h3>Matériel</h3>
            <ul id="tab-lots"></ul>
          </section>
          <section class="tab-centre">
            <nav id="tab-onglets"></nav>
            <div id="tab-resultat"></div>
            <div id="tab-gestes"></div>
            <div id="tab-progres" hidden><span id="tab-progres-nom"></span><div class="barre"><i id="tab-progres-barre"></i></div></div>
          </section>
          <section class="tab-journal">
            <h3>Main courante</h3>
            <ol id="tab-journal"></ol>
          </section>
        </div>
      </div>`;
    $('#tab-onglets').innerHTML = ONGLETS.map(([id, nom]) => `<button type="button" data-onglet="${id}">${nom}</button>`).join('');
    $('#tab-onglets').addEventListener('click', (ev) => { const b = ev.target.closest('[data-onglet]'); if (b) { this.onglet = b.dataset.onglet; this._gestes(); } });
    const ouverture = performance.now();
    $('#tab-gestes').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-geste]');
      if (!b || b.disabled || performance.now() - ouverture < 350) return;      // pas de geste lancé par l'appui qui a ouvert la tablette
      if (b.dataset.lot) this.chercher(b.dataset.lot); else this.lancer(b.dataset.geste);     // matériel resté au VSAV : on l'envoie chercher
    });
    $('#tab-lots').addEventListener('click', (ev) => { const b = ev.target.closest('[data-lot]'); if (b && !b.disabled) this.chercher(b.dataset.lot); });
    $('#tab-voir').addEventListener('click', () => this.basculer());
    this._gestes(); this._lots(); this._constantes(); this._journal();
  }

  basculer(force) {
    const cache = force ?? !this.ecran.classList.contains('reduit');
    this.ecran.classList.toggle('reduit', cache);
    $('#tab-voir').textContent = cache ? 'Rouvrir la tablette' : 'Voir la scène';
  }

  _gestes() {
    document.querySelectorAll('#tab-onglets button').forEach((b) => b.classList.toggle('actif', b.dataset.onglet === this.onglet));
    const occupe = !!this.encours;
    $('#tab-gestes').innerHTML = Object.entries(GESTES).filter(([, g]) => g[0] === this.onglet).map(([id, [, nom, lot, duree]]) => {
      const fait = this.faits.has(id), absent = lot && this.lots[lot] !== 'place';
      const bloque = this._bloque(id);
      // matériel resté dans le VSAV : le bouton sert à l'envoyer chercher (sauf le brancard, qui se sort par son propre geste)
      const chercher = absent && !bloque && lot !== 'brancard';
      if (chercher) return `<button type="button" data-geste="${id}" data-lot="${lot}" class="absent" ${occupe ? 'disabled' : ''}>
        <b>${nom}</b><small>Aller chercher : ${LOTS[lot].nom} · ${ALLER_RETOUR} s</small></button>`;
      return `<button type="button" data-geste="${id}" class="${fait ? 'fait' : ''}" ${occupe || absent || bloque ? 'disabled' : ''}>
        <b>${nom}</b><small>${bloque || (absent ? 'Matériel resté dans le VSAV : ' + LOTS[lot].nom : lot ? LOTS[lot].nom : 'Sans matériel')} · ${duree} s</small></button>`;
    }).join('');
  }

  _lots() {
    $('#tab-lots').innerHTML = Object.entries(LOTS).map(([id, l]) => {
      const ici = this.lots[id] === 'place';
      return `<li class="${ici ? 'ici' : ''}" title="${l.contenu.join(' · ')}"><span>${l.nom}</span>${ici ? '<em>sur place</em>' : `<button type="button" data-lot="${id}" ${this.encours || id === 'brancard' ? 'disabled' : ''}>${id === 'brancard' ? 'dans le VSAV' : 'Aller chercher'}</button>`}</li>`;
    }).join('');
  }

  _constantes() {
    const k = this.connu, e = this.e;
    if (k.oxymetre) { k.spo2 = e.spo2 > 0 ? Math.round(e.spo2) + ' %' : 'pas de signal'; k.pouls = e.fc > 0 ? Math.round(e.fc) + ' /min' : 'non perçu'; }
    const lignes = [['Conscience', k.conscience], ['Respiration', k.respiration], ['Saturation', k.spo2], ['Pouls', k.pouls], ['Tension', k.tension],
      ['Peau', k.peau], ['Pupilles', k.pupilles], ['Glycémie', k.glycemie], ['Température', k.temperature], ['Douleur', k.douleur]];
    $('#tab-constantes').innerHTML = lignes.map(([n, v]) => `<div class="${v ? '' : 'vide'}"><dt>${n}</dt><dd>${v || '—'}</dd></div>`).join('');
    const etats = [];
    if (this.position) etats.push('Position ' + NOM_POSITION[this.position]);
    for (const [g, txt] of [['o2', 'Oxygène 15 L/min'], ['collier', 'Collier cervical'], ['mid', 'Matelas à dépression'], ['garrot', 'Garrot posé'], ['pansement_compressif', 'Pansement compressif'], ['dsa_pose', 'Défibrillateur en place'], ['couvrir', 'Couverte']])
      if (this.faits.has(g)) etats.push(txt);
    if (this.s.rcp && !this.s.racs) etats.push('Réanimation en cours');
    $('#tab-etat').innerHTML = etats.map((x) => `<span>${x}</span>`).join('');
    // bandeau des constantes déjà relevées (petits écrans : toujours sous les yeux)
    const vitales = [['Consc.', k.conscience], ['Resp.', k.respiration], ['SpO₂', k.spo2], ['Pouls', k.pouls], ['TA', k.tension], ['Douleur', k.douleur]].filter(([, x]) => x);
    $('#tab-vitales').innerHTML = vitales.map(([n, x]) => `<span><i>${n}</i>${x}</span>`).join('');
  }

  _journal() {
    const j = $('#tab-journal');
    if (j) j.innerHTML = this.journal.slice(0, 40).map((l) => `<li class="${l.type}"><time>${formatTemps(l.t)}</time>${l.texte}</li>`).join('');
  }

  // ------------------------------------------------------------------ règles
  _bloque(id) {
    const f = this.faits;
    if (id === 'dsa_choc' && !f.has('dsa_pose')) return 'Poser d\'abord le défibrillateur';
    if (id === 'relevage' && this.lots.brancard !== 'place') return 'Sortir d\'abord le brancard';
    if (id === 'sangler' && !f.has('relevage')) return 'Victime pas encore sur le brancard';
    if (id === 'charger' && !f.has('relevage')) return 'Victime pas encore sur le brancard';
    if (id === 'sortir_brancard' && this.lots.brancard === 'place') return 'Brancard déjà sorti';
    if ((id === 'relevage' || id === 'sortir_brancard') && this.phase === 'charge') return 'Déjà chargé';
    return '';
  }

  lancer(id) {
    if (this.encours || this.finie) return;
    const [, nom, , duree] = GESTES[id];
    this.encours = { id, nom, reste: duree, duree };
    if (id === 'sortir_brancard') this.ctx.scene3d.sortirBrancard();
    if (id === 'charger') this.ctx.scene3d.chargerBrancard();
    if (id === 'relevage') this.ctx.scene3d.installer(true);
    this._gestes(); this._lots();
  }

  chercher(lot) {
    if (this.encours || this.finie) return;
    this.encours = { lot, nom: `Un équipier va chercher : ${LOTS[lot].nom}`, reste: ALLER_RETOUR, duree: ALLER_RETOUR };
    this._gestes(); this._lots();
  }

  _resultat(id) {
    const e = this.e, c = this.cas, k = this.connu, d = c.donnees, s = this.s, f = this.faits;
    const conscient = e.conscience !== 'inconsciente';
    switch (id) {
      case 'gants': return 'Gants enfilés.';
      case 'balisage': return 'Zone balisée : cônes et triflash en place, le VSAV protège l\'intervention.';
      case 'securiser_vehicule': return 'Contact coupé, frein à main serré, véhicule calé.';
      case 'presenter': return conscient ? 'Vous vous présentez. La victime vous regarde et se calme un peu.' : 'Aucune réaction à votre voix.';
      case 'hemorragie_recherche': return d.hemorragie;
      case 'conscience': k.conscience = e.conscience; return { consciente: 'Consciente : elle répond aux questions et exécute les ordres simples.', confuse: 'Elle réagit, mais ses réponses sont lentes ou confuses.', inconsciente: 'Aucune réponse, aucune réaction : la victime est inconsciente.' }[e.conscience];
      case 'lva': return 'Voies aériennes libérées (bascule prudente de la tête, élévation du menton).';
      case 'respiration': k.respiration = e.respire ? Math.round(e.fr) + ' /min' : 'ne respire pas'; return e.respire ? `La victime respire : ${Math.round(e.fr)} mouvements par minute${e.fr > 24 ? ' (rapide)' : e.fr < 10 ? ' (lente)' : ''}.` : 'Aucun mouvement respiratoire en 10 secondes : la victime NE RESPIRE PAS.';
      case 'pouls': k.pouls = e.fc > 0 ? Math.round(e.fc) + ' /min' : 'non perçu'; return e.fc > 0 ? `Pouls : ${Math.round(e.fc)} battements par minute${e.fc > 110 ? ', rapide' : ''}${e.pas < 90 ? ', filant' : ''}.` : 'Pouls non perçu.';
      case 'spo2': k.oxymetre = true; return e.spo2 > 0 ? `Saturation : ${Math.round(e.spo2)} %${e.spo2 < 94 ? ' — inférieure à 94 %' : ''}. L'oxymètre reste en place.` : 'L\'oxymètre ne capte aucun signal.';
      case 'tension': k.tension = e.pas > 0 ? `${Math.round(e.pas)}/${Math.round(e.pad)}` : 'imprenable'; return e.pas > 0 ? `Pression artérielle : ${Math.round(e.pas)}/${Math.round(e.pad)} mmHg${e.pas < 90 ? ' — basse' : e.pas > 170 ? ' — élevée' : ''}.` : 'Tension imprenable.';
      case 'peau': k.peau = e.peau; return `Peau ${e.peau}. Recoloration cutanée ${e.pas > 0 && e.pas < 95 ? 'allongée (plus de 3 secondes)' : 'normale'}.`;
      case 'pupilles': k.pupilles = e.pupilles; return `Pupilles ${e.pupilles}.`;
      case 'glycemie': k.glycemie = e.glycemie.toFixed(2) + ' g/L'; return `Glycémie capillaire : ${e.glycemie.toFixed(2)} g/L${e.glycemie < 0.6 ? ' — hypoglycémie' : ''}.`;
      case 'temperature': k.temperature = e.temp.toFixed(1) + ' °C'; return `Température : ${e.temp.toFixed(1)} °C${e.temp > 40 ? ' — hyperthermie majeure' : e.temp < 35.5 ? ' — hypothermie' : ''}.`;
      case 'douleur': k.douleur = conscient ? Math.round(e.douleur) + '/10' : 'non évaluable'; return conscient ? `Douleur évaluée à ${Math.round(e.douleur)} sur 10.` : 'Victime inconsciente : douleur non évaluable.';
      case 'motricite': return d.motricite || (conscient ? 'Bouge les quatre membres, sensibilité normale.' : 'Victime inconsciente : non évaluable.');
      case 'fast': return d.fast;
      case 'examen': return d.examen;
      case 'interrogatoire': return d.interrogatoire;
      case 'rcp':
        if (e.respire) return 'La victime respire : la réanimation n\'est pas indiquée.';
        s.rcp = s.rcp ?? this.t;
        return this.lots.o2 === 'place' ? 'Réanimation en cours : 30 compressions, 2 insufflations au ballon avec oxygène. L\'équipier prend le relais des compressions.' : 'Compressions thoraciques en cours (pas de ballon insufflateur sur place).';
      case 'insufflations5': return e.respire ? 'La victime respire déjà.' : 'Cinq insufflations réalisées : le thorax se soulève.';
      case 'dsa_pose': return 'Électrodes collées sur le thorax nu et sec. Le défibrillateur est en marche.';
      case 'dsa_choc': {
        if (e.respire) return 'Analyse en cours… Choc non indiqué.';
        if (c.enfant) return 'Analyse… Choc non indiqué : poursuivez la réanimation.';
        s.chocs = (s.chocs || 0) + 1;
        this.ctx.sons.charge();
        if (s.rcp != null && s.chocs >= 2) { s.racs = true; e.conscience = 'inconsciente'; return 'Choc délivré. Reprise d\'une activité cardiaque : un pouls est perçu, la victime recommence à respirer !'; }
        return s.rcp != null ? 'Choc recommandé — écartez-vous — choc délivré. Reprenez immédiatement la réanimation.' : 'Choc délivré, mais personne ne masse : débutez la réanimation !';
      }
      case 'o2': return 'Oxygène à 15 L/min au masque à haute concentration.';
      case 'aspiration': return 'Sécrétions aspirées, la bouche est dégagée.';
      case 'canule': return conscient ? 'La victime est consciente : elle ne tolère pas la canule.' : 'Canule oropharyngée en place.';
      case 'bilan_radio': return this._regulation();
      case 'smur': return 'CODIS : « Reçu, une équipe médicale du SMUR de Montélimar est engagée. »';
      case 'renfort': return 'CODIS : « Reçu, gendarmerie et renforts demandés sur votre intervention. »';
      case 'sortir_brancard': this.lots.brancard = 'place'; this.phase = 'brancard'; return 'Portes arrière ouvertes, le brancard est sorti et amené près de la victime.';
      case 'relevage': this.phase = 'installe'; return `Relevage à plusieurs. La victime est installée sur le brancard${this.position || f.has('mid') ? ', ' + NOM_POSITION[f.has('mid') ? 'mid' : this.position] : ''}.`;
      case 'sangler': return 'Sangles bouclées et ajustées.';
      case 'charger': this.phase = 'charge'; return 'Brancard chargé et verrouillé dans la cellule. Vous pouvez partir.';
      case 'traitement': return conscient ? 'Vous aidez la victime à prendre le traitement qui lui a été prescrit.' : 'Victime inconsciente : impossible.';
      case 'boire': return 'La victime boit quelques gorgées.';
      case 'marcher': return 'Vous faites lever la victime…';
      default: return GESTES[id][1] + ' : fait.';
    }
  }

  _regulation() {
    const c = this.cas, f = this.faits;
    const mesures = ['conscience', 'respiration', 'spo2', 'pouls', 'tension'].filter((x) => f.has(x)).length;
    if (mesures < 3) return 'Médecin régulateur : « Votre bilan est incomplet. Rappelez-moi avec la conscience, la respiration, le pouls et la tension. »';
    this.s.bilanComplet = true;
    return c.smur ? 'Médecin régulateur : « Bien reçu. Je vous envoie le SMUR. Poursuivez les gestes, puis transport médicalisé vers le centre hospitalier de Montélimar. »'
      : 'Médecin régulateur : « Bien reçu. Transport non médicalisé vers les urgences du centre hospitalier de Montélimar. Surveillez et rappelez si aggravation. »';
  }

  _finGeste(id) {
    const c = this.cas;
    if (!this.faits.has(id)) this.faits.set(id, this.t);
    if (POSITIONS.includes(id)) this.position = id;
    const interdit = c.eviter && c.eviter.find(([g]) => g === id);
    const texte = this._resultat(id);
    $('#tab-resultat').innerHTML = `<b>${GESTES[id][1]}</b>${texte}`;
    this.note(`<b>${GESTES[id][1]}</b> — ${texte}`);
    if (interdit) {
      this.erreurs.push(interdit);
      this.note('À éviter : ' + interdit[1], 'alerte');
      this.ctx.sons.erreur();
    } else this.ctx.sons.moniteur();
  }

  // ------------------------------------------------------------------ déroulement
  maj(dt) {
    if (this.finie) return;
    this.t += dt;
    const e = this.e, avant = e.conscience, respirait = e.respire;
    if (this.cas.evolution) this.cas.evolution(e, dt, this.faits, this.s);
    // arrêt respiratoire prolongé d'une victime inconsciente : besoin de réanimation
    if (this.cas.id === 'noyade' && this.faits.has('rcp') && this.faits.has('insufflations5') && this.t - this.faits.get('rcp') > 40) this.s.racs = true;
    if (e.conscience !== avant) { this.note(e.conscience === 'inconsciente' ? 'La victime perd connaissance !' : `La victime est maintenant ${e.conscience}.`, e.conscience === 'inconsciente' ? 'alerte' : 'bien'); if (e.conscience === 'inconsciente') this.ctx.sons.erreur(); else this.ctx.sons.reussite(); this.connu.conscience = e.conscience; }
    if (e.respire && !respirait) this.ctx.sons.reussite();
    if (this.encours) {
      const a = this.encours;
      a.reste -= dt;
      $('#tab-progres').hidden = false;
      $('#tab-progres-nom').textContent = a.nom + '…';
      $('#tab-progres-barre').style.width = Math.round((1 - a.reste / a.duree) * 100) + '%';
      if (a.reste <= 0) {
        this.encours = null;
        $('#tab-progres').hidden = true;
        if (a.lot) { this.lots[a.lot] = 'place'; this.note(`${LOTS[a.lot].nom} : apporté près de la victime.`); this.ctx.scene3d.poser(a.lot); }
        else this._finGeste(a.id);
        this._gestes(); this._lots();
      }
    }
    $('#tab-chrono').textContent = formatTemps(this.t);
    this.img = (this.img || 0) + 1;
    if (this.img % 10 === 0) this._constantes();
  }

  fermer() { this.finie = true; this.ecran.hidden = true; this.ecran.innerHTML = ''; }

  /** Notation de la prise en charge. Renvoie { points, max, lignes, erreurs, duree }. */
  noter() {
    const c = this.cas, f = this.faits;
    const arret = c.constantes.respire === false;
    const evites = new Set((c.eviter || []).map(([g]) => g));
    const liste = c.attendus.map(([g, p, d]) => [g, p, d]);
    for (const [g, p] of SOCLE) {
      if (liste.some(([x]) => x === g) || evites.has(g)) continue;
      if (arret && ['spo2', 'pouls', 'tension', 'interrogatoire', 'couvrir'].includes(g) && !['noyade'].includes(c.id)) continue;
      liste.push([g, p, 0]);
    }
    let points = 0, max = 0;
    const lignes = liste.map(([g, p, d]) => {
      max += p;
      const t = f.get(g);
      const etat = t == null ? 'manque' : d && t > d ? 'tard' : 'ok';
      points += etat === 'ok' ? p : etat === 'tard' ? p / 2 : 0;
      return { nom: GESTES[g][1], etat, points: p, delai: d };
    });
    // position de transport
    max += 4;
    const bonne = c.transport === 'mid' ? f.has('mid') : this.position === c.transport || (c.transport === 'demi_assis' && this.position === 'assis');
    if (bonne) points += 4;
    lignes.push({ nom: `Position de transport : ${NOM_POSITION[c.transport]}`, etat: bonne ? 'ok' : 'manque', points: 4 });
    return { points, max, lignes, erreurs: this.erreurs, duree: this.t, rappel: c.rappel };
  }
}
