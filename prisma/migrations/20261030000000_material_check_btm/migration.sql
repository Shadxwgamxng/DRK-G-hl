-- CreateEnum
CREATE TYPE "CheckMaterialStatus" AS ENUM ('OK', 'DEVIATION', 'MISSING', 'DEFECT');

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "isEquipment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isNarcotic" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "VehicleCheckMaterialResult" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "vehicleStockId" TEXT,
    "materialName" TEXT NOT NULL,
    "compartment" TEXT,
    "unit" TEXT NOT NULL,
    "isEquipment" BOOLEAN NOT NULL DEFAULT false,
    "isNarcotic" BOOLEAN NOT NULL DEFAULT false,
    "targetQuantity" INTEGER NOT NULL,
    "previousQuantity" INTEGER NOT NULL,
    "countedQuantity" INTEGER NOT NULL,
    "expiredRemoved" INTEGER NOT NULL DEFAULT 0,
    "status" "CheckMaterialStatus" NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VehicleCheckMaterialResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleCheckMaterialResult_checkId_idx" ON "VehicleCheckMaterialResult"("checkId");

-- CreateIndex
CREATE INDEX "VehicleCheckMaterialResult_vehicleStockId_idx" ON "VehicleCheckMaterialResult"("vehicleStockId");

-- AddForeignKey
ALTER TABLE "VehicleCheckMaterialResult" ADD CONSTRAINT "VehicleCheckMaterialResult_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "VehicleCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCheckMaterialResult" ADD CONSTRAINT "VehicleCheckMaterialResult_vehicleStockId_fkey" FOREIGN KEY ("vehicleStockId") REFERENCES "VehicleMaterialStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Mengen sind nie negativ
ALTER TABLE "VehicleCheckMaterialResult" ADD CONSTRAINT "VehicleCheckMaterialResult_quantities_nonnegative"
  CHECK ("targetQuantity" >= 0 AND "previousQuantity" >= 0 AND "countedQuantity" >= 0 AND "expiredRemoved" >= 0);

-- Materialergebnisse abgeschlossener Kontrollen sind unveränderlich (revisionssicher)
CREATE TRIGGER "VehicleCheckMaterialResult_immutable"
  BEFORE UPDATE OR DELETE ON "VehicleCheckMaterialResult"
  FOR EACH ROW EXECUTE FUNCTION drk_prevent_modification();
