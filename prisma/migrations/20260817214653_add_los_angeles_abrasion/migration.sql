-- CreateEnum
CREATE TYPE "LosAngelesAbrasionStatus" AS ENUM ('DRAFT', 'DONE', 'NEEDS_REVIEW');

-- AlterEnum
ALTER TYPE "EquipmentType" ADD VALUE 'LOS_ANGELES_MACHINE';

-- CreateTable
CREATE TABLE "LosAngelesMachine" (
    "id" SERIAL NOT NULL,
    "equipmentId" INTEGER NOT NULL,
    "description" TEXT,
    "cylinderDiameterMm" DOUBLE PRECISION,
    "cylinderLengthMm" DOUBLE PRECISION,
    "rotationSpeedRpm" DOUBLE PRECISION,
    "lastVerificationAt" TIMESTAMP(3),
    "verificationDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LosAngelesMachine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LosAngelesAbrasion" (
    "id" SERIAL NOT NULL,
    "sampleId" INTEGER NOT NULL,
    "methodCode" TEXT DEFAULT 'NCh1369.Of2010',
    "status" "LosAngelesAbrasionStatus" NOT NULL DEFAULT 'DRAFT',
    "gradoEnsayo" INTEGER,
    "gradoGrupo" TEXT,
    "esferasCount" INTEGER,
    "esferasMassG" DOUBLE PRECISION,
    "revolucionesCount" INTEGER,
    "masaInicial" DOUBLE PRECISION NOT NULL,
    "masaFinal" DOUBLE PRECISION NOT NULL,
    "desgastePercent" INTEGER,
    "calcNote" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LosAngelesAbrasion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LosAngelesAbrasionSieve" (
    "id" SERIAL NOT NULL,
    "losAngelesAbrasionId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "openingMm" DOUBLE PRECISION NOT NULL,
    "retainedMass" DOUBLE PRECISION NOT NULL,
    "percentRetained" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LosAngelesAbrasionSieve_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LosAngelesAbrasionFraction" (
    "id" SERIAL NOT NULL,
    "losAngelesAbrasionId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "fractionLabel" TEXT NOT NULL,
    "upperOpeningMm" DOUBLE PRECISION NOT NULL,
    "lowerOpeningMm" DOUBLE PRECISION NOT NULL,
    "massG" DOUBLE PRECISION NOT NULL,
    "targetMassG" DOUBLE PRECISION NOT NULL,
    "toleranceG" DOUBLE PRECISION NOT NULL,
    "diffG" DOUBLE PRECISION NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LosAngelesAbrasionFraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LosAngelesMachine_equipmentId_key" ON "LosAngelesMachine"("equipmentId");

-- CreateIndex
CREATE INDEX "LosAngelesAbrasion_sampleId_idx" ON "LosAngelesAbrasion"("sampleId");

-- CreateIndex
CREATE INDEX "LosAngelesAbrasionSieve_losAngelesAbrasionId_idx" ON "LosAngelesAbrasionSieve"("losAngelesAbrasionId");

-- CreateIndex
CREATE UNIQUE INDEX "LosAngelesAbrasionSieve_losAngelesAbrasionId_order_key" ON "LosAngelesAbrasionSieve"("losAngelesAbrasionId", "order");

-- CreateIndex
CREATE INDEX "LosAngelesAbrasionFraction_losAngelesAbrasionId_idx" ON "LosAngelesAbrasionFraction"("losAngelesAbrasionId");

-- CreateIndex
CREATE UNIQUE INDEX "LosAngelesAbrasionFraction_losAngelesAbrasionId_order_key" ON "LosAngelesAbrasionFraction"("losAngelesAbrasionId", "order");

-- AddForeignKey
ALTER TABLE "LosAngelesMachine" ADD CONSTRAINT "LosAngelesMachine_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LosAngelesAbrasion" ADD CONSTRAINT "LosAngelesAbrasion_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LosAngelesAbrasion" ADD CONSTRAINT "LosAngelesAbrasion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LosAngelesAbrasionSieve" ADD CONSTRAINT "LosAngelesAbrasionSieve_losAngelesAbrasionId_fkey" FOREIGN KEY ("losAngelesAbrasionId") REFERENCES "LosAngelesAbrasion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LosAngelesAbrasionFraction" ADD CONSTRAINT "LosAngelesAbrasionFraction_losAngelesAbrasionId_fkey" FOREIGN KEY ("losAngelesAbrasionId") REFERENCES "LosAngelesAbrasion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
