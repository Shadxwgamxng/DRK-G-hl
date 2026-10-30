"use client";

import { Printer } from "lucide-react";
import { Button } from "./ui";

export function PrintButton({ label = "QR-Karte drucken" }: { label?: string }) {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden /> {label}
    </Button>
  );
}
