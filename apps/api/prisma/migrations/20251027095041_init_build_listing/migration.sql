-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "status" TEXT NOT NULL,
    "playUrl" TEXT,
    "bundlePublicUrl" TEXT,
    "buildId" TEXT,
    "pendingBuildId" TEXT,
    "authorUid" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Build" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "appId" TEXT,
    "status" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'legacy',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "error" TEXT,
    "bundlePublicUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Build_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Build" ("createdAt", "id", "listingId", "mode", "reason", "status", "updatedAt") SELECT "createdAt", "id", "listingId", "mode", "reason", "status", "updatedAt" FROM "Build";
DROP TABLE "Build";
ALTER TABLE "new_Build" RENAME TO "Build";
CREATE INDEX "Build_listingId_idx" ON "Build"("listingId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Listing_buildId_idx" ON "Listing"("buildId");

-- CreateIndex
CREATE INDEX "Listing_pendingBuildId_idx" ON "Listing"("pendingBuildId");
