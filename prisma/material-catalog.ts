/**
 * Materialkatalog (Stammdaten ohne Mengen) – Vorschlag für Fahrzeuge des DRK OV Göhl.
 * Die Beladung (Fach, Soll-Menge) legt die KFZ-Warte je Fahrzeug fest.
 *
 * Medikamente: abgeglichen mit den „Handlungsempfehlungen für den Rettungsdienst in Schleswig-Holstein“,
 * Version 10.0, Stand 15.07.2025 (Medikamentenappendix). Als BtM ist dort Morphin gekennzeichnet;
 * weitere Einstufungen legt der Träger bzw. der ÄLRD fest (Häkchen „Betäubungsmittel“ am Material).
 *
 * Kürzel: v = mit Verfallsdatum (chargengeführt) · g = Gerät/Ausstattung · btm = Betäubungsmittel
 */
import type { PrismaClient } from "@prisma/client";

export type CatalogCategory = { name: string; sortOrder: number; isMedication?: boolean };

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  { name: "Infusionen und Infusionszubehör", sortOrder: 0 },
  { name: "Medizinische Verbrauchsmaterialien", sortOrder: 10 },
  { name: "Verbandmaterial", sortOrder: 20 },
  { name: "Trauma und Immobilisation", sortOrder: 25 },
  { name: "Diagnostik", sortOrder: 30 },
  { name: "Beatmung und Atemwegssicherung", sortOrder: 40 },
  { name: "Geburt und Kindernotfall", sortOrder: 45 },
  { name: "Medikamente", sortOrder: 50, isMedication: true },
  { name: "Betäubungsmittel (BtM)", sortOrder: 55, isMedication: true },
  { name: "Hygiene und Schutzmaterial", sortOrder: 60 },
  { name: "Rettungs- und Transportgeräte", sortOrder: 65 },
  { name: "Technische Ausstattung", sortOrder: 70 },
  { name: "Werkzeuge", sortOrder: 80 },
  { name: "Fahrzeugzubehör", sortOrder: 90 },
];

type Flags = { v?: boolean; g?: boolean; btm?: boolean; unit?: string; note?: string };
export type CatalogItem = { name: string; category: string; unit: string; batchTracked: boolean; isEquipment: boolean; isNarcotic: boolean; description?: string };

const items: CatalogItem[] = [];
function add(category: string, names: string | string[], f: Flags = {}) {
  for (const name of Array.isArray(names) ? names : [names]) {
    items.push({ name, category, unit: f.unit ?? "Stück", batchTracked: Boolean(f.v || f.btm), isEquipment: Boolean(f.g), isNarcotic: Boolean(f.btm), description: f.note });
  }
}
const sizes = (base: string, list: (string | number)[]) => list.map((s) => `${base} ${s}`);

// ───────── Verbandmaterial ─────────
const V = "Verbandmaterial";
add(V, ["Verbandpäckchen DIN 13151 klein", "Verbandpäckchen DIN 13151 mittel", "Verbandpäckchen DIN 13151 groß"], { v: true });
add(V, ["Verbandtuch DIN 13152 40 × 60 cm", "Verbandtuch DIN 13152 60 × 80 cm"], { v: true });
add(V, ["Brandwunden-Gelkompresse (Hydrogel) klein", "Brandwunden-Gelkompresse (Hydrogel) groß"], { v: true });
add(V, sizes("Kompresse steril", ["5 × 5 cm", "7,5 × 7,5 cm", "10 × 10 cm"]), { v: true });
add(V, "Kompresse unsteril 10 × 10 cm");
add(V, "Augenkompresse steril", { v: true });
add(V, "Wundauflage aluminiumbeschichtet 10 × 12 cm", { v: true });
add(V, sizes("Mullbinde", ["6 cm", "8 cm", "10 cm"]));
add(V, sizes("Elastische Fixierbinde", ["6 cm", "8 cm", "10 cm"]));
add(V, sizes("Kohäsive Binde", ["6 cm", "8 cm"]));
add(V, "Dreiecktuch");
add(V, "Rollenpflaster 2,5 cm × 5 m", { unit: "Rolle" });
add(V, "Wundschnellverband 6 cm × 1 m", { unit: "Rolle" });
add(V, "Pflasterstrips sortiert", { unit: "Packung" });
add(V, "Fixiervlies 10 cm × 10 m", { unit: "Rolle" });
add(V, ["Notfall-Druckverband 10 cm", "Notfall-Druckverband 15 cm"], { v: true });
add(V, "Hämostyptische Wundauflage / Wundtamponade", { v: true });
add(V, "Sicherheitsnadeln", { unit: "Packung" });
add(V, ["Kälte-Sofortkompresse", "Wärme-Sofortkissen"], { v: true });

