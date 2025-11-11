import fs from 'fs';
import path from 'path';

export default async function TermsPage() {
  // Read the canonical HTML file from the repository root `docs` folder
  const filePath = path.resolve(process.cwd(), 'docs', 'thesara_terms.html');
  let bodyHtml = '';
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    // extract the content inside the <body> tag so we don't inject another full HTML document
    const m = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    bodyHtml = m ? m[1] : raw;
  } catch (e) {
    // fallback content if file cannot be read
    bodyHtml = `
      <h1 class="text-2xl font-semibold mb-4">Terms of Service</h1>
      <p>Terms are currently unavailable. Please check <a href="/docs/thesara_terms.html">the static Terms page</a>.</p>
    `;
  }

  return (
    <main className="p-8 prose max-w-none" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
  );
}
