// Data types
interface HourlyData {
  hour: number;
  importPrice: number;
  exportPrice: number;
  load: number;
  solarGeneration: number;
}


// New interface for the analyzed data
interface AnalyzedHourlyData extends HourlyData {
  gridImport: number;
  gridExport: number;
  gridPower: number;
  batteryCharge: number;
  batteryDischarge: number;
  batteryCapacity: number; // Changed from batterySoc
  importCost: number;
  exportProfit: number;
  decision: string;
  action: string;
  reason: string;
}

// Modified function to return analyzed data with smarter battery management
function analyzeEnergyData(
  data: HourlyData[],
  batteryCapacity: number,
  baseChargingEfficiency: number,
  baseDischargingEfficiency: number,
  chargingCRate: number,
  dischargingCRate: number
): AnalyzedHourlyData[] {
  const maxChargingPower = batteryCapacity * chargingCRate;
  const maxDischargingPower = batteryCapacity * dischargingCRate;
  let currentBatteryCapacity = batteryCapacity / 2; // Start at 50% capacity
  const analyzedData: AnalyzedHourlyData[] = [];

  // Calculate efficiency based on C-rate
  const calculateEfficiency = (baseCRate: number, actualCRate: number, baseEfficiency: number) => {
    const efficiencyLoss = Math.floor(actualCRate / 0.2) * 0.01;
    return Math.max(baseEfficiency - efficiencyLoss, 0.5); // Ensure efficiency doesn't go below 50%
  };

  // Calculate average import price
  const avgImportPrice = data.reduce((sum, hour) => sum + hour.importPrice, 0) / data.length;

  // Find expensive import zones
  const expensiveImportZones = findExpensiveImportZones(data, avgImportPrice * 1.2);

  // Find cheap import zones
  const cheapImportZones = findCheapImportZones(data, avgImportPrice * 0.8);

  data.forEach((hour, index) => {
    let netEnergy = hour.solarGeneration - hour.load;
    let batteryCharge = 0;
    let batteryDischarge = 0;
    let gridImport = 0;
    let gridExport = 0;

    const isExpensiveImportHour = hour.importPrice > avgImportPrice * 1.2;
    const isCheapImportHour = hour.importPrice < avgImportPrice * 0.8;

    // Predict future expensive periods
    const upcomingExpensivePeriod = findNextExpensivePeriod(expensiveImportZones, index);
    const energyNeededForExpensivePeriod = calculateEnergyNeededForPeriod(data, upcomingExpensivePeriod);

    let action = 'Idle';
    let reason = 'No action needed';

    if (isExpensiveImportHour && currentBatteryCapacity > batteryCapacity * 0.2) {
      // Discharge during expensive hours
      const dischargeAmount = Math.min(
        currentBatteryCapacity - batteryCapacity * 0.2,
        hour.load,
        maxDischargingPower
      );
      const actualDischargeCRate = dischargeAmount / batteryCapacity;
      const dischargingEfficiency = calculateEfficiency(dischargingCRate, actualDischargeCRate, baseDischargingEfficiency);

      batteryDischarge = dischargeAmount;
      currentBatteryCapacity -= dischargeAmount;
      netEnergy += dischargeAmount * dischargingEfficiency;
      action = 'Discharging';
      reason = `Peak hour, high import price. Efficiency: ${(dischargingEfficiency * 100).toFixed(1)}%`;
    } else if (isCheapImportHour || netEnergy > 0) {
      // Charge during cheap hours or when there's excess solar
      const energyDeficit = energyNeededForExpensivePeriod - currentBatteryCapacity;
      if (energyDeficit > 0) {
        const chargeAmount = Math.min(
          energyDeficit,
          isCheapImportHour ? maxChargingPower : netEnergy,
          batteryCapacity - currentBatteryCapacity
        );
        const actualChargeCRate = chargeAmount / batteryCapacity;
        const chargingEfficiency = calculateEfficiency(chargingCRate, actualChargeCRate, baseChargingEfficiency);

        batteryCharge = chargeAmount;
        currentBatteryCapacity += chargeAmount;
        if (isCheapImportHour) {
          gridImport = chargeAmount / chargingEfficiency;
          netEnergy -= chargeAmount / chargingEfficiency;
        } else {
          netEnergy -= chargeAmount / chargingEfficiency;
        }
        action = isCheapImportHour ? 'Charging from grid' : 'Charging from solar';
        reason = `Preparing for upcoming expensive period (${upcomingExpensivePeriod?.start}-${upcomingExpensivePeriod?.end}). Efficiency: ${(chargingEfficiency * 100).toFixed(1)}%`;
      }
    }

    // Handle remaining energy
    if (netEnergy < 0) {
      gridImport -= netEnergy;
      action = action === 'Idle' ? 'Importing' : `${action} and Importing`;
      reason = action === 'Idle' ? 'Energy deficit' : `${reason}, importing remaining energy`;
    } else if (netEnergy > 0) {
      gridExport = netEnergy;
      action = action === 'Idle' ? 'Exporting' : `${action} and Exporting`;
      reason = action === 'Idle' ? 'Excess energy' : `${reason}, exporting remaining energy`;
    }

    // Calculate profits and costs
    const exportProfit = gridExport * hour.exportPrice;
    const importCost = gridImport * hour.importPrice;

    analyzedData.push({
      ...hour,
      gridImport,
      gridExport,
      gridPower: gridExport - gridImport,
      batteryCharge,
      batteryDischarge,
      batteryCapacity: currentBatteryCapacity,
      importCost,
      exportProfit,
      action,
      reason,
      decision: action,
    });
  });

  return analyzedData;
}