// ───────── Trauma und Immobilisation ─────────
const T = "Trauma und Immobilisation";
add(T, "Tourniquet", { g: true });
add(T, "Beckenschlinge", { g: true });
add(T, ["HWS-Immobilisationskragen Erwachsene (verstellbar)", "HWS-Immobilisationskragen Kinder (verstellbar)"], { g: true });
add(T, "Kopffixierset (Headblocks)", { g: true });
add(T, "Vakuummatratze", { g: true });
add(T, "Vakuumschienen-Set", { g: true, unit: "Set" });
add(T, ["Formbare Schiene groß", "Formbare Schiene klein"], { g: true });
add(T, "Schaufeltrage", { g: true });
add(T, "Spineboard mit Gurtsystem", { g: true });
add(T, "Rettungskorsett (KED)", { g: true });
add(T, "Fixiergurt", { g: true });

// ───────── Spritzen, Kanülen, Gefäßzugang ─────────
const M = "Medizinische Verbrauchsmaterialien";
add(M, sizes("Einmalspritze", ["2 ml", "5 ml", "10 ml", "20 ml"]), { v: true });
add(M, "Perfusorspritze 50 ml", { v: true });
add(M, "Feindosierungsspritze 1 ml", { v: true });
add(M, ["Kanüle Gr. 1 (gelb, 20 G)", "Kanüle Gr. 2 (grün, 21 G)", "Kanüle Gr. 12 (schwarz, 22 G)"], { v: true });
add(M, "Aufziehkanüle mit Filter", { v: true });
add(
  M,
  ["14 G (orange)", "16 G (grau)", "17 G (weiß)", "18 G (grün)", "20 G (rosa)", "22 G (blau)", "24 G (gelb)"].map((s) => `Venenverweilkanüle ${s}`),
  { v: true },
);
add(M, "VVK-Fixierpflaster", { v: true });
add(M, "Einmal-Stauband");
add(M, "Alkoholtupfer", { v: true });
add(M, "Kombistopfen", { v: true });
add(M, "Dreiwegehahn", { v: true });
add(M, "Verlängerungsleitung 30 cm", { v: true });
add(M, "Infusionsbesteck", { v: true });
add(M, "Intraossär-Bohrer", { g: true });
add(M, ["IO-Nadel 15 mm", "IO-Nadel 25 mm", "IO-Nadel 45 mm"], { v: true });
add(M, "IO-Verbindungsset", { v: true });
add(M, "Einmalskalpell", { v: true });
add(M, "Kanülenabwurfbehälter");
add(M, "Einmalunterlage");
add(M, "Nierenschale (Einmal)");
add(M, "Brechbeutel");
add(M, "Tupfer unsteril", { unit: "Packung" });
add(M, "Rettungsdecke gold/silber");
add(M, "Einmaldecke");

// ───────── Infusionen ─────────
const I = "Infusionen und Infusionszubehör";
add(I, "Vollelektrolytlösung (balanciert) 500 ml", { v: true, unit: "Flasche" });
add(I, ["NaCl 0,9 % 100 ml", "NaCl 0,9 % 500 ml"], { v: true, unit: "Flasche" });
add(I, "NaCl 0,9 % 10 ml", { v: true, unit: "Ampulle" });
add(I, "Glucose 5 % 100 ml (Trägerlösung Amiodaron)", { v: true, unit: "Flasche" });
add(I, ["Aqua ad iniectabilia 5 ml", "Aqua ad iniectabilia 10 ml"], { v: true, unit: "Ampulle" });
add(I, ["Infusions-Druckmanschette 500 ml", "Infusions-Druckmanschette 1000 ml"], { g: true });

