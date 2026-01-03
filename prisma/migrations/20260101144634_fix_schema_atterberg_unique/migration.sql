-- DropForeignKey
ALTER TABLE "Alert" DROP CONSTRAINT "Alert_testId_fkey";

-- DropForeignKey
ALTER TABLE "Alert" DROP CONSTRAINT "Alert_testResultId_fkey";

-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_documentId_fkey";

-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_sampleId_fkey";

-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_testId_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_sampleId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentRevision" DROP CONSTRAINT "DocumentRevision_documentId_fkey";

-- DropForeignKey
ALTER TABLE "Granulometry" DROP CONSTRAINT "Granulometry_sampleId_fkey";

-- DropForeignKey
ALTER TABLE "Test" DROP CONSTRAINT "Test_sampleId_fkey";

-- DropForeignKey
ALTER TABLE "TestResult" DROP CONSTRAINT "TestResult_testId_fkey";

-- DropIndex
DROP INDEX "Granulometry_sampleId_idx";

-- AlterTable
ALTER TABLE "Granulometry" ADD COLUMN     "errorPercentOver5mm" DOUBLE PRECISION,
ADD COLUMN     "errorPercentUnder5mm" DOUBLE PRECISION,
ADD COLUMN     "massOver5mm_D" DOUBLE PRECISION,
ADD COLUMN     "massOver5mm_Dprime" DOUBLE PRECISION,
ADD COLUMN     "massUnder5mm_C" DOUBLE PRECISION,
ADD COLUMN     "massUnder5mm_Cprime" DOUBLE PRECISION,
ADD COLUMN     "massUnder5mm_CprimeWashed" DOUBLE PRECISION,
ADD COLUMN     "qaStatus" TEXT,
ADD COLUMN     "residueOver5mm" DOUBLE PRECISION,
ADD COLUMN     "residueUnder5mm" DOUBLE PRECISION,
ADD COLUMN     "sampleTotalMass" DOUBLE PRECISION,
ADD COLUMN     "tmaSampleMm" DOUBLE PRECISION,
ADD COLUMN     "tmaSpecifiedMm" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Atterberg" (
    "id" SERIAL NOT NULL,
    "sampleId" INTEGER NOT NULL,
    "method" TEXT,
    "liquidLimit" DOUBLE PRECISION,
    "plasticLimit" DOUBLE PRECISION,
    "plasticityIdx" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Atterberg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Atterberg_sampleId_key" ON "Atterberg"("sampleId");

-- AddForeignKey
ALTER TABLE "Atterberg" ADD CONSTRAINT "Atterberg_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestResult" ADD CONSTRAINT "TestResult_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_testResultId_fkey" FOREIGN KEY ("testResultId") REFERENCES "TestResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRevision" ADD CONSTRAINT "DocumentRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Granulometry" ADD CONSTRAINT "Granulometry_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;
