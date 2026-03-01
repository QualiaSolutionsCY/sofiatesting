/**
 * Calculator Tool Handlers
 * Handles VAT, transfer fees, and capital gains calculations
 */

export interface ToolResult {
  success?: boolean;
  error?: string;
  needsInput?: boolean;
  question?: string;
  message?: string;
  data?: unknown;
}

/**
 * Calculate VAT - NEW POLICY (From 31 October 2023)
 *
 * For primary residence (EU buyers):
 * - Max floor area for reduced rate: 130 m²
 * - Max value for reduced rate: €350,000
 * - Total price cannot exceed €475,000
 * - Total area cannot exceed 190 m²
 *
 * Formula:
 * areaRatio = min(130, totalArea) / totalArea
 * reducedValueBase = areaRatio * min(price, €350,000)
 * VAT at 5% = reducedValueBase * 0.05
 * VAT at 19% = (price - reducedValueBase) * 0.19
 */
export function handleCalculateVAT(args: Record<string, unknown>): ToolResult {
  const price = args.price as number;
  const area = (args.area as number) || 0;
  // Default to primary residence (true) - most VAT calculations are for primary residence
  const isPrimaryResidence = args.isPrimaryResidence !== false;

  // Check if eligible for reduced rate
  const isEligible =
    isPrimaryResidence && price <= 475_000 && area > 0 && area <= 190;

  if (!isEligible) {
    // Standard 19% VAT on full price
    const vat = price * 0.19;

    let reason = "";
    if (!isPrimaryResidence) {
      reason = "Not primary residence - standard rate applies";
    } else if (price > 475_000) {
      reason = "Price exceeds €475,000 limit - standard rate applies";
    } else if (area > 190) {
      reason = "Area exceeds 190m² limit - standard rate applies";
    } else if (area === 0) {
      reason = "Area not provided - standard rate applies";
    }

    const formatCurrency = (n: number) =>
      n.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    return {
      success: true,
      message:
        "VAT Calculation:\n\n" +
        `Property Price: €${price.toLocaleString()}\n` +
        "VAT Rate: 19%\n" +
        `*VAT Amount: €${formatCurrency(vat)}*\n\n` +
        `${reason}\n\n` +
        "_This calculation is indicative only. Please consult a tax advisor for exact figures._",
      data: { vat, rate: "19%", eligible: false },
    };
  }

  // Calculate with area ratio (NEW POLICY)
  const areaRatio = Math.min(130, area) / area;
  const reducedValueBase = areaRatio * Math.min(price, 350_000);
  const vatAt5 = reducedValueBase * 0.05;
  const vatAt19 = (price - reducedValueBase) * 0.19;
  const totalVat = vatAt5 + vatAt19;

  // Format numbers with 2 decimal places
  const formatCurrency = (n: number) =>
    n.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  return {
    success: true,
    message:
      "VAT Calculation (Primary Residence):\n\n" +
      `Property Price: €${price.toLocaleString()}\n` +
      `Property Area: ${area}m²\n\n` +
      `Area Ratio: ${(areaRatio * 100).toFixed(2)}% (130m² ÷ ${area}m²)\n` +
      `Reduced Value Base: €${formatCurrency(reducedValueBase)}\n\n` +
      `VAT at 5%: €${formatCurrency(vatAt5)}\n` +
      `VAT at 19%: €${formatCurrency(vatAt19)}\n` +
      `*Total VAT: €${formatCurrency(totalVat)}*\n\n` +
      "_This calculation is indicative only. Please consult a tax advisor for exact figures._",
    data: {
      vat: totalVat,
      vatAt5,
      vatAt19,
      areaRatio,
      reducedValueBase,
      eligible: true,
    },
  };
}

/**
 * Calculate transfer fees using Cyprus progressive bands
 * Bands: 3% up to €85k, 5% €85k-€170k, 8% above €170k
 */
