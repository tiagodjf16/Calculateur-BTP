// Le monde : Donzère réel (relief, photo aérienne, routes, bâtiments, eau, ciel) et les requêtes de jeu
// (altitude, route la plus proche, collisions, itinéraire GPS).
import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from '../vendor/jsm/loaders/RGBELoader.js';
import { alea, clamp, dansPolygone, procheSegment } from './outils.js';

const CARROSSABLE = new Set(['Route à 1 chaussée', 'Route à 2 chaussées', 'Rond-point', 'Bretelle', 'Route empierrée']);
const REVETUE = new Set(['Route à 1 chaussée', 'Route à 2 chaussées', 'Rond-point', 'Bretelle']);

/** Décode une chaîne base64 en octets. */
export function octets(b64) {
  if (Uint8Array.fromBase64) return Uint8Array.fromBase64(b64);
  const brut = atob(b64), oct = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) oct[i] = brut.charCodeAt(i);
  return oct;
}

const message = (e) => String((e && e.message) || e).slice(0, 160);

let decodeurPret = null;
/**
 * Décodeur des maillages compressés : WebAssembly si la page l'autorise, sinon la version JavaScript
 * (plus lente, même résultat). Certains hébergements interdisent WebAssembly par leur politique de sécurité.
 */
function decodeur() {
  if (!decodeurPret) {
    decodeurPret = (async () => {
      try {
        const { MeshoptDecoder } = await import('../vendor/jsm/libs/meshopt_decoder.module.js');
        if (MeshoptDecoder.supported) { await MeshoptDecoder.ready; return MeshoptDecoder; }
      } catch (e) { /* WebAssembly refusé : on passe au décodeur JavaScript */ }
      return (await import('../vendor/meshopt_decoder_reference.js')).MeshoptDecoder;
    })();
  }
  return decodeurPret;
}
decodeur().catch(() => {});                  // préparé dès le départ

/** Image à partir d'octets : par une balise <img> (adresse blob:), ou à défaut par décodage direct. */
async function imageIntegree(blob) {
  try {
    return await new Promise((ok, ko) => {
      const url = URL.createObjectURL(blob), img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); ok(img); };
      img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('image refusée')); };
      img.src = url;
    });
  } catch (e) {
    return await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  }
}

/**
 * Extension du chargeur glTF : les textures intégrées au fichier sont décodées ici, sans passer par fetch()
 * sur une adresse blob: (interdit par certains hébergements, ce qui laissait les modèles sans textures).
 */
function texturesIntegrees(parser) {
  const origine = parser.loadImageSource;
  parser.loadImageSource = function (index, loader) {
    const def = this.json.images[index];
    if (def.bufferView === undefined) return origine.call(this, index, loader);
    if (this.sourceCache[index] !== undefined) return this.sourceCache[index].then((t) => t.clone());
    this.sourceCache[index] = this.getDependency('bufferView', def.bufferView)
      .then((vue) => imageIntegree(new Blob([vue], { type: def.mimeType })))
      .then((image) => {
        const t = new THREE.Texture(image);
        t.needsUpdate = true;
        t.userData.mimeType = def.mimeType;
        return t;
      });
    return this.sourceCache[index];
  };
  return { name: 'TEXTURES_INTEGREES' };
}

async function chargeurGLTF() {
  const l = new GLTFLoader();
  l.setMeshoptDecoder(await decodeur());
  l.register(texturesIntegrees);
  return l;
}

/**
 * Charge un modèle : `base`.glb, ou à défaut `base`.json ({ "glb": "<base64>" }) pour les hébergements qui ne
 * servent pas les .glb. Le binaire est décodé ici puis analysé en mémoire, sans requête vers une adresse data:.
 */
export async function chargerModele(base) {
  const l = await chargeurGLTF();
  const echecs = [];
  try {
    return await l.loadAsync(base + '.glb');
  } catch (e) { echecs.push('.glb : ' + message(e)); }
  try {
    const rep = await fetch(base + '.json');
    if (!rep.ok) throw new Error('HTTP ' + rep.status);
    return await l.parseAsync(octets((await rep.json()).glb).buffer, base.replace(/[^/]*$/, ''));
  } catch (e) { echecs.push('.json : ' + message(e)); }
  throw new Error(`${base} (${echecs.join(' ; ')})`);
}

export class Monde {
  constructor(scene, renderer, leger) {
    this.scene = scene;
    this.renderer = renderer;
    this.leger = leger;
    this.tex = new THREE.TextureLoader();
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.alertes = [];                       // problèmes de chargement non bloquants, affichés sur l'écran d'accueil
    this.obstacles = [];                     // obstacles ronds (îlots de giratoire) : { x, z, r }
  }

  texture(url, opts = {}) {
    return new Promise((ok, ko) => this.tex.load(url, (t) => {
      t.colorSpace = opts.lineaire ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      t.anisotropy = this.aniso;
      if (opts.repete) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      ok(t);
    }, undefined, () => ko(new Error('Image introuvable : ' + url))));
  }

  async charger(etape) {
    etape('Données IGN de Donzère…', 0.05);
    const d = (this.d = await (await fetch('data/donzere.json')).json());
    [this.L, this.H] = d.taille;
    this.n = d.relief.n;
    this.rel = new Uint16Array(octets(d.relief.data).buffer);
    this._index();
    etape('Ciel et lumière…', 0.12);
    await this._ciel();
    etape('Relief et photo aérienne IGN…', 0.25);
    await this._terrain();
    etape('Routes…', 0.5);
    await this._routes();
    this._eau();
    etape('Bâtiments…', 0.6);
    await this._batiments();
    etape('Végétation…', 0.8);
    await this._vegetation();
  }

