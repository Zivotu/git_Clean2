
import { promises as fs } from 'fs';
import { createHash } from 'crypto';

export async function readFile(path: string): Promise<string> {
  return fs.readFile(path, 'utf-8');
}

export async function writeFile(path: string, content: string): Promise<void> {
  await fs.mkdir(new URL('.', `file://${path}`).pathname, { recursive: true });
  return fs.writeFile(path, content, 'utf-8');
}

export function generateSri(content: string): string {
  const hash = createHash('sha256').update(content).digest('base64');
  return `sha256-${hash}`;
}

export async function replaceInFile(filePath: string, searchValue: string | RegExp, replaceValue: string): Promise<void> {
    const content = await readFile(filePath);
    const newContent = content.replace(searchValue, replaceValue);
    await writeFile(filePath, newContent);
}
