// MongoDB connection management.
//
// MongoDB is optional: it is used when it is reachable, and the app falls back to the
// local JSON store (see repository.js) when it is not. That keeps the desktop app and a
// plain "npm run dev" working on a machine with no database server installed.
import mongoose from 'mongoose';

const DEFAULT_URI = 'mongodb://localhost:27017/examstudio';
export const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_URI;

// Short by default: when no server is installed, startup must not hang.
const TIMEOUT_MS = Number(process.env.MONGODB_TIMEOUT_MS) || 3000;

let ready = false;
let lastError = null;
let connecting = null;

const redact = (uri) => String(uri).replace(/\/\/[^@/]*@/, '//<credentials>@');

export async function connectToDatabase() {
  if (ready && mongoose.connection.readyState === 1) return true;
  if (connecting) return connecting;

  connecting = (async () => {
    try {
      await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: TIMEOUT_MS,
        connectTimeoutMS: TIMEOUT_MS,
        socketTimeoutMS: 45_000,
        maxPoolSize: 10,
      });
      ready = true;
      lastError = null;
      // stderr, not stdout: this module is also loaded by the MCP server, where stdout
      // carries the protocol and any extra line would break the connection.
      console.warn(`Storage: MongoDB (${redact(MONGODB_URI)})`);
      return true;
    } catch (error) {
      ready = false;
      lastError = error;
      console.warn(`Storage: MongoDB at ${redact(MONGODB_URI)} is not available (${error.message}). Using the local file store instead.`);
      return false;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

export const isMongoReady = () => ready && mongoose.connection.readyState === 1;

export function databaseStatus() {
  return {
    kind: 'mongodb',
    uri: redact(MONGODB_URI),
    connected: isMongoReady(),
    error: isMongoReady() ? null : lastError?.message || null,
  };
}

export async function closeDatabaseConnections() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  ready = false;
}

export default { connectToDatabase, isMongoReady, databaseStatus, closeDatabaseConnections, MONGODB_URI };
