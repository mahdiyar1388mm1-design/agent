'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
function stopTree(pid) {
  if (process.platform !== 'win32' || !Number.isSafeInteger(pid) || pid <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const killer = spawn(path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => { killer.kill(); resolve(); }, 5000);
    const done = () => { clearTimeout(timer); resolve(); }; killer.once('error', done); killer.once('close', done);
  });
}
class Extensions {
  constructor({ directory, confirm, clean = (text) => text }) { this.directory = directory; this.confirm = confirm; this.clean = clean; this.entries = []; this.connections = new Map(); this.bindings = new Map(); }
  load() {
    fs.mkdirSync(this.directory, { recursive: true });
    this.entries = fs.readdirSync(this.directory).filter((name) => /^[a-f0-9]{24}\.json$/.test(name)).slice(0, 20).flatMap((name) => { try { const file = path.join(this.directory, name); if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 24000) return []; const value = JSON.parse(fs.readFileSync(file, 'utf8')); this.validate(value); return [{ ...value, id: name.slice(0, -5) }]; } catch { return []; } });
  }
  validate(item) {
    if (this.clean(JSON.stringify(item)) !== JSON.stringify(item)) throw new Error('کلید/اعتبارنامه در manifest یا Skill مجاز نیست.');
    if (!item || !['skill', 'mcp'].includes(item.kind) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80 || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(item.name)) throw new Error('افزونه/Skill باید نام و kind معتبر داشته باشد.');
    if (item.kind === 'skill' && (typeof item.instructions !== 'string' || item.instructions.length > 16000)) throw new Error('متن Skill حداکثر ۱۶۰۰۰ نویسه است.');
    if (item.kind === 'mcp' && (typeof item.command !== 'string' || !item.command || item.command.length > 1000 || /[\r\n\0]/.test(item.command) || !Array.isArray(item.args) || item.args.length > 40 || item.args.some((arg) => typeof arg !== 'string' || arg.length > 2000 || /[\r\n\0]/.test(arg)))) throw new Error('فرمان و آرگومان‌های stdio MCP معتبر لازم است؛ متغیر محیطی/رمز در manifest پشتیبانی نمی‌شود.');
    const allowed = item.kind === 'skill' ? ['id', 'kind', 'name', 'instructions'] : ['id', 'kind', 'name', 'command', 'args'];
    if (Object.keys(item).some((key) => !allowed.includes(key))) throw new Error('manifest دارای فیلد ناشناخته است.');
  }
  async install(file) {
    if (!fs.lstatSync(file).isFile() || fs.statSync(file).size > 24000) throw new Error('فایل محلی JSON/Markdown تا ۲۴ KiB لازم است.');
    const content = fs.readFileSync(file, 'utf8');
    const item = /\.md$/i.test(file) ? { kind: 'skill', name: path.basename(file, '.md'), instructions: content } : JSON.parse(content);
    this.validate(item);
    const detail = item.kind === 'mcp' ? `کد واقعی با دسترسی کاربر Windows اجرا می‌شود؛ MCP sandbox نیست. فقط از سازندهٔ مورداعتماد نصب کنید. فرمان می‌تواند کد دانلود/اجرا کند. هیچ کلید Dahl به محیط افزونه داده نمی‌شود.\n\n${item.command} ${item.args.join(' ')}` : 'Skill متن راهنماست، نه کد اجرایی. نباید مجوزهای عامل را گسترش دهد.\n\n' + item.instructions.slice(0, 5000);
    if (!await this.confirm('نصب ' + item.name, detail, 'نصب این مورد مورداعتماد')) return this.status();
    const id = createHash('sha256').update(JSON.stringify(item)).digest('hex').slice(0, 24);
    const safe = { ...item }; delete safe.id;
    fs.mkdirSync(this.directory, { recursive: true }); fs.writeFileSync(path.join(this.directory, id + '.json'), JSON.stringify(safe, null, 2), { mode: 0o600 }); this.load(); return this.status();
  }
  status() { return this.entries.map(({ id, kind, name }) => ({ id, kind, name })); }
  async remove(id) { if (!/^[a-f0-9]{24}$/.test(id)) throw new Error('شناسهٔ افزونه نامعتبر است.'); await this.close(); fs.rmSync(path.join(this.directory, id + '.json'), { force: true }); this.load(); return this.status(); }
  skills() { return this.entries.filter((e) => e.kind === 'skill').map((e) => ({ name: e.name, instructions: e.instructions })); }
  async tools(signal) {
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
    this.bindings.clear(); const result = [];
    try {
      for (const entry of this.entries.filter((e) => e.kind === 'mcp')) {
        signal.throwIfAborted(); let connection = this.connections.get(entry.id); let client = connection?.client;
        if (!client) {
          const env = { ...process.env };
          for (const key of Object.keys(env)) if (/ELECTRON_|NODE_OPTIONS|TOKEN|SECRET|PASSWORD|(?:API|PRIVATE)_?KEY|DAHL_/i.test(key)) delete env[key];
          const transport = new StdioClientTransport({ command: entry.command, args: entry.args, env, stderr: 'pipe', maxBufferSize: 1048576 });
          transport.stderr?.on('data', () => {});
          client = new Client({ name: 'orbit-agent', version: '0.1.0' }); connection = { client, transport };
          this.connections.set(entry.id, connection);
          await client.connect(transport, { signal, timeout: 20000 }); signal.throwIfAborted();
        }
        const list = await client.listTools({}, { signal, timeout: 15000 });
        for (const [index, tool] of list.tools.slice(0, 12).entries()) {
          const name = 'plugin_' + entry.id.slice(0, 10) + '_' + index;
          const schema = tool.inputSchema || { type: 'object', properties: {} };
          if (JSON.stringify(schema).length > 12000) continue;
          result.push({ type: 'function', function: { name, description: this.clean(`${entry.name}: ${tool.description || tool.name}`).slice(0, 1000), parameters: schema } });
          this.bindings.set(name, { client, tool: tool.name, owner: entry.name });
        }
      }
      return result;
    } catch (error) { await this.close(); throw error; }
  }
  async call(name, args, signal) {
    const binding = this.bindings.get(name); if (!binding) throw new Error('ابزار افزونه فعال نیست.');
    const result = await binding.client.callTool({ name: binding.tool, arguments: args }, undefined, { signal, timeout: 45000 });
    return { plugin: binding.owner, untrusted: true, content: this.clean(JSON.stringify(result)).slice(0, 20000) };
  }
  async close() { const connections = [...this.connections.values()]; this.connections.clear(); this.bindings.clear(); await Promise.allSettled(connections.map(async ({ client, transport }) => { await stopTree(transport.pid); await client.close(); })); }
}
module.exports = { Extensions };
