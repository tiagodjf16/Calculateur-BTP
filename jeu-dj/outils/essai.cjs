// Essai automatique du jeu dans Chromium (Playwright) : les fichiers du projet sont servis par un petit serveur local, le temps de l'essai.
// Usage : node outils/essai.cjs outils/essais/<scénario>.cjs [dossier des captures]
// Variables : CSP=strict (imite un hébergement restrictif) · APPAREIL="iPhone 14 landscape" · SANS=worklet,ouvrier,stockage (pannes simulées)
//             RACINE_JEU=publication (essayer le dossier publié) · LARGEUR / HAUTEUR (fenêtre, 1280 × 720 par défaut)
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const [, , scenario, sortie = '.cache/essais'] = process.argv;
const RACINE = process.env.RACINE_JEU ? path.resolve(process.env.RACINE_JEU) : path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };
const CSP = process.env.CSP === 'strict' && "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:";
const SANS = (process.env.SANS || '').split(',');

(async () => {
  fs.mkdirSync(sortie, { recursive: true });
  const nav = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const APP = process.env.APPAREIL;
  if (APP && !devices[APP]) throw new Error('Appareil inconnu : ' + APP);
  const page = await nav.newPage(APP ? { ...devices[APP] } : { viewport: { width: +(process.env.LARGEUR || 1280), height: +(process.env.HAUTEUR || 720) }, deviceScaleFactor: 1 });
  if (SANS.includes('worklet')) await page.addInitScript(() => { Object.defineProperty(BaseAudioContext.prototype, 'audioWorklet', { get() { return { addModule: () => Promise.reject(new Error('panne simulée')) }; } }); });
  if (SANS.includes('ouvrier')) await page.addInitScript(() => { window.Worker = function () { throw new Error('panne simulée'); }; });
  if (SANS.includes('stockage')) await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('panne simulée'); } }); });
  const erreurs = [];
  // les messages du pilote graphique logiciel et l'avertissement du lecteur de secours ne sont pas des erreurs du jeu
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver Message|ScriptProcessorNode is deprecated/.test(m.text())) erreurs.push(`[${m.type()}] ${m.text()}`.slice(0, 400)); });
  page.on('pageerror', (e) => erreurs.push('[exception] ' + String(e.stack || e).slice(0, 700)));
  // Petit serveur de fichiers, le temps de l'essai (localhost est un contexte sécurisé : l'AudioWorklet y est disponible, comme en https).
  const serveur = require('http').createServer((req, res) => {
    const f = path.join(RACINE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('absent'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store', ...(CSP && f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {}) });
    res.end(fs.readFileSync(f));
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  await page.goto('http://localhost:' + serveur.address().port + '/index.html');
  await page.waitForSelector('#menu .grand', { timeout: 30000 }).catch(() => erreurs.push('le menu ne s\'est pas affiché'));
  const capture = (nom) => page.screenshot({ path: path.join(sortie, nom + '.png') });
  const outils = {
    capture, attendre: (s) => page.waitForTimeout(s * 1000), tactile: !!APP,
    /** clic (ou appui du doigt sur un téléphone) */
    clic: (sel) => (APP ? page.tap(sel) : page.click(sel)),
    /** exécute du code dans la page avec l'objet de test `dj` */
    dj: (f, arg) => page.evaluate(`(${f.toString()})(window.__dj, ${JSON.stringify(arg === undefined ? null : arg)})`),
    /** contrôle : affiche OK ou ÉCHEC */
    verifier: (nom, ok, detail = '') => { console.log((ok ? '  OK     ' : '  ÉCHEC  ') + nom + (detail !== '' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); if (!ok) process.exitCode = 1; },
  };
  if (scenario) {
    try { await require(path.resolve(scenario))(page, outils); } catch (err) { erreurs.push('[scénario] ' + String(err.stack || err).slice(0, 700)); await capture('erreur').catch(() => {}); }
  } else await capture('menu');
  if (erreurs.length) process.exitCode = 1;
  for (const e of erreurs.slice(0, 15)) console.log(e);
  console.log(erreurs.length ? erreurs.length + ' erreur(s) dans la page' : 'aucune erreur dans la page');
  await nav.close();
  serveur.close();
})();
