-- Verschachtelte Fächer: statt zwei Ebenen jetzt bis zu 5 Ebenen (Schrank › Auszug › Fach …)
CREATE OR REPLACE FUNCTION drk_compartment_guard() RETURNS trigger AS $$
DECLARE
  pv TEXT;
  cur TEXT;
  depth INT := 1;
BEGIN
  IF NEW."parentId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "vehicleId" INTO pv FROM "VehicleCompartment" WHERE id = NEW."parentId";
  IF pv IS DISTINCT FROM NEW."vehicleId" THEN
    RAISE EXCEPTION 'Fach und übergeordneter Lagerort müssen zum selben Fahrzeug gehören';
  END IF;
  cur := NEW."parentId";
  WHILE cur IS NOT NULL LOOP
    IF cur = NEW.id THEN
      RAISE EXCEPTION 'Ein Lagerort kann nicht in sich selbst liegen';
    END IF;
    depth := depth + 1;
    IF depth > 5 THEN
      RAISE EXCEPTION 'Es sind höchstens 5 Ebenen erlaubt';
    END IF;
    SELECT "parentId" INTO cur FROM "VehicleCompartment" WHERE id = cur;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
