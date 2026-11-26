// Allège un GLB pour le web : fusion des sommets, simplification douce, textures WebP, compression Meshopt.
// Usage : node outils/optimiser.mjs entree.glb sortie.glb [ratio=0.6] [textureMax=4096] [erreur=0.0006] [bitsPosition=14]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, simplify, prune, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';

const [, , entree, sortie, ratio = '0.6', texMax = '4096', erreur = '0.0006', bitsPosition = '14'] = process.argv;
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(entree);
const compte = () => {
  let t = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return Math.round(t);
};
const avant = compte();
const etapes = [dedup(), weld()];
if (+ratio < 1) etapes.push(simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: +erreur }));
etapes.push(prune({ keepLeaves: true }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 90, resize: [+texMax, +texMax] }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: +bitsPosition, quantizeTexcoord: 14, quantizeNormal: 10 }));
await doc.transform(...etapes);
await io.write(sortie, doc);
console.log(`triangles ${avant} -> ${compte()} | ${(fs.statSync(entree).size / 1e6).toFixed(1)} Mo -> ${(fs.statSync(sortie).size / 1e6).toFixed(1)} Mo`);