function calculateBandedFee(amount: number): number {
  if (amount <= 85_000) {
    return amount * 0.03;
  }
  if (amount <= 170_000) {
    return 85_000 * 0.03 + (amount - 85_000) * 0.05;
  }
  return 85_000 * 0.03 + 85_000 * 0.05 + (amount - 170_000) * 0.08;
}

/**
 * Calculate Transfer Fees
 * Joint names: price is split equally between 2 buyers, each taxed separately
 * This results in lower total fees due to progressive rate bands
 */
export function handleCalculateTransferFees(
  args: Record<string, unknown>
): ToolResult {
  const price = args.price as number;
  const jointNames = args.jointNames as boolean;
  const isFirstProperty = args.isFirstProperty as boolean;
  const hasVAT = args.hasVAT as boolean;

  // No transfer fees if VAT applies
  if (hasVAT) {
    return {
      success: true,
      message: "No transfer fees apply when VAT is paid on the property.",
      data: { fee: 0, note: "VAT property - no transfer fees" },
    };
  }

  let fee: number;
  let perPersonFee: number | undefined;

  if (jointNames) {
    // Joint names: split price between 2 buyers, calculate each separately
    const halfPrice = price / 2;
    perPersonFee = calculateBandedFee(halfPrice);
    fee = perPersonFee * 2;
  } else {
    fee = calculateBandedFee(price);
  }

  const baseFee = fee;

  // 50% discount always applies (contract deposited at Dept of Lands & Surveys - standard practice)
  fee = fee * 0.5;
  if (perPersonFee !== undefined) {
    perPersonFee = perPersonFee * 0.5;
  }

  const formatCurrency = (n: number) =>
    n.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  let message = `Transfer Fees for €${price.toLocaleString()}`;
  if (jointNames) message += " (Joint Names)";
  message += ":\n\n";

  message += `*Total Transfer Fees: €${formatCurrency(fee)}*\n\n`;
  message +=
    "_This calculation is indicative only. Please consult a lawyer for exact figures._";

  return {
    success: true,
    message,
    data: {
      fee,
      baseFee,
      jointNames: !!jointNames,
      isFirstProperty,
      perPersonFee,
    },
  };
}

/**
 * Calculate Capital Gains Tax
 */
export function handleCalculateCapitalGains(
  args: Record<string, unknown>
): ToolResult {
  const purchasePrice = args.purchasePrice as number;
  const salePrice = args.salePrice as number;
  const purchaseYear = args.purchaseYear as number;
  const improvements = (args.improvements as number) || 0;
  const isMainResidence = args.isMainResidence as boolean;

  // Inflation adjustment (simplified)
  const currentYear = new Date().getFullYear();
  const yearsHeld = currentYear - purchaseYear;
  const inflationRate = 0.03; // Approximate
  const adjustedPurchase = purchasePrice * (1 + inflationRate) ** yearsHeld;

  // Calculate gain
  const totalCosts = adjustedPurchase + improvements;
  const gain = salePrice - totalCosts;

  if (gain <= 0) {
    return {
      success: true,
      message: "No capital gains tax applies - no profit on sale.",
      data: { tax: 0, gain: 0 },
    };
  }

  // Exemptions
  let exemption = 0;
  if (isMainResidence) {
    exemption = Math.min(gain, 85_430); // Main residence exemption
  }

  const taxableGain = Math.max(0, gain - exemption);
  const tax = taxableGain * 0.2; // 20% CGT rate

  return {
    success: true,
    message:
      "Capital Gains Tax calculation:\n" +
      `• Sale price: €${salePrice.toLocaleString()}\n` +
      `• Adjusted purchase: €${adjustedPurchase.toLocaleString()}\n` +
      `• Improvements: €${improvements.toLocaleString()}\n` +
      `• Gross gain: €${gain.toLocaleString()}\n` +
      (exemption > 0
        ? `• Main residence exemption: -€${exemption.toLocaleString()}\n`
        : "") +
      `• Taxable gain: €${taxableGain.toLocaleString()}\n` +
      `• **CGT (20%): €${tax.toLocaleString()}**`,
    data: { tax, gain, taxableGain, exemption },
  };
}