// ───────── Beatmung, Atemweg, Absaugung ─────────
const B = "Beatmung und Atemwegssicherung";
add(B, ["Beatmungsbeutel Erwachsene", "Beatmungsbeutel Kinder", "Beatmungsbeutel Säuglinge"], { g: true });
add(B, sizes("Beatmungsmaske Gr.", [0, 1, 2, 3, 4, 5]));
add(B, ["Sauerstoffmaske mit Reservoir Erwachsene", "Sauerstoffmaske mit Reservoir Kinder"], { v: true });
add(B, "Sauerstoffbrille", { v: true });
add(B, sizes("Guedel-Tubus Gr.", ["00", 0, 1, 2, 3, 4, 5]));
add(B, sizes("Wendl-Tubus", ["Ch 24", "Ch 28", "Ch 32"]));
add(B, sizes("Larynxtubus Gr.", [0, 1, 2, 3, 4, 5]), { v: true });
add(B, ["3,0", "3,5", "4,0", "4,5", "5,0", "5,5", "6,0", "6,5", "7,0", "7,5", "8,0", "8,5"].map((s) => `Endotrachealtubus ID ${s}`), { v: true });
add(B, ["Führungsstab Kinder", "Führungsstab Erwachsene"], { v: true });
add(B, "Tubusfixierung", { v: true });
add(B, "Laryngoskopgriff", { g: true });
add(B, sizes("Einmal-Laryngoskopspatel Macintosh Gr.", [1, 2, 3, 4]), { v: true });
add(B, "Videolaryngoskop", { g: true });
add(B, ["Magill-Zange Kinder", "Magill-Zange Erwachsene"], { g: true });
add(B, "Beatmungsfilter (HME)", { v: true });
add(B, "Kapnografie-Messleitung / -Adapter", { v: true });
add(B, "PEEP-Ventil", { g: true });
add(B, "Notfallbeatmungsgerät", { g: true });
add(B, "Einmal-Beatmungsschlauchsystem", { v: true });
add(B, "Koniotomie-Set", { v: true, unit: "Set" });
add(B, "Absaugpumpe", { g: true });
add(B, sizes("Absaugkatheter", ["Ch 6", "Ch 8", "Ch 10", "Ch 12", "Ch 14", "Ch 18"]), { v: true });
add(B, "Yankauer-Absaugkatheter", { v: true });
add(B, "Sekretbeutel", { v: true });
add(B, ["Verneblermaske Erwachsene", "Verneblermaske Kinder"], { v: true });
add(B, ["Sauerstoffflasche 2 l", "Sauerstoffflasche 10 l"], { g: true, note: "Füllstand und Prüffrist beachten" });
add(B, "Druckminderer Sauerstoff", { g: true });
add(B, "Sauerstoffschlauch");

// ───────── Diagnostik und Monitoring ─────────
const D = "Diagnostik";
add(D, "EKG/Defibrillator", { g: true });
add(D, ["Defibrillations-Pads Erwachsene", "Defibrillations-Pads Kinder"], { v: true });
add(D, "EKG-Elektroden", { v: true, unit: "Packung" });
add(D, "Thermopapier EKG", { unit: "Rolle" });
add(D, ["SpO₂-Sensor Erwachsene", "SpO₂-Sensor Kinder"], { g: true });
add(D, ["Blutdruckmanschette Kind", "Blutdruckmanschette Erwachsene", "Blutdruckmanschette Erwachsene groß"], { g: true });
add(D, "Blutdruckmessgerät manuell", { g: true });
add(D, "Stethoskop", { g: true });
add(D, "Blutzuckermessgerät", { g: true });
add(D, "Blutzucker-Teststreifen", { v: true, unit: "Packung" });
add(D, "Lanzetten", { v: true });
add(D, "Blutzucker-Kontrolllösung", { v: true });
add(D, "Ohrthermometer", { g: true });
add(D, "Schutzkappen Ohrthermometer", { unit: "Packung" });
add(D, "Diagnostikleuchte", { g: true });
add(D, "Einmalrasierer");
add(D, "Ersatzakku Monitor/Defibrillator", { g: true });

// ───────── Geburt und Kindernotfall ─────────
const G = "Geburt und Kindernotfall";
add(G, "Geburtsset", { v: true, unit: "Set" });
add(G, "Wärmeschutz Neugeborene (Folie und Mütze)", { v: true, unit: "Set" });
add(G, "Kindernotfalltasche", { g: true });
add(G, "Pädiatrisches Notfallband / -lineal", { g: true });

