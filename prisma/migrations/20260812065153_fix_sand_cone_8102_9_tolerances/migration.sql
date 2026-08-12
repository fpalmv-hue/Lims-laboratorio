/*
  Warnings:

  - You are about to drop the column `funnelMassFinalG` on the `SandCone` table. All the data in the column will be lost.
  - You are about to drop the column `funnelMassInitialG` on the `SandCone` table. All the data in the column will be lost.
  - You are about to drop the column `sandDensityChosenJson` on the `SandCone` table. All the data in the column will be lost.
  - You are about to drop the column `sandDensityVariationAllPercent` on the `SandCone` table. All the data in the column will be lost.
  - You are about to drop the column `sandDensityVariationChosenPercent` on the `SandCone` table. All the data in the column will be lost.
  - You are about to drop the column `maG` on the `SandConeTest` table. All the data in the column will be lost.
  - You are about to drop the column `mfG` on the `SandConeTest` table. All the data in the column will be lost.
  - You are about to drop the column `miG` on the `SandConeTest` table. All the data in the column will be lost.
  - Added the required column `apparatusType` to the `SandCone` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mtfG` to the `SandConeTest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mtiG` to the `SandConeTest` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SandConeApparatusType" AS ENUM ('CONVENTIONAL', 'MACRO');

-- AlterTable
ALTER TABLE "SandCone" DROP COLUMN "funnelMassFinalG",
DROP COLUMN "funnelMassInitialG",
DROP COLUMN "sandDensityChosenJson",
DROP COLUMN "sandDensityVariationAllPercent",
DROP COLUMN "sandDensityVariationChosenPercent",
ADD COLUMN     "apparatusType" "SandConeApparatusType" NOT NULL,
ADD COLUMN     "balanceResolutionG" DOUBLE PRECISION,
ADD COLUMN     "depositDiameterMm" DOUBLE PRECISION,
ADD COLUMN     "funnelRawJson" JSONB,
ADD COLUMN     "funnelVariationPercent" DOUBLE PRECISION,
ADD COLUMN     "sandDensityVariationPercent" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "SandConeTest" DROP COLUMN "maG",
DROP COLUMN "mfG",
DROP COLUMN "miG",
ADD COLUMN     "mpG" DOUBLE PRECISION,
ADD COLUMN     "mtfG" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "mtiG" DOUBLE PRECISION NOT NULL,
ALTER COLUMN "methodCode" SET DEFAULT 'MC Vol.8 §8.102.9';
