import 'dotenv/config';
import readline from 'node:readline';
import { initStorage } from '../lib/store.js';
import { findUserByEmail, createUser, countUsers } from '../lib/repository.js';
import { hashPassword, validatePassword } from '../lib/auth.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

await initStorage();

const email = (await ask('Admin email: ')).trim();
const name = (await ask('Admin name (default: Administrator): ')).trim() || 'Administrator';
const password = await ask('Admin password: ');

const err = validatePassword(password);
if (err) { console.error('Weak password:', err); process.exit(1); }
const existing = await findUserByEmail(email);
if (existing) { console.error('An account with that email already exists.'); process.exit(1); }
const user = await createUser({ email, name, passwordHash: await hashPassword(password), role: 'admin', mustChangePassword: true });
console.log('Created admin:', user.id, user.email);
rl.close();
process.exit(0);
