// spacetime generate emits extensionless relative imports; NodeNext
// resolution needs explicit .js. Run after every `spacetime generate`.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../src/stdb/bindings', import.meta.url).pathname;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts')) {
      const src = readFileSync(p, 'utf8');
      const out = src.replace(/(from\s+")(\.[^"]*)(")/g, (m, a, spec, z) =>
        /\.(js|ts|json)$/.test(spec) ? m : `${a}${spec}.js${z}`,
      );
      if (out !== src) writeFileSync(p, out);
    }
  }
}

walk(root);
console.log('bindings imports normalized');
