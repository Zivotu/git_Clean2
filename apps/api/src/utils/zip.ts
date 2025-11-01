import fs from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import archiver from 'archiver';

export async function zipDirectoryToBuffer(sourceDir: string): Promise<Buffer> {
  const archive = archiver('zip', {
    zlib: { level: 9 }
  });

  const chunks: Buffer[] = [];
  archive.on('data', (chunk) => chunks.push(chunk));

  await fs.readdir(sourceDir, { withFileTypes: true }).then(async (entries) => {
    for (const entry of entries) {
      const fullPath = path.join(sourceDir, entry.name);
      if (entry.isDirectory()) {
        archive.directory(fullPath, entry.name);
      } else {
        const stream = await fs.readFile(fullPath);
        archive.append(stream, { name: entry.name });
      }
    }
  });

  await archive.finalize();

  return Buffer.concat(chunks);
}

export async function unzipToDirectory(zipBuffer: Buffer, targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
  const tempZipPath = path.join(targetDir, '_temp.zip');
  
  try {
    await fs.writeFile(tempZipPath, zipBuffer);
    // TODO: Implement unzip using native Node.js unzip or external library
    await fs.unlink(tempZipPath);
  } catch (err) {
    await fs.unlink(tempZipPath).catch(() => {});
    throw err;
  }
}