// Helper function to find the next expensive period
function findNextExpensivePeriod(expensiveZones: { start: number; end: number }[], currentHour: number): { start: number; end: number } | null {
  return expensiveZones.find(zone => zone.start > currentHour) || null;
}

// Helper function to calculate energy needed for a period
function calculateEnergyNeededForPeriod(data: HourlyData[], period: { start: number; end: number } | null): number {
  if (!period) return 0;
  return data.slice(period.start, period.end + 1)
    .reduce((sum, hour) => sum + Math.max(0, hour.load - hour.solarGeneration), 0);
}

// Helper function to find cheap import zones
function findCheapImportZones(data: HourlyData[], threshold: number): { start: number; end: number }[] {
  const zones: { start: number; end: number }[] = [];
  let currentZone: { start: number; end: number } | null = null;

  data.forEach((hour, index) => {
    if (hour.importPrice < threshold) {
      if (!currentZone) {
        currentZone = { start: index, end: index };
      } else {
        currentZone.end = index;
      }
    } else if (currentZone) {
      zones.push(currentZone);
      currentZone = null;
    }
  });

  if (currentZone) {
    zones.push(currentZone);
  }

  return zones;
}

// Define scenarios
const scenarios = {
  highSolarHighLoad: {
    name: "High Solar, High Load",
    solarMultiplier: 1.5,
    loadMultiplier: 1.5,
  },
  highSolarLowLoad: {
    name: "High Solar, Low Load",
    solarMultiplier: 1.5,
    loadMultiplier: 0.5,
  },
  lowSolarHighLoad: {
    name: "Low Solar, High Load",
    solarMultiplier: 0.5,
    loadMultiplier: 1.5,
  },
  lowSolarLowLoad: {
    name: "Low Solar, Low Load",
    solarMultiplier: 0.5,
    loadMultiplier: 0.5,
  },
  noSolar: {
    name: "No Solar",
    solarMultiplier: 0,
    loadMultiplier: 1,
  },
};

// Add this new interface
interface PricingStructure {
  getImportPrice: (hour: number) => number;
  getExportPrice: (hour: number) => number;
}

