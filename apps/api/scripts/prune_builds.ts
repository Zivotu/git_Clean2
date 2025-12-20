
import { pruneBuilds } from '../src/lib/maintenance.js';

async function main() {
    const isForce = process.argv.includes('--force');
    console.log('--- Prune Builds Script ---');
    console.log(`Mode: ${isForce ? 'DELETE' : 'DRY RUN'}`);

    try {
        const stats = await pruneBuilds(!isForce);

        console.log('\nStats:');
        console.log(`Total Builds: ${stats.totalBuilds}`);
        console.log(`Active Builds: ${stats.activeBuilds}`);
        console.log(`Orphaned (Claimed by Pruner): ${stats.orphanedBuilds}`);
        console.log(`Reclaimable: ${(stats.reclaimableBytes / 1024 / 1024).toFixed(2)} MB`);

        if (stats.orphanedPaths.length > 0 && !isForce) {
            console.log('\nSample candidates:');
            console.log(stats.orphanedPaths.slice(0, 5).join('\n'));
            console.log(`\nRun with --force to delete ${stats.orphanedBuilds} folders.`);
        } else if (isForce && stats.orphanedBuilds > 0) {
            console.log(`\nDeleted ${stats.orphanedBuilds} orphaned builds.`);
        }
    } catch (err) {
        console.error('Failed to prune builds:', err);
        process.exit(1);
    }
}

main();