  // ------------------------------------------------------------------ relief
  /** Altitude du sol (m), identique à la surface affichée (interpolation par triangles). */
  hauteur(x, z) {
    const n = this.n;
    const fx = clamp(((x + this.L / 2) / this.L) * (n - 1), 0, n - 1.0001);
    const fz = clamp(((z + this.H / 2) / this.H) * (n - 1), 0, n - 1.0001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j;
    const r = this.rel, k = j * n + i;
    const a = r[k], b = r[k + 1], c = r[k + n], dd = r[k + n + 1];
    return (u + v <= 1 ? a + (b - a) * u + (c - a) * v : dd + (c - dd) * (1 - u) + (b - dd) * (1 - v)) / 100;
  }

  // ------------------------------------------------------------------ index spatiaux (routes, bâtiments)
  _index() {
    const d = this.d;
    // routes : segments rangés dans une grille de 50 m + graphe pour le GPS
    this.C = 50;
    this.grilleRoutes = new Map();
    this.noeuds = new Map();
    const cle = (x, z) => Math.round(x) + ',' + Math.round(z);
    const noeud = (x, z) => {
      const k = cle(x, z);
      if (!this.noeuds.has(k)) this.noeuds.set(k, { x, z, aretes: [] });
      return this.noeuds.get(k);
    };
    d.routes.forEach((r, ri) => {
      r.ok = CARROSSABLE.has(r.n);
      if (!r.ok) return;
      const p = r.p;
      let long = 0;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
        long += Math.hypot(bx - ax, bz - az);
        const i0 = Math.floor(Math.min(ax, bx) / this.C), i1 = Math.floor(Math.max(ax, bx) / this.C);
        const j0 = Math.floor(Math.min(az, bz) / this.C), j1 = Math.floor(Math.max(az, bz) / this.C);
        for (let gi = i0; gi <= i1; gi++) for (let gj = j0; gj <= j1; gj++) {
          const k = gi + ',' + gj;
          if (!this.grilleRoutes.has(k)) this.grilleRoutes.set(k, []);
          this.grilleRoutes.get(k).push([ax, az, bx, bz, ri]);
        }
      }
      const A = noeud(p[0], p[1]), B = noeud(p[p.length - 2], p[p.length - 1]);
      const cout = long * (r.n === 'Route empierrée' ? 3 : r.w >= 6 ? 0.8 : 1);
      A.aretes.push({ vers: B, cout, r, sens: 1 });
      B.aretes.push({ vers: A, cout, r, sens: -1 });
    });
    // bâtiments : grille de 40 m
    this.CB = 40;
    this.grilleBat = new Map();
    d.batiments.forEach((b, bi) => {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, cx = 0, cz = 0;
      for (let i = 0; i < b.p.length; i += 2) {
        x0 = Math.min(x0, b.p[i]); x1 = Math.max(x1, b.p[i]); z0 = Math.min(z0, b.p[i + 1]); z1 = Math.max(z1, b.p[i + 1]);
        cx += b.p[i]; cz += b.p[i + 1];
      }
      b.cx = cx / (b.p.length / 2); b.cz = cz / (b.p.length / 2);
      b.boite = [x0, z0, x1, z1];
      for (let gi = Math.floor(x0 / this.CB); gi <= Math.floor(x1 / this.CB); gi++)
        for (let gj = Math.floor(z0 / this.CB); gj <= Math.floor(z1 / this.CB); gj++) {
          const k = gi + ',' + gj;
          if (!this.grilleBat.has(k)) this.grilleBat.set(k, []);
          this.grilleBat.get(k).push(bi);
        }
    });
    // lieux utiles
    const lieu = (motif) => d.lieux.find((l) => motif.test(l.n));
    const cas = lieu(/Caserne de pompiers/i);
    this.caserne = cas ? { x: cas.x, z: cas.z, nom: cas.nom || 'Centre de secours' } : { x: 0, z: 0, nom: 'Centre de secours' };
    // sortie nord par la N7 : direction du centre hospitalier de Montélimar
    let nord = null;
    for (const r of d.routes) {
      if (!r.ok || !/NATIONALE 7|N7\b/i.test(r.nom || '')) continue;
      for (let i = 0; i < r.p.length; i += 2) if (!nord || r.p[i + 1] < nord.z) nord = { x: r.p[i], z: r.p[i + 1] };
    }
    this.hopital = nord || { x: this.L / 2 - 60, z: -this.H / 2 + 60 };
  }

  /** Route carrossable la plus proche : { d, x, z, dx, dz, r } (dx, dz = direction de la route). */
  routeProche(x, z, rayon = 120) {
    let meilleur = null, md = rayon;
    const gi0 = Math.floor((x - rayon) / this.C), gi1 = Math.floor((x + rayon) / this.C);
    const gj0 = Math.floor((z - rayon) / this.C), gj1 = Math.floor((z + rayon) / this.C);
    for (let gi = gi0; gi <= gi1; gi++) for (let gj = gj0; gj <= gj1; gj++) {
      const segs = this.grilleRoutes.get(gi + ',' + gj);
      if (!segs) continue;
      for (const s of segs) {
        const [px, pz] = procheSegment(x, z, s[0], s[1], s[2], s[3]);
        const dd = Math.hypot(px - x, pz - z);
        if (dd < md) {
          md = dd;
          const l = Math.hypot(s[2] - s[0], s[3] - s[1]) || 1;
          meilleur = { d: dd, x: px, z: pz, dx: (s[2] - s[0]) / l, dz: (s[3] - s[1]) / l, r: this.d.routes[s[4]] };
        }
      }
    }
    return meilleur;
  }

