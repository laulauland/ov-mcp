/**
 * Build script using esbuild (Node.js compatible, no Bun required)
 */

import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

console.log(`Building ${pkg.name} v${pkg.version}...`);

try {
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    minify: true,
    sourcemap: true,
    target: 'esnext',
    format: 'esm',
    platform: 'browser',
    outdir: 'dist',
    external: [],
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    logLevel: 'info',
  });
  
  console.log('✓ Build complete');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
