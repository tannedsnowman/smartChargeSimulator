import { json, LoaderFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { getAnalyzedEnergyData } from "~/energyAnalysis.server";

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const batteryCapacity = Number(url.searchParams.get("batteryCapacity") ?? "10");
  const chargingEfficiency = Number(url.searchParams.get("chargingEfficiency") ?? "0.95");
  const dischargingEfficiency = Number(url.searchParams.get("dischargingEfficiency") ?? "0.95");
  const chargingCRate = Number(url.searchParams.get("chargingCRate") ?? "0.5");
  const dischargingCRate = Number(url.searchParams.get("dischargingCRate") ?? "0.5");
  const highSolar = url.searchParams.get("highSolar") === "true";
  const highLoad = url.searchParams.get("highLoad") === "true";
  const pricingStructure = url.searchParams.get("pricingStructure") ?? "normal";

  const analysisResult = await getAnalyzedEnergyData({
    batteryCapacity,
    chargingEfficiency,
    dischargingEfficiency,
    chargingCRate,
    dischargingCRate,
    highSolar,
    highLoad,
    pricingStructure,
  });
  //console.log(analysisResult);

  return json(analysisResult);
};

// Define a type for the loader data
type LoaderData = Awaited<ReturnType<typeof getAnalyzedEnergyData>>;

export default function Energy() {
  const data = useLoaderData<LoaderData>();

  return (
    <div>
      <h1>Energy Analysis Results</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
