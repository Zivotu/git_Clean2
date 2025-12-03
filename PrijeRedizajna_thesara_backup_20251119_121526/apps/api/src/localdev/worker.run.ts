import { startLocalDevWorker } from './worker.js';

try {
  const worker = startLocalDevWorker();
  console.log('[worker] Started, listening for jobs...');

  process.on('SIGINT', async () => {
    console.log('[worker] Shutting down gracefully...');
    await worker.close();
    process.exit(0);
  });
} catch (err: any) {
  console.error('[worker] Fatal error:', err);
  process.exit(1);
}
