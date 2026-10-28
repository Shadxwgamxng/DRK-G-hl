import { describe, expect, it } from "vitest";
import { matches } from "@/lib/search-match";

describe("Materialsuche im Auswahlfeld", () => {
  it("findet unabhängig von Groß-/Kleinschreibung, Umlauten, Wortreihenfolge und mit Abkürzungen", () => {
    expect(matches("Dreiwegehahn Medizinische Verbrauchsmaterialien", "dreiweg")).toBe(true);
    expect(matches("Venenverweilkanüle 18 G (grün)", "vvk 18")).toBe(true);
    expect(matches("Venenverweilkanüle 18 G (grün)", "18 venenverweilkanule")).toBe(true);
    expect(matches("Venenverweilkanüle 18 G (grün)", "vvk 20")).toBe(false);
    expect(matches("Blutzucker-Teststreifen", "bz streifen")).toBe(true);
    expect(matches("Intraossär-Bohrer", "io bohrer")).toBe(true);
    expect(matches("Kompresse steril 10 × 10 cm", "KOMPRESSE 10")).toBe(true);
    expect(matches("Mullbinde 8 cm", "")).toBe(true);
  });
});
