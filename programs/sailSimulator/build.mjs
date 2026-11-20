// Sestaví js/*.js (ES moduly) do jednoho klasického skriptu sail.bundle.js,
// aby hra šla spustit i dvojklikem na index.html (protokol file://, kde prohlížeč
// blokuje načítání lokálních modulů). Three.js se načte dynamickým importem z CDN.
//
// Po každé úpravě souborů v js/ spusť:  node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
// pořadí podle závislostí
const ORDER = ['physics', 'config', 'waves', 'ocean', 'models', 'effects', 'audio', 'ui', 'main'];

const modVar = (name) => `__m_${name}`;
const exportsOf = {};
let out = `// VYGENEROVÁNO souborem build.mjs ze zdrojů v js/ – needitovat ručně.\n'use strict';\n(async () => {\nconst __three = await import('${THREE_URL}');\n`;

for (const name of ORDER) {
  let src = readFileSync(join(root, 'js', `${name}.js`), 'utf8').replace(/\r\n/g, '\n');
  const exportsList = [];
  // importy
  src = src.replace(/^import\s+\*\s+as\s+(\w+)\s+from\s+['"]three['"];?/gm, (_, id) => `const ${id} = __three;`);
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*['"]\.\/(\w+)\.js['"];?/gm, (_, names, mod) => {
    if (!ORDER.slice(0, ORDER.indexOf(name)).includes(mod)) throw new Error(`${name}: závislost ${mod} musí být v ORDER dřív`);
    for (const n of names.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!exportsOf[mod].includes(n)) throw new Error(`${name}: ${mod}.js neexportuje ${n}`);
    }
    return `const {${names}} = ${modVar(mod)};`;
  });
  if (/^\s*import\s/m.test(src)) throw new Error(`${name}: nepodporovaný import`);
  // exporty
  src = src.replace(/^export\s+(async\s+function|function|class|const|let|var)\s+(\w+)(.*)$/gm, (_, kw, id, rest) => {
    exportsList.push(id);
    // více deklarací na jednom řádku: export const A = 1, B = 2;
    if (/^(const|let|var)$/.test(kw) && !/[({[`]/.test(rest)) {
      for (const m of rest.matchAll(/,\s*(\w+)\s*=/g)) exportsList.push(m[1]);
    }
    return `${kw} ${id}${rest}`;
  });
  exportsOf[name] = exportsList;
  if (/^\s*export\s/m.test(src)) throw new Error(`${name}: nepodporovaný export`);
  out += `\n// ===== js/${name}.js =====\nconst ${modVar(name)} = (() => {\n${src}\nreturn { ${exportsList.join(', ')} };\n})();\n`;
}

out += `})().catch((e) => { console.error(e); alert('Nepodařilo se spustit simulátor: ' + e.message); });\n`;
writeFileSync(join(root, 'sail.bundle.js'), out);
console.log(`sail.bundle.js: ${(out.length / 1024).toFixed(0)} kB`);
