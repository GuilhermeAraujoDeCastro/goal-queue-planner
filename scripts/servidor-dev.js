// Servidor estático mínimo pra rodar o site local e os testes E2E (não faz parte do deploy).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';

const RAIZ = join(import.meta.dirname, '..', process.env.PASTA || '');
const PORTA = Number(process.env.PORT) || 5311;
const TIPOS = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
    let caminho;
    try {
        caminho = join(RAIZ, decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
    } catch {
        res.writeHead(400).end();
        return;
    }
    // Não deixa sair da pasta do projeto ("../../.env").
    if (caminho !== RAIZ && !caminho.startsWith(RAIZ + sep)) {
        res.writeHead(403).end();
        return;
    }
    try {
        const corpo = await readFile(caminho);
        res.writeHead(200, { 'Content-Type': TIPOS[extname(caminho)] || 'application/octet-stream' });
        res.end(corpo);
    } catch {
        res.writeHead(404).end('Não encontrado');
    }
}).listen(PORTA, '127.0.0.1', () => console.log(`Servidor em http://localhost:${PORTA}`));
