-- CreateEnum
CREATE TYPE "GravelDensityStatus" AS ENUM ('DRAFT', 'DONE', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "GravelDensity" (
    "id" SERIAL NOT NULL,
    "sampleId" INTEGER NOT NULL,
    "methodCode" TEXT DEFAULT 'NCh1117.Of2010',
    "status" "GravelDensityStatus" NOT NULL DEFAULT 'DRAFT',
    "maxNominalSizeMm" DOUBLE PRECISION,
    "aG1" DOUBLE PRECISION NOT NULL,
    "bG1" DOUBLE PRECISION NOT NULL,
    "cG1" DOUBLE PRECISION NOT NULL,
    "aG2" DOUBLE PRECISION NOT NULL,
    "bG2" DOUBLE PRECISION NOT NULL,
    "cG2" DOUBLE PRECISION NOT NULL,
    "realSssDensity1Kgm3" DOUBLE PRECISION,
    "realDryDensity1Kgm3" DOUBLE PRECISION,
    "netDensity1Kgm3" DOUBLE PRECISION,
    "absorption1Percent" DOUBLE PRECISION,
    "realSssDensity2Kgm3" DOUBLE PRECISION,
    "realDryDensity2Kgm3" DOUBLE PRECISION,
    "netDensity2Kgm3" DOUBLE PRECISION,
    "absorption2Percent" DOUBLE PRECISION,
    "realSssDensityDiffKgm3" DOUBLE PRECISION,
    "realDryDensityDiffKgm3" DOUBLE PRECISION,
    "netDensityDiffKgm3" DOUBLE PRECISION,
    "absorptionDiffPercent" DOUBLE PRECISION,
    "realSssDensityKgm3" DOUBLE PRECISION,
    "realDryDensityKgm3" DOUBLE PRECISION,
    "netDensityKgm3" DOUBLE PRECISION,
    "absorptionPercent" DOUBLE PRECISION,
    "calcNote" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GravelDensity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GravelDensity_sampleId_idx" ON "GravelDensity"("sampleId");

-- AddForeignKey
ALTER TABLE "GravelDensity" ADD CONSTRAINT "GravelDensity_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GravelDensity" ADD CONSTRAINT "GravelDensity_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
