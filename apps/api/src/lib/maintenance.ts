
import path from 'node:path';
import fs from 'node:fs';
import { readApps } from '../db.js';
import { BUNDLE_DIR } from '../config.js';


export interface BuildDetail {
    id: string;
    path: string;
    size: number;
    mtime: number;
    status: 'active' | 'pending' | 'archived' | 'orphaned';
    appId?: string;
    appName?: string;
    appSlug?: string;
    orphanedReason?: string;
}

export interface PruneStats {
    totalBuilds: number;
    activeBuilds: number;
    orphanedBuilds: number;
    reclaimableBytes: number;
    orphanedPaths: string[];
    details: BuildDetail[];
}

function getDirSize(dirPath: string): number {
    let size = 0;
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                size += getDirSize(fullPath);
            } else if (entry.isFile()) {
                try {
                    const stats = fs.statSync(fullPath);
                    size += stats.size;
                } catch { }
            }
        }
    } catch { }
    return size;
}

export async function scanBuilds(): Promise<PruneStats> {
    const apps = await readApps();

    // Map buildId -> App info
    const buildMap = new Map<string, { appId: string; appName: string; appSlug: string; status: 'active' | 'pending' | 'archived' }>();

    for (const app of apps) {
        if (app.buildId) {
            buildMap.set(app.buildId, { appId: app.id, appName: app.title, appSlug: app.slug, status: 'active' });
        }
        if (app.pendingBuildId) {
            // If it's already active (rare collision), keep active status, otherwise pending
            if (!buildMap.has(app.pendingBuildId)) {
                buildMap.set(app.pendingBuildId, { appId: app.id, appName: app.title, appSlug: app.slug, status: 'pending' });
            }
        }
        if (app.archivedVersions && Array.isArray(app.archivedVersions)) {
            for (const v of app.archivedVersions) {
                if (v.buildId && !buildMap.has(v.buildId)) {
                    buildMap.set(v.buildId, { appId: app.id, appName: app.title, appSlug: app.slug, status: 'archived' });
                }
            }
        }
    }

    const buildsDir = path.join(BUNDLE_DIR, 'builds');
    let totalBuilds = 0;
    let orphanedBuilds = 0;
    let reclaimableBytes = 0;
    const orphanedPaths: string[] = [];
    const details: BuildDetail[] = [];

    if (fs.existsSync(buildsDir)) {
        const entries = fs.readdirSync(buildsDir, { withFileTypes: true });
        const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name);

        totalBuilds = folders.length;
        const now = Date.now();
        const retainMs = 7 * 24 * 60 * 60 * 1000; // 7 days safety buffer

        for (const folder of folders) {
            const folderPath = path.join(buildsDir, folder);
            let size = 0;
            let mtime = 0;
            try {
                const stats = fs.statSync(folderPath);
                mtime = stats.mtimeMs;
                size = getDirSize(folderPath);
            } catch { }

            const known = buildMap.get(folder);

            if (known) {
                details.push({
                    id: folder,
                    path: folderPath,
                    size,
                    mtime,
                    status: known.status,
                    appId: known.appId,
                    appName: known.appName,
                    appSlug: known.appSlug
                });
            } else {
                // Orphaned
                const age = now - mtime;
                const isSafeToDelete = age > retainMs;

                if (isSafeToDelete) {
                    orphanedBuilds++;
                    orphanedPaths.push(folder);
                    reclaimableBytes += size;
                }

                details.push({
                    id: folder,
                    path: folderPath,
                    size,
                    mtime,
                    status: 'orphaned',
                    orphanedReason: isSafeToDelete ? 'Orphaned & Expired' : 'Orphaned (Retention Period)'
                });
            }
        }
    }

    // Sort details: Active first, then by date desc
    details.sort((a, b) => {
        if (a.status !== b.status) {
            if (a.status === 'active') return -1;
            if (b.status === 'active') return 1;
        }
        return b.mtime - a.mtime;
    });

    return {
        totalBuilds,
        activeBuilds: buildMap.size,
        orphanedBuilds,
        reclaimableBytes,
        orphanedPaths,
        details
    };
}

export async function pruneBuilds(dryRun = true): Promise<PruneStats> {
    const stats = await scanBuilds();
    if (dryRun) return stats;

    const buildsDir = path.join(BUNDLE_DIR, 'builds');
    for (const folder of stats.orphanedPaths) {
        const p = path.join(buildsDir, folder);
        try {
            fs.rmSync(p, { recursive: true, force: true });
        } catch (e) {
            console.error(`Failed to prune build ${folder}:`, e);
        }
    }

    // Re-scan to confirm
    return scanBuilds();
}

