// Fails when raw SQL escape hatches appear in API source (07-security.md › SQL injection prevention).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = 'apps/api/src';
const banned = /sql\.raw\(|\.unsafe\(/;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) yield path;
  }
}

const hits = [];
for (const file of walk(root)) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (banned.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
    });
}

if (hits.length > 0) {
  process.stderr.write(
    `Banned raw SQL found (use Drizzle or postgres.js tagged templates):\n${hits.join('\n')}\n`,
  );
  process.exit(1);
}
process.stdout.write('lint:sql ok\n');
