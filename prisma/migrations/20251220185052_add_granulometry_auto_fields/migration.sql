/*
  Warnings:

  - You are about to drop the column `calcNotes` on the `GranulometrySieve` table. All the data in the column will be lost.
  - You are about to drop the column `cc` on the `GranulometrySieve` table. All the data in the column will be lost.
  - You are about to drop the column `cu` on the `GranulometrySieve` table. All the data in the column will be lost.
  - You are about to drop the column `d10` on the `GranulometrySieve` table. All the data in the column will be lost.
  - You are about to drop the column `d30` on the `GranulometrySieve` table. All the data in the column will be lost.
  - You are about to drop the column `d60` on the `GranulometrySieve` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "GranulometrySieve" DROP CONSTRAINT "GranulometrySieve_granulometryId_fkey";

-- AlterTable
ALTER TABLE "Granulometry" ADD COLUMN     "calcNotes" TEXT,
ADD COLUMN     "cc" DOUBLE PRECISION,
ADD COLUMN     "cu" DOUBLE PRECISION,
ADD COLUMN     "d10" DOUBLE PRECISION,
ADD COLUMN     "d30" DOUBLE PRECISION,
ADD COLUMN     "d60" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "GranulometrySieve" DROP COLUMN "calcNotes",
DROP COLUMN "cc",
DROP COLUMN "cu",
DROP COLUMN "d10",
DROP COLUMN "d30",
DROP COLUMN "d60";

-- CreateIndex
CREATE INDEX "Granulometry_sampleId_idx" ON "Granulometry"("sampleId");

-- CreateIndex
CREATE INDEX "GranulometrySieve_granulometryId_idx" ON "GranulometrySieve"("granulometryId");

-- CreateIndex
CREATE INDEX "GranulometrySieve_order_idx" ON "GranulometrySieve"("order");

-- AddForeignKey
ALTER TABLE "GranulometrySieve" ADD CONSTRAINT "GranulometrySieve_granulometryId_fkey" FOREIGN KEY ("granulometryId") REFERENCES "Granulometry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
