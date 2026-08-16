-- CreateEnum
CREATE TYPE "AggregateType" AS ENUM ('FINO', 'GRUESO', 'MEZCLADO');

-- CreateEnum
CREATE TYPE "AggregateGranulometryStatus" AS ENUM ('DRAFT', 'DONE', 'NEEDS_REVIEW');

-- AlterTable
ALTER TABLE "Equipment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Sieve" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "AggregateGranulometry" (
    "id" SERIAL NOT NULL,
    "sampleId" INTEGER NOT NULL,
    "methodCode" TEXT DEFAULT 'NCh165.Of2009',
    "status" "AggregateGranulometryStatus" NOT NULL DEFAULT 'DRAFT',
    "tipoArido" "AggregateType" NOT NULL,
    "masaInicialSeca" DOUBLE PRECISION NOT NULL,
    "tamañoMaximoNominalMm" DOUBLE PRECISION,
    "masaDeposito" DOUBLE PRECISION NOT NULL,
    "sumaFracciones" DOUBLE PRECISION,
    "diferenciaPercent" DOUBLE PRECISION,
    "moduloFinura" DOUBLE PRECISION,
    "moduloFinuraCase" TEXT,
    "qaStatus" TEXT,
    "calcNotes" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AggregateGranulometry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregateGranulometrySieve" (
    "id" SERIAL NOT NULL,
    "aggregateGranulometryId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "openingMm" DOUBLE PRECISION NOT NULL,
    "nominalLabel" TEXT,
    "retainedMass" DOUBLE PRECISION NOT NULL,
    "percentRetained" DOUBLE PRECISION NOT NULL,
    "percentAccumRetained" DOUBLE PRECISION NOT NULL,
    "percentPassing" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AggregateGranulometrySieve_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AggregateGranulometry_sampleId_idx" ON "AggregateGranulometry"("sampleId");

-- CreateIndex
CREATE INDEX "AggregateGranulometrySieve_aggregateGranulometryId_idx" ON "AggregateGranulometrySieve"("aggregateGranulometryId");

-- CreateIndex
CREATE UNIQUE INDEX "AggregateGranulometrySieve_aggregateGranulometryId_order_key" ON "AggregateGranulometrySieve"("aggregateGranulometryId", "order");

-- AddForeignKey
ALTER TABLE "AggregateGranulometry" ADD CONSTRAINT "AggregateGranulometry_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AggregateGranulometry" ADD CONSTRAINT "AggregateGranulometry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AggregateGranulometrySieve" ADD CONSTRAINT "AggregateGranulometrySieve_aggregateGranulometryId_fkey" FOREIGN KEY ("aggregateGranulometryId") REFERENCES "AggregateGranulometry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
