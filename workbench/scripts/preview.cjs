'use strict';
// Static UI only. Never serves a project, node_modules, credentials, or native IPC.
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
function handler(request, response) {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); return response.end(); }
    const url = new URL(request.url, 'http://preview.invalid'); const route = decodeURIComponent(url.pathname);
    let file;
    if (route === '/') file = path.join(root, 'src/renderer/index.html');
    else if (['/app.js', '/app.css'].includes(route)) file = path.join(root, 'src/renderer', route.slice(1));
    else if (/^\/assets\/[a-zA-Z0-9_./-]+$/.test(route) && !route.includes('..')) file = path.join(root, route);
    if (!file || !types[path.extname(file)] || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); return response.end('Not found'); }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    if (request.method === 'HEAD') return response.end(); fs.createReadStream(file).pipe(response);
  } catch { response.writeHead(400); response.end('Bad request'); }
}
if (require.main === module) http.createServer(handler).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Orbit command-center UI preview · no local tools or keys · port ' + (process.env.PORT || 3000)));
module.exports = { handler };
