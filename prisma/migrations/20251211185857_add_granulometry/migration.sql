-- CreateTable
CREATE TABLE "Granulometry" (
    "id" SERIAL NOT NULL,
    "sampleId" INTEGER NOT NULL,
    "method" TEXT,
    "totalDryMass" DOUBLE PRECISION NOT NULL,
    "oversizeMass" DOUBLE PRECISION,
    "oversizePercent" DOUBLE PRECISION,
    "errorPercent" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Granulometry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GranulometrySieve" (
    "id" SERIAL NOT NULL,
    "granulometryId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "sieveLabel" TEXT NOT NULL,
    "openingMm" DOUBLE PRECISION,
    "retainedMass" DOUBLE PRECISION NOT NULL,
    "percentRetained" DOUBLE PRECISION NOT NULL,
    "percentPassing" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GranulometrySieve_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Granulometry" ADD CONSTRAINT "Granulometry_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GranulometrySieve" ADD CONSTRAINT "GranulometrySieve_granulometryId_fkey" FOREIGN KEY ("granulometryId") REFERENCES "Granulometry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
