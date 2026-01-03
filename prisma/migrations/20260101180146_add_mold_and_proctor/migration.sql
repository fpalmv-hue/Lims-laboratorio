-- CreateEnum
CREATE TYPE "MoldStatus" AS ENUM ('ACTIVE', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "ProctorStatus" AS ENUM ('DRAFT', 'DONE', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "ProctorCurveFit" AS ENUM ('PARABOLA', 'LINEAR_SEGMENTS');

-- CreateTable
CREATE TABLE "Mold" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "volumeCm3" DOUBLE PRECISION NOT NULL,
    "tareMassG" DOUBLE PRECISION,
    "collarMassG" DOUBLE PRECISION,
    "status" "MoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastCalibrationAt" TIMESTAMP(3),
    "calibrationCertUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proctor" (
    "id" SERIAL NOT NULL,
    "sampleId" INTEGER NOT NULL,
    "methodCode" TEXT,
    "methodName" TEXT,
    "layers" INTEGER,
    "blowsPerLayer" INTEGER,
    "status" "ProctorStatus" NOT NULL DEFAULT 'DRAFT',
    "overrideReason" TEXT,
    "overrideById" INTEGER,
    "overrideAt" TIMESTAMP(3),
    "omcPercent" DOUBLE PRECISION,
    "mddDryDensity" DOUBLE PRECISION,
    "curveFit" "ProctorCurveFit" DEFAULT 'PARABOLA',
    "chartJson" JSONB,
    "chartUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProctorPoint" (
    "id" SERIAL NOT NULL,
    "proctorId" INTEGER NOT NULL,
    "moldId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "wetMassMoldPlusSoilG" DOUBLE PRECISION NOT NULL,
    "waterContentPercent" DOUBLE PRECISION,
    "tinTareG" DOUBLE PRECISION,
    "tinWetG" DOUBLE PRECISION,
    "tinDryG" DOUBLE PRECISION,
    "wetDensity" DOUBLE PRECISION,
    "dryDensity" DOUBLE PRECISION,
    "qaFlags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProctorPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Mold_code_key" ON "Mold"("code");

-- CreateIndex
CREATE INDEX "Proctor_sampleId_idx" ON "Proctor"("sampleId");

-- CreateIndex
CREATE INDEX "Proctor_status_idx" ON "Proctor"("status");

-- CreateIndex
CREATE INDEX "ProctorPoint_proctorId_idx" ON "ProctorPoint"("proctorId");

-- CreateIndex
CREATE INDEX "ProctorPoint_moldId_idx" ON "ProctorPoint"("moldId");

-- CreateIndex
CREATE UNIQUE INDEX "ProctorPoint_proctorId_order_key" ON "ProctorPoint"("proctorId", "order");

-- AddForeignKey
ALTER TABLE "Proctor" ADD CONSTRAINT "Proctor_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProctorPoint" ADD CONSTRAINT "ProctorPoint_proctorId_fkey" FOREIGN KEY ("proctorId") REFERENCES "Proctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProctorPoint" ADD CONSTRAINT "ProctorPoint_moldId_fkey" FOREIGN KEY ("moldId") REFERENCES "Mold"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
