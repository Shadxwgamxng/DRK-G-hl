-- CreateEnum
CREATE TYPE "CompartmentKind" AS ENUM ('CABINET', 'DRAWER', 'BACKPACK', 'BAG', 'BOX', 'SHELF', 'COMPARTMENT', 'OTHER');

-- DropIndex
DROP INDEX "VehicleMaterialStock_vehicleId_materialId_key";

-- AlterTable
ALTER TABLE "VehicleMaterialStock" ADD COLUMN     "compartmentId" TEXT;

-- CreateTable
CREATE TABLE "VehicleCompartment" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "CompartmentKind" NOT NULL DEFAULT 'CABINET',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleCompartment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleCompartment_vehicleId_parentId_idx" ON "VehicleCompartment"("vehicleId", "parentId");

-- CreateIndex
CREATE INDEX "VehicleMaterialStock_vehicleId_idx" ON "VehicleMaterialStock"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleMaterialStock_compartmentId_idx" ON "VehicleMaterialStock"("compartmentId");

-- AddForeignKey
ALTER TABLE "VehicleCompartment" ADD CONSTRAINT "VehicleCompartment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCompartment" ADD CONSTRAINT "VehicleCompartment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "VehicleCompartment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleMaterialStock" ADD CONSTRAINT "VehicleMaterialStock_compartmentId_fkey" FOREIGN KEY ("compartmentId") REFERENCES "VehicleCompartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Ein Material je Lagerort nur einmal (unter aktiven Positionen); in verschiedenen Fächern erlaubt
CREATE UNIQUE INDEX "VehicleMaterialStock_active_location_unique"
  ON "VehicleMaterialStock" ("vehicleId", "materialId", COALESCE("compartmentId", ''))
  WHERE "active";

-- Höchstens zwei Ebenen (Schrank/Behälter → Fach), Fach gehört zum selben Fahrzeug
CREATE OR REPLACE FUNCTION drk_compartment_guard() RETURNS trigger AS $$
DECLARE p RECORD;
BEGIN
  IF NEW."parentId" IS NOT NULL THEN
    SELECT "vehicleId", "parentId" INTO p FROM "VehicleCompartment" WHERE id = NEW."parentId";
    IF p."vehicleId" <> NEW."vehicleId" THEN
      RAISE EXCEPTION 'Fach und Schrank müssen zum selben Fahrzeug gehören';
    END IF;
    IF p."parentId" IS NOT NULL THEN
      RAISE EXCEPTION 'Es sind nur zwei Ebenen (Schrank → Fach) erlaubt';
    END IF;
    IF EXISTS (SELECT 1 FROM "VehicleCompartment" WHERE "parentId" = NEW.id) THEN
      RAISE EXCEPTION 'Ein Schrank mit Fächern kann nicht selbst zum Fach werden';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "VehicleCompartment_guard"
  BEFORE INSERT OR UPDATE ON "VehicleCompartment"
  FOR EACH ROW EXECUTE FUNCTION drk_compartment_guard();

-- Materialposition und Lagerort gehören zum selben Fahrzeug
CREATE OR REPLACE FUNCTION drk_stock_compartment_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."compartmentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "VehicleCompartment" WHERE id = NEW."compartmentId" AND "vehicleId" = NEW."vehicleId"
  ) THEN
    RAISE EXCEPTION 'Lagerort gehört nicht zu diesem Fahrzeug';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "VehicleMaterialStock_compartment_guard"
  BEFORE INSERT OR UPDATE OF "compartmentId", "vehicleId" ON "VehicleMaterialStock"
  FOR EACH ROW EXECUTE FUNCTION drk_stock_compartment_guard();
