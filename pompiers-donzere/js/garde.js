// La garde : alertes, trajet vers l'intervention, prise en charge, transport à l'hôpital, plein de carburant, bilan noté.
import * as THREE from 'three';
import { CAS } from './cas.js';
import { Intervention } from './intervention.js';
import { Scene3D } from './scene3d.js';
import { $, alea, clamp, formatTemps } from './outils.js';

const VOIES = { R: 'rue', AV: 'avenue', RTE: 'route', CHE: 'chemin', IMP: 'impasse', PL: 'place', CRS: 'cours', BD: 'boulevard', ALL: 'allée', LOT: 'lotissement',
  QUA: 'quartier', MTE: 'montée', TRA: 'traverse', SQ: 'square', PAS: 'passage', RPT: 'rond-point', CHS: 'chaussée', VC: 'voie communale', RES: 'résidence' };
const PETITS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'à', 'au', 'aux', 'en', 'sur']);

/** « AV JEAN MOULIN » -> « avenue Jean Moulin » */
export function rueLisible(nom) {
  if (!nom) return '';
  const mots = nom.trim().split(/\s+/);
  const tete = VOIES[mots[0]];
  const reste = (tete ? mots.slice(1) : mots).map((m) => {
    const b = m.toLowerCase();
    return PETITS.has(b) ? b : b.replace(/(^|[-'])([a-zàâçéèêëîïôûùüÿ])/g, (x, s, c) => s + c.toUpperCase());
  });
  return (tete ? tete + ' ' : '') + reste.join(' ');
}

export class Garde {
  constructor(ctx) {
    Object.assign(this, ctx);
    this.scene3d = new Scene3D(ctx.scene, ctx.vsav, ctx.monde, ctx.sons);
    this.phase = 'attente';
    this.delai = 9;
    this.total = 0; this.nb = 0;
    this.recents = [];
    this.rnd = alea((Date.now() % 1e6) + 17);
    this.stats = {};
    this.angle = 0;
  }

  async charger() {
    try { this.enseignes = await (await fetch('data/enseignes.json')).json(); } catch (e) { this.enseignes = []; }
  }

  /** Pompe à gazole du centre de secours (au bord de la route, près du point de stationnement). */
  _pompe3d() {
    const st = this.monde.station, m = this.monde;
    if (!st) return;
    const r = m.routeProche(st.x, st.z, 60);
    const nx = r ? -r.dz : 1, nz = r ? r.dx : 0, ecart = (r ? r.r.w / 2 : 3) + 1.6;
    const x = st.x + nx * ecart, z = st.z + nz * ecart;
    const g = new THREE.Group();
    const mat = (c, rug = 0.5, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rug, metalness: metal });
    const boite = (w, h, d, mt, y, dx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mt); o.position.set(dx, y, 0); o.castShadow = true; g.add(o); return o; };
    boite(1.5, 0.16, 1.0, mat(0x9a9a96, 0.9), 0.08);                // îlot en béton
    boite(0.62, 1.55, 0.42, mat(0xe9ecef, 0.4), 0.93);              // corps de la pompe
    boite(0.64, 0.34, 0.44, mat(0xd6281a, 0.45), 1.5);              // bandeau rouge
    boite(0.4, 0.26, 0.02, mat(0x0c1016, 0.2), 1.12).position.z = 0.22;
    boite(0.05, 0.9, 0.05, mat(0x15171a, 0.6), 0.75, 0.4);          // pistolet et flexible
    g.position.set(x, m.hauteur(x, z), z);
    g.rotation.y = Math.atan2(nx, nz);
    this.scene.add(g);
  }

  commencer() {
    const v = this.vsav;
    this._pompe3d();
    this.hud.mission('Disponible', this.monde.caserne.nom, 'Mettez le contact (<b>M</b>), bouclez votre ceinture (<b>C</b>), desserrez le frein à main (<b>P</b>). En attente d\'un départ…', null);
    v.evenement = (type, force) => {
      if (type === 'choc') { this.sons.choc(force); this.stats.chocs = (this.stats.chocs || 0) + 1; this.hud.annonce('Choc !', 'Conduisez prudemment : vous êtes responsable du véhicule.', 2.5); }
      if (type === 'panne') this.hud.annonce('Panne sèche', 'Le réservoir est vide.', 6);
    };
  }

  // ------------------------------------------------------------------ choix du lieu
  _lieu(cas) {
    const m = this.monde, d = m.d, v = this.vsav, rnd = this.rnd;
    const bord = (x, z) => Math.abs(x) < m.L / 2 - 90 && Math.abs(z) < m.H / 2 - 90;
    const loin = (x, z) => { const dd = Math.hypot(x - v.x, z - v.z); return dd > 280 && dd < 1700; };
    const route = (x, z) => { const r = m.routeProche(x, z, 60); return r && r.d < 42 ? r : null; };
    const numero = () => 1 + Math.floor(rnd() * 48);
    const essayer = (liste, fn) => { for (let k = 0; k < 60 && liste.length; k++) { const r = fn(liste[Math.floor(rnd() * liste.length)]); if (r) return r; } return null; };
    const batiment = (filtre, prefixe) => essayer(d.batiments, (b) => {
      if (!filtre(b) || !bord(b.cx, b.cz) || !loin(b.cx, b.cz)) return null;
      const r = route(b.cx, b.cz);
      return r && r.r.nom ? { x: b.cx, z: b.cz, r, adresse: `${prefixe}${numero()} ${rueLisible(r.r.nom)}` } : null;
    });
    let res = null;
    if (cas.lieu === 'commerce') {
      res = essayer(this.enseignes.filter((e) => ['bar', 'restaurant', 'boulangerie', 'tabac'].includes(e.type)), (e) => {
        const r = route(e.x, e.z);
        return r && loin(e.x, e.z) ? { x: e.x, z: e.z, r, adresse: `${e.nom}, ${rueLisible(r.r.nom)}` } : null;
      });
    } else if (cas.lieu === 'stade') {
      res = essayer(d.lieux.filter((l) => /Stade|sportif/i.test(l.n)), (l) => { const r = m.routeProche(l.x, l.z, 200); return r ? { x: l.x, z: l.z, r, adresse: l.nom || 'Stade municipal' } : null; });
    } else if (cas.lieu === 'chantier') {
      res = batiment((b) => b.h >= 5, 'chantier au ');
    } else if (cas.lieu === 'voie_publique' || cas.lieu === 'route') {
      const grandes = cas.lieu === 'route';
      res = essayer(d.routes, (rt) => {
        if (!rt.ok || !rt.nom || (grandes ? rt.w < 5.6 : rt.n !== 'Route à 1 chaussée')) return null;
        const k = Math.floor(rnd() * (rt.p.length / 2 - 1)) * 2;
        const x = (rt.p[k] + rt.p[k + 2]) / 2, z = (rt.p[k + 1] + rt.p[k + 3]) / 2;
        if (!bord(x, z) || !loin(x, z)) return null;
        const l = Math.hypot(rt.p[k + 2] - rt.p[k], rt.p[k + 3] - rt.p[k + 1]) || 1;
        return { x, z, r: { x, z, d: 0, dx: (rt.p[k + 2] - rt.p[k]) / l, dz: (rt.p[k + 3] - rt.p[k + 1]) / l, r: rt }, adresse: `${rueLisible(rt.nom)}${grandes ? '' : ', à hauteur du n° ' + numero()}`, surRoute: true };
      });
    }
    if (!res) res = batiment((b) => (b.u === 'Résidentiel' || b.u === 'Indifférencié') && b.h >= 3.5, '');
    if (!res) { const r = m.routeProche(0, 0, 900); res = { x: r.x, z: r.z, r, adresse: rueLisible(r.r.nom) || 'centre-ville' }; }
    return res;
  }

  nouvelleAlerte() {
    // tirage pondéré, sans reprendre les derniers cas
    const dispo = CAS.filter((c) => !this.recents.includes(c.id));
    let somme = dispo.reduce((s, c) => s + c.poids, 0), t = this.rnd() * somme, cas = dispo[0];
    for (const c of dispo) { t -= c.poids; if (t <= 0) { cas = c; break; } }
    this.lancer(cas);
  }

  /** Démarre une intervention sur le cas donné (utilisé aussi par les essais). */
  lancer(cas) {
    this.recents.push(cas.id);
    if (this.recents.length > 8) this.recents.shift();
    const lieu = this._lieu(cas);
    this.cas = cas; this.lieu = lieu;
    this.adresse = lieu.adresse.charAt(0).toUpperCase() + lieu.adresse.slice(1) + ', Donzère';
    this.cible = { x: lieu.r.x, z: lieu.r.z, nom: this.adresse };
    this.stats = { chocs: 0, sansCeinture: 0, sansGyro: 0 };
    this.chrono = 0;
    this.distance = Math.hypot(this.cible.x - this.vsav.x, this.cible.z - this.vsav.z);
    this.phase = 'alerte';
    this.hud.destination(this.cible, this.vsav);
    this.sons.alerte();
    this.hud.annonce('Départ VSAV', `${cas.motif} — ${this.adresse}`, 8);
    this.hud.mission('Départ', cas.motif, `${cas.depart}.<br><b>${this.adresse}</b>`, 0);
  }

  // ------------------------------------------------------------------ étapes
  arriver() {
    const v = this.vsav, m = this.monde, l = this.lieu;
    v.freinMain = true; v.deuxTons = false;
    this.jeu.etat = 'intervention';
    this.phase = 'intervention';
    this.stats.route = this.chrono;
    // emplacement de la victime : vers le lieu de l'appel, à quelques mètres du VSAV, hors des murs
    const dx = l.x - v.x, dz = l.z - v.z, dist = Math.hypot(dx, dz) || 1;
    let p = null;
    for (let r = Math.min(dist, 11); r > 3 && !p; r -= 1.2) {
      const x = v.x + (dx / dist) * r, z = v.z + (dz / dist) * r;
      if (!m.collision(x, z, 1.4)) p = new THREE.Vector3(x, m.hauteur(x, z), z);
    }
    if (!p) { const q = v.point(2.8, 0, v.arriereZ - 4); p = new THREE.Vector3(q.x, m.hauteur(q.x, q.z), q.z); }
    this.spot = p;
    this.inter = new Intervention({ hud: this.hud, sons: this.sons, vsav: v, scene3d: this.scene3d }, this.cas, this.adresse);
    this.scene3d.installerScene(p, this.inter.lots);
    const cr = v.point(0, 0, v.arriereZ - 2);
    this.centre = new THREE.Vector3((p.x + cr.x) / 2, p.y + 1, (p.z + cr.z) / 2);
    // angle de vue : la direction la plus dégagée autour de la scène
    const libre = (a) => { let r = 2; while (r < 11 && !m.collision(this.centre.x + Math.sin(a) * (r + 1), this.centre.z + Math.cos(a) * (r + 1), 0.9)) r += 1; return r; };
    const base = Math.atan2(v.x - p.x, v.z - p.z) + 1.9;
    let meilleur = base, mr = -1;
    for (let k = 0; k < 16; k++) { const a = base + (k * Math.PI) / 8, r = libre(a) - Math.min(k, 16 - k) * 0.15; if (r > mr) { mr = r; meilleur = a; } }
    this.angle = meilleur;
    this.sons.radio();
    this.hud.destination(null, v);
    this.hud.mission('Sur les lieux', this.cas.motif, this.adresse, null);
    this.hud.aide(null);
    $('#hud').classList.add('intervention');
  }

  partir() {
    this.note = this.inter.noter();
    this.inter.fermer();
    this.scene3d.ranger();
    $('#hud').classList.remove('intervention');
    this.jeu.etat = 'conduite';
    this.phase = 'transport';
    this.chrono = 0;
    this.stats.chocsRoute = this.stats.chocs; this.stats.chocs = 0;
    const h = this.monde.hopital;
    this.cible = { x: h.x, z: h.z, nom: 'Centre hospitalier de Montélimar (N7 nord)' };
    this.distanceH = Math.hypot(h.x - this.vsav.x, h.z - this.vsav.z);
    this.hud.destination(this.cible, this.vsav);
    this.sons.radio();
    this.hud.annonce('Transport', 'Direction le centre hospitalier de Montélimar par la N7. Conduite souple : la victime est à bord.', 7);
    this.hud.mission('Transport', 'Centre hospitalier de Montélimar', 'Sortie nord de Donzère par la N7.<br>Conduite souple : la victime est à bord.', 0);
  }

  finir() {
    const s = this.stats, n = this.note;
    this.jeu.etat = 'bilan';
    this.phase = 'bilan';
    this.vsav.deuxTons = false; this.vsav.gyro = false;
    this.hud.destination(null, this.vsav);
    const refRoute = this.distance * 1.35 / 11 + 25, refH = this.distanceH * 1.35 / 12 + 10;
    const soins = 60 * (n.points / n.max);
    const erreurs = Math.min(20, n.erreurs.length * 5);
    const delai = 15 * clamp(refRoute / Math.max(s.route, 1), 0, 1);
    const place = 5 * clamp(1 - (n.duree - 300) / 420, 0, 1);
    const conduite = clamp(10 - 3 * (s.chocsRoute + s.chocs) - (s.sansCeinture > 6 ? 3 : 0) - (s.sansGyro > 15 ? 2 : 0), 0, 10);
    const transport = 10 * clamp(refH / Math.max(this.chrono, 1), 0.4, 1);
    const total = Math.round(clamp(soins - erreurs + delai + place + conduite + transport, 0, 100));
    this.total += total; this.nb++;
    const mention = total >= 90 ? 'Excellent' : total >= 75 ? 'Très bien' : total >= 60 ? 'Bien' : total >= 45 ? 'Passable' : 'À revoir';
    const ico = { ok: '✓', tard: '◐', manque: '✗' };
    $('#bilan').hidden = false;
    $('#bilan').innerHTML = `
      <div class="bilan-cadre">
        <header><div><span class="tab-motif">${this.cas.motif}</span><span class="tab-adresse">${this.adresse}</span></div>
          <div class="bilan-note"><b>${total}</b><span>/100 · ${mention}</span></div></header>
        <div class="bilan-corps">
          <section>
            <h3>Prise en charge de la victime <em>${Math.round(soins)}/60</em></h3>
            <ul class="bilan-lignes">${n.lignes.map((l) => `<li class="${l.etat}"><i>${ico[l.etat]}</i>${l.nom}${l.etat === 'tard' ? ' <small>(trop tard)</small>' : ''}</li>`).join('')}</ul>
          </section>
          <section>
            ${n.erreurs.length ? `<h3>Gestes à éviter <em>−${erreurs}</em></h3><ul class="bilan-lignes">${n.erreurs.map(([, r]) => `<li class="manque"><i>!</i>${r}</li>`).join('')}</ul>` : ''}
            <h3>Délais et conduite</h3>
            <ul class="bilan-lignes simple">
              <li>Trajet aller : ${formatTemps(s.route)} <em>${Math.round(delai)}/15</em></li>
              <li>Temps sur les lieux : ${formatTemps(n.duree)} <em>${Math.round(place)}/5</em></li>
              <li>Conduite${s.chocsRoute + s.chocs ? ` (${s.chocsRoute + s.chocs} choc${s.chocsRoute + s.chocs > 1 ? 's' : ''})` : ''}${s.sansCeinture > 6 ? ', ceinture non bouclée' : ''}${s.sansGyro > 15 ? ', sans avertisseurs' : ''} <em>${conduite}/10</em></li>
              <li>Transport à l'hôpital : ${formatTemps(this.chrono)} <em>${Math.round(transport)}/10</em></li>
            </ul>
            <h3>À retenir</h3>
            <p class="bilan-rappel">${n.rappel}</p>
            <p class="bilan-moyenne">Garde en cours : ${this.nb} intervention${this.nb > 1 ? 's' : ''}, moyenne ${Math.round(this.total / this.nb)}/100</p>
            <button type="button" id="bilan-suite">Retour disponible</button>
          </section>
        </div>
      </div>`;
    $('#bilan-suite').addEventListener('click', () => this.reprendre());
    this.sons.reussite();
  }

  reprendre() {
    const v = this.vsav, m = this.monde, h = m.hopital;
    $('#bilan').hidden = true; $('#bilan').innerHTML = '';
    // retour de Montélimar : le VSAV réapparaît à l'entrée nord, tourné vers Donzère
    const r = m.routeProche(h.x, h.z + 60, 300) || { x: h.x, z: h.z, dx: 0, dz: 1 };
    const versSud = r.dz >= 0 ? 1 : -1;
    v.placer(r.x, r.z, Math.atan2(r.dx * versSud, r.dz * versSud));
    v.carburant = Math.max(2, v.carburant - 9);
    v.km += 31;
    this.jeu.etat = 'conduite';
    this.phase = 'attente';
    this.delai = 28 + this.rnd() * 25;
    const c = m.caserne, rc = m.routeProche(c.x, c.z, 300);
    this.hud.destination({ x: rc ? rc.x : c.x, z: rc ? rc.z : c.z, nom: c.nom }, v);
    this.hud.mission('Disponible', 'Retour au centre de secours', v.carburant < 16 ? 'Pensez à faire le plein à la pompe du centre de secours.' : 'Vous restez disponible par radio pour un nouveau départ.', null);
    this.sons.radio();
  }

  // ------------------------------------------------------------------ boucle
  touche(code) {
    if (this.phase === 'intervention') {
      if (code === 'Escape' || code === 'KeyV' || code === 'Tab') this.inter.basculer();
      return true;
    }
    if (this.phase === 'bilan') return true;
    if (code === 'KeyF' && this.phase === 'alerte' && this.surPlace) { this.arriver(); return true; }
    return false;
  }

  maj(dt) {
    const v = this.vsav, hud = this.hud;
    this.scene3d.maj(dt);
    if (this.phase === 'attente') {
      this.delai -= dt;
      if (this.delai <= 0) this.nouvelleAlerte();
    } else if (this.phase === 'alerte') {
      this.chrono += dt;
      if (v.moteur && !v.ceinture && v.vitesseKmh > 8) this.stats.sansCeinture += dt;
      if (!v.gyro && v.vitesseKmh > 8) this.stats.sansGyro += dt;
      const d = Math.hypot(this.cible.x - v.x, this.cible.z - v.z);
      this.surPlace = d < 32 && Math.abs(v.v) < 0.7;
      hud.mission('Départ', this.cas.motif, `${this.cas.depart}.<br><b>${this.adresse}</b>`, this.chrono);
      hud.aide(this.surPlace ? '<kbd>F</kbd> Se présenter sur les lieux' : d < 32 ? 'Arrêtez le véhicule' : null);
    } else if (this.phase === 'intervention') {
      this.inter.maj(dt);
      if (this.inter.phase === 'charge' && !this.inter.encours) {
        this.attenteDepart = (this.attenteDepart || 0) + dt;
        if (this.attenteDepart > 2.2) { this.attenteDepart = 0; this.partir(); }
      }
    } else if (this.phase === 'transport') {
      this.chrono += dt;
      const d = Math.hypot(this.cible.x - v.x, this.cible.z - v.z);
      $('#m-chrono').textContent = formatTemps(this.chrono);
      if (d < 55) this.finir();
    }
    if (this.phase !== 'intervention' && this.phase !== 'bilan') this._pompe(dt);
  }

  /** Plein de carburant à la pompe du centre de secours. */
  _pompe(dt) {
    const v = this.vsav, st = this.monde.station;
    if (!st) return;
    const pres = Math.hypot(st.x - v.x, st.z - v.z) < 11 && Math.abs(v.v) < 0.5;
    const plein = v.carburant >= v.reservoir - 0.05;
    if (pres && !plein && this.phase !== 'alerte') {
      if (v.moteur) this.hud.aide('Coupez le moteur (<kbd>M</kbd>) pour faire le plein');
      else {
        const sert = this.entrees.tenue('KeyF');
        this.hud.aide(sert ? `Plein en cours… ${v.carburant.toFixed(0)} L` : 'Maintenez <kbd>F</kbd> : faire le plein de gazole');
        if (sert) v.carburant = Math.min(v.reservoir, v.carburant + 5.5 * dt);
        this.sons.pompe(sert);
        this.servait = sert;
        return;
      }
    } else if (this.phase === 'attente') this.hud.aide(null);
    if (this.servait) { this.sons.pompe(false); this.servait = false; }
  }

  /** Pendant l'intervention, la caméra regarde la scène. Renvoie vrai si elle a pris la main. */
  piloteCamera(dt, cam) {
    if (this.phase !== 'intervention') return false;
    const a = this.angle + cam.lacet, c = this.centre, m = this.monde;
    let r = 2;
    while (r < 10.5 && !m.collision(c.x + Math.sin(a) * (r + 1), c.z + Math.cos(a) * (r + 1), 0.9)) r += 0.5;
    // rue étroite : la caméra monte et regarde la scène d'en haut
    const haut = r < 6 ? 5 + (6 - r) * 2.6 : 2.4;
    const x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
    const y = Math.max(c.y + haut + cam.tangage * 5, m.hauteur(x, z) + 1);
    this.camera.position.lerp(new THREE.Vector3(x, y, z), 1 - Math.exp(-3 * dt));
    this.camera.fov = 52;
    this.camera.lookAt(c);
    this.camera.updateProjectionMatrix();
    return true;
  }
}
