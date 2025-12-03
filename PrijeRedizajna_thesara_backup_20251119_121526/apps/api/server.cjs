// Passenger-friendly bootstrapper for the API (Fastify, ESM output)
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';

const path = require('node:path');

// Build script renames index.js → server.cjs, so we require it directly
require('./dist/server.cjs');

