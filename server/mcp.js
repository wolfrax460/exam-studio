#!/usr/bin/env node
// Exam Studio as an MCP server (stdio). Lets Claude Desktop, Claude Code, Codex, OpenCode, Gemini CLI and other
// agents check, export and generate exams and study notes. Nothing here prints to stdout except the protocol.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './lib/mcpServer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '.env') });

const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'));
const server = createMcpServer();

await server.connect(new StdioServerTransport());
