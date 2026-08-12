-- CreateEnum
CREATE TYPE "SandConeStatus" AS ENUM ('ACTIVE', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "SandConeTestStatus" AS ENUM ('DRAFT', 'DONE', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "SandCone" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" "SandConeStatus" NOT NULL DEFAULT 'ACTIVE',
    "depositMassWaterG" DOUBLE PRECISION,
    "depositWaterTempC" DOUBLE PRECISION,
    "depositVolumeCm3" DOUBLE PRECISION,
    "depositCalibratedAt" TIMESTAMP(3),
    "sandDensityRawJson" JSONB,
    "sandDensityChosenJson" JSONB,
    "sandDensityGcm3" DOUBLE PRECISION,
    "sandDensityVariationChosenPercent" DOUBLE PRECISION,
    "sandDensityVariationAllPercent" DOUBLE PRECISION,
    "sandDensityCalibratedAt" TIMESTAMP(3),
    "funnelMassInitialG" DOUBLE PRECISION,
    "funnelMassFinalG" DOUBLE PRECISION,
    "funnelMassG" DOUBLE PRECISION,
    "funnelCalibratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SandCone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandConeTest" (
    "id" SERIAL NOT NULL,
    "sampleId" INTEGER NOT NULL,
    "sandConeId" INTEGER NOT NULL,
    "moistureContentId" INTEGER NOT NULL,
    "methodCode" TEXT DEFAULT 'NCh1516.Of79',
    "status" "SandConeTestStatus" NOT NULL DEFAULT 'DRAFT',
    "minExcavationVolumeCm3" DOUBLE PRECISION,
    "miG" DOUBLE PRECISION NOT NULL,
    "mfG" DOUBLE PRECISION NOT NULL,
    "mhG" DOUBLE PRECISION NOT NULL,
    "maG" DOUBLE PRECISION,
    "msG" DOUBLE PRECISION,
    "volumeCm3" DOUBLE PRECISION,
    "dryDensityGcm3" DOUBLE PRECISION,
    "wetDensityGcm3" DOUBLE PRECISION,
    "calcNote" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SandConeTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SandCone_code_key" ON "SandCone"("code");

-- CreateIndex
CREATE INDEX "SandConeTest_sampleId_idx" ON "SandConeTest"("sampleId");

-- CreateIndex
CREATE INDEX "SandConeTest_sandConeId_idx" ON "SandConeTest"("sandConeId");

-- CreateIndex
CREATE INDEX "SandConeTest_moistureContentId_idx" ON "SandConeTest"("moistureContentId");

-- AddForeignKey
ALTER TABLE "SandConeTest" ADD CONSTRAINT "SandConeTest_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandConeTest" ADD CONSTRAINT "SandConeTest_sandConeId_fkey" FOREIGN KEY ("sandConeId") REFERENCES "SandCone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandConeTest" ADD CONSTRAINT "SandConeTest_moistureContentId_fkey" FOREIGN KEY ("moistureContentId") REFERENCES "MoistureContent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandConeTest" ADD CONSTRAINT "SandConeTest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