  /** Repousse un disque (x, z, rayon) hors des bâtiments. Renvoie [dx, dz] ou null. */
  collision(x, z, rayon) {
    for (const o of this.obstacles) {
      const dx = x - o.x, dz = z - o.z, dd = Math.hypot(dx, dz);
      if (dd < o.r + rayon) { const s = (o.r + rayon - dd) / (dd || 1e-6); return [dx * s, dz * s]; }
    }
    const lus = this.grilleBat.get(Math.floor(x / this.CB) + ',' + Math.floor(z / this.CB));
    if (!lus) return null;
    for (const bi of lus) {
      const b = this.d.batiments[bi];
      if (x < b.boite[0] - rayon || x > b.boite[2] + rayon || z < b.boite[1] - rayon || z > b.boite[3] + rayon) continue;
      let md = 1e9, mx = 0, mz = 0;
      const p = b.p;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        const [px, pz] = procheSegment(x, z, p[j], p[j + 1], p[i], p[i + 1]);
        const dd = Math.hypot(px - x, pz - z);
        if (dd < md) { md = dd; mx = px; mz = pz; }
      }
      const dedans = dansPolygone(x, z, p);
      if (dedans || md < rayon) {
        const l = md || 1e-6;
        const s = dedans ? -(md + rayon) / l : (rayon - md) / l;
        return [(x - mx) * s, (z - mz) * s];
      }
    }
    return null;
  }

  /** Itinéraire routier (liste de points [x, z]) entre deux positions, ou null. */
  itineraire(x0, z0, x1, z1) {
    const proche = (x, z) => {
      let m = null, md = 1e9;
      for (const nd of this.noeuds.values()) {
        const dd = (nd.x - x) ** 2 + (nd.z - z) ** 2;
        if (dd < md) { md = dd; m = nd; }
      }
      return m;
    };
    const dep = proche(x0, z0), arr = proche(x1, z1);
    if (!dep || !arr) return null;
    const dist = new Map([[dep, 0]]), prec = new Map(), faits = new Set();
    const file = [dep];
    while (file.length) {
      let k = 0;
      for (let i = 1; i < file.length; i++) if (dist.get(file[i]) < dist.get(file[k])) k = i;
      const u = file.splice(k, 1)[0];
      if (u === arr) break;
      if (faits.has(u)) continue;
      faits.add(u);
      for (const a of u.aretes) {
        const nd = dist.get(u) + a.cout;
        if (nd < (dist.get(a.vers) ?? 1e12)) { dist.set(a.vers, nd); prec.set(a.vers, [u, a]); file.push(a.vers); }
      }
    }
    if (!prec.has(arr) && arr !== dep) return null;
    const morceaux = [];
    for (let u = arr; prec.has(u);) {
      const [avant, a] = prec.get(u);
      const pts = [];
      for (let i = 0; i < a.r.p.length; i += 2) pts.push([a.r.p[i], a.r.p[i + 1]]);
      morceaux.push(a.sens === 1 ? pts : pts.reverse());
      u = avant;
    }
    const chemin = [[x0, z0]];
    for (const m of morceaux.reverse()) for (const pt of m) chemin.push(pt);
    chemin.push([x1, z1]);
    return chemin;
  }

  // ------------------------------------------------------------------ ciel et lumière
  async _ciel() {
    const c = (this.ciel = await (await fetch('data/ciel.json')).json());
    const scene = this.scene;
    // direction du soleil dans l'image (convention panoramique de three.js), puis rotation pour le placer au sud-ouest
    const a0 = (c.u_soleil - 0.5) * 2 * Math.PI;
    const voulu = Math.atan2(0.86, -0.5);                     // z vers le sud, x vers l'ouest
    const rot = a0 - voulu;
    const el = c.elevation;
    this.soleilDir = new THREE.Vector3(Math.cos(el) * Math.cos(voulu), Math.sin(el), Math.cos(el) * Math.sin(voulu)).normalize();
    let env;
    try {
      env = await new Promise((ok, ko) => new RGBELoader().load('ciel/env.hdr', ok, undefined, ko));
    } catch (e) {
      // même image, livrée en JSON (base64) pour les hébergements qui ne servent pas les .hdr
      const d = new RGBELoader().parse(octets((await (await fetch('ciel/env.json')).json()).hdr).buffer);
      env = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, d.type);
      Object.assign(env, { colorSpace: THREE.LinearSRGBColorSpace, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, flipY: true, needsUpdate: true });
    }
    env.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = env;
    scene.environmentRotation = new THREE.Euler(0, rot, 0);
    scene.environmentIntensity = 1.25;
    // dôme du ciel (photo), non soumis au « développement » de l'image
    const carte = await this.texture(this.leger ? 'ciel/dome_leger.jpg' : 'ciel/dome.jpg');
    const bas = (c.sous_horizon_deg * Math.PI) / 180;
    const geo = new THREE.SphereGeometry(9000, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2 + bas);
    const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: carte, color: new THREE.Color(1.14, 1.12, 1.08), side: THREE.DoubleSide, toneMapped: false, fog: false, depthWrite: false }));
    dome.scale.z = -1;
    dome.rotation.y = rot;
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    scene.add(dome);
    this.dome = dome;
    const h = c.horizon;
    this.brume = new THREE.Color().setRGB(h[0] / 255, h[1] / 255, h[2] / 255, THREE.SRGBColorSpace);
    scene.fog = new THREE.FogExp2(this.brume, 0.00042);
    // soleil : lumière directionnelle avec ombres, qui suit le véhicule
    const e = c.eclairement_soleil, m = Math.max(...e);
    const soleil = new THREE.DirectionalLight(new THREE.Color(e[0] / m, e[1] / m, e[2] / m), m * 0.9);
    soleil.castShadow = true;
    const t = this.leger ? 1024 : 4096, portee = this.leger ? 70 : 150;
    soleil.shadow.mapSize.set(t, t);
    Object.assign(soleil.shadow.camera, { left: -portee, right: portee, top: portee, bottom: -portee, near: 10, far: 900 });
    soleil.shadow.bias = -0.0004;
    soleil.shadow.normalBias = 0.06;
    scene.add(soleil, soleil.target);
    this.soleil = soleil;
    this.porteeOmbres = portee;
  }

  /** Active ou coupe les ombres portées du soleil (coupées en qualité « économie »). */
  ombres(actives) { if (this.soleil && this.soleil.castShadow !== actives) this.soleil.castShadow = actives; }

  /** À appeler à chaque image : le ciel et les ombres suivent la caméra / le véhicule. */
  suivre(camera, cible) {
    this.dome.position.set(camera.position.x, 0, camera.position.z);
    if (this.dallesArbres) for (const d of this.dallesArbres.values()) {
      const pres = Math.hypot(d.x - camera.position.x, d.z - camera.position.z) < this.porteeArbres + (d.groupe.visible ? 12 : 0);
      if (d.groupe.visible !== pres) d.groupe.visible = pres;
      if (d.loin && d.loin.visible === pres) d.loin.visible = !pres;
    }
    // on aligne la carte d'ombres sur une grille pour éviter le scintillement
    const pas = (this.porteeOmbres * 2) / this.soleil.shadow.mapSize.x * 8;
    const cx = Math.round(cible.x / pas) * pas, cz = Math.round(cible.z / pas) * pas;
    this.soleil.target.position.set(cx, cible.y, cz);
    this.soleil.position.copy(this.soleil.target.position).addScaledVector(this.soleilDir, 450);
  }

  // ------------------------------------------------------------------ terrain
  async _terrain() {
    const n = this.n, L = this.L, H = this.H, rel = this.rel;
    const q = this.leger ? 1 : 2;                                  // dalles de photo aérienne par côté
    const cartes = [];
    if (q === 1) cartes.push(await this.texture('data/ortho.jpg'));
    else for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) cartes.push(await this.texture(`data/ortho_${i}_${j}.jpg`));
    this.orthoLeger = q === 1 ? cartes[0] : await this.texture('data/ortho.jpg');
    const [solFlou, solClasses, solHerbe, solBitume, solTerre] = await Promise.all([this.texture('textures/sol_flou.jpg'), this.texture('textures/sol_classes.png', { lineaire: true }),
      this.texture('textures/sol_herbe.jpg', { repete: true }), this.texture('textures/sol_bitume.jpg', { repete: true }), this.texture('textures/sol_terre.jpg', { repete: true })]);
    const pasX = L / (n - 1), pasZ = H / (n - 1);
    const h = (i, j) => rel[clamp(j, 0, n - 1) * n + clamp(i, 0, n - 1)] / 100;
    const m = (n - 1) / q;
    this.sol = new THREE.Group();
    for (let qj = 0; qj < q; qj++) for (let qi = 0; qi < q; qi++) {
      const nv = m + 1;
      const pos = new Float32Array(nv * nv * 3), uv = new Float32Array(nv * nv * 2), nor = new Float32Array(nv * nv * 3);
      for (let j = 0; j < nv; j++) for (let i = 0; i < nv; i++) {
        const gi = qi * m + i, gj = qj * m + j, k = j * nv + i;
        pos.set([-L / 2 + gi * pasX, h(gi, gj), -H / 2 + gj * pasZ], k * 3);
        uv.set([i / m, 1 - j / m], k * 2);
        const nx = (h(gi - 1, gj) - h(gi + 1, gj)) / (2 * pasX), nz = (h(gi, gj - 1) - h(gi, gj + 1)) / (2 * pasZ);
        const l = Math.hypot(nx, 1, nz);
        nor.set([nx / l, 1 / l, nz / l], k * 3);
      }
      const idx = new Uint32Array(m * m * 6);
      let t = 0;
      for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
        const a = j * nv + i, b = a + 1, c = a + nv, dd = c + 1;
        idx.set([a, c, b, b, c, dd], t); t += 6;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      // pas de reflet spéculaire sur le sol : sinon le ciel « délave » la photo aérienne en vue rasante
      const mat = new THREE.MeshPhysicalMaterial({ map: cartes[qj * q + qi], roughness: 1, metalness: 0, specularIntensity: 0 });
      // De près, on remplace la photo aérienne (voitures, ombres « écrasées ») par de vraies matières
      // (herbe, bitume, terre) choisies et teintées d'après la photo ; au loin, on garde la photo.
      const quad = new THREE.Vector4(qi / q, (q - 1 - qj) / q, 1 / q, 1 / q);
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, { uFlou: { value: solFlou }, uClasses: { value: solClasses }, uHerbe: { value: solHerbe }, uBitume: { value: solBitume },
          uTerre: { value: solTerre }, uQuad: { value: quad }, uTaille: { value: new THREE.Vector2(L, H) } });
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D uFlou, uClasses, uHerbe, uBitume, uTerre;\nuniform vec4 uQuad;\nuniform vec2 uTaille;')
          .replace('#include <map_fragment>', `#include <map_fragment>
            vec2 uvG = vMapUv * uQuad.zw + uQuad.xy;
            vec2 m = uvG * uTaille;
            float lumi = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
            vec3 loin = diffuseColor.rgb * clamp(0.105 / max(lumi, 0.012), 1.0, 2.4) * 0.86;
            vec3 cl = texture2D(uClasses, uvG).rgb;
            cl /= max(cl.r + cl.g + cl.b, 0.001);
            vec3 detail = texture2D(uHerbe, m / 3.1).rgb * texture2D(uHerbe, m / 17.0).rgb * 4.0 * cl.r
                        + texture2D(uBitume, m / 4.3).rgb * 2.0 * cl.g
                        + texture2D(uTerre, m / 2.7).rgb * texture2D(uTerre, m / 13.0).rgb * 4.0 * cl.b;
            vec3 pres = texture2D(uFlou, uvG).rgb * detail * (vec3(0.50, 0.58, 0.40) * cl.r + vec3(1.08) * cl.g + vec3(0.74) * cl.b);
            float k = 1.0 - smoothstep(45.0, 170.0, length(vViewPosition));
            diffuseColor.rgb = mix(loin, pres, k);`);
      };
      const maille = new THREE.Mesh(geo, mat);
      maille.receiveShadow = true;
      this.sol.add(maille);
    }
    this.scene.add(this.sol);
    // au-delà de la carte : une grande plaine de la couleur des champs, fondue dans la brume
    const loin = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), new THREE.MeshPhysicalMaterial({ color: 0x6f6a52, roughness: 1, specularIntensity: 0 }));
    loin.rotation.x = -Math.PI / 2;
    loin.position.y = -1.5;
    this.scene.add(loin);
  }

  // ------------------------------------------------------------------ routes
  async _routes() {
    const [enrobe, enrobeN] = await Promise.all([this.texture('textures/enrobe.jpg', { repete: true }), this.texture('textures/enrobe_n.jpg', { repete: true, lineaire: true })]);
    const P = [], UV = [], C = [], I = [];
    const MP = [], MI = [];
    const point = (x, z, a) => { P.push(x, this.hauteur(x, z) + 0.07, z); UV.push(x / 5, z / 5); C.push(1, 1, 1, a); return P.length / 3 - 1; };
    const marque = (x0, z0, x1, z1, larg) => {
      const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nx = (-dz / l) * larg / 2, nz = (dx / l) * larg / 2;
      const b = MP.length / 3;
      for (const [x, z] of [[x0 - nx, z0 - nz], [x0 + nx, z0 + nz], [x1 + nx, z1 + nz], [x1 - nx, z1 - nz]]) MP.push(x, this.hauteur(x, z) + 0.1, z);
      MI.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    for (const r of this.d.routes) {
      if (!REVETUE.has(r.n)) continue;
      // on rééchantillonne la route tous les 4 m environ pour épouser le relief
      const pts = [];
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i], az = r.p[i + 1], bx = r.p[i + 2], bz = r.p[i + 3];
        const k = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
        for (let s = 0; s < k; s++) pts.push([ax + ((bx - ax) * s) / k, az + ((bz - az) * s) / k]);
      }
      pts.push([r.p[r.p.length - 2], r.p[r.p.length - 1]]);
      const demi = Math.max(1.6, r.w / 2 + 0.25), fondu = 0.5;
      let prec = null, cumul = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
        const [x, z] = pts[i];
        const ligne = [point(x - nx * (demi + fondu), z - nz * (demi + fondu), 0), point(x - nx * demi, z - nz * demi, 1),
          point(x + nx * demi, z + nz * demi, 1), point(x + nx * (demi + fondu), z + nz * (demi + fondu), 0)];
        if (prec) for (let k = 0; k < 3; k++) I.push(prec[k], ligne[k], prec[k + 1], prec[k + 1], ligne[k], ligne[k + 1]);
        // marquage : axe en pointillés (3 m tracés, 10 m d'intervalle) sur les routes assez larges, rives sur les grands axes
        if (i > 0 && r.n !== 'Rond-point') {
          const p0 = pts[i - 1], seg = Math.hypot(x - p0[0], z - p0[1]);
          if (r.w >= 5.4 && cumul % 13 < 3) marque(p0[0], p0[1], x, z, 0.13);
          if (r.w >= 6.4) for (const s of [-1, 1]) marque(p0[0] + nx * s * (r.w / 2 - 0.2), p0[1] + nz * s * (r.w / 2 - 0.2), x + nx * s * (r.w / 2 - 0.2), z + nz * s * (r.w / 2 - 0.2), 0.16);
          cumul += seg;
        }
        prec = ligne;
      }
    }
    this._abords(marque);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 4));
    geo.setIndex(I);
    geo.computeVertexNormals();
    const mat = new THREE.MeshPhysicalMaterial({ map: enrobe, normalMap: enrobeN, roughness: 0.92, metalness: 0, specularIntensity: 0.35, vertexColors: true, transparent: true,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const chaussee = new THREE.Mesh(geo, mat);
    chaussee.receiveShadow = true;
    chaussee.renderOrder = 1;
    this.scene.add(chaussee);
    const gm = new THREE.BufferGeometry();
    gm.setAttribute('position', new THREE.Float32BufferAttribute(MP, 3));
    gm.setIndex(MI);
    gm.computeVertexNormals();
    const peinture = new THREE.Mesh(gm, new THREE.MeshStandardMaterial({ color: 0xd9d9d2, roughness: 0.7, transparent: true, opacity: 0.82,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    peinture.receiveShadow = true;
    peinture.renderOrder = 2;
    this.scene.add(peinture);
  }

  _eau() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1d3238, roughness: 0.06, metalness: 0.0, envMapIntensity: 1.4 });
    for (const e of this.d.eau) {
      const pts = [];
      let bas = 1e9;
      for (let i = 0; i < e.p.length; i += 2) { pts.push(new THREE.Vector2(e.p[i], -e.p[i + 1])); bas = Math.min(bas, this.hauteur(e.p[i], e.p[i + 1])); }
      if (pts.length < 3) continue;
      const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat);
      m.position.y = bas + 0.12;
      this.scene.add(m);
    }
  }

  /**
   * Abords des rues en agglomération : trottoirs avec leur bordure, îlots des giratoires, passages piétons.
   * Les trottoirs s'interrompent aux carrefours et là où un bâtiment touche la chaussée.
   */
  _abords(marque) {
    const P = [], C = [], I = [];
    const quad = (a, b, c, d, coul) => {
      const k = P.length / 3;
      for (const p of [a, b, c, d]) { P.push(p[0], p[1], p[2]); C.push(coul[0], coul[1], coul[2]); }
      I.push(k, k + 1, k + 2, k, k + 2, k + 3);
    };
    // zones bâties : cases de 20 m à moins de 14 m d'un bâtiment
    const bati = new Set();
    for (const b of this.d.batiments) {
      if (!b.boite) continue;
      for (let i = Math.floor((b.boite[0] - 14) / 20); i <= Math.floor((b.boite[2] + 14) / 20); i++)
        for (let j = Math.floor((b.boite[1] - 14) / 20); j <= Math.floor((b.boite[3] + 14) / 20); j++) bati.add(i + ',' + j);
    }
    const enVille = (x, z) => bati.has(Math.floor(x / 20) + ',' + Math.floor(z / 20));
    const DALLE = [0.23, 0.225, 0.215], BORD = [0.37, 0.365, 0.35], PIERRE = [0.42, 0.39, 0.33], TERRE = [0.15, 0.19, 0.09];      // couleurs linéaires
    const HT = 0.13, LARG = 1.4;
    for (const r of this.d.routes) {
      if (!REVETUE.has(r.n) || r.n === 'Rond-point' || r.n === 'Bretelle' || r.w < 3) continue;
      const pts = [];
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i], az = r.p[i + 1], bx = r.p[i + 2], bz = r.p[i + 3];
        const k = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
        for (let s = 0; s < k; s++) pts.push([ax + ((bx - ax) * s) / k, az + ((bz - az) * s) / k]);
      }
      pts.push([r.p[r.p.length - 2], r.p[r.p.length - 1]]);
      const d0 = Math.max(1.6, r.w / 2 + 0.25) + 0.05;
      for (const s of [-1, 1]) {
        const lignes = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (-(b[1] - a[1]) / l) * s, nz = ((b[0] - a[0]) / l) * s;
          const [x, z] = pts[i];
          const xi = x + nx * d0, zi = z + nz * d0, xe = x + nx * (d0 + LARG), ze = z + nz * (d0 + LARG), xm = (xi + xe) / 2, zm = (zi + ze) / 2;
          let ok = enVille(xm, zm) && !this.collision(xe, ze, 0.25) && !this.collision(xm, zm, 0.25);
          if (ok) { const rp = this.routeProche(xm, zm, 14); if (rp && rp.r !== r && rp.d < rp.r.w / 2 + 1.2) ok = false; }
          const yi = this.hauteur(xi, zi) + 0.07, ye = this.hauteur(xe, ze) + 0.07;
          lignes.push(ok ? [[xi, yi, zi], [xi, yi + HT, zi], [xe, ye + HT, ze], [xe, ye - 0.1, ze]] : null);
        }
        // seuls les tronçons continus d'au moins 12 m sont posés (pas de dalle isolée)
        for (let i = 0; i < lignes.length; i++) {
          if (!lignes[i]) continue;
          let j = i;
          while (j + 1 < lignes.length && lignes[j + 1]) j++;
          if (j - i >= 3) for (let k = i + 1; k <= j; k++) {
            const prec = lignes[k - 1], ligne = lignes[k];
            quad(prec[1], prec[2], ligne[2], ligne[1], DALLE);        // dessus du trottoir
            quad(prec[0], prec[1], ligne[1], ligne[0], BORD);         // bordure côté chaussée
            quad(prec[2], prec[3], ligne[3], ligne[2], DALLE);        // chant côté riverains
          }
          i = j;
        }
      }
      // passage piéton à l'approche d'un carrefour, sur une partie des rues de ville assez larges
      const long = pts.length * 4;
      if (r.w >= 4.5 && long > 30 && enVille(pts[0][0], pts[0][1]) && Math.abs(Math.round(r.p[0] * 7 + r.p[1] * 13)) % 5 < 2) {
        const k = Math.min(pts.length - 2, 2), [x, z] = pts[k], [x2, z2] = pts[k + 1];
        const l = Math.hypot(x2 - x, z2 - z) || 1, tx = (x2 - x) / l, tz = (z2 - z) / l;
        for (let e = -r.w / 2 + 0.5; e <= r.w / 2 - 0.5; e += 1.0) marque(x - tz * e, z + tx * e, x - tz * e + tx * 2.6, z + tx * e + tz * 2.6, 0.5);
      }
    }
    // giratoires : les tronçons d'un même anneau sont réunis, puis on pose l'îlot central (muret de pierre, terre-plein)
    const ronds = this.d.routes.filter((r) => r.n === 'Rond-point');
    const parent = ronds.map((_, i) => i), racine = (i) => (parent[i] === i ? i : (parent[i] = racine(parent[i])));
    const bouts = ronds.map((r) => [[r.p[0], r.p[1]], [r.p[r.p.length - 2], r.p[r.p.length - 1]]]);
    for (let i = 0; i < ronds.length; i++) for (let j = i + 1; j < ronds.length; j++)
      if (bouts[i].some((a) => bouts[j].some((b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1.5))) parent[racine(i)] = racine(j);
    const anneaux = new Map();
    ronds.forEach((r, i) => {
      const k = racine(i);
      if (!anneaux.has(k)) anneaux.set(k, { pts: [], w: r.w });
      for (let q = 0; q < r.p.length; q += 2) anneaux.get(k).pts.push([r.p[q], r.p[q + 1]]);
    });
    this.giratoires = [];
    for (const g of anneaux.values()) {
      const xs = g.pts.map((p) => p[0]), zs = g.pts.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
      const rs = g.pts.map((p) => Math.hypot(p[0] - cx, p[1] - cz)), rm = rs.reduce((a, b) => a + b, 0) / rs.length;
      const ri = rm - g.w / 2 - 0.5;
      if (g.pts.length < 8 || Math.max(...rs) - Math.min(...rs) > rm * 0.5 || ri < 1) continue;
      const y0 = this.hauteur(cx, cz) + 0.02, hm = ri < 7 ? 0.5 : 0.22, N = 28;
      for (let k = 0; k < N; k++) {
        const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
        const p0 = [cx + Math.cos(a0) * ri, y0, cz + Math.sin(a0) * ri], p1 = [cx + Math.cos(a1) * ri, y0, cz + Math.sin(a1) * ri];
        quad(p0, p1, [p1[0], y0 + hm, p1[2]], [p0[0], y0 + hm, p0[2]], PIERRE);
        quad([cx, y0 + hm + 0.12, cz], [p0[0], y0 + hm, p0[2]], [p1[0], y0 + hm, p1[2]], [cx, y0 + hm + 0.12, cz], TERRE);
      }
      this.obstacles.push({ x: cx, z: cz, r: ri });
      this.giratoires.push({ x: cx, z: cz, r: ri });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    geo.setIndex(I);
    geo.computeVertexNormals();
    const maille = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide, flatShading: true }));
    maille.receiveShadow = true;
    maille.castShadow = false;
    this.scene.add(maille);
    this.nbTrottoirs = I.length / 6;
  }

  // ------------------------------------------------------------------ bâtiments (générés dans Blender depuis la BD TOPO)
  async _batiments() {
    let gltf;
    try {
      // téléphone : même ville, textures deux fois plus petites (la mémoire graphique y est comptée)
      gltf = this.leger ? await chargerModele('modeles/batiments_leger').catch(() => chargerModele('modeles/batiments')) : await chargerModele('modeles/batiments');
    } catch (e) {
      console.warn('Bâtiments absents :', e.message);
      this.alertes.push('Bâtiments non chargés : ' + e.message);
      return;
    }
    // toits : formes mesurées par laser (IGN LiDAR HD). Chaque facette garde sa propre orientation : pans plans, arêtes vives.
    const platMat = new THREE.MeshStandardMaterial({ map: this.orthoLeger, roughness: 0.95, flatShading: true });
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      if (o.material.name === 'toit_plat') o.material = platMat;
      else {
        if (o.material.map) o.material.map.anisotropy = this.aniso;
        if (o.material.name === 'tuiles') {
          o.material.side = THREE.DoubleSide;
          o.material.flatShading = true;
          o.material.color.setScalar(1.3);              // la teinte de chaque toit est stockée divisée par 1,3
        }
        o.material.envMapIntensity = 0.9;
      }
    });
    this.scene.add(gltf.scene);
    this.batiments = gltf.scene;
  }

  // ------------------------------------------------------------------ végétation : arbres « imposteurs » (photos de vrais modèles 3D)
  async _vegetation() {
    let info;
    try {
      info = await (await fetch('textures/arbres.json')).json();
    } catch (e) {
      this.alertes.push('Arbres non chargés : ' + e.message);
      return;
    }
    const carte = await this.texture('textures/arbres.png');
    const rnd = alea(12345);
    const esp = info.especes;                                     // [{ vues: [[u0, u1], [u0, u1]], hauteur, largeur, poids, zones }]
    const places = esp.map(() => []);
    const max = this.leger ? 3000 : 11000;
    let total = 0;
    const libre = (x, z) => {
      const rp = this.routeProche(x, z, 14);
      return !(rp && rp.d < rp.r.w / 2 + 2.4) && !this.collision(x, z, 1.6);
    };
    const choisir = (candidats) => {
      let s = candidats.reduce((a, k) => a + esp[k].poids, 0), t = rnd() * s;
      for (const k of candidats) { t -= esp[k].poids; if (t <= 0) return k; }
      return candidats[0];
    };
    const surface = (p) => { let s = 0; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) s += p[j] * p[i + 1] - p[i] * p[j + 1]; return Math.abs(s) / 2; };
    // arbres réels : chacun a été repéré dans le relevé laser de l'IGN (position, hauteur, envergure) ; à défaut, on les devine
    const centre = await this._arbresCentre();
    const auCentre = (x, z) => !!centre && x > centre.zone[0] && x < centre.zone[2] && z > centre.zone[1] && z < centre.zone[3];
    // 1) bois, forêts et haies de la BD TOPO
    for (const v of this.d.vegetation) {
      if (centre) break;
      const dens = /Forêt fermée/.test(v.n) ? 1 / 50 : /Bois|Forêt ouverte/.test(v.n) ? 1 / 75 : /Haie/.test(v.n) ? 1 / 28 : /Verger/.test(v.n) ? 1 / 45 : 0;
      if (!dens) continue;
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let i = 0; i < v.p.length; i += 2) { x0 = Math.min(x0, v.p[i]); x1 = Math.max(x1, v.p[i]); z0 = Math.min(z0, v.p[i + 1]); z1 = Math.max(z1, v.p[i + 1]); }
      const nb = Math.min(600, Math.ceil(surface(v.p) * dens));
      const candidats = esp.map((e, k) => (new RegExp(e.zones).test(v.n) ? k : -1)).filter((k) => k >= 0);
      if (!candidats.length) continue;
      for (let k = 0, essais = 0; k < nb && essais < nb * 6 && total < max * 0.6; essais++) {
        const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
        if (!dansPolygone(x, z, v.p) || !libre(x, z)) continue;
        places[choisir(candidats)].push([x, z, 0.75 + rnd() * 0.6, rnd() * Math.PI]);
        k++; total++;
      }
    }
    // 2) arbres des jardins, parcs et rues : là où la photo aérienne montre un feuillage
    const img = this.orthoLeger.image, T = 1024;
    const cv = document.createElement('canvas');
    cv.width = cv.height = T;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, T, T);
    const px = g.getImageData(0, 0, T, T).data;
    const pas = this.leger ? 9 : 6.5, tous = esp.map((e, k) => k);
    for (let z = -this.H / 2 + 20; z < this.H / 2 - 20 && total < max; z += pas) {
      for (let x = -this.L / 2 + 20; x < this.L / 2 - 20 && total < max; x += pas) {
        const xx = x + (rnd() - 0.5) * pas, zz = z + (rnd() - 0.5) * pas;
        const k = (Math.floor(((zz + this.H / 2) / this.H) * T) * T + Math.floor(((xx + this.L / 2) / this.L) * T)) * 4;
        const r = px[k], v = px[k + 1], b = px[k + 2];
        if (v - (r + b) / 2 < 9 || r + v + b > 300 || rnd() > 0.5 || auCentre(xx, zz) || !libre(xx, zz)) continue;   // feuillage : vert et sombre
        places[choisir(tous)].push([xx, zz, 0.55 + rnd() * 0.55, rnd() * Math.PI]);
        total++;
      }
    }
    // arbres 3D du centre : de loin, ils sont remplacés par leur silhouette plate (dalles de 70 m, basculées selon la distance)
    const D3 = 70;
    if (centre) for (const [x, z, ray, h = ray * 2.4] of centre.arbres) {
      const cle = Math.floor(x / D3) + ',' + Math.floor(z / D3);
      places[0].push([x, z, clamp(h / esp[0].hauteur, 0.22, 2.6), rnd() * Math.PI, centre.denses.has(cle) ? undefined : 'L' + cle]);
      total++;
    }
    // deux plans croisés par arbre (une photo par plan), regroupés par dalles de 275 m pour n'afficher que les arbres visibles
    const D = 275, dalles = new Map();
    esp.forEach((e, ei) => {
      for (const [x, z, s, a, loin] of places[ei]) {
        const cle = loin || Math.floor(x / D) + ',' + Math.floor(z / D);
        if (!dalles.has(cle)) dalles.set(cle, { P: [], UV: [], N: [], I: [], C: [] });
        const tr = 0.72 + rnd() * 0.4, tv = 0.78 + rnd() * 0.34, tb = 0.6 + rnd() * 0.35;     // teinte propre à chaque arbre
        const t = dalles.get(cle), y = this.hauteur(x, z) - 0.12, hh = e.hauteur * s, dl = (e.largeur * s) / 2;
        for (let k = 0; k < 2; k++) {
          const ca = Math.cos(a + (k * Math.PI) / 2), sa = Math.sin(a + (k * Math.PI) / 2), b = t.P.length / 3;
          const [u0, u1] = e.vues[k];
          t.P.push(x - ca * dl, y, z - sa * dl, x + ca * dl, y, z + sa * dl, x + ca * dl, y + hh, z + sa * dl, x - ca * dl, y + hh, z - sa * dl);
          t.UV.push(u0, 0, u1, 0, u1, 1, u0, 1);
          for (let q = 0; q < 4; q++) t.C.push(tr, tv, tb);
          // normales « gonflées » vers l'extérieur et le haut : éclairage doux, comme un volume
          for (const [sx, sy] of [[-1, 0.2], [1, 0.2], [1, 1], [-1, 1]]) { const l = Math.hypot(sx * 0.7, sy + 0.45); t.N.push((ca * sx * 0.7) / l, (sy + 0.45) / l, (sa * sx * 0.7) / l); }
          t.I.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
      }
    });
    const mat = new THREE.MeshStandardMaterial({ map: carte, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.92, metalness: 0, envMapIntensity: 0.6, vertexColors: true });
    const ombre = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: carte, alphaTest: 0.45 });
    for (const [cle, t] of dalles) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(t.P, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(t.UV, 2));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(t.N, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(t.C, 3));
      geo.setIndex(t.I);
      const maille = new THREE.Mesh(geo, mat);
      maille.castShadow = true;
      maille.customDepthMaterial = ombre;
      this.scene.add(maille);
      if (cle[0] === 'L' && this.dallesArbres.has(cle.slice(1))) this.dallesArbres.get(cle.slice(1)).loin = maille;
    }
    this.nbArbres = total;
  }

  /**
   * Arbres du centre-ville en volume (platanes de la place et des boulevards, parc) : chaque arbre repéré sur la photo
   * aérienne reçoit un modèle 3D (tronc, branches, feuillage), regroupé avec ses voisins par dalles de 70 m.
   * Renvoie { zone, arbres } ou null si les modèles ne sont pas disponibles.
   */
  async _arbresCentre() {
    this.dallesArbres = new Map();
    let liste, gltf;
    try {
      liste = await (await fetch('data/arbres.json')).json();
      gltf = await chargerModele('modeles/arbres');
    } catch (e) {
      this.alertes.push('Arbres 3D non chargés : ' + e.message);
      return null;
    }
    // les maillages compressés sont stockés en entiers avec une mise à l'échelle sur leur nœud : on les remet en mètres
    const pieces = {};
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry, src = g.attributes.position, pos = new Float32Array(src.count * 3);
      for (let i = 0; i < src.count; i++) { pos[i * 3] = src.getX(i); pos[i * 3 + 1] = src.getY(i); pos[i * 3 + 2] = src.getZ(i); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const ns = g.attributes.normal, nrm = new Float32Array(ns.count * 3);
      for (let i = 0; i < ns.count; i++) { nrm[i * 3] = ns.getX(i); nrm[i * 3 + 1] = ns.getY(i); nrm[i * 3 + 2] = ns.getZ(i); }
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.applyMatrix4(o.matrixWorld);
      g.computeBoundingBox();
      pieces[o.name] = o;
    });
    const suffixe = this.leger ? '_feuilles_leger' : '_feuilles';
    const modeles = ['platane_a', 'platane_b', 'platane_c', 'jeune_a'].filter((n) => pieces[n + '_bois'] && pieces[n + suffixe]);
    if (modeles.length < 4) { this.alertes.push('Arbres 3D incomplets'); return null; }
    const feuille = pieces['platane_a' + suffixe].material, carte = feuille.map;
    carte.anisotropy = this.aniso;
    const matFeuilles = new THREE.MeshStandardMaterial({ map: carte, alphaTest: 0.4, vertexColors: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.55 });
    const matBois = pieces.platane_a_bois.material;
    matBois.envMapIntensity = 0.5;
    const ombre = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: carte, alphaTest: 0.4 });
    this.arbre3d = { pieces, matFeuilles, matBois, ombre, suffixe };
    // envergure de chaque modèle (pour l'ajuster au houppier repéré)
    const envergure = {};
    for (const n of modeles) { const g = pieces[n + suffixe].geometry; g.computeBoundingBox(); envergure[n] = (g.boundingBox.max.x - g.boundingBox.min.x + g.boundingBox.max.z - g.boundingBox.min.z) / 4; }
    const hauteurModele = {};
    for (const n of modeles) hauteurModele[n] = pieces[n + suffixe].geometry.boundingBox.max.y;
    const rnd = alea(777), D3 = 70, groupes = new Map(), M = new THREE.Matrix4(), q = new THREE.Quaternion(), haut = new THREE.Vector3(0, 1, 0);
    const cleDe = (x, z) => Math.floor(x / D3) + ',' + Math.floor(z / D3);
    // bois épais : trop d'arbres pour les dessiner en volume ; ils gardent leur silhouette (deux plans croisés)
    const compte = new Map();
    for (const [x, z] of liste.arbres) compte.set(cleDe(x, z), (compte.get(cleDe(x, z)) || 0) + 1);
    liste.denses = new Set([...compte].filter(([, nb]) => nb > (this.leger ? 40 : 75)).map(([cle]) => cle));
    for (const [x, z, ray, h = ray * 2.4] of liste.arbres) {
      const cle = cleDe(x, z);
      if (liste.denses.has(cle)) continue;
      const [ti, tj] = cle.split(',').map(Number);
      const n = h < 5.2 ? 'jeune_a' : modeles[Math.abs(ti * 7 + tj * 13) % 3];
      const ey = (h / hauteurModele[n]) * (0.96 + rnd() * 0.08);
      const exz = clamp(ray / envergure[n], ey * 0.7, ey * 1.5);
      if (!groupes.has(cle)) groupes.set(cle, {});
      const g = groupes.get(cle);
      (g[n] = g[n] || []).push(M.compose(new THREE.Vector3(x, this.hauteur(x, z) - 0.05, z), q.setFromAxisAngle(haut, rnd() * Math.PI * 2), new THREE.Vector3(exz, ey, exz)).clone());
    }
    for (const [cle, parModele] of groupes) {
      const groupe = new THREE.Group();
      for (const [n, matrices] of Object.entries(parModele)) {
        for (const [piece, mat] of [[n + '_bois', matBois], [n + suffixe, matFeuilles]]) {
          const im = new THREE.InstancedMesh(pieces[piece].geometry, mat, matrices.length);
          matrices.forEach((mx, i) => im.setMatrixAt(i, mx));
          im.castShadow = true;
          im.receiveShadow = piece.endsWith('_bois');
          if (mat === matFeuilles) im.customDepthMaterial = ombre;
          im.computeBoundingSphere();
          groupe.add(im);
        }
      }
      const [i, j] = cle.split(',').map(Number);
      this.scene.add(groupe);
      this.dallesArbres.set(cle, { groupe, x: (i + 0.5) * D3, z: (j + 0.5) * D3, loin: null });
    }
    this.porteeArbres = this.leger ? 95 : 190;
    return liste;
  }

  /** Un arbre isolé du catalogue (olivier du giratoire…), posé au sol. */
  planter(nom, x, z, echelle = 1, angle = 0) {
    const a = this.arbre3d;
    if (!a || !a.pieces[nom + '_bois']) return null;
    const g = new THREE.Group();
    for (const [piece, mat] of [[nom + '_bois', a.matBois], [nom + a.suffixe, a.matFeuilles]]) {
      const o = new THREE.Mesh(a.pieces[piece].geometry, mat);
      o.castShadow = true;
      if (mat === a.matFeuilles) o.customDepthMaterial = a.ombre;
      g.add(o);
    }
    g.position.set(x, this.hauteur(x, z), z);
    g.rotation.y = angle;
    g.scale.setScalar(echelle);
    this.scene.add(g);
    return g;
  }
}