// Define pricing structures
const pricingStructures: Record<string, PricingStructure> = {
  normal: {
    getImportPrice: (hour: number) => {
      if (hour >= 0 && hour < 6) {
        return 0.05 + Math.random() * 0.05; // Night time (low)
      } else if (hour >= 6 && hour < 9) {
        return 0.15 + Math.random() * 0.05; // Morning peak
      } else if (hour >= 9 && hour < 17) {
        return 0.10 + Math.random() * 0.05; // Daytime
      } else if (hour >= 17 && hour < 22) {
        return 0.20 + Math.random() * 0.05; // Evening peak
      } else {
        return 0.08 + Math.random() * 0.05; // Late evening
      }
    },
    getExportPrice: (hour: number) => {
      const importPrice = pricingStructures.normal.getImportPrice(hour);
      if (hour >= 17 && hour < 22) {
        return importPrice * (1.1 + Math.random() * 0.1); // Higher during evening peak
      } else if (hour >= 6 && hour < 10) {
        return importPrice * (1.2 + Math.random() * 0.1); // Higher during morning peak
      } else if (hour >= 10 && hour < 16) {
        return importPrice * (0.9 + Math.random() * 0.1); // Higher during sunny hours
      } else {
        return importPrice * (0.7 + Math.random() * 0.1); // Lower during other times
      }
    }
  },
  simpleCheaper: {
    getImportPrice: (hour: number) => {
      if (hour >= 0 && hour < 4) {
        return 0.05; // Cheap rate from midnight to 4AM
      } else {
        return 0.15; // Standard rate for the rest of the day
      }
    },
    getExportPrice: () => 0 // No feed-in tariff
  }
};

// Modify the generateScenarioData function
function generateScenarioData(scenario: typeof scenarios.highSolarHighLoad, pricingStructure: string): HourlyData[] {
  const pricing = pricingStructures[pricingStructure];
  return Array.from({ length: 24 }, (_, i) => {
    const hour = i;
    let load, solarGeneration;

    // Set import and export prices based on the selected pricing structure
    const importPrice = pricing.getImportPrice(hour);
    const exportPrice = pricing.getExportPrice(hour);

    // Set load (higher in morning and evening)
    if (hour >= 6 && hour <= 9) {
      load = (3 + (hour - 6) * 0.5) * scenario.loadMultiplier; // Morning ramp up
    } else if (hour >= 17 && hour <= 22) {
      load = (4 + (hour - 17) * 0.5) * scenario.loadMultiplier; // Evening ramp up
    } else if (hour >= 23 || hour < 6) {
      load = 2 * scenario.loadMultiplier; // Night time base load
    } else {
      load = 3.5 * scenario.loadMultiplier; // Daytime base load
    }

    // Set solar generation (follows a bell curve)
    if (hour >= 6 && hour <= 18) {
      const maxGeneration = 6;
      solarGeneration = maxGeneration * Math.sin(((hour - 6) / (18 - 6)) * Math.PI) * scenario.solarMultiplier;
    } else {
      solarGeneration = 0;
    }

    return {
      hour,
      importPrice: Number(importPrice.toFixed(2)),
      exportPrice: Number(exportPrice.toFixed(2)),
      load: Number(load.toFixed(2)),
      solarGeneration: Number(solarGeneration.toFixed(2))
    };
  });
}



// New function to find export price zones
function findExportPriceZones(data: HourlyData[], threshold: number): { start: number; end: number }[] {
  const zones: { start: number; end: number }[] = [];
  let currentZone: { start: number; end: number } | null = null;

  data.forEach((hour) => {
    if (hour.exportPrice >= threshold) {
      if (!currentZone) {
        currentZone = { start: hour.hour, end: hour.hour };
      } else {
        currentZone.end = hour.hour;
      }
    } else {
      if (currentZone) {
        zones.push(currentZone);
        currentZone = null;
      }
    }
  });

  // Add the last zone if it exists
  if (currentZone) {
    zones.push(currentZone);
  }

  return zones;
}

// New function to find expensive import price zones
function findExpensiveImportZones(data: HourlyData[], threshold: number): { start: number; end: number }[] {
  const zones: { start: number; end: number }[] = [];
  let currentZone: { start: number; end: number } | null = null;

  data.forEach((hour) => {
    if (hour.importPrice >= threshold) {
      if (!currentZone) {
        currentZone = { start: hour.hour, end: hour.hour };
      } else {
        currentZone.end = hour.hour;
      }
    } else {
      if (currentZone) {
        zones.push(currentZone);
        currentZone = null;
      }
    }
  });

  // Add the last zone if it exists
  if (currentZone) {
    zones.push(currentZone);
  }

  return zones;
}

