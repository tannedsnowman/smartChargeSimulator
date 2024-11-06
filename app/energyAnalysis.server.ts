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
  importCost2: number;
  exportProfit: number;
  exportProfit2: number;
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
  chargingEfficiency2: number,
  dischargingEfficiency2: number,
  chargingCRate: number,
  dischargingCRate: number,
  optimalChargingMapFirst: Map<number, number>,
  optimalChargingMapSecond: Map<number, number>,
  optimalDischargingMapFirst: Map<number, number>,
  optimalDischargingMapSecond: Map<number, number>
): AnalyzedHourlyData[] {
  const maxChargingPower = batteryCapacity * chargingCRate;
  const maxDischargingPower = batteryCapacity * dischargingCRate;
  let currentBatteryCapacity = batteryCapacity * 0;
  const analyzedData: AnalyzedHourlyData[] = [];

  // Calculate efficiency based on C-rate
  const calculateEfficiency = (actualCRate: number, baseEfficiency: number) => {
    const efficiencyLoss = Math.floor(actualCRate / 0.1) * 0.01;
    return Math.max(baseEfficiency - efficiencyLoss, 0.5); // Ensure efficiency doesn't go below 50%
  };
  data.forEach((hour) => {
    let batteryCharge = 0;
    let batteryDischarge = 0;
    let gridImport = 0;
    let gridImport2 = 0;
    let gridExport = 0;
    let gridExport2 = 0;
    let action = 'Idle';
    let reason = 'No action needed';

    // Check if this hour is in the optimal charging schedule
    const optimalChargingRate = optimalChargingMapFirst.get(hour.hour) || optimalChargingMapSecond.get(hour.hour);
    if (optimalChargingRate && optimalChargingRate > 0) {
      const chargeAmount = Math.min(
        batteryCapacity * optimalChargingRate,
        maxChargingPower,
        batteryCapacity - currentBatteryCapacity
      );

      if (chargeAmount > 0) {
        const actualChargeCRate = chargeAmount / batteryCapacity;
        const chargingEfficiency = calculateEfficiency(actualChargeCRate, baseChargingEfficiency);
        const effectiveChargingEfficiency2 = calculateEfficiency(actualChargeCRate, chargingEfficiency2);
        batteryCharge = chargeAmount;
        gridImport = chargeAmount / chargingEfficiency;
        gridImport2 = chargeAmount / effectiveChargingEfficiency2;
        action = 'Optimal Charging';
        reason = `Scheduled optimal charging at ${(optimalChargingRate * 100).toFixed(1)}% rate. Efficiency: ${(chargingEfficiency * 100).toFixed(1)}%`;
      }
    }

    // Add discharging logic
    const optimalDischargingRate = optimalDischargingMapFirst.get(hour.hour) || optimalDischargingMapSecond.get(hour.hour);
    //console.log(hour.hour, "optimalDischargingRate", optimalDischargingRate);
    if (optimalDischargingRate && optimalDischargingRate > 0) {
      const dischargeAmount = Math.min(
        batteryCapacity * optimalDischargingRate,
        maxDischargingPower,
        currentBatteryCapacity
      );

      if (dischargeAmount > 0) {
        const actualDischargeCRate = dischargeAmount / batteryCapacity;
        const dischargingEfficiency = calculateEfficiency(actualDischargeCRate, baseDischargingEfficiency);
        const effectiveDischargingEfficiency2 = calculateEfficiency(actualDischargeCRate, dischargingEfficiency2);

        batteryDischarge = dischargeAmount;
        gridExport = dischargeAmount * dischargingEfficiency;
        gridExport2 = dischargeAmount * effectiveDischargingEfficiency2;
        action = 'Optimal Discharging';
        reason = `Scheduled optimal discharging at ${(optimalDischargingRate * 100).toFixed(1)}% rate. Efficiency: ${(dischargingEfficiency * 100).toFixed(1)}%`;
      }
    }
    // Calculate profits and costs
    const exportProfit = gridExport * hour.exportPrice;
    const exportProfit2 = gridExport2 * hour.exportPrice;
    const importCost = gridImport * hour.importPrice;
    const importCost2 = gridImport2 * hour.importPrice;

    analyzedData.push({
      ...hour,
      gridImport,
      gridExport,
      gridPower: gridExport - gridImport,
      batteryCharge,
      batteryDischarge,
      batteryCapacity: currentBatteryCapacity,
      importCost,
      importCost2,
      exportProfit,
      exportProfit2,
      action,
      reason,
      decision: action,
    });

    // Update battery capacity at the end of the hour
    currentBatteryCapacity += batteryCharge - batteryDischarge;
  });

  return analyzedData;
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
        return importPrice * (0.7 + Math.random() * 0.1); // Higher during evening peak
      } else if (hour >= 6 && hour < 10) {
        return importPrice * (0.7 + Math.random() * 0.1); // Higher during morning peak
      } else if (hour >= 10 && hour < 16) {
        return importPrice * (0.5 + Math.random() * 0.1); // Higher during sunny hours
      } else {
        return importPrice * (0.7 + Math.random() * 0.1); // Lower during other times
      }
    }
  },
  negativeImportandExportPrice: {
    getImportPrice: (hour: number) => {
      if (hour >= 0 && hour < 6) {
        return -0.05 - Math.random() * 0.05; // Night time (low)
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
      if (hour >= 0 && hour < 6) {
        return -0.15 - Math.random() * 0.05; // Night time (low)
      } else if (hour >= 6 && hour < 9) {
        return 0.05 + Math.random() * 0.05; // Morning peak
      } else if (hour >= 9 && hour < 17) {
        return 0.1 + Math.random() * 0.05; // Daytime
      } else if (hour >= 17 && hour < 22) {
        return 0.1 + Math.random() * 0.05; // Evening peak
      } else {
        return -0.08 - Math.random() * 0.05; // Late evening
      }
    }
  },
  variableCheapRatesLowExport: {
    getImportPrice: (hour: number) => {
      if (hour >= 0 && hour < 6) {
        return 0.05 + Math.random() * 0.05; // Night time (low)
      } else if (hour >= 6 && hour < 9) {
        return 0.35 + Math.random() * 0.05; // Morning peak
      } else if (hour >= 9 && hour < 17) {
        return 0.20 + Math.random() * 0.05; // Daytime
      } else if (hour >= 17 && hour < 22) {
        return 0.30 + Math.random() * 0.05; // Evening peak
      } else {
        return 0.08 + Math.random() * 0.05; // Late evening
      }
    },
    getExportPrice: (hour: number) => {
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
    }
  },
  stablePrice: {
    getImportPrice: (hour: number) => {
      if (hour >= 0 && hour < 6) {
        return 0.07 + Math.random() * 0.02; // Night time (low)
      } else if (hour >= 6 && hour < 9) {
        return 0.14 + Math.random() * 0.02; // Morning peak
      } else if (hour >= 9 && hour < 17) {
        return 0.07 + Math.random() * 0.02; // Daytime
      } else if (hour >= 17 && hour < 22) {
        return 0.14 + Math.random() * 0.02; // Evening peak
      } else {
        return 0.07 + Math.random() * 0.02; // Late evening
      }
    },
    getExportPrice: (hour: number) => {
      if (hour >= 0 && hour < 6) {
        return 0.07 + Math.random() * 0.02; // Night time (low)
      } else if (hour >= 6 && hour < 9) {
        return 0.10 + Math.random() * 0.02; // Morning peak
      } else if (hour >= 9 && hour < 17) {
        return 0.07 + Math.random() * 0.02; // Daytime
      } else if (hour >= 17 && hour < 22) {
        return 0.10 + Math.random() * 0.02; // Evening peak
      } else {
        return 0.07 + Math.random() * 0.02; // Late evening
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

// Add new function to calculate discharging profit
function calculateDischargingProfit(
  distribution: number[],
  sortedHours: HourlyData[],
  batteryCapacity: number,
  baseDischargingEfficiency: number
): number {
  if (distribution.length !== sortedHours.length) {
    console.error("Length mismatch in calculateDischargingProfit", {
      distributionLength: distribution.length,
      sortedHoursLength: sortedHours.length
    });
    return 0;
  }

  return distribution.reduce((totalProfit, ratio, index) => {
    if (ratio === 0) return totalProfit;
    if (!sortedHours[index]) {
      console.error("Missing hour data at index", index);
      return totalProfit;
    }

    const calculateEfficiency = (actualCRate: number, baseEfficiency: number) => {
      const efficiencyLoss = Math.floor(actualCRate / 0.1) * 0.01;
      return Math.max(baseEfficiency - efficiencyLoss, 0.5);
    };

    const dischargingEfficiency = calculateEfficiency(ratio, baseDischargingEfficiency);
    const energyExported = (batteryCapacity * ratio) * dischargingEfficiency;
    const hourProfit = energyExported * sortedHours[index].exportPrice;

    return totalProfit + hourProfit;
  }, 0);
}

// Modify generateDistributions to accept a length parameter
function generateDistributions(length: number = 6): number[][] {
  const distributions: number[][] = [];
  const step = 0.1;

  function generateCombinations(remaining: number, current: number[], depth: number = 0): void {
    if (depth === length - 1) {
      const roundedRemaining = Math.round(remaining * 10) / 10;
      if (roundedRemaining >= 0 && roundedRemaining <= 1) {
        distributions.push([...current, roundedRemaining]);
      }
      return;
    }

    for (let i = 0; i <= remaining; i += step) {
      const roundedI = Math.round(i * 10) / 10;
      if (roundedI <= remaining) {
        generateCombinations(remaining - roundedI, [...current, roundedI], depth + 1);
      }
    }
  }

  generateCombinations(1, []);
  return distributions;
}

// Update findOptimalDischargingDistribution to handle variable length arrays
function findOptimalDischargingDistribution(
  hours: HourlyData[],
  batteryCapacity: number,
  baseDischargingEfficiency: number
): { distribution: number[], profit: number } {
  if (hours.length === 0) {
    return { distribution: [], profit: 0 };
  }

  // Get the actual length of hours (up to 6)
  const length = Math.min(hours.length, 6);

  // Modified sorting to handle equal prices, similar to charging
  const sortedHours = hours.slice(0, length).sort((a, b) => {
    // First compare by price
    const priceDiff = b.exportPrice - a.exportPrice;  // Note: reversed for highest export price first
    if (priceDiff !== 0) return priceDiff;
    // If prices are equal, prefer earlier hours
    return a.hour - b.hour;
  });

  // Generate distributions with the correct length
  const distributions = generateDistributions(length);
  let bestDistribution = Array(length).fill(0);
  let highestProfit = -Infinity;

  for (const distribution of distributions) {
    const profit = calculateDischargingProfit(
      distribution,
      sortedHours,
      batteryCapacity,
      baseDischargingEfficiency
    );

    // Prefer more balanced distributions when profits are equal
    const isMoreBalanced = profit === highestProfit &&
      distribution.reduce((max, curr) => Math.max(max, curr), 0) <
      bestDistribution.reduce((max, curr) => Math.max(max, curr), 0);

    if (profit > highestProfit || isMoreBalanced) {
      highestProfit = profit;
      bestDistribution = distribution;
    }
  }

  // Log the final schedule
  console.log("\nOptimal Discharging Schedule:");
  bestDistribution.forEach((rate, index) => {
    if (rate > 0 && sortedHours[index]) {
      console.log(`Hour ${sortedHours[index].hour}: Discharge at ${(rate * 100).toFixed(1)}% rate (Price: $${sortedHours[index].exportPrice.toFixed(3)})`);
    }
  });

  return {
    distribution: bestDistribution,
    profit: highestProfit
  };
}

// Modified route handler function
export async function getAnalyzedEnergyData({
  batteryCapacity,
  chargingEfficiency,
  dischargingEfficiency,
  chargingEfficiency2,
  dischargingEfficiency2,
  chargingCRate,
  dischargingCRate,
  highSolar,
  highLoad,
  noSolarAndLoad,
  pricingStructure = "normal"
}: {
  batteryCapacity: number;
  chargingEfficiency: number;
  dischargingEfficiency: number;
  chargingEfficiency2: number;
  dischargingEfficiency2: number;
  chargingCRate: number;
  dischargingCRate: number;
  highSolar: boolean;
  highLoad: boolean;
  noSolarAndLoad: boolean;
  pricingStructure: string;
}) {
  // Determine which scenario to use based on highSolar and highLoad
  let scenarioKey: keyof typeof scenarios;
  if (noSolarAndLoad) {
    scenarioKey = "lowSolarLowLoad";
  } else if (highSolar && highLoad) {
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

  // Get optimal charging strategy before analyzing data
  const cheapestHoursFirst = scenarioData.slice(0, 6).sort((a, b) => a.importPrice - b.importPrice);
  const optimalStrategyFirst = findOptimalChargingDistribution(
    cheapestHoursFirst,
    batteryCapacity,
    chargingEfficiency
  );
  console.log("optimalStrategyFirst", optimalStrategyFirst);
  // Create a map of optimal charging rates for each hour
  const optimalChargingMapFirst = new Map<number, number>();
  optimalStrategyFirst.distribution.forEach((rate, index) => {
    if (rate > 0) {
      optimalChargingMapFirst.set(cheapestHoursFirst[index].hour, rate);
    }
  });
  console.log("optimalChargingMapFirst", optimalChargingMapFirst);
  const cheapestHoursSecond = scenarioData.slice(10, 16).sort((a, b) => a.importPrice - b.importPrice);
  const optimalStrategySecond = findOptimalChargingDistribution(
    cheapestHoursSecond,
    batteryCapacity,
    chargingEfficiency
  );
  console.log("optimalStrategySecond", optimalStrategySecond);
  const optimalChargingMapSecond = new Map<number, number>();
  optimalStrategySecond.distribution.forEach((rate, index) => {
    if (rate > 0) {
      optimalChargingMapSecond.set(cheapestHoursSecond[index].hour, rate);
    }
  });
  console.log("optimalChargingMapSecond", optimalChargingMapSecond);

  // Get optimal discharging strategy for morning peak (6-10am)
  const morningPeakHours = scenarioData.slice(6, 10).sort((a, b) => b.exportPrice - a.exportPrice);
  const optimalDischargingStrategyFirst = findOptimalDischargingDistribution(
    morningPeakHours,
    batteryCapacity,
    dischargingEfficiency
  );
  console.log("optimalDischargingStrategyFirst", optimalDischargingStrategyFirst);
  // Create a map of optimal discharging rates (similar to charging)
  const optimalDischargingMapFirst = new Map<number, number>();
  optimalDischargingStrategyFirst.distribution.forEach((rate, index) => {
    if (rate > 0) {
      optimalDischargingMapFirst.set(morningPeakHours[index].hour, rate);
    }
  });

  const eveningPeakHours = scenarioData.slice(16, 22).sort((a, b) => b.exportPrice - a.exportPrice);
  const optimalDischargingStrategySecond = findOptimalDischargingDistribution(
    eveningPeakHours,
    batteryCapacity,
    dischargingEfficiency
  );

  // Create a map of optimal discharging rates (similar to charging)
  const optimalDischargingMapSecond = new Map<number, number>();
  optimalDischargingStrategySecond.distribution.forEach((rate, index) => {
    if (rate > 0) {
      optimalDischargingMapSecond.set(eveningPeakHours[index].hour, rate);
    }
  });

  console.log("optimalDischargingMapSecond", optimalDischargingMapSecond);

  // Modify analyzeEnergyData call to include optimal discharging schedule
  const analyzedData = analyzeEnergyData(
    scenarioData,
    batteryCapacity,
    chargingEfficiency,
    dischargingEfficiency,
    chargingEfficiency2,
    dischargingEfficiency2,
    chargingCRate,
    dischargingCRate,
    optimalChargingMapFirst,
    optimalChargingMapSecond,
    optimalDischargingMapFirst,
    optimalDischargingMapSecond,
  );

  const maxExportPrice = Math.max(...analyzedData.map(hour => hour.exportPrice));
  const minImportPrice = Math.min(...analyzedData.map(hour => hour.importPrice));
  const efficiencyThreshold = 1 - chargingEfficiency * dischargingEfficiency
  const arbitrageThreshold = (maxExportPrice - minImportPrice) * efficiencyThreshold
  const midPrice = (maxExportPrice + minImportPrice) / 2
  const goodImportPriceThreshold = midPrice - arbitrageThreshold
  const goodExportPriceThreshold = midPrice + arbitrageThreshold
  const goodImportHours = analyzedData.filter(hour => hour.importPrice <= goodImportPriceThreshold);
  const goodExportHours = analyzedData.filter(hour => hour.exportPrice >= goodExportPriceThreshold);

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
        totalImportCost2: Number(analyzedData.reduce((sum, hour) => sum + hour.importCost2, 0).toFixed(2)),
        totalExportProfit2: Number(analyzedData.reduce((sum, hour) => sum + hour.exportProfit2, 0).toFixed(2)),
        netCost: Number(analyzedData.reduce((sum, hour) => sum + hour.importCost - hour.exportProfit, 0).toFixed(2)),
        netCost2: Number(analyzedData.reduce((sum, hour) => sum + hour.importCost2 - hour.exportProfit2, 0).toFixed(2)),
        finalBatteryCapacity: Number(analyzedData[analyzedData.length - 1].batteryCapacity.toFixed(2)),
        exportPriceZones: exportPriceZones.length > 0 ? exportPriceZones : "None",
        expensiveImportZones: expensiveImportZones.length > 0 ? expensiveImportZones : "None",
        cheaperTariffZones: cheaperTariffZones.length > 0 ? cheaperTariffZones : "None",
        neededEnergyProfile: neededEnergyProfile.length > 0 ? neededEnergyProfile : "None",
      }
    }
  };
}

// Helper function to calculate total cost for a given charging distribution
function calculateChargingCost(
  distribution: number[],
  sortedHours: HourlyData[],
  batteryCapacity: number,
  baseChargingEfficiency: number
): number {
  return distribution.reduce((totalCost, ratio, index) => {
    if (ratio === 0) return totalCost;
    // Calculate average export and import prices
    // Calculate efficiency based on C-rate
    const calculateEfficiency = (actualCRate: number, baseEfficiency: number) => {
      const efficiencyLoss = Math.floor(actualCRate / 0.1) * 0.01;
      return Math.max(baseEfficiency - efficiencyLoss, 0.5); // Ensure efficiency doesn't go below 50%
    };
    const chargingEfficiency = calculateEfficiency(ratio, baseChargingEfficiency);
    const energyNeeded = (batteryCapacity * ratio) / chargingEfficiency;
    const hourCost = energyNeeded * sortedHours[index].importPrice;

    return totalCost + hourCost;
  }, 0);
}

// Find optimal charging distribution
function findOptimalChargingDistribution(
  hours: HourlyData[],
  batteryCapacity: number,
  baseChargingEfficiency: number
): { distribution: number[], cost: number } {
  // Modified sorting to handle equal prices
  const sortedHours = hours.slice(0, 6).sort((a, b) => {
    // First compare by price
    const priceDiff = a.importPrice - b.importPrice;
    if (priceDiff !== 0) return priceDiff;
    // If prices are equal, prefer earlier hours
    return a.hour - b.hour;
  });

  const distributions = generateDistributions();
  let bestDistribution = Array(6).fill(0);
  let lowestCost = Infinity;

  // When evaluating distributions, prefer more balanced distributions when prices are equal
  for (const distribution of distributions) {
    const cost = calculateChargingCost(
      distribution,
      sortedHours,
      batteryCapacity,
      baseChargingEfficiency
    );

    // If we find a distribution with the same cost, prefer the more balanced one
    const isMoreBalanced = cost === lowestCost &&
      distribution.reduce((max, curr) => Math.max(max, curr), 0) <
      bestDistribution.reduce((max, curr) => Math.max(max, curr), 0);

    if (cost < lowestCost || isMoreBalanced) {
      lowestCost = cost;
      bestDistribution = distribution;
    }
  }

  // Add detailed logging of the charging schedule
  console.log("\nOptimal Charging Schedule:");
  bestDistribution.forEach((rate, index) => {
    if (rate > 0) {
      console.log(`Hour ${sortedHours[index].hour}: Charge at ${(rate * 100).toFixed(1)}% rate (Price: $${sortedHours[index].importPrice.toFixed(3)})`);
    }
    //charge the battery at the end of each hour add that energy to the battery

  });
  //charge the battery at the optimal rate

  return {
    distribution: bestDistribution,
    cost: lowestCost
  };
}


