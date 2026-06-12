// Build de produção: empacota js/main.js (e tudo que ele importa) num
// único arquivo com o esbuild e depois ofusca esse arquivo com o
// javascript-obfuscator, pra quem abrir o F12 no site publicado não ver
// o código fonte legível.
//
// Diferente do Treine Bem, aqui o Firebase é carregado por tags <script>
// comuns no index.html (SDK "compat", não modular), então não existe
// nenhum import de URL pra preservar: o esbuild empacota os módulos
// normalmente e o bundle resultante já assume que o objeto global
// "firebase" existe antes dele rodar.

import { build } from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'fs';

const DIST = 'dist';

if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
mkdirSync(`${DIST}/js`, { recursive: true });

cpSync('index.html', `${DIST}/index.html`);
cpSync('css', `${DIST}/css`, { recursive: true });
if (existsSync('assets')) cpSync('assets', `${DIST}/assets`, { recursive: true });

await build({
  entryPoints: ['js/main.js'],
  bundle: true,
  format: 'esm',
  target: 'es2019',
  outfile: `${DIST}/js/main.js`,
  minify: false
});

const bundled = readFileSync(`${DIST}/js/main.js`, 'utf8');
const obfuscated = JavaScriptObfuscator.obfuscate(bundled, {
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
  disableConsoleOutput: false
}).getObfuscatedCode();

writeFileSync(`${DIST}/js/main.js`, obfuscated);

console.log('Build concluído em dist/, com o JavaScript empacotado e ofuscado.');