// New function to find cheaper tariff zones
function findCheaperTariffZones(data: HourlyData[], importThreshold: number, exportThreshold: number): { start: number; end: number; type: 'import' | 'export' }[] {
  const zones: { start: number; end: number; type: 'import' | 'export' }[] = [];
  let currentZone: { start: number; end: number; type: 'import' | 'export' } | null = null;

  data.forEach((hour) => {
    if (hour.importPrice < importThreshold || hour.exportPrice > exportThreshold) {
      const type = hour.importPrice < importThreshold ? 'import' : 'export';
      if (!currentZone) {
        currentZone = { start: hour.hour, end: hour.hour, type };
      } else if (currentZone.type === type) {
        currentZone.end = hour.hour;
      } else {
        zones.push(currentZone);
        currentZone = { start: hour.hour, end: hour.hour, type };
      }
    } else {
      if (currentZone) {
        zones.push(currentZone);
        currentZone = null;
      }
    }
  });

  // Add the last zone if it exists
  if (currentZone) {
    zones.push(currentZone);
  }

  return zones;
}

// New interface for energy profile
interface EnergyProfile {
  hour: number;
  neededEnergy: number;
  reason: string;
}

// New function to calculate needed energy profile
function calculateNeededEnergyProfile(data: AnalyzedHourlyData[], expensiveImportZones: { start: number; end: number }[]): EnergyProfile[] {
  const profile: EnergyProfile[] = [];
  const lookAheadHours = 6; // Look ahead 6 hours for potential high demand

  for (let i = 0; i < data.length; i++) {
    let neededEnergy = 0;
    let reason = "";

    // Check if we're approaching an expensive import zone
    const upcomingExpensiveZone = expensiveImportZones.find(zone => zone.start > i && zone.start <= i + lookAheadHours);
    if (upcomingExpensiveZone) {
      // Calculate energy needed for the expensive zone
      neededEnergy = data.slice(upcomingExpensiveZone.start, upcomingExpensiveZone.end + 1)
        .reduce((sum, hour) => sum + Math.max(0, hour.load - hour.solarGeneration), 0);
      reason = `Preparing for expensive import zone (${upcomingExpensiveZone.start}-${upcomingExpensiveZone.end})`;
    } else {
      // Look ahead for high demand periods
      const upcomingDemand = data.slice(i + 1, i + 1 + lookAheadHours)
        .reduce((sum, hour) => sum + Math.max(0, hour.load - hour.solarGeneration), 0);
      if (upcomingDemand > 0) {
        neededEnergy = upcomingDemand;
        reason = `Preparing for upcoming high demand`;
      }
    }

    profile.push({
      hour: data[i].hour,
      neededEnergy: Number(neededEnergy.toFixed(2)),
      reason
    });
  }

  return profile;
}

// Helper function to get the future import price
function getFutureImportPrice(data: HourlyData[], currentIndex: number, lookAhead: number = 6): number {
  const futureHours = data.slice(currentIndex + 1, currentIndex + 1 + lookAhead);
  if (futureHours.length === 0) return 0;
  return Math.max(...futureHours.map(hour => hour.importPrice));
}

