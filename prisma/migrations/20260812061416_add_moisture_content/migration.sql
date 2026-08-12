-- CreateEnum
CREATE TYPE "MoistureContentStatus" AS ENUM ('DRAFT', 'DONE', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "MoistureContent" (
    "id" SERIAL NOT NULL,
    "sampleId" INTEGER NOT NULL,
    "methodCode" TEXT DEFAULT 'MC Vol.8 §8.102.2',
    "status" "MoistureContentStatus" NOT NULL DEFAULT 'DRAFT',
    "mrG" DOUBLE PRECISION NOT NULL,
    "mhG" DOUBLE PRECISION NOT NULL,
    "msG" DOUBLE PRECISION NOT NULL,
    "dryingTempC" DOUBLE PRECISION NOT NULL,
    "wPercent" DOUBLE PRECISION,
    "calcNote" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoistureContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MoistureContent_sampleId_idx" ON "MoistureContent"("sampleId");

-- AddForeignKey
ALTER TABLE "MoistureContent" ADD CONSTRAINT "MoistureContent_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoistureContent" ADD CONSTRAINT "MoistureContent_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
