/**
 * Cyprus Property Calculators
 *
 * Shared calculator functions for VAT, Transfer Fees, and Capital Gains.
 * Used by all channels (WhatsApp, Telegram, Web).
 */

export interface CalculatorResult {
  success: boolean;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Calculate VAT for a Cyprus property purchase
 *
 * - New properties: 19% VAT (reduced to 5% for first €350k if primary residence for EU buyers)
 * - Resale properties: No VAT
 */
export const calculateVAT = (args: {
  price: number;
  isNewProperty: boolean;
  isPrimaryResidence?: boolean;
  buyerIsEU?: boolean;
}): CalculatorResult => {
  const { price, isNewProperty, isPrimaryResidence, buyerIsEU } = args;

  if (!isNewProperty) {
    return {
      success: true,
      message: "No VAT applies to resale properties in Cyprus.",
      data: { vat: 0, rate: "0%", note: "Resale property - no VAT" },
    };
  }

  const rate = 0.19; // Standard 19% VAT
  const note = "Standard VAT rate of 19%";

  // Reduced rate conditions for primary residence EU buyers
  if (isPrimaryResidence && buyerIsEU) {
    const reducedPortion = Math.min(price, 350_000);
    const standardPortion = Math.max(0, price - 350_000);

    const reducedVat = reducedPortion * 0.05;
    const standardVat = standardPortion * 0.19;
    const totalVat = reducedVat + standardVat;

    return {
      success: true,
      message:
        "VAT calculation for primary residence (EU buyer):\n" +
        `• First €350,000 at 5%: €${reducedVat.toLocaleString()}\n` +
        `• Above €350,000 at 19%: €${standardVat.toLocaleString()}\n` +
        `• **Total VAT: €${totalVat.toLocaleString()}**`,
      data: {
        vat: totalVat,
        breakdown: { reduced: reducedVat, standard: standardVat },
        note: "Reduced rate applies to first €350,000",
      },
    };
  }

  const vat = price * rate;

  return {
    success: true,
    message: `VAT on €${price.toLocaleString()} at ${rate * 100}% = **€${vat.toLocaleString()}**\n\n${note}`,
    data: { vat, rate: `${rate * 100}%`, note },
  };
};

/**
 * Calculate Transfer Fees for a Cyprus property purchase
 *
 * Fee bands:
 * - First €85,000: 3%
 * - €85,001 - €170,000: 5%
 * - Above €170,000: 8%
 *
 * 50% discount for first property buyers.
 * No fees if VAT was paid on the property.
 */
export const calculateTransferFees = (args: {
  price: number;
  isFirstProperty?: boolean;
  hasVAT?: boolean;
}): CalculatorResult => {
  const { price, isFirstProperty, hasVAT } = args;

  // No transfer fees if VAT applies
  if (hasVAT) {
    return {
      success: true,
      message: "No transfer fees apply when VAT is paid on the property.",
      data: { fee: 0, note: "VAT property - no transfer fees" },
    };
  }

  // Cyprus transfer fee bands
  let fee = 0;
  if (price <= 85_000) {
    fee = price * 0.03;
  } else if (price <= 170_000) {
    fee = 85_000 * 0.03 + (price - 85_000) * 0.05;
  } else {
    fee = 85_000 * 0.03 + 85_000 * 0.05 + (price - 170_000) * 0.08;
  }

  // 50% discount for first property
  if (isFirstProperty) {
    fee = fee * 0.5;
  }

  return {
    success: true,
    message:
      `Transfer fees for €${price.toLocaleString()}:\n` +
      `• Base fee: €${(fee * (isFirstProperty ? 2 : 1)).toLocaleString()}\n` +
      (isFirstProperty
        ? `• First property discount (50%): -€${fee.toLocaleString()}\n`
        : "") +
      `• **Total: €${fee.toLocaleString()}**`,
    data: { fee, isFirstProperty },
  };
};

/**
 * Calculate Capital Gains Tax for selling a Cyprus property
 *
 * - 20% CGT rate on gains
 * - Inflation adjustment applied to purchase price
 * - Main residence exemption: €85,430
 */
export const calculateCapitalGains = (args: {
  purchasePrice: number;
  salePrice: number;
  purchaseYear: number;
  improvements?: number;
  isMainResidence?: boolean;
}): CalculatorResult => {
  const {
    purchasePrice,
    salePrice,
    purchaseYear,
    improvements = 0,
    isMainResidence,
  } = args;

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
};
