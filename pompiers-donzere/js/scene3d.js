// La scène d'intervention en 3D : brancard (sorti, amené, rechargé), sacs de matériel posés près de la victime, balisage.
import * as THREE from '../vendor/three.module.min.js';
import { clamp } from './outils.js';

const lisse = (t) => t * t * (3 - 2 * t);

export class Scene3D {
  constructor(scene, vsav, monde, sons) {
    this.scene = scene; this.vsav = vsav; this.monde = monde; this.sons = sons;
    this.anims = [];
    this.objets = new THREE.Group();
    scene.add(this.objets);
    this._brancard();
    this.pose = {};
  }

  _mat(couleur, rug = 0.6, metal = 0) { return new THREE.MeshStandardMaterial({ color: couleur, roughness: rug, metalness: metal }); }

  _brancard() {
    const b = (this.brancard = new THREE.Group());
    const jaune = this._mat(0xe8b800, 0.42, 0.3), noir = this._mat(0x15171a, 0.55, 0.2), alu = this._mat(0xb9bdc2, 0.35, 0.9);
    const matelas = this._mat(0x1b2a44, 0.82), orange = this._mat(0xd9541e, 0.75), blanc = this._mat(0xe9ecef, 0.85);
    const boite = (w, h, d, m, x, y, z, parent = b) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
    const tube = (r, l, m, x, y, z, axe = 'z', parent = b) => {
      const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 12), m);
      if (axe === 'z') o.rotation.x = Math.PI / 2; else if (axe === 'x') o.rotation.z = Math.PI / 2;
      o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o;
    };
    // plateau : cadre jaune, matelas, dossier relevable
    this.plateau = new THREE.Group();
    b.add(this.plateau);
    for (const s of [-1, 1]) {
      tube(0.022, 1.96, jaune, s * 0.27, 0, 0, 'z', this.plateau);
      tube(0.016, 0.9, alu, s * 0.3, 0.2, -0.25, 'z', this.plateau);                 // barrières latérales
      for (const z of [-0.68, 0.18]) tube(0.012, 0.2, alu, s * 0.3, 0.1, z, 'y', this.plateau);
    }
    for (const z of [-0.98, 0.98]) tube(0.022, 0.54, jaune, 0, 0, z, 'x', this.plateau);
    boite(0.5, 0.07, 1.2, matelas, 0, 0.055, -0.36, this.plateau);
    boite(0.5, 0.012, 1.2, orange, 0, 0.096, -0.36, this.plateau);
    this.dossier = new THREE.Group();
    this.dossier.position.set(0, 0.02, 0.24);
    this.plateau.add(this.dossier);
    boite(0.5, 0.07, 0.72, matelas, 0, 0.035, 0.36, this.dossier);
    boite(0.5, 0.012, 0.72, orange, 0, 0.076, 0.36, this.dossier);
    boite(0.36, 0.07, 0.22, blanc, 0, 0.115, 0.56, this.dossier);                    // oreiller
    // piètement repliable et roues
    this.pieds = [];
    for (const z of [-0.72, 0.72]) {
      const p = new THREE.Group();
      p.position.set(0, 0, z);
      for (const s of [-1, 1]) {
        tube(0.018, 0.86, noir, s * 0.25, -0.43, 0, 'y', p);
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.035, 18), noir);
        r.rotation.z = Math.PI / 2; r.position.set(s * 0.25, -0.86, 0); r.castShadow = true; p.add(r);
      }
      tube(0.014, 0.5, alu, 0, -0.5, 0, 'x', p);
      b.add(p);
      this.pieds.push(p);
    }
    // victime installée : silhouette sous une couverture de survie, tête sur l'oreiller
    const v = (this.victime = new THREE.Group());
    const or = new THREE.MeshStandardMaterial({ color: 0xcfa233, roughness: 0.32, metalness: 0.9 });
    const corps = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.0, 6, 14), or);
    corps.rotation.x = Math.PI / 2; corps.scale.set(1.12, 1, 0.62); corps.position.set(0, 0.2, -0.3); corps.castShadow = true;
    const pieds = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), or);
    pieds.scale.set(1.5, 1.1, 1); pieds.position.set(0, 0.25, -0.86);
    const tete = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 14), this._mat(0xc99a7c, 0.6));
    tete.scale.set(0.92, 1, 1.08); tete.position.set(0, 0.26, 0.5);
    const cheveux = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), this._mat(0x3a2c22, 0.9));
    cheveux.rotation.x = -Math.PI / 2.3; cheveux.position.copy(tete.position); cheveux.position.z += 0.012;
    const masque = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshStandardMaterial({ color: 0xcfe8ee, roughness: 0.15, transparent: true, opacity: 0.55 }));
    masque.position.set(0, 0.335, 0.47);
    this.masque = masque;
    v.add(corps, pieds, tete, cheveux, masque);
    v.visible = false;
    this.plateau.add(v);
    b.visible = false;
    this.objets.add(b);
    this.hauteur = 0.93;
  }

  _sac(couleur, w, h, d, bande = 0xf2f2f2) {
    const g = new THREE.Group();
    const corps = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this._mat(couleur, 0.78));
    corps.position.y = h / 2; corps.castShadow = true;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.006, h * 0.14, d + 0.006), this._mat(bande, 0.6));
    b.position.y = h * 0.62;
    const poignee = new THREE.Mesh(new THREE.TorusGeometry(w * 0.16, 0.012, 6, 14, Math.PI), this._mat(0x111111, 0.8));
    poignee.position.y = h;
    g.add(corps, b, poignee);
    return g;
  }

  /** Prépare la scène : `lieu` = point au sol où se trouve la victime. */
  installerScene(lieu, lots) {
    this.lieu = lieu.clone();
    this.vider();
    for (const [id, etat] of Object.entries(lots)) if (etat === 'place') this.poser(id);
  }

  /** Pose un lot de matériel près de la victime. */
  poser(id) {
    if (this.pose[id] || !this.lieu) return;
    const modeles = {
      sac: () => this._sac(0xb3161b, 0.62, 0.36, 0.34), o2: () => this._sac(0x14335f, 0.56, 0.26, 0.26), dsa: () => this._sac(0xd4b000, 0.3, 0.26, 0.12, 0x222222),
      aspi: () => this._sac(0x5a6470, 0.34, 0.24, 0.2), immo: () => this._sac(0xd9541e, 0.8, 0.22, 0.34), kits: () => this._sac(0x2f7d4f, 0.4, 0.22, 0.26),
      act: () => this._sac(0x1f8a5b, 0.75, 0.12, 0.3), plan: () => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 1.83), this._mat(0xe8b800, 0.5)); p.position.y = 0.03; p.castShadow = true; return p; },
      mid: () => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.07, 2.0), this._mat(0xd9541e, 0.85)); p.position.y = 0.04; p.castShadow = true; return p; },
      balisage: () => {
        const g = new THREE.Group();
        for (let i = 0; i < 5; i++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 14), this._mat(0xff5a14, 0.6));
          const p = this.vsav.point((i - 2) * 1.5, 0, this.vsav.arriereZ - 6 - Math.abs(i - 2) * 2.2);
          c.position.set(p.x, this.monde.hauteur(p.x, p.z) + 0.25, p.z); c.castShadow = true;
          g.add(c);
        }
        g.userData.absolu = true;
        return g;
      },
    };
    if (!modeles[id]) return;
    const o = modeles[id]();
    if (!o.userData.absolu) {
      const n = Object.keys(this.pose).length, a = 0.6 + n * 0.9, r = 0.95 + (n % 2) * 0.35;
      const x = this.lieu.x + Math.cos(a) * r, z = this.lieu.z + Math.sin(a) * r;
      o.position.x = x; o.position.z = z; o.position.y += this.monde.hauteur(x, z);
      o.rotation.y = a * 1.7;
    }
    this.objets.add(o);
    this.pose[id] = o;
  }

  vider() {
    for (const o of Object.values(this.pose)) this.objets.remove(o);
    this.pose = {};
    this.brancard.visible = false;
    this.victime.visible = false;
    this.anims = [];
  }

  _anim(duree, fn, fin) { this.anims.push({ t: 0, duree, fn, fin }); }

  /** Repère du brancard dans le VSAV (invisible, portes fermées) -> derrière le pare-chocs -> près de la victime. */
  _positions() {
    const v = this.vsav;
    const dedans = v.point(0.12, 0.62, v.arriereZ + 1.25), seuil = v.point(0.12, 0.62, v.arriereZ - 1.25);
    const dehors = seuil.clone(); dehors.y = this.monde.hauteur(dehors.x, dehors.z) + this.hauteur;
    const pres = this.lieu.clone();
    const dir = pres.clone().sub(dehors).setY(0);
    const dist = dir.length();
    if (dist > 0.01) pres.addScaledVector(dir.normalize(), -Math.min(0.9, dist * 0.4));
    pres.y = this.monde.hauteur(pres.x, pres.z) + this.hauteur;
    return { dedans, seuil, dehors, pres };
  }

  sortirBrancard() {
    const v = this.vsav, b = this.brancard, P = this._positions();
    v.portesCible.ar = 1;
    this.sons.porte();
    const capV = v.cap;
    this._anim(1.2, () => {}, () => {
      b.visible = true;
      b.position.copy(P.dedans); b.rotation.set(0, capV, 0);
      this._plier(1);
      this._anim(1.8, (t) => { b.position.lerpVectors(P.dedans, P.seuil, lisse(t)); }, () => {
        this._anim(0.7, (t) => { this._plier(1 - lisse(t)); b.position.lerpVectors(P.seuil, P.dehors, lisse(t)); }, () => {
          const cap = Math.atan2(P.pres.x - P.dehors.x, P.pres.z - P.dehors.z);
          this._anim(2.2, (t) => { b.position.lerpVectors(P.dehors, P.pres, lisse(t)); b.rotation.y = capV + (cap - capV) * lisse(Math.min(1, t * 2)); });
        });
      });
    });
  }

  installer(visible) {
    this._anim(3.2, () => {}, () => { this.victime.visible = visible; this.dossier.rotation.x = -0.5; });
    this._anim(1.5, (t) => { this.plateau.position.y = -0.45 * Math.sin(Math.PI * lisse(t)); });
  }

  chargerBrancard() {
    const v = this.vsav, b = this.brancard, P = this._positions();
    const depart = b.position.clone(), capD = b.rotation.y, capV = v.cap;
    v.portesCible.ar = 1;
    this._anim(2.4, (t) => { b.position.lerpVectors(depart, P.dehors, lisse(t)); b.rotation.y = capD + (capV - capD) * lisse(t); }, () => {
      this._anim(0.7, (t) => { this._plier(lisse(t)); b.position.lerpVectors(P.dehors, P.seuil, lisse(t)); }, () => {
        this._anim(1.8, (t) => { b.position.lerpVectors(P.seuil, P.dedans, lisse(t)); }, () => { this.sons.porte(); });
      });
    });
  }

  /** k = 1 : piètement replié sous le plateau (brancard dans le véhicule). */
  _plier(k) {
    this.pieds[0].rotation.x = -k * 1.45;
    this.pieds[1].rotation.x = -k * 1.45;
  }

  /** Fin de l'intervention : on ferme les portes et on range ce qui reste. */
  ranger() {
    this.vsav.portesCible.ar = 0;
    this.vsav.portesCible.lat = 0;
    this.sons.porte();
    this._anim(0.8, () => {}, () => { this.vider(); });
  }

  maj(dt) {
    for (const a of [...this.anims]) {
      a.t += dt;
      const t = clamp(a.t / a.duree, 0, 1);
      a.fn(t);
      if (t >= 1) { this.anims.splice(this.anims.indexOf(a), 1); if (a.fin) a.fin(); }
    }
  }
}
