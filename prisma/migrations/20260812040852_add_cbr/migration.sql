-- CreateEnum
CREATE TYPE "CbrStatus" AS ENUM ('DRAFT', 'DONE', 'NEEDS_REVIEW');

-- AlterTable
ALTER TABLE "Mold" ADD COLUMN     "heightMm" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Cbr" (
    "id" SERIAL NOT NULL,
    "sampleId" INTEGER NOT NULL,
    "proctorId" INTEGER NOT NULL,
    "methodCode" TEXT DEFAULT 'NCh1852.Of81',
    "status" "CbrStatus" NOT NULL DEFAULT 'DRAFT',
    "designCbrPercent" DOUBLE PRECISION,
    "curveJson" JSONB,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cbr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CbrPoint" (
    "id" SERIAL NOT NULL,
    "cbrId" INTEGER NOT NULL,
    "moldId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "blowsPerLayer" INTEGER NOT NULL,
    "layers" INTEGER NOT NULL DEFAULT 5,
    "wetMassMoldPlusSoilG" DOUBLE PRECISION NOT NULL,
    "waterContentPercent" DOUBLE PRECISION,
    "tinTareG" DOUBLE PRECISION,
    "tinWetG" DOUBLE PRECISION,
    "tinDryG" DOUBLE PRECISION,
    "wetDensity" DOUBLE PRECISION,
    "dryDensity" DOUBLE PRECISION,
    "swellInitialDialMm" DOUBLE PRECISION,
    "swellFinalDialMm" DOUBLE PRECISION,
    "swellPercent" DOUBLE PRECISION,
    "loadAt01inKgCm2" DOUBLE PRECISION,
    "loadAt02inKgCm2" DOUBLE PRECISION,
    "cbr01Percent" DOUBLE PRECISION,
    "cbr02Percent" DOUBLE PRECISION,
    "cbrPercent" DOUBLE PRECISION,
    "qaFlags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CbrPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cbr_sampleId_idx" ON "Cbr"("sampleId");

-- CreateIndex
CREATE INDEX "Cbr_proctorId_idx" ON "Cbr"("proctorId");

-- CreateIndex
CREATE INDEX "CbrPoint_cbrId_idx" ON "CbrPoint"("cbrId");

-- CreateIndex
CREATE INDEX "CbrPoint_moldId_idx" ON "CbrPoint"("moldId");

-- CreateIndex
CREATE UNIQUE INDEX "CbrPoint_cbrId_order_key" ON "CbrPoint"("cbrId", "order");

-- AddForeignKey
ALTER TABLE "Cbr" ADD CONSTRAINT "Cbr_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cbr" ADD CONSTRAINT "Cbr_proctorId_fkey" FOREIGN KEY ("proctorId") REFERENCES "Proctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cbr" ADD CONSTRAINT "Cbr_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CbrPoint" ADD CONSTRAINT "CbrPoint_cbrId_fkey" FOREIGN KEY ("cbrId") REFERENCES "Cbr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CbrPoint" ADD CONSTRAINT "CbrPoint_moldId_fkey" FOREIGN KEY ("moldId") REFERENCES "Mold"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
