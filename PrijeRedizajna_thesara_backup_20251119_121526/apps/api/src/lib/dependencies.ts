import { getBuildDir } from '../paths.js';
import fs from 'node:fs/promises';
import path from 'node:path';

// The versions map for external dependencies
export const DEPENDENCY_VERSIONS = {
  'react': '18.2.0',
  'react-dom': '18.2.0',
  // NOTE: react/jsx-runtime and react/jsx-dev-runtime are NOT separate packages
  // They are sub-path exports from the 'react' package, esbuild resolves them automatically
  'framer-motion': '10.16.4',
  'recharts': '2.9.1',
  'html-to-image': '1.11.11',
  'lucide-react': '0.292.0',
  '@radix-ui/react-label': '2.0.2',
  '@radix-ui/react-slider': '1.1.2',
  '@/components/ui/button': null, // local alias, will be handled separately
  '@/components/ui/input': null,  // local alias, will be handled separately 
  '@/components/ui/label': null,  // local alias, will be handled separately
  '@/components/ui/slider': null, // local alias, will be handled separately
  '@/components/ui/card': null    // local alias, will be handled separately
} as const;

// Function to ensure all required dependencies are available
export async function ensureDependencies(buildId: string, log: any) {
  log?.info?.({ buildId }, 'ensureDependencies:init');

  const buildDir = getBuildDir(buildId);
  const entryPath = path.join(buildDir, 'build', '_app_entry.tsx');

  // Fallback: if entry doesn't exist yet, create a minimal package.json
  let source = '';
  try {
    source = await fs.readFile(entryPath, 'utf8');
  } catch {
    log?.warn?.({ buildId, entryPath }, 'ensureDependencies:entry_not_found_using_minimal');
  }

  // Always include core react libs
  const used = new Set<string>(['react', 'react-dom']);

  // Very light-weight import scanner for bare specifiers
  // Matches: import ... from 'pkg', import('pkg'), require('pkg')
  const importRe = /(?:from\s+['"]([^'"\.\/_][^'"\)]*)['"])|(?:import\(\s*['"]([^'"\.\/_][^'"\)]*)['"]\s*\))|(?:require\(\s*['"]([^'"\.\/_][^'"\)]*)['"]\s*\))/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source)) !== null) {
    const spec = (m[1] || m[2] || m[3] || '').trim();
    if (!spec) continue;
    // Normalize subpath e.g. react/jsx-runtime -> react
    const base = spec.split('/')[0];
    used.add(base);
  }

  // Map to versions from catalog; filter out aliases and unknowns
  const dependencies: Record<string, string> = {};
  const unknown: string[] = [];
  for (const name of used) {
    const ver = (DEPENDENCY_VERSIONS as Record<string, string | null>)[name];
    if (ver) dependencies[name] = ver;
    else if (ver === null) {
      // Skip aliases like '@/components/ui/*'
    } else if (!(name.startsWith('@/') || name.startsWith('./') || name.startsWith('../'))) {
      unknown.push(name);
    }
  }

  // If nothing detected (unlikely), keep minimal react/react-dom
  if (Object.keys(dependencies).length === 0) {
    dependencies['react'] = (DEPENDENCY_VERSIONS as any)['react'];
    dependencies['react-dom'] = (DEPENDENCY_VERSIONS as any)['react-dom'];
  }

  const packageJson = {
    name: `build-${buildId}`,
    private: true,
    version: '1.0.0',
    dependencies,
  };

  const packageJsonPath = path.join(buildDir, 'build', 'package.json');
  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8');

  log?.info?.({ buildId, deps: Object.keys(dependencies) }, 'ensureDependencies:package_json_created');
  if (unknown.length) {
    log?.warn?.({ buildId, unknown }, 'ensureDependencies:unknown_dependencies_detected');
  }
  log?.info?.({ buildId }, 'ensureDependencies:ready');
}

export type Dependencies = typeof DEPENDENCY_VERSIONS;
