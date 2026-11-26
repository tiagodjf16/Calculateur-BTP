// Variante « téléphone » d'un GLB : textures plafonnées (couleur d'un côté, relief/rugosité de l'autre),
// simplification des maillages, compression Meshopt. Sert à tenir dans la mémoire graphique d'un téléphone.
// Usage : node outils/leger.mjs entree.glb sortie.glb [ratio=0.5] [couleurMax=2048] [autresMax=1024] [erreur=0.001] [bitsPosition=14] [heros]
// heros : expression régulière sur le nom des textures de couleur qui gardent couleurMax (les autres passent à autresMax).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, weld, simplify, prune, compressTexture, listTextureSlots, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';

const [, , entree, sortie, ratio = '0.5', couleurMax = '2048', autresMax = '1024', erreur = '0.001', bitsPosition = '14', heros = ''] = process.argv;
const herosRe = heros ? new RegExp(heros) : null;
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(entree);
const triangles = () => {
  let t = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return Math.round(t);
};
const memoire = () => doc.getRoot().listTextures().reduce((s, t) => { const d = t.getSize(); return s + (d ? d[0] * d[1] * 4 * 1.33 / 1048576 : 0); }, 0);
const avant = [triangles(), memoire()];
const etapes = [dedup(), weld()];
if (+ratio < 1) etapes.push(simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: +erreur }));
/** Textures : celles de couleur gardent couleurMax (toutes, ou seulement les « héros »), les autres passent à autresMax. */
const textures = () => async (d) => {
  for (const t of d.getRoot().listTextures()) {
    const couleur = listTextureSlots(t).some((c) => /^(baseColor|emissive)/.test(c));
    const max = couleur && (!herosRe || herosRe.test(t.getName())) ? +couleurMax : +autresMax;
    await compressTexture(t, { encoder: sharp, targetFormat: 'webp', quality: 88, resize: [max, max] });
  }
  d.createExtension(EXTTextureWebP).setRequired(true);
};
etapes.push(prune({ keepLeaves: true }), textures(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: +bitsPosition, quantizeTexcoord: 14, quantizeNormal: 10 }));
await doc.transform(...etapes);
await io.write(sortie, doc);
console.log(`triangles ${avant[0]} -> ${triangles()} | textures en mémoire ${avant[1].toFixed(0)} -> ${memoire().toFixed(0)} Mo | fichier ${(fs.statSync(entree).size / 1e6).toFixed(1)} -> ${(fs.statSync(sortie).size / 1e6).toFixed(1)} Mo`);
for (const t of doc.getRoot().listTextures()) console.log('  ', (t.getSize() || []).join('x'), t.getName() || t.getURI() || '', '←', [...new Set(doc.getGraph().listParentEdges(t).map((e) => e.getName()))].join(','));
