// Le VSAV : chargement du modèle, conduite, suspension, feux (gyroleds, pénétration, stop, clignotants), portes.
import * as THREE from 'three';
import { chargerModele } from './monde.js';
import { amorti, clamp } from './outils.js';

const V_MAX = 38;            // m/s (≈ 137 km/h)
const RESERVOIR = 80;        // litres

function halo() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const d = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  d.addColorStop(0, 'rgba(255,255,255,1)');
  d.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  d.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  d.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = d;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Vehicule {
  constructor(scene, monde) {
    this.scene = scene;
    this.monde = monde;
    this.groupe = new THREE.Group();      // posé sur le terrain (position, cap, pente)
    this.caisse = new THREE.Group();      // carrosserie suspendue (roulis, tangage)
    this.groupe.add(this.caisse);
    scene.add(this.groupe);
    this.x = 0; this.z = 0; this.cap = 0; this.v = 0;
    this.braquage = 0;
    this.moteur = false;
    this.rapport = 'N';
    this.carburant = RESERVOIR * 0.62;
    this.reservoir = RESERVOIR;
    this.km = 48213.4;
    this.ceinture = false;
    this.gyro = false; this.deuxTons = false; this.balisage = false;
    this.codes = false; this.clignotant = 0;        // -1 gauche, 1 droite, 2 détresse
    this.freinMain = true;
    this.portes = { ar: 0, lat: 0, avG: 0, avD: 0 };
    this.portesCible = { ar: 0, lat: 0, avG: 0, avD: 0 };
    this.temps = 0;
    this.roulis = 0; this.tangage = 0;
    this.accel = 0;
    this.surRoute = true;
    this.evenement = () => {};
  }

  async charger(urls) {
    let gltf = null;
    const erreurs = [];
    for (const u of urls) {
      try { gltf = await chargerModele(u); this.modele = u; break; } catch (e) { erreurs.push(String(e.message || e).slice(0, 220)); }
    }
    if (!gltf) throw new Error('aucun modèle de véhicule n\'a pu être chargé — ' + erreurs.join(' | '));
    const racine = gltf.scene.getObjectByName('vehicule') || gltf.scene;
    this.credits = racine.userData.credits || '';
    this.roues = {};
    for (const e of [...racine.children]) {
      if (e.name.startsWith('roue_')) { this.roues[e.name.slice(5)] = e; this.groupe.add(e); } else this.caisse.add(e);
    }
    const r = this.roues;
    this.rayon = r.AV_G ? r.AV_G.position.y : 0.36;
    this.empattement = r.AV_G && r.AR_G ? Math.abs(r.AV_G.position.z - r.AR_G.position.z) : 3.68;
    this.voie = r.AV_G && r.AV_D ? Math.abs(r.AV_G.position.x - r.AV_D.position.x) : 1.76;
    this.zAv = r.AV_G ? r.AV_G.position.z : 1.9;
    this.zAr = r.AR_G ? r.AR_G.position.z : -1.7;
    for (const k in r) r[k].rotation.order = 'YXZ';
    // matériaux
    this.feux = [];
    this.groupe.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const m = o.material;
      if (m.transparent) { o.castShadow = false; m.depthWrite = false; o.renderOrder = 4; }
      if (m.map) m.map.anisotropy = 8;
    });
    // feux : chaque pièce lumineuse reçoit son propre matériau émissif, piloté par le jeu
    const motif = /^(extra_\d+|headlight|taillight|brakelight|indicator|reversinglight|extralight)/;
    const sprite = halo();
    this.extras = [];
    this.caisse.traverse((n) => {
      if (!motif.test(n.name) || n.isMesh) return;
      const mats = [];
      n.traverse((o) => {
        if (!o.isMesh) return;
        const sh = (o.material.userData && o.material.userData.shader_gta) || o.material.name;
        if (!/emissive/.test(sh)) return;
        o.material = o.material.clone();
        o.material.emissive = new THREE.Color(1, 1, 1);
        o.material.emissiveMap = o.material.map;
        o.material.emissiveIntensity = 0;
        o.castShadow = false;
        mats.push(o.material);
      });
      const feu = { nom: n.name, noeud: n, mats, niveau: 0 };
      this.feux.push(feu);
      if (/^extra_/.test(n.name)) {
        const boite = new THREE.Box3().setFromObject(n);
        const c = boite.getCenter(new THREE.Vector3());
        const coul = n.userData.couleur === 'amber' ? 0xffa018 : 0x2f6bff;
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite, color: coul, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
        s.position.copy(c);
        s.scale.setScalar(n.userData.couleur === 'amber' ? 0.8 : 1.3);
        s.visible = false;
        this.caisse.add(s);
        Object.assign(feu, { extra: true, ambre: n.userData.couleur === 'amber', halo: s, gauche: c.x > 0, avant: c.z > 0, centre: c });
        this.extras.push(feu);
        n.visible = false;
      }
    });
    // deux lumières bleues qui éclairent le décor
    this.lumG = new THREE.PointLight(0x2f6bff, 0, 22, 2);
    this.lumD = new THREE.PointLight(0x2f6bff, 0, 22, 2);
    this.lumG.position.set(0.9, 2.6, 0.8);
    this.lumD.position.set(-0.9, 2.6, 0.8);
    this.caisse.add(this.lumG, this.lumD);
    this.noeud = (nom) => this.caisse.getObjectByName(nom);
    this.pPortes = { arG: this.noeud('door_dside_r'), arD: this.noeud('door_pside_r'), lat: this.noeud('boot'), avG: this.noeud('door_dside_f'), avD: this.noeud('door_pside_f') };
    this.latOrigine = this.pPortes.lat ? this.pPortes.lat.position.clone() : null;
    this.volant = this.noeud('steeringwheel');
    this.axeVolant = new THREE.Vector3(0, -0.423, 0.906).normalize();
    this.boite = new THREE.Box3().setFromObject(this.caisse);
    this.longueur = this.boite.max.z - this.boite.min.z;
    this.arriereZ = this.boite.min.z;
  }

  placer(x, z, cap) {
    this.x = x; this.z = z; this.cap = cap; this.v = 0;
    this._poser(1);
  }

  /** Allume (0..1+) tous les feux dont le nom commence par `prefixe`. */
  feu(prefixe, niveau) {
    for (const f of this.feux) if (f.nom.startsWith(prefixe) && f.niveau !== niveau) {
      f.niveau = niveau;
      for (const m of f.mats) m.emissiveIntensity = niveau;
    }
  }

  get vitesseKmh() { return Math.abs(this.v) * 3.6; }

  /** cmd : { avant, arriere, direction (-1..1, gauche positif), frein } */
  maj(dt, cmd) {
    this.temps += dt;
    const m = this.monde;
    let v = this.v, acc = 0, gaz = 0;
    const rp = m.routeProche(this.x, this.z, 30);
    this.route = rp;
    this.surRoute = !!rp && rp.d < rp.r.w / 2 + 1.2;
    const peutRouler = this.moteur && this.carburant > 0;
    if (cmd.avant > 0) {
      if (v < -0.4) acc += 8 * cmd.avant;
      else if (peutRouler && !this.freinMain) { this.rapport = 'D'; gaz = cmd.avant; acc += gaz * 3.1 * (1 - Math.pow(clamp(v / V_MAX, 0, 1), 1.5)); }
    }
    if (cmd.arriere > 0) {
      if (v > 0.4) acc -= 8.5 * cmd.arriere;
      else if (peutRouler && !this.freinMain) { this.rapport = 'R'; gaz = cmd.arriere; acc -= gaz * 2.2 * (1 - clamp(-v / 7, 0, 1)); }
    }
    this.freinage = (cmd.avant > 0 && v < -0.4) || (cmd.arriere > 0 && v > 0.4) || cmd.frein > 0;
    if (cmd.frein > 0 || this.freinMain) acc -= Math.sign(v) * Math.min(Math.abs(v) / dt, 9);
    // résistances : roulement, air, hors route ; pente
    const res = 0.16 + 0.0011 * v * v + (this.surRoute ? 0 : 0.5 + 0.06 * Math.abs(v)) + (gaz ? 0 : 0.35);
    if (Math.abs(v) > 0.02) acc -= Math.sign(v) * Math.min(res, Math.abs(v) / dt + Math.abs(acc)); else if (!gaz) v = 0;
    acc -= 9.81 * Math.sin(this.pente || 0) * (Math.abs(v) > 0.3 || gaz ? 1 : 0);
    v += acc * dt;
    if (!this.surRoute && Math.abs(v) > 13) v = amorti(v, Math.sign(v) * 13, 1.5, dt);
    if (!cmd.avant && !cmd.arriere && Math.abs(v) < 0.25) { v = 0; if (this.moteur) this.rapport = this.freinMain ? 'P' : 'N'; }
    this.accel = amorti(this.accel, (v - this.v) / Math.max(dt, 1e-4), 8, dt);
    this.gaz = gaz;
    // direction : le braquage maximal diminue avec la vitesse
    const maxB = 0.6 / (1 + Math.pow(Math.abs(v) / 9.5, 2));
    this.braquage = amorti(this.braquage, cmd.direction * maxB, cmd.direction ? 5 : 8, dt);
    const lacet = (v / this.empattement) * Math.tan(this.braquage);
    this.cap += lacet * dt;
    const nx = this.x + Math.sin(this.cap) * v * dt, nz = this.z + Math.cos(this.cap) * v * dt;
    // collisions avec les bâtiments (trois disques le long du fourgon)
    let px = nx, pz = nz, choc = false;
    for (const d of [2.1, 0, -2.0]) {
      const c = m.collision(px + Math.sin(this.cap) * d, pz + Math.cos(this.cap) * d, 1.12);
      if (c) { px += c[0]; pz += c[1]; choc = true; }
    }
    if (choc) {
      if (Math.abs(v) > 2.5) this.evenement('choc', Math.abs(v));
      v *= 0.3;
    }
    const lim = m.L / 2 - 14, limZ = m.H / 2 - 14;
    this.x = clamp(px, -lim, lim);
    this.z = clamp(pz, -limZ, limZ);
    this.km += (Math.abs(v) * dt) / 1000;
    this.v = v;
    // carburant : ralenti + charge (volontairement gourmand pour que le plein fasse partie du jeu)
    if (this.moteur) {
      this.carburant = Math.max(0, this.carburant - (0.0035 + gaz * 0.02 + Math.abs(v) * 0.0032) * dt);
      if (this.carburant <= 0) { this.moteur = false; this.evenement('panne'); }
    }
    // carrosserie : roulis en virage, tangage à l'accélération et au freinage
    this.roulis = amorti(this.roulis, clamp(v * lacet * 0.011, -0.075, 0.075), 6, dt);
    this.tangage = amorti(this.tangage, clamp(-this.accel * 0.0085, -0.05, 0.06), 6, dt);
    this._poser(dt);
    this._feux(dt);
    this._portes(dt);
    // roues
    const tour = (v * dt) / this.rayon;
    for (const k in this.roues) {
      const r = this.roues[k];
      r.rotation.x += tour;
      if (k.startsWith('AV')) r.rotation.y = this.braquage;
    }
    if (this.volant) this.volant.quaternion.setFromAxisAngle(this.axeVolant, -this.braquage * 7.5);
  }

  _poser() {
    const m = this.monde, s = Math.sin(this.cap), c = Math.cos(this.cap);
    const h = (dx, dz) => m.hauteur(this.x + s * dz + c * dx, this.z + c * dz - s * dx);
    const d = this.voie / 2;
    const hAvG = h(d, this.zAv), hAvD = h(-d, this.zAv), hArG = h(d, this.zAr), hArD = h(-d, this.zAr);
    const hAv = (hAvG + hAvD) / 2, hAr = (hArG + hArD) / 2;
    this.pente = Math.atan2(hAv - hAr, this.empattement);
    const devers = Math.atan2((hAvG + hArG) / 2 - (hAvD + hArD) / 2, this.voie);
    // altitude sous l'origine du modèle, sur le plan qui passe par les quatre roues
    const y = hAr + ((hAv - hAr) * -this.zAr) / (this.zAv - this.zAr);
    this.y = y;
    this.groupe.rotation.set(-this.pente, this.cap, devers, 'YXZ');
    this.groupe.position.set(this.x, y, this.z);
    this.caisse.rotation.set(this.tangage, 0, this.roulis);
    this.caisse.position.y = -Math.abs(this.roulis) * 0.25 - Math.max(0, this.tangage) * 0.2;
  }

  _feux() {
    const t = this.temps;
    // gyroleds : double éclat, gauche puis droite ; pénétration : alternance rapide
    const ph = (t % 0.84) / 0.84;
    const eclat = (a) => (ph > a && ph < a + 0.09) || (ph > a + 0.17 && ph < a + 0.26);
    const g = this.gyro && eclat(0.02), d = this.gyro && eclat(0.5);
    let iG = 0, iD = 0;
    for (const f of this.extras) {
      let on;
      if (f.ambre) on = this.balisage && Math.floor(t * 3.2 + (f.centre.x > 0.2 ? 0 : f.centre.x < -0.2 ? 2 : 1)) % 3 === 0;
      else if (f.nom === 'extra_6') on = this.gyro && Math.floor(t * 9) % 2 === 0;
      else on = f.gauche ? g : d;
      f.noeud.visible = on;
      f.halo.visible = on;
      const niv = on ? 5 : 0;
      if (f.niveau !== niv) { f.niveau = niv; for (const mm of f.mats) mm.emissiveIntensity = niv; }
      if (on && !f.ambre) { if (f.gauche) iG = 1; else iD = 1; }
    }
    this.lumG.intensity = iG * 70;
    this.lumD.intensity = iD * 70;
    // feux de route
    const cli = Math.floor(t * 2.9) % 2 === 0;
    this.cliAllume = !!this.clignotant && cli;
    this.feu('headlight', this.codes ? 3.2 : this.moteur ? 0.6 : 0);
    this.feu('extralight', this.moteur ? 1.6 : 0);
    this.feu('taillight', this.freinage ? 3.2 : this.codes ? 0.9 : 0);
    this.feu('brakelight', this.freinage ? 3.5 : 0);
    this.feu('reversinglight', this.rapport === 'R' && this.moteur ? 2.5 : 0);
    const gch = (this.clignotant === -1 || this.clignotant === 2) && cli, drt = (this.clignotant === 1 || this.clignotant === 2) && cli;
    this.feu('indicator_l', gch ? 3 : 0);
    this.feu('indicator_r', drt ? 3 : 0);
  }

  _portes(dt) {
    const p = this.portes, c = this.portesCible, n = this.pPortes;
    for (const k in p) p[k] = amorti(p[k], c[k], 3.2, dt);
    if (n.arG) n.arG.rotation.y = -p.ar * 1.75;
    if (n.arD) n.arD.rotation.y = p.ar * 1.75;
    if (n.avG) n.avG.rotation.y = -p.avG * 1.15;
    if (n.avD) n.avD.rotation.y = p.avD * 1.15;
    if (n.lat) n.lat.position.set(this.latOrigine.x - Math.min(1, p.lat * 6) * 0.09, this.latOrigine.y, this.latOrigine.z - p.lat * 1.25);
  }

  /** Position dans le monde d'un point exprimé dans le repère du véhicule (x gauche, y haut, z avant). */
  point(x, y, z, cible = new THREE.Vector3()) {
    return this.groupe.localToWorld(cible.set(x, y, z));
  }
}
