// Turns the `vite build --mode single` output in dist-single/ into one
// self-contained HTML file (dist-single/gxuess.html) that runs offline,
// even opened straight from disk.
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist-single';
const read = (file) => readFileSync(join(dir, file), 'utf8');
let html = read('index.html');

// Inline the stylesheet(s) and the script(s).
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g, (_, file) => `<style>\n${read(file)}\n</style>`);
html = html.replace(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/g, (_, file) =>
  // A literal "</script" inside the code would end the tag early.
  `<script type="module">\n${read(file).replace(/<\/script/gi, '<\/script')}\n</script>`,
);
// Icons as data URIs; the manifest only makes sense for the hosted PWA.
const svg = `data:image/svg+xml,${encodeURIComponent(read('favicon.svg').trim())}`;
const png = `data:image/png;base64,${readFileSync(join(dir, 'apple-touch-icon.png')).toString('base64')}`;
html = html
  .replace(/href="\.\/favicon\.svg"/, `href="${svg}"`)
  .replace(/href="\.\/apple-touch-icon\.png"/, `href="${png}"`)
  .replace(/\s*<link rel="manifest"[^>]*>/, '');

const leftover = html.match(/(?:src|href)="\.\/[^"]+"/g);
if (leftover) throw new Error(`Not inlined: ${leftover.join(', ')}`);

for (const entry of readdirSync(dir)) rmSync(join(dir, entry), { recursive: true });
writeFileSync(join(dir, 'gxuess.html'), html);
console.log(`${dir}/gxuess.html: ${(Buffer.byteLength(html) / 1024).toFixed(0)} kB`);
