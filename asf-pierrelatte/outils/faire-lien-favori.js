// Turns rapport.js into a one-line bookmark address ("javascript:…", encoded like the site's own favori).
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8')
  .replace(/^\/\*[\s\S]*?\*\/\s*/, '')               // the header comment
  .split('\n').map(l => l.trim()).filter(Boolean).join('');
if (/(^|[^:\\])\/\/(?![\w-]*\/)/.test(src.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/(?:[^\/\\\n]|\\.)+\/[gimsuy]*/g, '""'))) {
  console.error('line comment found: the one-line code would break'); process.exit(1);
}
new Function(src);                                     // syntax check
const lien = 'javascript:' + encodeURIComponent(src + 'void 0');
fs.writeFileSync(process.argv[3], lien);
console.log('code', src.length, 'caractères ; lien', lien.length, 'caractères');
