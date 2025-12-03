/*
  Warnings:

  - You are about to drop the `RoomBridge` table. If the table is not empty, all the data it contains will be lost.
  - You are about to alter the column `response` on the `IdempotencyKey` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `itemsJson` on the `Purchase` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.

*/
-- DropIndex
DROP INDEX "RoomBridge_appId_userId_storageKey_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "RoomBridge";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "app_storage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "app_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Build" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_IdempotencyKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "response" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_IdempotencyKey" ("createdAt", "id", "key", "response", "scope") SELECT "createdAt", "id", "key", "response", "scope" FROM "IdempotencyKey";
DROP TABLE "IdempotencyKey";
ALTER TABLE "new_IdempotencyKey" RENAME TO "IdempotencyKey";
CREATE UNIQUE INDEX "IdempotencyKey_key_scope_key" ON "IdempotencyKey"("key", "scope");
CREATE TABLE "new_Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalCents" INTEGER NOT NULL,
    "by" TEXT NOT NULL,
    "itemsJson" JSONB NOT NULL,
    CONSTRAINT "Purchase_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Purchase" ("by", "date", "id", "itemsJson", "roomId", "totalCents") SELECT "by", "date", "id", "itemsJson", "roomId", "totalCents" FROM "Purchase";
DROP TABLE "Purchase";
ALTER TABLE "new_Purchase" RENAME TO "Purchase";
CREATE INDEX "Purchase_roomId_idx" ON "Purchase"("roomId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "app_storage_lookup_idx" ON "app_storage"("app_id", "room_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "app_storage_app_id_room_id_key_key" ON "app_storage"("app_id", "room_id", "key");

-- CreateIndex
CREATE INDEX "Build_listingId_idx" ON "Build"("listingId");
