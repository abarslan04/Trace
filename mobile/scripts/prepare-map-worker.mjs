import { createRequire } from 'node:module';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const output = fileURLToPath(new URL('../public/', import.meta.url));
await mkdir(output, { recursive: true });
await copyFile(join(dirname(require.resolve('maplibre-gl/package.json')), 'dist/maplibre-gl-worker.mjs'), join(output, 'maplibre-gl-worker.mjs'));
