-- CreateEnum
CREATE TYPE "SyncGroupTargetStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncGroupTarget" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" "SyncGroupTargetStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "SyncGroupTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_shop_key" ON "Store"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "SyncGroupTarget_groupId_storeId_key" ON "SyncGroupTarget"("groupId", "storeId");

-- AddForeignKey
ALTER TABLE "SyncGroup" ADD CONSTRAINT "SyncGroup_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncGroupTarget" ADD CONSTRAINT "SyncGroupTarget_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SyncGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncGroupTarget" ADD CONSTRAINT "SyncGroupTarget_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
