// Essai automatique du jeu dans Chromium (Playwright), sans serveur : les fichiers du projet sont servis par interception.
// Usage : node outils/essai.cjs <capture.png> [#options] [secondes] ["code JS à exécuter dans la page après le départ"]
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const [, , capture = 'essai.png', hash = '', attente = '6', code = ''] = process.argv;
const RACINE = process.env.RACINE_JEU ? path.resolve(process.env.RACINE_JEU) : path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream' };

// CSP=strict : imite un hébergement restrictif (pas de WebAssembly, pas de fetch vers data: ou blob:) ;
// CSP=wasm : le même avec WebAssembly autorisé ; CSP=sansblob : le même que strict, sans images blob:.
const POLITIQUES = {
  strict: ["'self' 'unsafe-inline'", "'self' data: blob:"],
  wasm: ["'self' 'unsafe-inline' 'wasm-unsafe-eval'", "'self' data: blob:"],
  sansblob: ["'self' 'unsafe-inline'", "'self' data:"],
};
const P = POLITIQUES[process.env.CSP];
const CSP = P && `default-src 'none'; script-src ${P[0]}; style-src 'self' 'unsafe-inline'; img-src ${P[1]}; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:`;

(async () => {
  const nav = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  // APPAREIL="iPhone 14", "iPhone 14 landscape", "Pixel 7"… : émulation d'un téléphone (écran tactile, taille, densité)
  const APP = process.env.APPAREIL;
  if (APP && !devices[APP]) throw new Error('Appareil inconnu : ' + APP);
  const page = await nav.newPage(APP ? { ...devices[APP] } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  // doigts : vrais appuis tactiles (plusieurs doigts à la fois), pour les scénarios
  const cdp = await page.context().newCDPSession(page);
  const points = new Map();
  const toucher = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...points.values()] });
  const doigts = {
    poser: async (id, x, y) => { points.set(id, { x, y, id }); await toucher('touchStart'); },
    bouger: async (id, x, y) => { points.set(id, { x, y, id }); await toucher('touchMove'); },
    // lever un seul doigt : « touchEnd » avec ce point-là (constaté dans Chromium : les points listés sont ceux qui se lèvent)
    lever: async (id) => { const p = points.get(id); points.delete(id); if (p) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [p] }); },
    /** centre d'un élément de la page */
    sur: async (sel) => { const b = await page.locator(sel).first().boundingBox(); if (!b) throw new Error('introuvable : ' + sel); return [b.x + b.width / 2, b.y + b.height / 2]; },
  };
  const erreurs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') erreurs.push(`[${m.type()}] ${m.text()}`.slice(0, 300)); });
  page.on('pageerror', (e) => erreurs.push('[exception] ' + String(e.stack || e).slice(0, 600)));
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    const f = path.join(RACINE, decodeURIComponent(u.pathname));
    if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'absent' });
    const entetes = CSP && f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {};
    route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', headers: entetes, body: fs.readFileSync(f) });
  });
  const t0 = Date.now();
  // « fixe » : la finesse de l'image ne s'adapte pas à la lenteur du rendu logiciel des essais
  await page.goto('http://jeu.test/index.html#' + [hash.replace('#', ''), 'fixe'].filter(Boolean).join('-'));
  try {
    await page.waitForFunction(() => { const b = document.querySelector('#jouer'); return (b && !b.disabled) || /Erreur/.test(document.querySelector('#charge-texte')?.textContent || ''); }, null, { timeout: 240000 });
  } catch (e) { erreurs.push('délai de chargement dépassé'); }
  console.log('chargement :', ((Date.now() - t0) / 1000).toFixed(1), 's —', await page.textContent('#charge-texte').catch(() => '?'));
  const diag = await page.textContent('#diagnostic').catch(() => '');
  if (diag) console.log('diagnostic :', diag.slice(0, 400));
  if (process.env.ACCUEIL) await page.screenshot({ path: capture.replace(/\.png$/, '_accueil.png') });
  if (await page.$('#jouer:not([disabled])')) {
    if (APP) await page.tap('#jouer'); else await page.click('#jouer');
    if (code.startsWith('@')) await require(path.resolve(code.slice(1)))(page, (nom) => page.screenshot({ path: capture.replace(/\.png$/, `_${nom}.png`) }), doigts).catch((err) => erreurs.push('[scénario] ' + String(err).slice(0, 300)));   // scénario en plusieurs étapes
    else if (code) { const r = await page.evaluate(code).catch((e) => 'ERREUR ' + e.message); if (r !== undefined) console.log('résultat :', JSON.stringify(r)); }
    await page.waitForTimeout(parseFloat(attente) * 1000);
    const infos = await page.evaluate(() => { const j = window.__jeu; const i = j.renderer.info; return { triangles: i.render.triangles, appels: i.render.calls, textures: i.memory.textures, x: +j.vsav.x.toFixed(1), z: +j.vsav.z.toFixed(1), v: +j.vsav.v.toFixed(2), etat: j.jeu.etat }; }).catch((e) => String(e));
    console.log('rendu :', JSON.stringify(infos));
  }
  await page.screenshot({ path: capture });
  for (const e of erreurs.slice(0, 12)) console.log(e);
  await nav.close();
})();
