-- CreateTable
CREATE TABLE "Sample" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "project" TEXT NOT NULL,
    "location" TEXT,
    "materialType" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "receivedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sample_code_key" ON "Sample"("code");
