// Publishing configuration with storage and rooms support
export const publishingConfig = {
  // Storage features
  STORAGE_ENABLED: process.env.STORAGE_ENABLED !== 'false',
  STORAGE_MAX_SIZE_MB: Number(process.env.STORAGE_MAX_SIZE_MB || '50'),
  STORAGE_ALLOWED_TYPES: ['json', 'text', 'binary'],
  
  // Rooms features
  ROOMS_ENABLED: process.env.ROOMS_ENABLED !== 'false',
  MAX_ROOMS_PER_APP: Number(process.env.MAX_ROOMS_PER_APP || '10'),
  MAX_USERS_PER_ROOM: Number(process.env.MAX_USERS_PER_ROOM || '100'),
  
  // Network security
  ALLOWED_DOMAINS: [
    'api.thesara.space',
    'storage.thesara.space'
  ],
  
  // Build pipeline
  BUILD_TIMEOUT_MS: Number(process.env.BUILD_TIMEOUT_MS || '30000'),
  MAX_BUILD_SIZE_MB: Number(process.env.MAX_BUILD_SIZE_MB || '10'),
  
  // Security features
  CSP_ENABLED: process.env.CSP_ENABLED !== 'false',
  CSP_REPORT_ONLY: process.env.CSP_REPORT_ONLY === 'true',
  
  // Validation
  VALIDATE_STORAGE_USAGE: process.env.VALIDATE_STORAGE_USAGE !== 'false',
  VALIDATE_ROOMS_USAGE: process.env.VALIDATE_ROOMS_USAGE !== 'false',
};