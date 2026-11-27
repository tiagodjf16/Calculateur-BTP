// Les lieux en 3D : la salle, le public qui danse, les projecteurs et leurs faisceaux, la fumée, les effets spéciaux.
import * as THREE from '../vendor/three.module.min.js';
import { alea, clamp, lerp } from './outils.js';

export const LIEUX = {
  chambre: { nom: 'Ta chambre', l: 4.4, p: 5, h: 2.5, murs: 0xcbbfae, sol: 0x8a6a48, plafond: 0xf0ece4, clarte: 0.8 },
  fetes: { nom: 'Salle des fêtes', l: 14, p: 20, h: 4.6, murs: 0xd6cdb8, sol: 0x9c8f7c, plafond: 0xe9e6de, clarte: 0.3, piste: 0xb9a27c, estrade: 0.4 },
  mariage: { nom: 'Salle de réception du domaine', l: 18, p: 24, h: 5.6, murs: 0xe6dccb, sol: 0x7a5b3c, plafond: 0xf3eee4, clarte: 0.27, piste: 0x9b7447, estrade: 0.4 },
  bar: { nom: 'Bar Le Phare', l: 8.5, p: 16, h: 3.3, murs: 0x6a4030, sol: 0x4a3626, plafond: 0x1c1a19, clarte: 0.2, estrade: 0.2 },
  club: { nom: 'Club Le Hangar', l: 22, p: 30, h: 8, murs: 0x17171b, sol: 0x1b1b1f, plafond: 0x0b0b0d, clarte: 0.045, piste: 0x101014, estrade: 0.8 },
  entreprise: { nom: 'Salon de l\'hôtel', l: 16, p: 22, h: 4.2, murs: 0xd9d3c8, sol: 0x4b4f63, plafond: 0xededed, clarte: 0.33, piste: 0x6b5a45, estrade: 0.4 },
  festival: { nom: 'Grande scène en plein air', l: 70, p: 90, h: 13, murs: 0x05060a, sol: 0x1f2a16, plafond: 0x05060a, clarte: 0.03, exterieur: true },
};
export const VUES = [['cabine', 'Vue de la cabine'], ['piste', 'Vue de la piste'], ['fond', 'Vue d\'ensemble']];

const PEAUX = [0xf1c9a5, 0xe0ac86, 0xc68a5e, 0x9a643f, 0x6e4329, 0xf6d6bd];
const HABITS = [0xe8e8e8, 0x1f2a44, 0xb3261a, 0x2f7d4f, 0xd9a520, 0x7b3fa0, 0x1d6fa5, 0x222222, 0xe07a9a, 0xf0f0f0, 0x444a55, 0xc24a1a];
const PANTALONS = [0x1c2233, 0x2b2b2b, 0x3a4a6b, 0x5a4a3a, 0x151515, 0x6b6f78];
const CHEVEUX = [0x1c1410, 0x3b2a1a, 0x6b4a2a, 0xb08a4a, 0x8a8a8a, 0x101010, 0x7a2e1a];
const TYPES = ['par', 'lyre', 'derby', 'laser', 'strobo', 'aveuglant'];
const NOMBRE = { par: 'pars', lyre: 'lyres', derby: 'derbys', laser: 'laser', strobo: 'strobo', aveuglant: 'aveuglants' };

const vsFaisceau = 'varying float vL; varying vec3 vN; varying vec3 vV; void main() { vL = 0.5 - position.y; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
const fsFaisceau = 'uniform vec3 couleur; uniform float force; varying float vL; varying vec3 vN; varying vec3 vV; void main() { float bord = pow(abs(dot(normalize(vN), normalize(vV))), 1.5); float a = force * pow(1.0 - vL, 1.3) * (0.2 + 0.8 * bord); gl_FragColor = vec4(couleur * a, a); }';

