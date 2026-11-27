// L'ordinateur du DJ : bibliothèque musicale (recherche, tri, genres), chargement sur les platines, import de fichiers.
import { $, $$, mmss, echapper } from './outils.js';

const COLONNES = [['titre', 'Titre'], ['artiste', 'Artiste'], ['genre', 'Genre'], ['bpm', 'BPM'], ['camelot', 'Ton'], ['energie', 'Énergie'], ['duree', 'Durée']];

/** Deux tons se mélangent bien s'ils sont voisins sur la roue de Camelot (même chiffre, ou chiffre voisin de même lettre). */
export function tonsCompatibles(a, b) {
  if (!a || !b) return false;
  const na = parseInt(a, 10), nb = parseInt(b, 10), la = a.slice(-1), lb = b.slice(-1);
  if (na === nb) return true;
  return la === lb && (Math.abs(na - nb) === 1 || Math.abs(na - nb) === 11);
}
export function temposCompatibles(a, b, marge = 0.07) {
  if (!a || !b) return false;
  return [1, 2, 0.5].some((k) => Math.abs((a * k) / b - 1) <= marge);
}

export class Pc {
  constructor(el, biblio, moteur, cabine, surCharge = () => {}) {
    this.el = el; this.b = biblio; this.m = moteur; this.cabine = cabine; this.surCharge = surCharge;
    this.tri = ['genre', 1]; this.genre = ''; this.recherche = ''; this.filtres = {};
    el.innerHTML = [
      '<div class="pc-barre"><b>Bibliothèque</b>',
      '<input type="search" placeholder="Rechercher un titre, un artiste…" aria-label="Rechercher">',
      '<span class="genres"></span>',
      '<label class="bouton importer" title="Vos propres fichiers audio : MP3, WAV, OGG, FLAC, M4A"><input type="file" multiple accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.opus" hidden>Importer mes fichiers…</label></div>',
      '<div class="pc-corps"><table><thead><tr><th class="ch">Charger</th>',
      COLONNES.map(([c, n]) => '<th data-tri="' + c + '">' + n + '</th>').join(''),
      '<th>★</th></tr></thead><tbody></tbody></table></div>',
      '<div class="pc-pied"><span class="etat">Cliquez sur A ou B pour charger un morceau sur une platine.</span>',
      '<span class="legende"><i class="ok"></i>tempo et ton compatibles avec le morceau en cours <i class="tempo"></i>tempo compatible</span></div>',
    ].join('');
    $('input[type=search]', el).addEventListener('input', (e) => { this.recherche = e.target.value.toLowerCase(); this.rendre(); });
    $('input[type=file]', el).addEventListener('change', (e) => {
      const n = this.b.importer(e.target.files).length, s = n > 1 ? 's' : '';
      this.etat(n ? n + ' fichier' + s + ' ajouté' + s + ' : le tempo est calculé au premier chargement sur une platine.' : 'Aucun fichier audio reconnu.');
      e.target.value = '';
      if (n) this.genre = 'Importé';
      this.rendre();
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-charger]'), th = e.target.closest('th[data-tri]'), g = e.target.closest('[data-genre]'), f = e.target.closest('[data-favori]');
      if (b) this.charger(b.closest('tr').dataset.id, +b.dataset.charger);
      else if (th) { this.tri = [th.dataset.tri, this.tri[0] === th.dataset.tri ? -this.tri[1] : 1]; this.rendre(); }
      else if (g) { this.genre = g.dataset.genre; this.rendre(); }
      else if (f) { const m = this.b.fiche(this._id(f.closest('tr').dataset.id)); m.favori = !m.favori; this.rendre(); }
    });
    el.addEventListener('dblclick', (e) => {              // double-clic : charge sur la platine libre (ou à l'arrêt)
      const tr = e.target.closest('tbody tr');
      if (!tr || !tr.dataset.id || e.target.closest('button')) return;
      const libre = this.m.platines.findIndex((p) => !p.morceau), arret = this.m.platines.findIndex((p) => !p.lecture);
      this.charger(tr.dataset.id, libre >= 0 ? libre : arret >= 0 ? arret : 0);
    });
    biblio.surChange = () => this.rendre();
    this.rendre();
  }

  _id(t) { return /^\d+$/.test(t) ? +t : t; }
  etat(t) { $('.etat', this.el).textContent = t; }

  /** Morceau « de référence » : celui que le public entend le plus. */
  reference() {
    const [a, b] = this.m.platines;
    const pa = a.morceau ? this.m.presence(0) : 0, pb = b.morceau ? this.m.presence(1) : 0;
    return pa === 0 && pb === 0 ? null : pa >= pb ? a : b;
  }

  rendre() {
    const el = this.el, genres = ['', '★', ...new Set(this.b.morceaux.map((m) => m.genre))];
    $('.genres', el).innerHTML = genres.map((g) => '<button type="button" data-genre="' + echapper(g) + '" class="' + (g === this.genre ? 'actif' : '') + '">' + (g === '' ? 'Tout' : echapper(g)) + '</button>').join('');
    const ref = this.reference(), [cle, sens] = this.tri;
    const liste = this.b.morceaux.filter((m) => (this.genre === '' || (this.genre === '★' ? m.favori : m.genre === this.genre))
      && (!this.recherche || (m.titre + ' ' + m.artiste + ' ' + m.genre).toLowerCase().includes(this.recherche)));
    liste.sort((x, y) => { const a = x[cle] ?? '', b = y[cle] ?? ''; return (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'fr')) * sens || x.titre.localeCompare(y.titre, 'fr'); });
    const sur = this.m.platines.map((p) => p.morceau && p.morceau.id);
    $('tbody', el).innerHTML = liste.map((m) => {
      const compat = ref && ref.morceau.id !== m.id && temposCompatibles(m.bpm, ref.bpm) ? (tonsCompatibles(m.camelot, ref.morceau.camelot) ? 'ok' : 'tempo') : '';
      return '<tr data-id="' + m.id + '" class="' + compat + (sur.includes(m.id) ? ' sur-platine' : '') + (m.joue ? ' joue' : '') + '">'
        + '<td class="ch"><button type="button" data-charger="0">A</button><button type="button" data-charger="1">B</button></td>'
        + '<td>' + echapper(m.titre) + (m.demande ? ' <em class="dem">demandé</em>' : '') + '</td><td>' + echapper(m.artiste) + '</td><td>' + echapper(m.genre) + '</td>'
        + '<td class="n">' + (m.bpm ? Math.round(m.bpm * 10) / 10 : '…') + '</td><td class="n">' + (m.camelot || '—') + '</td>'
        + '<td class="e">' + (m.energie ? '●'.repeat(m.energie) + '<i>' + '●'.repeat(5 - m.energie) + '</i>' : '…') + '</td>'
        + '<td class="n">' + (m.duree ? mmss(m.duree) : '—') + '</td><td><button type="button" class="fav' + (m.favori ? ' actif' : '') + '" data-favori>★</button></td></tr>';
    }).join('') || '<tr><td colspan="9" class="vide">Aucun morceau ne correspond.</td></tr>';
    $$('th[data-tri]', el).forEach((th) => th.classList.toggle('tri', th.dataset.tri === cle));
  }

  /** Charge un morceau sur la platine i (refusé si elle est en train de jouer pour le public). */
  async charger(idTexte, i) {
    const id = this._id(idTexte), p = this.m.platines[i], f = this.b.fiche(id), L = 'AB'[i];
    if (!f) return false;
    if (p.lecture && this.m.presence(i) > 0.05) { this.etat('La platine ' + L + ' joue pour le public : baissez-la ou arrêtez-la avant d\'y charger un autre morceau.'); return false; }
    this.etat('Préparation de « ' + f.titre + ' »…');
    try {
      const d = await this.b.obtenir(id, (x) => this.etat('Préparation de « ' + f.titre + ' »… ' + Math.round(x * 100) + ' %'));
      p.pause();
      p.charger(d);
      this.cabine.charge(i);
      f.joue = Date.now();
      this.etat('« ' + f.titre + ' » est sur la platine ' + L + ' — ' + d.bpm + ' BPM' + (f.source === 'fichier' ? ' (tempo détecté ; boutons « grille » de la platine si les temps sont décalés)' : '') + '.');
      this.rendre();
      this.surCharge(i, d);
      return true;
    } catch (e) {
      this.etat('Impossible de lire « ' + f.titre + ' » : ' + (e.message || e) + '. Essayez un autre format (MP3 ou WAV).');
      return false;
    }
  }
}
