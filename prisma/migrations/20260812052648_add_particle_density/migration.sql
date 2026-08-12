-- CreateEnum
CREATE TYPE "ParticleDensityStatus" AS ENUM ('DRAFT', 'DONE', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "PycnometerContainerType" AS ENUM ('FLASK', 'BOTTLE');

-- CreateEnum
CREATE TYPE "PycnometerStatus" AS ENUM ('ACTIVE', 'OUT_OF_SERVICE');

-- CreateTable
CREATE TABLE "Pycnometer" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "containerType" "PycnometerContainerType",
    "nominalCapacityMl" DOUBLE PRECISION,
    "massEmptyG" DOUBLE PRECISION,
    "massWaterAtCalTempG" DOUBLE PRECISION,
    "calibrationTempC" DOUBLE PRECISION,
    "status" "PycnometerStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastCalibrationAt" TIMESTAMP(3),
    "calibrationCertUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pycnometer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticleDensity" (
    "id" SERIAL NOT NULL,
    "sampleId" INTEGER NOT NULL,
    "pycnometerId" INTEGER NOT NULL,
    "methodCode" TEXT DEFAULT 'NCh1532.Of80',
    "status" "ParticleDensityStatus" NOT NULL DEFAULT 'DRAFT',
    "containerType" "PycnometerContainerType",
    "balancePrecisionG" DOUBLE PRECISION,
    "msG" DOUBLE PRECISION NOT NULL,
    "mmG" DOUBLE PRECISION NOT NULL,
    "testTempC" DOUBLE PRECISION NOT NULL,
    "maAtTestTempG" DOUBLE PRECISION,
    "waterDensityAtTestG" DOUBLE PRECISION,
    "particleDensityGcm3" DOUBLE PRECISION,
    "calcNote" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParticleDensity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pycnometer_code_key" ON "Pycnometer"("code");

-- CreateIndex
CREATE INDEX "ParticleDensity_sampleId_idx" ON "ParticleDensity"("sampleId");

-- CreateIndex
CREATE INDEX "ParticleDensity_pycnometerId_idx" ON "ParticleDensity"("pycnometerId");

-- AddForeignKey
ALTER TABLE "ParticleDensity" ADD CONSTRAINT "ParticleDensity_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticleDensity" ADD CONSTRAINT "ParticleDensity_pycnometerId_fkey" FOREIGN KEY ("pycnometerId") REFERENCES "Pycnometer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticleDensity" ADD CONSTRAINT "ParticleDensity_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
