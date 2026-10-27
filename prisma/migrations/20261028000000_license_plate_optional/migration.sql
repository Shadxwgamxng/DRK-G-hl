-- Kennzeichen optional (Geräte wie Feldkochherd, Fahrzeuge ohne bekanntes Kennzeichen)
ALTER TABLE "Vehicle" ALTER COLUMN "licensePlate" DROP NOT NULL;