// ───────── Medikamente (HE RD SH 10.0) ─────────
const Med = "Medikamente";
const amp = { v: true, unit: "Ampulle" };
add(Med, "Adrenalin 1 mg/1 ml", amp);
add(Med, "Adrenalin 25 mg/25 ml", { v: true, unit: "Durchstechflasche" });
add(Med, "Adrenalin-Fertigspritze 1 mg/10 ml", { v: true, unit: "Fertigspritze" });
add(Med, "Amiodaron 150 mg/3 ml", amp);
add(Med, "Acetylsalicylsäure 500 mg i.v.", { v: true, unit: "Durchstechflasche" });
add(Med, "Acetylsalicylsäure 500 mg", { v: true, unit: "Tablette" });
add(Med, ["Atropinsulfat 0,5 mg/1 ml"], amp);
add(Med, "Atropinsulfat 100 mg/10 ml (Intoxikation)", amp);
add(Med, "Clemastin 2 mg/5 ml", amp);
add(Med, ["Diazepam rektal 5 mg", "Diazepam rektal 10 mg"], { v: true, unit: "Rectiole" });
add(Med, "Dimenhydrinat 62 mg/10 ml", amp);
add(Med, "Dimetinden 4 mg/4 ml", amp);
add(Med, "Esketamin 25 mg/5 ml", amp);
add(Med, "Esketamin 250 mg/10 ml", { v: true, unit: "Durchstechflasche" });
add(Med, ["Furosemid 20 mg/2 ml", "Furosemid 40 mg/4 ml"], amp);
add(Med, "Glucagon 1 mg i.m.", { v: true, unit: "Fertigspritze", note: "Lagerungshinweise des Herstellers beachten" });
add(Med, "Glucagon 3 mg nasal", { v: true, unit: "Einzeldosis" });
add(Med, ["Glucose 20 % 10 ml", "Glucose 40 % 10 ml"], amp);
add(Med, "Glucose oral (Gel)", { v: true, unit: "Tube" });
add(Med, "Glyceroltrinitrat-Spray 0,4 mg/Hub", { v: true, unit: "Sprühflasche" });
add(Med, ["Heparin 5.000 I.E./1 ml"], amp);
add(Med, "Heparin 25.000 I.E./5 ml", { v: true, unit: "Durchstechflasche" });
add(Med, "Ipratropiumbromid 250 µg/2 ml", { v: true, unit: "Fertiginhalat" });
add(Med, "Lorazepam 1 mg Schmelztablette", { v: true, unit: "Tablette" });
add(Med, "Metamizol 1 g/2 ml", amp);
add(Med, "Metoprolol 5 mg/5 ml", amp);
add(Med, ["Midazolam 5 mg/1 ml", "Midazolam 5 mg/5 ml", "Midazolam 15 mg/3 ml"], { ...amp, note: "Unterschiedliche Konzentrationen – Verwechslungsgefahr!" });
add(Med, sizes("Midazolam buccal", ["2,5 mg", "5 mg", "7,5 mg", "10 mg"]), { v: true, unit: "Fertigspritze" });
add(Med, "Naloxon 0,4 mg/1 ml", amp);
add(Med, "Naloxon nasal 1,8 mg", { v: true, unit: "Einzeldosis" });
add(Med, "N-Butylscopolamin 20 mg/1 ml", amp);
add(Med, "Ondansetron 4 mg/2 ml", amp);
add(Med, sizes("Paracetamol Zäpfchen", ["75 mg", "125 mg", "250 mg", "500 mg"]), { v: true, unit: "Zäpfchen" });
add(Med, "Paracetamol 1000 mg/100 ml Infusion", { v: true, unit: "Flasche" });
add(Med, ["Prednisolon 100 mg i.v.", "Prednisolon 250 mg i.v."], amp);
add(Med, "Prednisolon Zäpfchen 100 mg", { v: true, unit: "Zäpfchen" });
add(Med, "Prednison Zäpfchen 100 mg", { v: true, unit: "Zäpfchen" });
add(Med, "Salbutamol 1,25 mg/2,5 ml", { v: true, unit: "Fertiginhalat" });
add(Med, "Salbutamol Inhalationslösung 5 mg/1 ml", { v: true, unit: "Flasche" });
add(Med, ["Tranexamsäure 500 mg/5 ml", "Tranexamsäure 1 g/10 ml"], amp);
add(Med, ["Urapidil 25 mg/5 ml", "Urapidil 50 mg/10 ml"], amp);

// ───────── Betäubungsmittel ─────────
add("Betäubungsmittel (BtM)", "Morphin 10 mg/1 ml", { btm: true, unit: "Ampulle", note: "BtM – Führen des BtM-Buches erforderlich (HE RD SH)." });

