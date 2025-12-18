import { LLM_REVIEW_ENABLED, LLM_PROVIDER } from './config.js';

export function validateEnv() {
  // === LLM Configuration ===
  if (LLM_REVIEW_ENABLED && LLM_PROVIDER === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required when LLM_REVIEW_ENABLED=true and LLM_PROVIDER=openai');
    }
    if (!process.env.LLM_ENDPOINT) {
      process.env.LLM_ENDPOINT = 'https://api.openai.com/v1';
    }
    if (!process.env.LLM_API_URL) {
      process.env.LLM_API_URL = 'https://api.openai.com/v1';
    }
  }

  // === API URL validation ===
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl && !apiUrl.startsWith('/')) {
    try {
      const u = new URL(apiUrl);
      if (!u.protocol || !u.hostname) throw new Error();
    } catch {
      throw new Error('NEXT_PUBLIC_API_URL must be an absolute URL or start with /');
    }
  }

  // === JWT Secret validation ===
  if (!process.env.JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET is required in production.');
    }
    console.warn('JWT_SECRET missing; using development fallback secret.');
  }

  // Security: Ensure production uses a strong, unique JWT secret
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.JWT_SECRET;
    if (secret === 'insecure-dev-secret' || secret === 'dev-secret' || secret === 'secret') {
      throw new Error(
        'CRITICAL SECURITY ERROR: JWT_SECRET in production must not be a common/dev secret. ' +
        'Generate a strong secret with: openssl rand -base64 32'
      );
    }
    if (secret && secret.length < 32) {
      console.warn(
        'WARNING: JWT_SECRET is shorter than recommended (32+ characters). ' +
        'Generate a stronger secret with: openssl rand -base64 32'
      );
    }
  }

  // === Admin Access PIN validation ===
  if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_ACCESS_PIN_HASH) {
    throw new Error('ADMIN_ACCESS_PIN_HASH is required in production to protect admin access.');
  }

  // === Security: Dev-only features must not be enabled in production ===
  if (process.env.NODE_ENV === 'production') {
    if (process.env.DEV_ENABLE_LOCAL_JWT === '1') {
      throw new Error(
        'CRITICAL SECURITY ERROR: DEV_ENABLE_LOCAL_JWT must not be enabled in production! ' +
        'This would expose a JWT token generation endpoint.'
      );
    }
  }

  // === Argon2 configuration validation ===
  const argonNumeric = [
    ['ARGON2_MEMORY_COST', 4096],
    ['ARGON2_TIME_COST', 3],
    ['ARGON2_PARALLELISM', 1],
  ] as const;
  for (const [key, def] of argonNumeric) {
    const raw = process.env[key];
    if (raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${key} must be a positive number (received "${raw}")`);
    }
  }

  // === Log security configuration status ===
  if (process.env.NODE_ENV === 'production') {
    console.log('✅ Security validation passed for production environment');
  } else {
    console.log('⚠️  Running in development mode with relaxed security (localhost-only backdoors enabled)');
  }
}
