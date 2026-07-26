/*
  Warnings:

  - You are about to drop the column `description` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `sampleId` on the `AuditLog` table. All the data in the column will be lost.
  - Added the required column `entityId` to the `AuditLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entityType` to the `AuditLog` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `action` on the `AuditLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'CALIBRATE', 'ROLE_CHANGE', 'LOGIN', 'OTHER');

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_sampleId_fkey";

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "description",
DROP COLUMN "sampleId",
ADD COLUMN     "entityId" INTEGER NOT NULL,
ADD COLUMN     "entityType" TEXT NOT NULL,
ADD COLUMN     "newValue" JSONB,
ADD COLUMN     "previousValue" JSONB,
ADD COLUMN     "reason" TEXT,
DROP COLUMN "action",
ADD COLUMN     "action" "AuditAction" NOT NULL;

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
