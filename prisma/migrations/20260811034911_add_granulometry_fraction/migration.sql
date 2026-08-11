/*
  Warnings:

  - Added the required column `fraction` to the `GranulometrySieve` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "GranulometryFraction" AS ENUM ('OVER_5MM', 'UNDER_5MM');

-- AlterTable
ALTER TABLE "GranulometrySieve" ADD COLUMN     "fraction" "GranulometryFraction" NOT NULL;
