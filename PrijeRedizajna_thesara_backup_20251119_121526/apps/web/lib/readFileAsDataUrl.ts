const encodeBase64 = (bytes: Uint8Array): string => {
  if (typeof globalThis.btoa === 'function') {
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return globalThis.btoa(binary);
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  throw new Error('base64_unsupported');
};

export async function readFileAsDataUrl(file: File): Promise<string> {
  const mime = file.type || 'application/octet-stream';
  if (typeof file.arrayBuffer === 'function') {
    const buffer = await file.arrayBuffer();
    const base64 = encodeBase64(new Uint8Array(buffer));
    return `data:${mime};base64,${base64}`;
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read_error'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

export default readFileAsDataUrl;
