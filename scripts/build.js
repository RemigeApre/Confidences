#!/usr/bin/env node
/**
 * Build script — minification + pré-compression
 *
 * Usage :
 *   node scripts/build.js          → minifie + compresse
 *   node scripts/build.js --dev    → copie sans minifier (dev rapide)
 *
 * Lit les sources dans public/, écrit en place les fichiers minifiés,
 * puis génère des variantes .gz et .br pour le middleware servePrecompressed.
 *
 * Pour revenir aux sources lisibles après un build local :
 *   git checkout -- public/
 */

const { buildSync } = require('esbuild');
const path  = require('path');
const fs    = require('fs');
const zlib  = require('zlib');

const DEV  = process.argv.includes('--dev');
const PUB  = path.join(__dirname, '..', 'public');

// ── Fichiers à ne pas minifier (service worker = no-cache, doit rester lisible) ──
const SKIP_MINIFY = new Set(['codex-sw.js']);

// ── JS ────────────────────────────────────────────────────────────────────────
const jsFiles = fs.readdirSync(PUB).filter(f =>
  f.endsWith('.js') && !f.endsWith('.br') && !f.endsWith('.gz')
);

console.log('\n── JS' + (DEV ? ' (dev, pas de minification)' : '') + ' ──────────────────────────────');
for (const f of jsFiles) {
  const fp = path.join(PUB, f);
  const before = fs.statSync(fp).size;
  if (!DEV && !SKIP_MINIFY.has(f)) {
    try {
      buildSync({
        entryPoints: [fp],
        outfile:     fp,
        minify:      true,
        allowOverwrite: true,
        logLevel:    'silent',
      });
    } catch (e) {
      console.error(`  ✗ ${f}: ${e.message}`);
      continue;
    }
  }
  const after = fs.statSync(fp).size;
  const pct   = DEV ? '' : ` (${Math.round((1 - after / before) * 100)}% réduit)`;
  console.log(`  ${f}: ${Math.round(before/1024)}K → ${Math.round(after/1024)}K${pct}`);
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const cssFiles = fs.readdirSync(PUB).filter(f =>
  f.endsWith('.css') && !f.endsWith('.br') && !f.endsWith('.gz')
);

console.log('\n── CSS' + (DEV ? ' (dev)' : '') + ' ─────────────────────────────────────────');
for (const f of cssFiles) {
  const fp = path.join(PUB, f);
  const before = fs.statSync(fp).size;
  if (!DEV) {
    try {
      buildSync({
        entryPoints: [fp],
        outfile:     fp,
        minify:      true,
        allowOverwrite: true,
        loader:      { '.css': 'css' },
        logLevel:    'silent',
      });
    } catch (e) {
      console.error(`  ✗ ${f}: ${e.message}`);
      continue;
    }
  }
  const after = fs.statSync(fp).size;
  const pct   = DEV ? '' : ` (${Math.round((1 - after / before) * 100)}% réduit)`;
  console.log(`  ${f}: ${Math.round(before/1024)}K → ${Math.round(after/1024)}K${pct}`);
}

// ── Pré-compression ────────────────────────────────────────────────────────────
// Génère .gz et .br pour chaque JS/CSS afin que le middleware servePrecompressed
// les serve directement, sans compression dynamique à chaque requête.
console.log('\n── Pré-compression ─────────────────────────────────────────────────────');
const toCompress = fs.readdirSync(PUB).filter(f =>
  (f.endsWith('.js') || f.endsWith('.css')) &&
  !f.endsWith('.br') && !f.endsWith('.gz')
);

for (const f of toCompress) {
  const fp      = path.join(PUB, f);
  const content = fs.readFileSync(fp);

  const gz = zlib.gzipSync(content, { level: 9 });
  fs.writeFileSync(fp + '.gz', gz);

  const br = zlib.brotliCompressSync(content, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  });
  fs.writeFileSync(fp + '.br', br);

  console.log(`  ${f}: raw=${Math.round(content.length/1024)}K  gz=${Math.round(gz.length/1024)}K  br=${Math.round(br.length/1024)}K`);
}

// ── Favicons ────────────────────────────────────────────────────────────────
// Génère les PNG depuis public/favicon.svg (source vectorielle, committée en
// texte comme le CSS/JS) à chaque build — jamais de binaire à committer, les
// icônes suivent automatiquement si le SVG change. sharp n'a pas d'API sync,
// d'où l'IIFE async ci-dessous ; Node n'arrêtera pas le process tant qu'elle
// n'est pas résolue, même si "✓ Build terminé" s'affiche avant dans les logs.
const faviconSvg = path.join(PUB, 'favicon.svg');
if (fs.existsSync(faviconSvg)) {
  const sharp = require('sharp');
  const faviconSizes = [
    ['favicon-16.png', 16],
    ['favicon-32.png', 32],
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ];
  console.log('\n── Favicons (depuis favicon.svg) ────────────────────────────────────────');
  (async () => {
    for (const [name, size] of faviconSizes) {
      await sharp(faviconSvg, { density: 384 }).resize(size, size).png().toFile(path.join(PUB, name));
      console.log(`  ${name}: ${size}x${size}`);
    }
  })().catch(e => console.error('  ✗ favicons:', e.message));
}

console.log('\n✓ Build terminé.\n');
