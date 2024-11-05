import { useLoaderData, useFetcher, Form } from "@remix-run/react";
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, ReferenceLine, ComposedChart, ReferenceArea } from 'recharts';
import { useEffect, useState } from 'react';
import { AreaChart, Area } from 'recharts';

interface AnalyzedHourlyData {
  hour: number;
  importPrice: number;
  exportPrice: number;
  load: number;
  solarGeneration: number;
  gridPower: number;
  batteryCapacity: number;
  importCost: number;
  exportProfit: number;
  action: string;
  reason: string;
}

interface EnergySummary {
  totalLoad: number;
  totalGridImport: number;
  totalGridExport: number;
  totalSolarGeneration: number;
  totalImportCost: number;
  totalExportProfit: number;
  netCost: number;
  finalBatteryCapacity: number;
  goodImportHours: AnalyzedHourlyData[];
  goodExportHours: AnalyzedHourlyData[];
}

interface ScenarioData {
  name: string;
  hourlyData: AnalyzedHourlyData[];
  summary: EnergySummary;
}

type EnergyDataResults = Record<string, ScenarioData>;

interface PricingStructure {
  name: string;
  key: string;
}

export default function EnergyDashboard() {
  const initialData = useLoaderData<EnergyDataResults>();
  const fetcher = useFetcher<EnergyDataResults>();
  const [batteryCapacity, setBatteryCapacity] = useState(10);
  const [chargingEfficiency, setChargingEfficiency] = useState(0.95);
  const [dischargingEfficiency, setDischargingEfficiency] = useState(0.95);
  const [chargingCRate, setChargingCRate] = useState(0.5);
  const [dischargingCRate, setDischargingCRate] = useState(0.5);
  const [highSolar, setHighSolar] = useState(false);
  const [highLoad, setHighLoad] = useState(false);
  const [noSolarAndLoad, setNoSolarAndLoad] = useState(false);
  const [pricingStructure, setPricingStructure] = useState<string>("normal");
  const [showGoodImportHours, setShowGoodImportHours] = useState(true);
  const [showGoodExportHours, setShowGoodExportHours] = useState(true);

  const pricingStructures: PricingStructure[] = [
    { name: "Normal", key: "normal" },
    { name: "Simple Cheaper Tariff", key: "simpleCheaper" },
    { name: "Variable Cheap Rates Low Export", key: "variableCheapRatesLowExport" },
    { name: "Negative Import and Export Price", key: "negativeImportandExportPrice" },
  ];

  const fetchData = () => {
    fetcher.submit(
      { 
        batteryCapacity: batteryCapacity.toString(),
        chargingEfficiency: chargingEfficiency.toString(),
        dischargingEfficiency: dischargingEfficiency.toString(),
        chargingCRate: chargingCRate.toString(),
        dischargingCRate: dischargingCRate.toString(),
        highSolar: highSolar.toString(),
        highLoad: highLoad.toString(),
        noSolarAndLoad: noSolarAndLoad.toString(),
        pricingStructure: pricingStructure
      },
      { method: "get", action: "/energy" }
    );
  };

  useEffect(() => {
    fetchData();
  }, [
    batteryCapacity,
    chargingEfficiency,
    dischargingEfficiency,
    chargingCRate,
    dischargingCRate,
    highSolar,
    highLoad,
    noSolarAndLoad,
    pricingStructure
  ]);

  const data = fetcher.data || initialData;

  if (!data) {
    return <div>Loading...</div>;
  }

  // Use the first (and only) scenario
  const scenarioKey = Object.keys(data)[0];
  const scenarioData = data[scenarioKey];
  const { hourlyData, summary, name } = scenarioData;

  const formatPrice = (value: number) => `$${value.toFixed(2)}`;

  // Update the tooltip formatter to show battery capacity in kWh
  const tooltipFormatter = (value: number, name: string) => {
    if (name === 'Battery Capacity') {
      return [`${value.toFixed(1)} kWh`, name];
    }
    return [
      name.includes('Price') ? formatPrice(value) : value.toFixed(2),
      name
    ];
  };

  // Function to determine action zones
  const getActionZones = (data: AnalyzedHourlyData[]) => {
    const zones = [];
    let currentZone = null;

    for (let i = 0; i < data.length; i++) {
      const hour = data[i];
      if (!currentZone || currentZone.action !== hour.action) {
        if (currentZone) {
          zones.push(currentZone);
        }
        currentZone = { start: hour.hour, end: hour.hour, action: hour.action, reason: hour.reason };
      } else {
        currentZone.end = hour.hour;
      }

      // Add good import and export zones
      if (showGoodImportHours && hour.reason === "Good Import") {
        zones.push({ start: hour.hour, end: hour.hour + 1, action: 'Good Import', reason: 'Favorable import price' });
      }
      if (showGoodExportHours && hour.reason === "Good Export") {
        zones.push({ start: hour.hour, end: hour.hour + 1, action: 'Good Export', reason: 'Favorable export price' });
      }
    }

    if (currentZone) {
      zones.push(currentZone);
    }

    return zones;
  };

  const actionZones = getActionZones(hourlyData);

  // New function to prepare data for good import/export charts
  const prepareZoneData = (data: AnalyzedHourlyData[], zoneType: 'import' | 'export') => {
    return data.map(hour => ({
      hour: hour.hour,
      price: zoneType === 'import' ? hour.importPrice : hour.exportPrice,
      zonePrice: hour.reason === `Good ${zoneType[0].toUpperCase() + zoneType.slice(1)}` 
        ? (zoneType === 'import' ? hour.importPrice : hour.exportPrice)
        : 0
    }));
  };

  const goodImportData = prepareZoneData(hourlyData, 'import');
  const goodExportData = prepareZoneData(hourlyData, 'export');
  console.log("goodImportData", goodImportData)
  console.log("goodExportData", goodExportData)

  // Modify the hourly data to include good import and export indicators
  const enhancedHourlyData = hourlyData.map(hour => ({
    ...hour,
    goodImportPrice: hour.reason === "Good Import" ? hour.importPrice : 0,
    goodExportPrice: hour.reason === "Good Export" ? hour.exportPrice : 0,
  }));

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Energy Consumption Overview - {name}</h2>
      <Form className="mb-4">
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label htmlFor="batteryCapacity" className="block">Battery Capacity (kWh):</label>
            <input
              type="number"
              id="batteryCapacity"
              name="batteryCapacity"
              value={batteryCapacity}
              onChange={(e) => setBatteryCapacity(Number(e.target.value))}
              className="border rounded p-1 w-full"
            />
          </div>
          <div>
            <label htmlFor="chargingEfficiency" className="block">Charging Efficiency:</label>
            <input
              type="number"
              id="chargingEfficiency"
              name="chargingEfficiency"
              value={chargingEfficiency}
              onChange={(e) => setChargingEfficiency(Number(e.target.value))}
              className="border rounded p-1 w-full"
              step="0.01"
              min="0"
              max="1"
            />
          </div>
          <div>
            <label htmlFor="dischargingEfficiency" className="block">Discharging Efficiency:</label>
            <input
              type="number"
              id="dischargingEfficiency"
              name="dischargingEfficiency"
              value={dischargingEfficiency}
              onChange={(e) => setDischargingEfficiency(Number(e.target.value))}
              className="border rounded p-1 w-full"
              step="0.01"
              min="0"
              max="1"
            />
          </div>
          <div>
            <label htmlFor="pricingStructure" className="block">Pricing Structure:</label>
            <select
              id="pricingStructure"
              name="pricingStructure"
              value={pricingStructure}
              onChange={(e) => setPricingStructure(e.target.value)}
              className="border rounded p-1 w-full"
            >
              {pricingStructures.map((structure) => (
                <option key={structure.key} value={structure.key}>
                  {structure.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={highSolar}
                onChange={(e) => setHighSolar(e.target.checked)}
                className="form-checkbox"
              />
              <span>High Solar</span>
            </label>
          </div>
          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={highLoad}
                onChange={(e) => setHighLoad(e.target.checked)}
                className="form-checkbox"
              />
              <span>High Load</span>
            </label>
          </div>
          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={noSolarAndLoad}
                onChange={(e) => setNoSolarAndLoad(e.target.checked)}
                className="form-checkbox"
              />
              <span>No Solar, No Load</span>
            </label>
          </div>
          <div className="mb-4">
            <label className="inline-flex items-center mr-4">
              <input
                type="checkbox"
                checked={showGoodImportHours}
                onChange={(e) => setShowGoodImportHours(e.target.checked)}
                className="form-checkbox"
              />
              <span className="ml-2">Show Good Import Hours</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                checked={showGoodExportHours}
                onChange={(e) => setShowGoodExportHours(e.target.checked)}
                className="form-checkbox"
              />
              <span className="ml-2">Show Good Export Hours</span>
            </label>
          </div>
          {/* ... existing code for other inputs ... */}
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Refresh Data
        </button>
      </Form>
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-2">Hourly Energy Data</h3>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={enhancedHourlyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" />
            <YAxis 
              yAxisId="left" 
              label={{ value: 'Energy (kWh)', angle: -90, position: 'insideLeft' }} 
            />
            <YAxis 
              yAxisId="right" 
              orientation="right" 
              label={{ value: 'Price ($/kWh)', angle: 90, position: 'insideRight' }} 
              tickFormatter={formatPrice}
            />
            <Tooltip formatter={tooltipFormatter} />
            <Legend />
            <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" yAxisId="left" />
            <Area 
              type="monotone" 
              dataKey="gridPower" 
              fill="#FFA500"
              stroke="#FFA500"
              fillOpacity={0.3}
              name="Grid Power" 
              yAxisId="left" 
            />
            <Line type="monotone" dataKey="load" stroke="#82ca9d" name="Load" yAxisId="left" strokeWidth={2} />
            <Line type="monotone" dataKey="solarGeneration" stroke="#8884d8" name="Solar Generation" yAxisId="left" strokeWidth={2} />
            <Line type="step" dataKey="batteryCapacity" stroke="#ff0000" name="Battery Capacity" yAxisId="left" strokeWidth={2} />
            <Line type="monotone" dataKey="importPrice" stroke="#0088FE" name="Import Price" yAxisId="right" strokeDasharray="5 5" />
            <Line type="monotone" dataKey="exportPrice" stroke="#00C49F" name="Export Price" yAxisId="right" strokeDasharray="3 3" />
            
            {/* Add Good Import and Export Areas */}
            {showGoodImportHours && (
              <Area 
                type="step" 
                dataKey="goodImportPrice" 
                fill="#0088FE" 
                stroke="#0088FE" 
                fillOpacity={0.5} 
                name="Good Import" 
                yAxisId="right"
              />
            )}
            {showGoodExportHours && (
              <Area 
                type="step" 
                dataKey="goodExportPrice" 
                fill="#00C49F" 
                stroke="#00C49F" 
                fillOpacity={0.5} 
                name="Good Export" 
                yAxisId="right"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-2">Energy Summary</h3>
        <ul>
          <li>Total Load: {summary.totalLoad.toFixed(2)} kWh</li>
          <li>Total Grid Import: {summary.totalGridImport.toFixed(2)} kWh</li>
          <li>Total Grid Export: {summary.totalGridExport.toFixed(2)} kWh</li>
          <li>Total Solar Generation: {summary.totalSolarGeneration.toFixed(2)} kWh</li>
          <li>Total Import Cost: ${summary.totalImportCost.toFixed(2)}</li>
          <li>Total Export Profit: ${summary.totalExportProfit.toFixed(2)}</li>
          <li>Net Cost: ${summary.netCost.toFixed(2)}</li>
          <li>Final Battery Capacity: {summary.finalBatteryCapacity.toFixed(2)} kWh ({((summary.finalBatteryCapacity / batteryCapacity) * 100).toFixed(1)}%)</li>
        </ul>
      </div>
      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-2">Hourly Actions and Reasons</h3>
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-2">Hour</th>
              <th className="border border-gray-300 p-2">Action</th>
              <th className="border border-gray-300 p-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {hourlyData.map((hour) => (
              <tr key={hour.hour}>
                <td className="border border-gray-300 p-2">{hour.hour}</td>
                <td className="border border-gray-300 p-2">{hour.action}</td>
                <td className="border border-gray-300 p-2">{hour.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-2">Good Import Zones</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={goodImportData}>
            <XAxis dataKey="hour" />
            <YAxis 
              label={{ value: 'Price ($/kWh)', angle: -90, position: 'insideLeft' }}
              tickFormatter={formatPrice}
            />
            <Tooltip formatter={(value) => formatPrice(Number(value))} />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#8884d8"
              fill="#8884d8"
              fillOpacity={0.1}
            />
            <Area
              type="monotone"
              dataKey="zonePrice"
              stroke="#82ca9d"
              fill="#82ca9d"
              fillOpacity={0.8}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-2">Good Export Zones</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={goodExportData}>
            <XAxis dataKey="hour" />
            <YAxis 
              label={{ value: 'Price ($/kWh)', angle: -90, position: 'insideLeft' }}
              tickFormatter={formatPrice}
            />
            <Tooltip formatter={(value) => formatPrice(Number(value))} />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#8884d8"
              fill="#8884d8"
              fillOpacity={0.1}
            />
            <Area
              type="monotone"
              dataKey="zonePrice"
              stroke="#ffc658"
              fill="#ffc658"
              fillOpacity={0.8}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
