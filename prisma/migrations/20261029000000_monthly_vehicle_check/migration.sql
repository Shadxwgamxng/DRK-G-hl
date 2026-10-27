-- Fahrzeugkontrolle: Intervall mit Einheit; Vorgabe des OV Göhl: alle Fahrzeuge 1 × pro Kalendermonat
ALTER TABLE "Vehicle" ADD COLUMN "checkIntervalValue" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Vehicle" ADD COLUMN "checkIntervalUnit" "IntervalUnit" NOT NULL DEFAULT 'MONTHS';
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_checkInterval_positive" CHECK ("checkIntervalValue" BETWEEN 1 AND 365);
ALTER TABLE "Vehicle" DROP COLUMN "checkIntervalDays";
