import path from 'node:path';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: path.resolve(process.cwd(), '.env') });
