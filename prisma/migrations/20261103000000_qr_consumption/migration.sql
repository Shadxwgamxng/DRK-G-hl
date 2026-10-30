-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "consumptionToken" TEXT;

-- CreateTable
CREATE TABLE "ConsumptionReport" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "occasion" TEXT NOT NULL,
    "occurredOn" DATE NOT NULL,
    "reporterName" TEXT NOT NULL,
    "note" TEXT,
    "items" JSONB NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumptionReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsumptionReport_vehicleId_createdAt_idx" ON "ConsumptionReport"("vehicleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_consumptionToken_key" ON "Vehicle"("consumptionToken");

-- AddForeignKey
ALTER TABLE "ConsumptionReport" ADD CONSTRAINT "ConsumptionReport_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