// Modified route handler function
export async function getAnalyzedEnergyData({
  batteryCapacity,
  chargingEfficiency,
  dischargingEfficiency,
  chargingCRate,
  dischargingCRate,
  highSolar,
  highLoad,
  pricingStructure = "normal"
}: {
  batteryCapacity: number;
  chargingEfficiency: number;
  dischargingEfficiency: number;
  chargingCRate: number;
  dischargingCRate: number;
  highSolar: boolean;
  highLoad: boolean;
  pricingStructure: string;
}) {
  // Determine which scenario to use based on highSolar and highLoad
  let scenarioKey: keyof typeof scenarios;
  if (highSolar && highLoad) {
    scenarioKey = "highSolarHighLoad";
  } else if (highSolar && !highLoad) {
    scenarioKey = "highSolarLowLoad";
  } else if (!highSolar && highLoad) {
    scenarioKey = "lowSolarHighLoad";
  } else {
    scenarioKey = "lowSolarLowLoad";
  }

  // Generate data for the selected scenario with the current pricing structure
  const scenarioData = generateScenarioData(scenarios[scenarioKey], pricingStructure);

  const analyzedData = analyzeEnergyData(
    scenarioData,
    batteryCapacity,
    chargingEfficiency,
    dischargingEfficiency,
    chargingCRate,
    dischargingCRate
  );

  // Calculate average export and import prices

  const maxExportPrice = Math.max(...analyzedData.map(hour => hour.exportPrice));
  const minImportPrice = Math.min(...analyzedData.map(hour => hour.importPrice));
  console.log("maxExportPrice", maxExportPrice)
  console.log("minImportPrice", minImportPrice)
  //find the arbitrage threshold which is calculated from efficiency of charging and discharging (both), only if maxExportPrice is higher than minImportPrice 
  //console.log("chargingEfficiency", chargingEfficiency)
  //console.log("dischargingEfficiency", dischargingEfficiency)
  const efficiencyThreshold = 1 - chargingEfficiency * dischargingEfficiency
  //console.log("efficiencyThreshold", efficiencyThreshold)
  const arbitrageThreshold = (maxExportPrice - minImportPrice) * efficiencyThreshold
  console.log("arbitrageThreshold", arbitrageThreshold)
  const midPrice = (maxExportPrice + minImportPrice) / 2
  const goodImportPriceThreshold = midPrice - arbitrageThreshold
  const goodExportPriceThreshold = midPrice + arbitrageThreshold
  console.log("goodImportPriceThreshold", goodImportPriceThreshold)
  console.log("goodExportPriceThreshold", goodExportPriceThreshold)
  //mark the hours with good import and export prices
  const goodImportHours = analyzedData.filter(hour => hour.importPrice <= goodImportPriceThreshold);
  const goodExportHours = analyzedData.filter(hour => hour.exportPrice >= goodExportPriceThreshold);
  //change each of these hours to actions and reasons
  for (const hour of goodImportHours) {
    hour.reason = "Good Import"
  }
  for (const hour of goodExportHours) {
    hour.reason = "Good Export"
  }

  const avgExportPrice = analyzedData.reduce((sum, hour) => sum + hour.exportPrice, 0) / analyzedData.length;
  const avgImportPrice = analyzedData.reduce((sum, hour) => sum + hour.importPrice, 0) / analyzedData.length;

  // Find export price zones (prices above average)
  const exportPriceZones = findExportPriceZones(analyzedData, avgExportPrice);

  // Find expensive import price zones (prices above average)
  const expensiveImportZones = findExpensiveImportZones(analyzedData, avgImportPrice);

  // Find cheaper tariff zones
  const cheaperTariffZones = findCheaperTariffZones(analyzedData, avgImportPrice * 0.9, avgExportPrice * 1.1);

  // Calculate needed energy profile
  const neededEnergyProfile = calculateNeededEnergyProfile(analyzedData, expensiveImportZones);
  //console.log("goodexportTimes", goodExportHours)
  return {
    [scenarioKey]: {
      name: scenarios[scenarioKey].name,
      hourlyData: analyzedData.map(hour => ({
        ...hour,
        reason: hour.reason // Include the reason in hourlyData
      })),
      summary: {
        totalLoad: Number(analyzedData.reduce((sum, hour) => sum + hour.load, 0).toFixed(2)),
        totalGridImport: Number(analyzedData.reduce((sum, hour) => sum + hour.gridImport, 0).toFixed(2)),
        totalGridExport: Number(analyzedData.reduce((sum, hour) => sum + hour.gridExport, 0).toFixed(2)),
        totalSolarGeneration: Number(analyzedData.reduce((sum, hour) => sum + hour.solarGeneration, 0).toFixed(2)),
        totalImportCost: Number(analyzedData.reduce((sum, hour) => sum + hour.importCost, 0).toFixed(2)),
        totalExportProfit: Number(analyzedData.reduce((sum, hour) => sum + hour.exportProfit, 0).toFixed(2)),
        netCost: Number(analyzedData.reduce((sum, hour) => sum + hour.importCost - hour.exportProfit, 0).toFixed(2)),
        finalBatteryCapacity: Number(analyzedData[analyzedData.length - 1].batteryCapacity.toFixed(2)),
        exportPriceZones: exportPriceZones.length > 0 ? exportPriceZones : "None",
        expensiveImportZones: expensiveImportZones.length > 0 ? expensiveImportZones : "None",
        cheaperTariffZones: cheaperTariffZones.length > 0 ? cheaperTariffZones : "None",
        neededEnergyProfile: neededEnergyProfile.length > 0 ? neededEnergyProfile : "None",
      }
    }
  };
}
