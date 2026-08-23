-- AlterTable
ALTER TABLE "SyncGroupTarget" ADD COLUMN     "authTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "authTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SyncGroupTarget_authTokenHash_key" ON "SyncGroupTarget"("authTokenHash");
