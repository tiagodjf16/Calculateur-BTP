// Scénario d'essai : place la caméra à un endroit précis de la ville (point de vue d'une photo de référence) et photographie.
// Les vues sont lues dans la variable d'environnement VUES : "nom:x,z,cap[,hauteur[,champ]];…" (cap en degrés, 0 = nord, 90 = est).
module.exports = async (page, photo) => {
  await page.evaluate(() => { const b = document.querySelector('#aide-tactile:not([hidden]) #aide-fermer'); if (b) b.click(); document.querySelector('#hud').style.display = 'none'; });
  for (const v of (process.env.VUES || '').split(';').filter(Boolean)) {
    const [nom, reste] = v.split(':');
    const [x, z, cap, h = 2.5, champ = 75] = reste.split(',').map(Number);
    await page.evaluate(([x, z, cap, h, champ]) => {
      const j = window.__jeu, a = (cap * Math.PI) / 180;
      j.jeu.pause = true;
      j.vsav.groupe.position.set(x - Math.sin(a) * 400, -50, z + Math.cos(a) * 400);      // véhicule hors champ
      j.garde.piloteCamera = () => {
        j.camera.clearViewOffset();
        j.camera.position.set(x, j.monde.hauteur(x, z) + h, z);
        j.camera.fov = champ;
        j.camera.lookAt(x + Math.sin(a) * 50, j.monde.hauteur(x, z) + h - 1.5, z - Math.cos(a) * 50);
        j.camera.updateProjectionMatrix();
        return true;
      };
      j.monde.suivre = ((f) => (cam) => f.call(j.monde, cam, cam.position))(j.monde.constructor.prototype.suivre);    // ombres centrées sur la caméra
    }, [x, z, cap, h, champ]);
    await page.waitForTimeout(2500);
    await photo(nom);
  }
};
