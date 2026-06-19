// Build de produção (roda na Vercel): empacota e ofusca o JS, minifica CSS e HTML
// e versiona o cache do service worker. O código legível fica só no repositório.
// O Firebase vem por <script> no HTML (SDK compat), então o bundle usa o "firebase" global.

import { build } from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { minify as minifyHtml } from 'html-minifier-terser';
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'fs';

const DIST = 'dist';

const OFUSCACAO = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.6,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  identifierNamesGenerator: 'hexadecimal',
  selfDefending: false,
  disableConsoleOutput: false,
};

if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
mkdirSync(`${DIST}/js`, { recursive: true });
mkdirSync(`${DIST}/css`, { recursive: true });

cpSync('assets', `${DIST}/assets`, { recursive: true });
cpSync('manifest.json', `${DIST}/manifest.json`);

// JS: um arquivo só, empacotado e ofuscado.
const js = await build({ entryPoints: ['js/main.js'], bundle: true, format: 'esm', target: 'es2019', write: false, legalComments: 'none' });
writeFileSync(`${DIST}/js/main.js`, JavaScriptObfuscator.obfuscate(js.outputFiles[0].text, OFUSCACAO).getObfuscatedCode());

// CSS minificado.
const css = await build({ entryPoints: ['css/style.css'], bundle: true, minify: true, write: false, legalComments: 'none' });
writeFileSync(`${DIST}/css/style.css`, css.outputFiles[0].text);

// Service worker com id novo a cada deploy (o cache antigo é apagado sozinho).
const buildId = (process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString(36)).slice(0, 10);
const sw = readFileSync('sw.js', 'utf8').replaceAll('__BUILD_ID__', buildId);
writeFileSync(`${DIST}/sw.js`, JavaScriptObfuscator.obfuscate(sw, { compact: true, stringArray: true }).getObfuscatedCode());

// HTML sem comentários nem espaços (scripts e estilos inline também minificados).
const html = await minifyHtml(readFileSync('index.html', 'utf8'), {
  collapseWhitespace: true,
  conservativeCollapse: true,
  removeComments: true,
  minifyJS: true,
  minifyCSS: true,
});
writeFileSync(`${DIST}/index.html`, html);

console.log('Build pronto em dist/: JS ofuscado, CSS e HTML minificados.');
