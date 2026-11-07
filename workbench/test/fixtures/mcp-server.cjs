'use strict';
// Synthetic test-only stdio server. Never contacts any external service.
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const server = new Server({ name: 'offline-orbit-fixture', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'echo', description: 'Synthetic offline echo', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }] }));
server.setRequestHandler(CallToolRequestSchema, async (request) => ({ content: [{ type: 'text', text: JSON.stringify({ echoed: request.params.arguments.text, credentialEnvironment: Object.keys(process.env).filter((name) => /TOKEN|SECRET|PASSWORD|API_?KEY|DAHL_|ELECTRON_/i.test(name)), pid: process.pid }) }] }));
server.connect(new StdioServerTransport()).catch(() => { process.exitCode = 1; });
