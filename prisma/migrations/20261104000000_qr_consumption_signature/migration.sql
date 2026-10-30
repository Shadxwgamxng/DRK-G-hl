-- AlterTable
ALTER TABLE "ConsumptionReport" ADD COLUMN     "btmUsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "missionNumber" TEXT,
ADD COLUMN     "signature" TEXT;