// ───────── Hygiene und Schutzausrüstung ─────────
const H = "Hygiene und Schutzmaterial";
add(H, sizes("Untersuchungshandschuhe Nitril", ["S", "M", "L", "XL"]), { unit: "Packung" });
add(H, ["Sterile Handschuhe Gr. 7", "Sterile Handschuhe Gr. 8"], { v: true, unit: "Paar" });
add(H, ["Mund-Nasen-Schutz", "FFP2-Maske", "FFP3-Maske"], { v: true });
add(H, "Schutzbrille", { g: true });
add(H, "Gesichtsschild");
add(H, "Schutzkittel");
add(H, ["Infektionsschutzanzug L", "Infektionsschutzanzug XL"]);
add(H, "Überschuhe", { unit: "Paar" });
add(H, ["Händedesinfektion 100 ml", "Händedesinfektion 500 ml"], { v: true, unit: "Flasche" });
add(H, "Hautdesinfektion 250 ml", { v: true, unit: "Flasche" });
add(H, "Flächendesinfektionstücher", { v: true, unit: "Packung" });
add(H, "Abfallsäcke", { unit: "Rolle" });
add(H, "Infektionsschutzbeutel");

// ───────── Rettungs- und Transportgeräte ─────────
const R = "Rettungs- und Transportgeräte";
add(R, ["Fahrtrage", "Tragestuhl", "Krankentrage faltbar", "Tragetuch / Rettungstuch", "Notfallrucksack", "Sauerstoffeinheit tragbar"], { g: true });
add(R, "Wolldecke");

// ───────── Technik, Werkzeug, Fahrzeug ─────────
add("Technische Ausstattung", ["Handfunkgerät", "Ersatzakku Handfunkgerät", "Fahrzeugfunkgerät", "Handlampe", "Stirnlampe", "Ladegerät / Ladekabel", "Tablet / Dokumentationsgerät"], { g: true });
add("Werkzeuge", ["Kleiderschere", "Rettungsschere", "Gurtmesser", "Glasbrecher"], { g: true });
add("Fahrzeugzubehör", ["Warnweste", "Warndreieck", "Warnleuchte", "Leitkegel", "Schutzhelm"], { g: true });
add("Fahrzeugzubehör", "Feuerlöscher", { v: true, note: "Als Verfallsdatum die nächste Prüffrist eintragen" });
add("Fahrzeugzubehör", "KFZ-Verbandkasten DIN 13164", { v: true });
add("Fahrzeugzubehör", "Arbeitshandschuhe", { unit: "Paar" });
add("Fahrzeugzubehör", ["Einsatzprotokolle", "Kugelschreiber"]);

export const CATALOG_ITEMS = items;

/**
 * Legt fehlende Kategorien und Materialien an (Abgleich über den Namen, Groß-/Kleinschreibung egal).
 * Vorhandene Einträge – auch archivierte oder von Admins geänderte – bleiben unverändert.
 */
export async function importMaterialCatalog(db: PrismaClient) {
  let categories = 0;
  let created = 0;
  const catIds = new Map<string, string>();
  for (const c of CATALOG_CATEGORIES) {
    let cat = await db.materialCategory.findFirst({ where: { name: { equals: c.name, mode: "insensitive" } } });
    if (!cat) {
      cat = await db.materialCategory.create({ data: { name: c.name, sortOrder: c.sortOrder, isMedication: Boolean(c.isMedication) } });
      categories++;
    }
    catIds.set(c.name, cat.id);
  }
  for (const m of items) {
    const exists = await db.material.findFirst({ where: { name: { equals: m.name, mode: "insensitive" } }, select: { id: true } });
    if (exists) continue;
    await db.material.create({
      data: {
        name: m.name,
        categoryId: catIds.get(m.category)!,
        unit: m.unit,
        batchTracked: m.batchTracked,
        isEquipment: m.isEquipment,
        isNarcotic: m.isNarcotic,
        description: m.description,
        remarks: "Aus dem Standardkatalog – bitte bei Bedarf anpassen.",
      },
    });
    created++;
  }
  if (created || categories) {
    await db.auditLog.create({
      data: { action: "master.import", entityType: "Material", newValues: { source: "Standardkatalog", categories, created, total: items.length } },
    });
  }
  return { categories, created, total: items.length };
}
