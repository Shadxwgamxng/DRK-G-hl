import { notFound } from "next/navigation";
import { publicConsumptionForm, OCCASIONS } from "@/server/services/consumption";
import { ConsumptionForm } from "@/components/consumption-form";
import { submitConsumptionAction } from "@/app/actions/consumption";
import { berlinToday, toDateInput } from "@/lib/format";

export const metadata = { title: "Verbrauch melden", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Öffentliche Seite (ohne Login) – erreichbar nur über den QR-Code des Fahrzeugs. */
export default async function ConsumptionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await publicConsumptionForm(token).catch(() => null);
  if (!data) notFound();
  return (
    <ConsumptionForm
      action={submitConsumptionAction.bind(null, token)}
      vehicle={[data.vehicle.name, data.vehicle.plate].filter(Boolean).join(" · ")}
      items={data.items.map(({ stockId, name, unit, location }) => ({ stockId, name, unit, location }))}
      occasions={OCCASIONS}
      today={toDateInput(berlinToday())}
    />
  );
}