/** Texture ronde et douce : fumée, éclats de la boule à facettes. */
function halo() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Salle {
  constructor(canvas) {
    this.canvas = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(66, 2, 0.1, 400);
    this.ambiant = new THREE.AmbientLight(0xffffff, Math.PI);
    this.ciel = new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 1);
    this.face = new THREE.DirectionalLight(0xffffff, 1);
    this.pl = [new THREE.PointLight(0xffffff, 0, 28, 1.3), new THREE.PointLight(0xffffff, 0, 28, 1.3)];
    this.scene.add(this.ambiant, this.ciel, this.face, this.face.target, ...this.pl);
    this.scene.fog = new THREE.FogExp2(0x000000, 0);
    this.decor = new THREE.Group(); this.scene.add(this.decor);
    this.halo = halo();
    this.temps = 0; this.gens = []; this.faisceaux = []; this.particules = []; this.vueNom = 'cabine'; this.clameur = 0; this.dansants = 0; this.tFumee = 0;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v3 = new THREE.Vector3(); this.e3 = new THREE.Euler(); this.s3 = new THREE.Vector3();
  }

  redimensionner(l, h) {
    this.renderer.setSize(l, h, false);
    this.canvas.style.width = l + 'px'; this.canvas.style.height = h + 'px';
    this.camera.aspect = l / Math.max(1, h); this.camera.updateProjectionMatrix();
  }

  _mat(couleur, o = {}) { return new THREE.MeshLambertMaterial({ color: couleur, ...o }); }
  _boite(l, h, p, mat, x, y, z, parent = this.decor) { const o = new THREE.Mesh(new THREE.BoxGeometry(l, h, p), mat); o.position.set(x, y, z); parent.add(o); return o; }
  _cyl(r1, r2, h, mat, x, y, z, parent = this.decor, seg = 14) { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat); o.position.set(x, y, z); parent.add(o); return o; }

  /** Construit le lieu, installe le matériel visible et fait entrer le public. */
  installer(id, inst, nbPublic, extras = {}) {
    const L = (this.lieu = LIEUX[id]), d = this.decor, rnd = alea(id.length * 977 + nbPublic);
    this.id = id; this.inst = inst;
    for (const o of [...d.children]) { d.remove(o); o.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) for (const m of [].concat(x.material)) m.dispose(); }); }
    this.faisceaux = []; this.particules = []; this.gens = []; this.points = null; this.im = null; this.clameur = 0;
    const l = L.l, p = L.p, h = L.h, zDJ = (this.zDJ = -p / 2 + 1.5), yDJ = (this.yDJ = L.exterieur ? 1.2 : L.estrade || 0);
    // ---- murs, sol, plafond
    const sol = new THREE.Mesh(new THREE.PlaneGeometry(l, p), this._mat(L.sol));
    sol.rotation.x = -Math.PI / 2; d.add(sol);
    if (!L.exterieur) {
      const mur = this._mat(L.murs, { side: THREE.BackSide }), sousSol = this._mat(L.sol, { side: THREE.BackSide });
      const piece = new THREE.Mesh(new THREE.BoxGeometry(l, h + 0.02, p), [mur, mur, this._mat(L.plafond, { side: THREE.BackSide }), sousSol, mur, mur]);
      piece.position.y = h / 2 - 0.01; d.add(piece);
      this._boite(l - 0.02, 0.1, 0.03, this._mat(0x2a2622), 0, 0.05, p / 2 - 0.02); this._boite(0.03, 0.1, p - 0.02, this._mat(0x2a2622), -l / 2 + 0.02, 0.05, 0); this._boite(0.03, 0.1, p - 0.02, this._mat(0x2a2622), l / 2 - 0.02, 0.05, 0);
    } else {
      const noirS = this._mat(0x15171c), tube = this._mat(0x30343b);
      this._boite(24, 1.2, 8, noirS, 0, 0.6, zDJ - 1);                                                                        // plateau de scène
      for (const sx of [-1, 1]) { this._boite(0.5, h, 0.5, tube, sx * 11.5, h / 2, zDJ + 2.6); this._boite(0.5, h, 0.5, tube, sx * 11.5, h / 2, zDJ - 4.5); this._boite(2.2, 7, 1.6, this._mat(0x0c0d10), sx * 15, 6, zDJ + 2); }
      this._boite(24, 0.5, 8, tube, 0, h, zDJ - 1);                                                                           // toit de scène
      this._boite(22, 7, 0.1, this._mat(0x0a1030, { emissive: 0x16205a, emissiveIntensity: 0.6 }), 0, 6.5, zDJ - 4.6);        // mur d'écrans
      for (let k = 0; k < 16; k++) { const x = (rnd() - 0.5) * 140, z = p / 2 + 4 + rnd() * 30, ar = new THREE.Mesh(new THREE.ConeGeometry(3 + rnd() * 2, 9 + rnd() * 5, 7), this._mat(0x0b140c)); ar.position.set(x, 5, z); d.add(ar); }
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) this._boite(4, 2.6, 3, this._mat([0xb3261a, 0xe8e8e8, 0x1d6fa5][k], { emissive: 0x33260f }), sx * (l / 2 - 3), 1.3, -5 + k * 14);     // buvettes
    }
    if (L.estrade) { this._boite(5.4, yDJ, 2.7, this._mat(0x1b1c20), 0, yDJ / 2, zDJ + 0.15); this._boite(5.4, 0.03, 0.04, this._mat(0x8d949e), 0, yDJ - 0.015, zDJ + 1.5); }      // estrade du DJ
    if (L.piste) { const pi = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(l - 3, 13), Math.min(p - 7, 11)), this._mat(L.piste)); pi.rotation.x = -Math.PI / 2; pi.position.set(0, 0.012, zDJ + 2.2 + Math.min(p - 7, 11) / 2); d.add(pi); }
    // ---- décor propre à chaque lieu
    const bois = this._mat(0x5b4030), blanc = this._mat(0xf2f0ea), noir = this._mat(0x16171a), metal = this._mat(0x6d737c);
    const table = (x, z, r = 0.8, nappe = blanc) => { this._cyl(r, r, 0.06, nappe, x, 0.75, z, d, 20); this._cyl(0.06, 0.25, 0.75, metal, x, 0.375, z, d, 8); };
    const assises = [];
    if (id === 'chambre') {
      this._boite(2, 0.45, 1.4, this._mat(0x3d5a80), l / 2 - 1.1, 0.25, p / 2 - 0.9); this._boite(2, 0.25, 0.5, blanc, l / 2 - 1.1, 0.6, p / 2 - 0.4);                  // lit
      this._boite(1.2, 1.9, 0.5, bois, -l / 2 + 0.7, 0.95, p / 2 - 0.3);                                                                                     // armoire
      for (const [x, c] of [[-0.9, 0xb3261a], [0.2, 0x1d6fa5], [1.2, 0xd9a520]]) this._boite(0.7, 1, 0.02, this._mat(c), x, 1.5, p / 2 - 0.02);                // affiches
      this._boite(0.04, 1.3, 1.1, this._mat(0x9fc4e8, { emissive: 0x3d5f80 }), -l / 2 + 0.03, 1.5, 0.4);                                                     // fenêtre
      this._boite(1.6, 0.02, 2.2, this._mat(0x7a3b2e), 0.2, 0.011, 0.6);                                                                                     // tapis
    } else if (id === 'fetes' || id === 'mariage' || id === 'entreprise') {
      const rangs = id === 'fetes' ? 2 : 3;
      for (let k = 0; k < rangs * 2; k++) for (const sx of [-1, 1]) { const x = sx * (l / 2 - 1.8 - (k % 2) * 2.2), z = -p / 2 + 6 + Math.floor(k / 2) * 4.6; table(x, z, id === 'fetes' ? 0.7 : 0.9); for (let a = 0; a < 6; a++) assises.push([x + Math.cos(a) * 1.25, z + Math.sin(a) * 1.25]); }
      this._boite(id === 'fetes' ? 4 : 6, 0.9, 0.8, blanc, 0, 0.45, p / 2 - 0.6);                                                                             // buffet
      for (let k = 0; k < 8; k++) assises.push([-2.5 + k * 0.7, p / 2 - 1.5]);
      if (id === 'fetes') {
        for (let k = 0; k < 16; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), this._mat(HABITS[2 + (k % 6)])); b.position.set(-l / 2 + 1 + rnd() * (l - 2), h - 0.5 - rnd() * 0.8, p / 2 - 0.4 - rnd() * 2); d.add(b); }
        this._boite(4.2, 0.6, 0.03, this._mat(0xd9a520), 0, h - 1.1, p / 2 - 0.03);                                                                           // banderole
      }
      if (id === 'mariage') {
        for (let k = 0; k < 7; k++) { const voile = new THREE.Mesh(new THREE.PlaneGeometry(l, 1.6), this._mat(0xfaf6ee, { side: THREE.DoubleSide, transparent: true, opacity: 0.5 })); voile.position.set(0, h - 0.35, -p / 2 + 3 + k * 3.2); voile.rotation.x = Math.PI / 2 - 0.5; d.add(voile); }
        for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), this._mat(0xf4c2cf)); f.position.set(sx * (l / 2 - 0.5), 1.5, -p / 2 + 5 + k * 5); d.add(f); }
      }
      if (id === 'entreprise') { this._boite(3.4, 2, 0.05, this._mat(0x0f1a33, { emissive: 0x143a8a }), 0, 2.3, p / 2 - 0.04); for (const sx of [-1, 1]) this._boite(0.9, 2.2, 0.05, this._mat(0x1d6fa5), sx * 4, 1.1, p / 2 - 0.4); }
    } else if (id === 'bar') {
      this._boite(1, 1.1, 9, bois, l / 2 - 0.9, 0.55, 1.5); this._boite(1.1, 0.06, 9.2, this._mat(0x2a1c14), l / 2 - 0.9, 1.13, 1.5);                              // comptoir
      this._boite(0.3, 2.2, 8.5, this._mat(0x1e1512), l / 2 - 0.16, 1.4, 1.5);
      for (let k = 0; k < 26; k++) this._boite(0.07, 0.3, 0.07, this._mat([0x3f7d3a, 0xb3862a, 0x7a2a1a, 0xd8d8d8][k % 4], { emissive: 0x151005 }), l / 2 - 0.34, 1.35 + (k % 3) * 0.5, -2.4 + Math.floor(k / 3) * 0.95);
      for (let k = 0; k < 7; k++) { assises.push([l / 2 - 1.75, -2.2 + k * 1.2]); this._cyl(0.17, 0.17, 0.75, metal, l / 2 - 1.75, 0.375, -2.2 + k * 1.2, d, 10); }
      for (let k = 0; k < 3; k++) { table(-l / 2 + 1.1, 1 + k * 2.6, 0.45, bois); assises.push([-l / 2 + 1.8, 1 + k * 2.6], [-l / 2 + 1.1, 1.7 + k * 2.6]); }
      this._boite(0.04, 0.5, 2.4, this._mat(0xff2d87, { emissive: 0xff2d87, emissiveIntensity: 0.9 }), -l / 2 + 0.03, 2.3, 4);                                    // néon
    } else if (id === 'club') {
      this._boite(1, 1.1, 10, noir, -l / 2 + 0.8, 0.55, 6); this._boite(1.1, 0.05, 10.2, this._mat(0x0a84ff, { emissive: 0x0a84ff, emissiveIntensity: 0.5 }), -l / 2 + 0.8, 1.12, 6);
      for (let k = 0; k < 9; k++) assises.push([-l / 2 + 1.7, 1.6 + k * 1.1]);
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) this._boite(0.6, h, 0.6, this._mat(0x101013), sx * (l / 2 - 3.5), h / 2, -p / 2 + 8 + k * 8);
      for (let k = 0; k < 6; k++) assises.push([l / 2 - 1.2, -6 + k * 3]);
      this._boite(5, 0.9, 0.05, this._mat(0xbf5af2, { emissive: 0xbf5af2, emissiveIntensity: 0.9 }), 0, h - 2, p / 2 - 0.04);
      this._boite(6, 2.4, 0.08, this._mat(0x12061c, { emissive: 0x3a1466, emissiveIntensity: 0.7 }), 0, 3.1, -p / 2 + 0.06);                                    // écran derrière la cabine
      for (const sx of [-1, 1]) { this._boite(0.05, 0.07, p - 2, this._mat(0x0a1c3a, { emissive: 0x0a84ff, emissiveIntensity: 0.8 }), sx * (l / 2 - 0.04), h - 1.4, 0); this._boite(0.05, 0.07, p - 2, this._mat(0x2a0a3a, { emissive: 0xbf5af2, emissiveIntensity: 0.7 }), sx * (l / 2 - 0.04), 0.5, 0); }
      this._boite(0.9, 0.3, 0.04, this._mat(0x0a2a12, { emissive: 0x32d74b, emissiveIntensity: 0.9 }), l / 2 - 2, 2.5, p / 2 - 0.04);                             // issue de secours
    }
    this._cabine(inst, id);
    this._enceintes(inst);
    this._projecteurs(inst);
    this._public(Math.max(0, Math.round(nbPublic)), assises, extras, rnd);
    this.face.position.set(0, h, zDJ); this.face.target.position.set(0, 0, zDJ + 8);
    this.scene.fog.density = 0;
    this.vue(this.vueNom);
  }

  // ------------------------------------------------------------------ cabine, DJ, enceintes
  _cabine(inst, id) {
    const z = this.zDJ, y = this.yDJ, noir = this._mat(0x16171a), gris = this._mat(0x24272d);
    this._boite(2.6, 0.06, 0.95, noir, 0, y + 0.98, z + 0.55);
    this._boite(2.6, 0.98, 0.05, this._mat(id === 'mariage' ? 0xf2f0ea : 0x101114), 0, y + 0.49, z + 1.02);
    for (const sx of [-1, 1]) this._boite(0.05, 0.98, 0.9, noir, sx * 1.28, y + 0.49, z + 0.55);
    // platines et table de mixage posées sur la table
    for (const sx of [-1, 1]) {
      this._boite(0.42, 0.08, 0.5, gris, sx * 0.55, y + 1.05, z + 0.55);
      this._cyl(0.15, 0.15, 0.03, this._mat(0x0b0c0e), sx * 0.55, y + 1.105, z + 0.6, this.decor, 24);
      this._boite(0.3, 0.012, 0.09, this._mat(0x0a1c2e, { emissive: 0x1d6fa5, emissiveIntensity: 0.8 }), sx * 0.55, y + 1.096, z + 0.36);
    }
    this._boite(0.36, 0.1, 0.5, gris, 0, y + 1.06, z + 0.55);
    for (let k = 0; k < 4; k++) this._boite(0.03, 0.02, 0.03, this._mat(0x101010, { emissive: [0xff453a, 0xffd60a, 0x32d74b, 0x0a84ff][k], emissiveIntensity: 1 }), -0.12 + k * 0.08, y + 1.115, z + 0.4);
    if (inst.cabine.ecrans === 'ordinateur') {                                             // ordinateur portable sur son support
      this._boite(0.36, 0.015, 0.25, this._mat(0x8a9099), 0.95, y + 1.2, z + 0.5);
      const ecran = this._boite(0.36, 0.24, 0.012, this._mat(0x0a1420, { emissive: 0x2a6ea8, emissiveIntensity: 0.9 }), 0.95, y + 1.32, z + 0.64); ecran.rotation.x = 0.25;
      this._boite(0.04, 0.2, 0.04, noir, 0.95, y + 1.1, z + 0.5);
    }
    // le DJ (vous) : visible depuis la piste, caché dans la vue de la cabine
    const dj = (this.dj = new THREE.Group()), peau = this._mat(0xe0ac86), haut = this._mat(0x15161a), bas = this._mat(0x1c2233);
    for (const sx of [-1, 1]) { this._boite(0.15, 0.84, 0.19, bas, sx * 0.1, 0.43, 0, dj); const br = this._boite(0.09, 0.56, 0.09, haut, sx * 0.27, 1.2, 0.16, dj); br.rotation.x = -1.0; }
    this._boite(0.42, 0.6, 0.24, haut, 0, 1.16, 0, dj);
    this.djTete = new THREE.Group(); this.djTete.position.set(0, 1.585, 0); dj.add(this.djTete);
    this.djTete.add(new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), peau));
    const ch = new THREE.Mesh(new THREE.SphereGeometry(0.124, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), this._mat(0x1c1410)); ch.position.set(0, 0.012, -0.012); this.djTete.add(ch);
    const arceau = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.014, 6, 16, Math.PI), this._mat(0x0a0a0c)); this.djTete.add(arceau);
    for (const sx of [-1, 1]) this._cyl(0.045, 0.045, 0.035, this._mat(0x0a0a0c), sx * 0.125, 0, 0, this.djTete, 10).rotation.z = Math.PI / 2;
    dj.position.set(0, y, z - 0.12); this.decor.add(dj);
  }

  _enceintes(inst) {
    const L = this.lieu, d = this.decor, z = this.zDJ, metal = this._mat(0x6d737c);
    const pw = inst.sono.puissance, he = pw > 600 ? 3.4 : pw > 200 ? 2.1 : pw > 60 ? 1.5 : 0.75, le = pw > 600 ? 1.3 : pw > 200 ? 0.62 : pw > 60 ? 0.42 : 0.3, ex = Math.min(L.l / 2 - le, 3.4 + (pw > 600 ? 5 : 0));
    this.enceintes = [];
    for (const sx of [-1, 1]) {
      const ys = L.exterieur ? this.yDJ : 0, y0 = ys + (pw > 200 ? 0 : 1.15);
      if (pw <= 200) this._cyl(0.025, 0.025, 1.15, metal, sx * ex, ys + 0.575, z + 1.4, d, 6);
      this._boite(le, he, le * 0.9, this._mat(0x0d0e10), sx * ex, y0 + he / 2, z + 1.4);
      for (let k = 0; k < (pw > 200 ? 2 : 1); k++) { const hp = new THREE.Mesh(new THREE.CircleGeometry(le * 0.36, 18), this._mat(0x24262b)); hp.position.set(sx * ex, y0 + he * (pw > 200 ? 0.28 + k * 0.42 : 0.42), z + 1.4 + le * 0.46); d.add(hp); this.enceintes.push(hp); }
    }
    if (inst.fumee) { this._boite(0.3, 0.2, 0.42, this._mat(0x1a1b1f), 1.9, this.yDJ + 0.1, z + 1.25); this._cyl(0.04, 0.04, 0.12, metal, 1.9, this.yDJ + 0.12, z + 1.5, d, 8).rotation.x = Math.PI / 2; }
  }

  // ------------------------------------------------------------------ projecteurs
  _faisceau(rayon, parent, type) {
    const geo = new THREE.CylinderGeometry(0.02, rayon, 1, type === 'laser' ? 4 : 16, 1, true);
    const mat = new THREE.ShaderMaterial({ uniforms: { couleur: { value: new THREE.Color(1, 1, 1) }, force: { value: 0 } }, vertexShader: vsFaisceau, fragmentShader: fsFaisceau,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(geo, mat);
    cone.position.y = -0.5; cone.frustumCulled = false;
    const pivot = new THREE.Group(); pivot.add(cone); parent.add(pivot);
    return { pivot, cone, mat };
  }

  _projecteurs(inst) {
    const L = this.lieu, d = this.decor, lum = inst.lumieres, total = TYPES.reduce((s, t) => s + lum[NOMBRE[t]], 0);
    this.yPont = null;
    if (!total) return;
    const base = {}; let n0 = 0;
    for (const t of TYPES) { base[t] = n0; n0 += lum[NOMBRE[t]]; }                          // même ordre que le pupitre
    const ext = !!L.exterieur, yP = ext ? 9 : Math.min(L.h - 0.5, 5.2), zP = this.zDJ + (ext ? 14 : clamp(L.p * 0.3, 2.2, 6.5)), larg = ext ? 24 : Math.min(L.l - 1.4, 10), alu = this._mat(0x9aa1ab);
    for (const [dy, dz] of [[0.42, -0.12], [0.42, 0.12], [0.2, 0]]) this._boite(larg + 0.5, 0.05, 0.05, alu, 0, yP + dy, zP + dz);
    for (let x = -larg / 2; x <= larg / 2 + 0.01; x += 1) this._boite(0.04, 0.26, 0.28, alu, x, yP + 0.31, zP);
    if (this.id !== 'club') for (const sx of [-1, 1]) this._boite(0.09, yP + 0.42, 0.09, alu, sx * (larg / 2 + 0.2), (yP + 0.42) / 2, zP);        // pieds de levage
    this.yPont = yP; this.zPont = zP;
    const corps = this._mat(0x15161a), solG = new THREE.CircleGeometry(1, 24);
    const ordre = [];
    for (let k = 0; k < Math.max(lum.pars, lum.lyres); k++) { if (k < lum.lyres) ordre.push('lyre'); if (k < lum.pars) ordre.push('par'); }
    for (const t of ['derby', 'laser', 'strobo', 'aveuglant']) for (let k = 0; k < lum[NOMBRE[t]]; k++) ordre.push(t);
    const rang = {};
    ordre.forEach((type, n) => {
      const x = total > 1 ? -larg / 2 + (larg * n) / (total - 1) : 0, k = (rang[type] = (rang[type] ?? -1) + 1), g = new THREE.Group();
      g.position.set(x, yP, zP); d.add(g);
      const f = { type, idx: base[type] + k, x, g, rayons: [], taches: [] };
      const large = type === 'strobo' || type === 'aveuglant';
      this._boite(large ? 0.5 : 0.22, 0.12, 0.22, corps, 0, 0.1, 0, g);
      f.lentille = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, toneMapped: false });
      const nbR = type === 'derby' ? 6 : type === 'laser' ? 9 : type === 'par' || type === 'lyre' ? 1 : 0;
      for (let r = 0; r < nbR; r++) {
        const fa = this._faisceau(type === 'par' ? 0.4 : type === 'lyre' ? 0.13 : type === 'derby' ? 0.06 : 0.012, g, type);
        f.rayons.push(fa);
        if (type === 'par' || type === 'lyre') {                                                      // tête orientable, lentille et tache au sol
          this._cyl(type === 'par' ? 0.11 : 0.085, type === 'par' ? 0.12 : 0.1, type === 'par' ? 0.2 : 0.26, corps, 0, -0.1, 0, fa.pivot);
          const oeil = new THREE.Mesh(new THREE.CircleGeometry(type === 'par' ? 0.11 : 0.085, 14), f.lentille); oeil.rotation.x = Math.PI / 2; oeil.position.y = type === 'par' ? -0.205 : -0.235; fa.pivot.add(oeil);
          const tache = new THREE.Mesh(solG, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); tache.rotation.x = -Math.PI / 2; d.add(tache); f.taches.push(tache);
        }
      }
      if (type === 'derby' || type === 'laser') { this._boite(0.2, 0.16, 0.2, corps, 0, -0.04, 0, g); const oeil = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), f.lentille); oeil.position.set(0, -0.13, 0); oeil.rotation.x = Math.PI / 2; g.add(oeil); }
      if (large) { this._boite(0.5, 0.2, 0.14, corps, 0, -0.05, 0, g); const oeil = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.16), f.lentille); oeil.position.set(0, -0.06, 0); oeil.rotation.x = 0.6; g.add(oeil); }
      this.faisceaux.push(f);
    });
    this.pl[0].position.set(-larg / 4, yP - 0.6, zP); this.pl[1].position.set(larg / 4, yP - 0.6, zP);
    // boule à facettes : éclats qui tournent sur les murs et le sol
    if (inst.effets.boule) {
      const boule = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 2), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.25, flatShading: true }));
      boule.position.set(0, Math.min(L.h - 0.7, 4.6), this.zDJ + Math.min(7, L.p * 0.3) + 1.2); d.add(boule);
      const N = 280, pos = new Float32Array(N * 3), dirs = [], rnd = alea(4242);
      for (let i = 0; i < N; i++) { const a = rnd() * Math.PI * 2, e = (rnd() - 0.62) * 1.9; dirs.push([Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)]); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.2, map: this.halo, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      pts.frustumCulled = false; d.add(pts);
      this.points = { boule, pts, dirs, pos };
    }
  }

  // ------------------------------------------------------------------ public
  _public(nb, assises, extras, rnd) {
    const L = this.lieu, d = this.decor;
    this.nb = nb;
    if (!nb) return;
    const fin = nb > 450 ? 6 : 8;                                                           // moins de facettes quand la foule est grande
    const geos = { jambe: [new THREE.CylinderGeometry(0.085, 0.06, 0.86, fin).translate(0, -0.43, 0), 2], buste: [new THREE.CylinderGeometry(0.2, 0.15, 0.6, fin + 2).scale(1, 1, 0.6), 1], tete: [new THREE.SphereGeometry(0.115, fin + 2, fin), 1],
      cheveux: [new THREE.SphereGeometry(0.124, fin + 2, 5, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.012, -0.012), 1], bras: [new THREE.CylinderGeometry(0.052, 0.04, 0.58, fin).translate(0, -0.27, 0), 2] };
    this.im = {};
    for (const [nom, [g, k]] of Object.entries(geos)) {
      const im = new THREE.InstancedMesh(g, this._mat(0xffffff), nb * k);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; d.add(im); this.im[nom] = im;
    }
    const demi = Math.min(L.l / 2 - 1.2, L.exterieur ? 28 : 6.5), piste = { x0: -demi, x1: demi, z0: this.zDJ + (L.exterieur ? 6 : 3.3), z1: this.zDJ + Math.min(L.p - 5, L.exterieur ? 62 : 13) };
    const c = new THREE.Color(), tirer = (t) => t[Math.floor(rnd() * t.length)];
    for (let i = 0; i < nb; i++) {
      // la piste se remplit depuis la cabine ; les autres attendent aux tables, au bar ou au fond
      const danse = [lerp(piste.x0, piste.x1, rnd()), lerp(piste.z0, piste.z1, rnd() ** 1.5)];
      const repos = assises.length && rnd() < 0.8 ? tirer(assises).map((v) => v + (rnd() - 0.5) * 0.5) : [(rnd() < 0.5 ? -1 : 1) * (L.l / 2 - 0.8 - rnd() * (L.exterieur ? 12 : 1.5)), lerp(piste.z0 + (piste.z1 - piste.z0) * 0.55, L.p / 2 - 1, rnd())];
      const g = { danse, repos, x: repos[0], z: repos[1], envie: (i + 0.5) / nb, t: rnd() * 10, taille: 0.9 + rnd() * 0.2, style: Math.floor(rnd() * 4), ampl: 0.6 + rnd() * 0.6, dansant: 0, bras: 0, cap: Math.PI };
      const role = extras.roles && extras.roles[i], haut = role ? role.haut : tirer(HABITS), peau = tirer(PEAUX);
      c.setHex(haut); this.im.buste.setColorAt(i, c);
      const manches = rnd() < 0.45 ? haut : peau;
      c.setHex(manches); this.im.bras.setColorAt(i * 2, c); this.im.bras.setColorAt(i * 2 + 1, c);
      c.setHex(role ? role.bas : tirer(PANTALONS)); this.im.jambe.setColorAt(i * 2, c); this.im.jambe.setColorAt(i * 2 + 1, c);
      c.setHex(peau); this.im.tete.setColorAt(i, c);
      c.setHex(tirer(CHEVEUX)); this.im.cheveux.setColorAt(i, c);
      if (role) { g.envie = 0.01 + i * 0.01; g.taille = role.taille || g.taille; }
      this.gens.push(g);
    }
    for (const im of Object.values(this.im)) im.instanceColor.needsUpdate = true;
  }

  /** Change l'angle de vue : 'cabine' (le regard du DJ), 'piste' (au milieu des danseurs) ou 'fond' (vue d'ensemble). */
  vue(nom) {
    const L = this.lieu, c = this.camera;
    this.vueNom = nom;
    if (!L) return;
    const z = this.zDJ, y = this.yDJ, petit = this.id === 'chambre';
    if (nom === 'piste') { c.fov = 60; c.position.set(Math.min(L.l * 0.16, 2.6), petit ? 1.6 : 2.7, z + (petit ? 2.6 : Math.min(L.p * 0.42, 9.5))); c.lookAt(0, y + (petit ? 1.2 : 1.9), z); }
    else if (nom === 'fond') { c.fov = petit ? 62 : 46; c.position.set(-Math.min(L.l / 2 - 0.7, 8), Math.min(L.h - 0.4, 5.5) + (L.exterieur ? 3 : 0), z + Math.min(L.p - 2.2, L.exterieur ? 30 : 19)); c.lookAt(0, y + 1.3, z + (petit ? 0.5 : 3.5)); }
    else { c.fov = 68; c.position.set(0, y + (petit ? 1.55 : 1.85), z - (petit ? 0.75 : 0.45)); c.lookAt(0, y + (petit ? 1.2 : 1.7), z + 8); }
    c.updateProjectionMatrix();
    if (this.dj) this.dj.visible = nom !== 'cabine';
  }

  /** Le public lève les bras quelques instants (bel enchaînement, effet réussi…). */
  acclamer(duree = 2.5) { this.clameur = Math.max(this.clameur, duree); }

  _nuage(nom, N, taille, opacite, duree, additif, init) {
    const pos = new Float32Array(N * 3), vit = new Float32Array(N * 3), coul = new Float32Array(N * 3), c = new THREE.Color(), rnd = alea(Math.floor(this.temps * 1000) + N);
    for (let i = 0; i < N; i++) { const [p, v] = init(i, rnd, c); pos.set(p, i * 3); vit.set(v, i * 3); coul.set([c.r, c.g, c.b], i * 3); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(coul, 3));
    const doux = nom === 'co2' || nom === 'fumee';
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: taille, vertexColors: true, transparent: true, opacity: opacite, depthWrite: false, map: doux ? this.halo : null, blending: additif ? THREE.AdditiveBlending : THREE.NormalBlending }));
    pts.frustumCulled = false; this.decor.add(pts);
    this.particules.push({ nom, pts, pos, vit, age: 0, duree, N, rnd, opacite });
  }

  /** Lance un effet spécial visible : 'confettis', 'etincelles', 'co2'. */
  tir(nom) {
    const y = this.yDJ, z = this.zDJ;
    if (nom === 'confettis') this._nuage(nom, 900, 0.09, 1, 9, false, (i, r, c) => { c.setHex(HABITS[1 + Math.floor(r() * 8)]); return [[(i % 2 ? 1 : -1) * 2.2, y + 1.2, z + 1.6], [(r() - 0.5) * 7, 5 + r() * 5, 1 + r() * 8]]; });
    else if (nom === 'etincelles') this._nuage(nom, 520, 0.06, 1, 12, true, (i, r, c) => { c.setRGB(1, 0.85, 0.5); return [[(i % 2 ? 1 : -1) * 1.9, y + 0.1, z + 1.8], [(r() - 0.5) * 0.9, 4 + r() * 3.2, (r() - 0.5) * 0.9]]; });
    else if (nom === 'co2') this._nuage(nom, 150, 0.9, 0.4, 1.7, false, (i, r, c) => { c.setRGB(0.88, 0.94, 1); return [[(i % 2 ? 1 : -1) * 2.4, y + 0.2 + r() * 0.3, z + 1.6], [(r() - 0.5) * 0.8, 7 + r() * 6, (r() - 0.5) * 0.8]]; });
  }

  // ------------------------------------------------------------------ à chaque image
  /** lum : sortie du pupitre ; phase : position en temps (battements) ; ambiance : 0 à 100 ; energie : 0 à 1. */
  maj(dt, { lum, phase = 0, ambiance = 0, energie = 0.5, musique = true }) {
    this.temps += dt;
    const L = this.lieu;
    if (!L) return;
    const P = lum ? lum.projecteurs : [], amb = lum ? lum.ambiance : [0, 0, 0], flash = lum ? lum.flash : 0, dens = lum ? lum.densite : 0, noir = !lum || lum.noir, uv = lum && lum.uv ? 1 : 0, c = L.clarte;
    // lumière générale : éclairage du lieu + couleur des projecteurs + éclairs
    this.ambiant.color.setRGB(c + amb[0] * 0.4 + flash * 1.3 + uv * 0.05, c * 0.97 + amb[1] * 0.4 + flash * 1.3, c * 0.92 + amb[2] * 0.4 + flash * 1.3 + uv * 0.28);
    this.ciel.intensity = Math.PI * (c * 0.55 + 0.04);
    this.face.color.setRGB(0.25 + amb[0], 0.25 + amb[1], 0.25 + amb[2]); this.face.intensity = Math.PI * (c * 0.35 + (noir ? 0 : 0.3) + flash * 0.8);
    this.scene.fog.density = (L.exterieur ? 0.003 : 0.006) + dens * (L.exterieur ? 0.013 : 0.055);
    this.scene.fog.color.setRGB((c + amb[0]) * 0.2 * (0.25 + dens), (c + amb[1]) * 0.2 * (0.25 + dens), (c + amb[2]) * 0.22 * (0.25 + dens));
    if (L.exterieur) this.scene.background.setRGB(0.006 + this.scene.fog.color.r * 0.4, 0.008 + this.scene.fog.color.g * 0.4, 0.02 + this.scene.fog.color.b * 0.4); else this.scene.background.copy(this.scene.fog.color);
    // faisceaux : on les voit surtout dans la fumée
    const voile = 0.06 + dens * 0.94, sols = 0, cotes = [[0, 0, 0, 0], [0, 0, 0, 0]];
    for (const f of this.faisceaux) {
      const o = P[f.idx], I = o ? o.intensite : 0, cl = o ? o.couleur : [0, 0, 0];
      f.lentille.color.setRGB(cl[0] * I * 1.5 + I * 0.25, cl[1] * I * 1.5 + I * 0.25, cl[2] * I * 1.5 + I * 0.25);
      if (f.type === 'par' || f.type === 'lyre') { const s = cotes[f.x < 0 ? 0 : 1]; s[0] += cl[0] * I; s[1] += cl[1] * I; s[2] += cl[2] * I; s[3]++; }
      f.rayons.forEach((r, k) => {
        let pan = 0, tilt = 0.5, lon = 30;
        if (f.type === 'par') { pan = f.x > 0 ? -0.2 : 0.2; tilt = f.idx % 2 ? 0.25 : 0.62; }
        else if (f.type === 'lyre') { pan = o ? o.pan : 0; tilt = o ? o.tilt : 0.5; }
        else if (f.type === 'derby') { const a = (o ? o.pan : 0) + (k / f.rayons.length) * Math.PI * 2; pan = Math.cos(a) * 0.75; tilt = 0.5 + Math.sin(a) * 0.4; }
        else if (f.type === 'laser') { pan = (o ? o.pan : 0) + (k - 4) * 0.13; tilt = o ? o.tilt : 0.5; lon = 60; }
        const ax = (tilt - 0.42) * 1.7, ay = pan;                                               // d'avant en arrière, puis de côté
        r.pivot.rotation.set(-ax, 0, 0); r.pivot.rotateOnWorldAxis(this.v3.set(0, 0, 1), ay);
        const hauteur = f.g.position.y - sols, portee = Math.min(lon, hauteur / Math.max(0.12, Math.cos(ax) * Math.cos(ay)));
        r.cone.scale.set(portee, portee, portee); r.cone.position.y = -portee / 2;
        r.mat.uniforms.couleur.value.setRGB(cl[0], cl[1], cl[2]);
        r.mat.uniforms.force.value = I * (f.type === 'laser' ? 0.35 + voile * 0.9 : voile * (f.type === 'par' ? 0.2 : 1));
        if (f.taches[k]) {
          const t = f.taches[k], dx = Math.tan(ay) * hauteur, dz = (Math.tan(ax) * hauteur) / Math.max(0.2, Math.cos(ay)), ray = (f.type === 'par' ? 0.4 : 0.13) * portee;
          t.position.set(f.g.position.x + dx, 0.03, f.g.position.z + dz);
          t.scale.set(ray, ray * (1 + (Math.abs(dz) / Math.max(1, hauteur)) * 0.5), 1);
          t.material.color.setRGB(cl[0] * I * 0.5, cl[1] * I * 0.5, cl[2] * I * 0.5);
        }
      });
    }
    this.pl.forEach((pl, k) => { const s = cotes[k]; if (s[3] && !noir) { pl.color.setRGB(s[0] / s[3], s[1] / s[3], s[2] / s[3]); pl.intensity = 34; } else pl.intensity = 0; });
    // boule à facettes
    if (this.points) {
      const B = this.points, allume = lum && lum.boule ? 1 : 0, b = B.boule.position, a = this.temps * 0.35, ca = Math.cos(a), sa = Math.sin(a), hl = L.l / 2 - 0.05, hp = L.p / 2 - 0.05;
      B.boule.rotation.y = a;
      B.pts.material.opacity = lerp(B.pts.material.opacity, allume * 0.95, 0.1);
      for (let i = 0; i < B.dirs.length; i++) {
        const [x0, y, z0] = B.dirs[i], x = x0 * ca - z0 * sa, z = x0 * sa + z0 * ca;
        let t = 1e9;
        if (x > 1e-4) t = Math.min(t, (hl - b.x) / x); else if (x < -1e-4) t = Math.min(t, (-hl - b.x) / x);
        if (z > 1e-4) t = Math.min(t, (hp - b.z) / z); else if (z < -1e-4) t = Math.min(t, (-hp - b.z) / z);
        if (y < -1e-4) t = Math.min(t, (0.03 - b.y) / y); else if (y > 1e-4) t = Math.min(t, (L.h - 0.03 - b.y) / y);
        if (L.exterieur) t = Math.min(t, 30);
        B.pos[i * 3] = b.x + x * t; B.pos[i * 3 + 1] = b.y + y * t; B.pos[i * 3 + 2] = b.z + z * t;
      }
      B.pts.geometry.attributes.position.needsUpdate = true;
    }
    // bouffées de la machine à fumée
    if (lum && lum.fumee) { this.tFumee -= dt; if (this.tFumee <= 0) { this.tFumee = 0.22; this._nuage('fumee', 22, 1.5, 0.2, 5, false, (i, r, c2) => { c2.setRGB(0.75, 0.76, 0.8); return [[1.9 + (r() - 0.5) * 0.2, this.yDJ + 0.2, this.zDJ + 1.6], [(r() - 0.5) * 1.6, 0.3 + r() * 0.9, 2.2 + r() * 3]]; }); } }
    // le DJ bat la mesure ; les membranes des enceintes vibrent
    const bat = phase - Math.floor(phase), coup = musique ? Math.exp(-bat * 6) : 0;
    if (this.djTete) this.djTete.rotation.x = coup * 0.22;
    if (this.enceintes) for (const hp of this.enceintes) hp.scale.setScalar(1 + coup * 0.06 * energie);
    this.clameur = Math.max(0, this.clameur - dt);
    this._gens(dt, phase, ambiance, energie, musique);
    this._particules(dt);
  }

  _gens(dt, phase, ambiance, energie, musique) {
    if (!this.im) { this.dansants = 0; return; }
    const part = clamp((ambiance / 100) * 1.15 - 0.08, 0, 1), rebond = Math.abs(Math.sin(phase * Math.PI)), m4 = this.m4, q = this.q, e3 = this.e3, s3 = this.s3, v3 = this.v3, im = this.im;
    const mains = clamp((ambiance - 55) / 40, 0, 1) * energie, zDJ = this.zDJ, T = this.temps;
    let dansants = 0;
    for (let i = 0; i < this.gens.length; i++) {
      const g = this.gens[i], veut = musique && g.envie < part ? 1 : 0, cible = veut ? g.danse : g.repos, dx = cible[0] - g.x, dz = cible[1] - g.z, dist = Math.hypot(dx, dz);
      let marche = 0;
      if (dist > 0.08) { const pas = Math.min(dist, dt * 1.3); g.x += (dx / dist) * pas; g.z += (dz / dist) * pas; marche = 1; g.cap = Math.atan2(dx, dz); }
      g.dansant = lerp(g.dansant, veut && !marche ? 1 : 0, 0.06);
      if (g.dansant > 0.5) dansants++;
      const dn = g.dansant * g.ampl, h = g.taille;
      const saut = dn * (0.04 + energie * 0.12) * (g.style === 1 ? Math.abs(Math.sin((phase + g.t) * Math.PI * 0.5)) : rebond);
      const balance = Math.sin((phase * 0.5 + g.t) * Math.PI) * dn * 0.09 + Math.sin(T * 0.7 + g.t) * 0.012;
      const face = Math.PI + Math.atan2(g.x * 0.3, 6 + g.z - zDJ), tourne = (marche ? g.cap : g.dansant > 0.3 ? face : face + Math.sin(g.t * 7) * 1.4) + Math.sin((phase * 0.25 + g.t) * Math.PI) * dn * 0.35;
      const cx = Math.cos(tourne), cz = -Math.sin(tourne), x = g.x + balance, z = g.z;
      s3.set(h, h, h);
      for (let b = 0; b < 2; b++) {                                                                    // jambes : elles marchent, ou marquent le temps
        const cote = b ? 1 : -1, a = marche ? Math.sin(T * 7 + g.t + b * Math.PI) * 0.55 : Math.sin((phase + g.t) * Math.PI + b * Math.PI) * 0.17 * dn;
        q.setFromEuler(e3.set(a, tourne, 0, 'YXZ'));
        m4.compose(v3.set(x + cx * cote * 0.1 * h, 0.86 * h + saut, z + cz * cote * 0.1 * h), q, s3); im.jambe.setMatrixAt(i * 2 + b, m4);
      }
      q.setFromEuler(e3.set(dn * 0.06, tourne, balance * 0.7, 'YXZ'));
      m4.compose(v3.set(x + balance * 0.4, 1.16 * h + saut, z), q, s3); im.buste.setMatrixAt(i, m4);
      q.setFromEuler(e3.set(Math.sin(phase * Math.PI * 2 + g.t) * 0.13 * dn, tourne, balance * 0.5, 'YXZ'));
      m4.compose(v3.set(x + balance * 0.7, 1.585 * h + saut * 1.05, z), q, s3); im.tete.setMatrixAt(i, m4); im.cheveux.setMatrixAt(i, m4);
      // bras : le long du corps, pliés en dansant, levés quand la piste s'enflamme
      const vague = Math.sin(T * 0.45 + g.t * 2.3) * 0.5 + 0.5;                                        // chacun lève les bras à son tour, pas tous ensemble
      g.bras = lerp(g.bras, veut && !marche ? (vague > (this.clameur > 0 ? 0.15 : 1.05 - 0.5 * mains) ? 1 : 0.3) : 0, 0.08);
      for (let b = 0; b < 2; b++) {
        const cote = b ? 1 : -1, leve = g.bras * (g.style === 2 && b ? 0.4 : 1);
        const ang = leve > 0.6 ? Math.PI - 0.45 + Math.sin((phase + g.t) * Math.PI * 2) * 0.25 * dn : marche ? Math.sin(T * 7 + g.t + b * Math.PI) * -0.4 : 0.12 + leve * 1.2 + Math.sin((phase + g.t + b * 0.5) * Math.PI) * 0.5 * dn;
        q.setFromEuler(e3.set(-ang, tourne, cote * (0.1 + leve * 0.16), 'YXZ'));
        m4.compose(v3.set(x + cx * cote * 0.25 * h + balance * 0.4, 1.42 * h + saut, z + cz * cote * 0.25 * h), q, s3); im.bras.setMatrixAt(i * 2 + b, m4);
      }
    }
    this.dansants = dansants;
    for (const m of Object.values(im)) m.instanceMatrix.needsUpdate = true;
  }

  _particules(dt) {
    for (const p of [...this.particules]) {
      p.age += dt;
      const n = p.nom, g = n === 'confettis' ? 2.4 : n === 'etincelles' ? 9 : n === 'fumee' ? -0.05 : -1.5, frein = n === 'confettis' ? 0.985 : n === 'fumee' ? 0.97 : 0.995;
      for (let i = 0; i < p.N; i++) {
        const k = i * 3;
        if (n === 'etincelles' && (p.pos[k + 1] < this.yDJ + 0.05 || p.age < 0.02) && p.age < p.duree - 1.5) {            // la fontaine continue de jaillir
          p.pos[k + 1] = this.yDJ + 0.1; p.pos[k] = (i % 2 ? 1 : -1) * 1.9; p.pos[k + 2] = this.zDJ + 1.8;
          p.vit[k] = (p.rnd() - 0.5) * 1.1; p.vit[k + 1] = 3.5 + p.rnd() * 3.6; p.vit[k + 2] = (p.rnd() - 0.5) * 1.1;
        }
        p.vit[k + 1] -= g * dt; p.vit[k] *= frein; p.vit[k + 2] *= frein;
        if (n === 'confettis' && p.vit[k + 1] < -1.1) p.vit[k + 1] = -1.1;
        if (n === 'fumee') p.vit[k + 1] *= 0.97;
        p.pos[k] += p.vit[k] * dt; p.pos[k + 1] = Math.max(0.02, p.pos[k + 1] + p.vit[k + 1] * dt); p.pos[k + 2] += p.vit[k + 2] * dt;
      }
      p.pts.geometry.attributes.position.needsUpdate = true;
      if (n === 'co2' || n === 'fumee') { p.pts.material.opacity = p.opacite * (1 - p.age / p.duree); if (n === 'fumee') p.pts.material.size = 1.5 + p.age * 1.1; }
      if (p.age > p.duree) { this.decor.remove(p.pts); p.pts.geometry.dispose(); p.pts.material.dispose(); this.particules.splice(this.particules.indexOf(p), 1); }
    }
  }

  rendre() { this.renderer.render(this.scene, this.camera); }
}
