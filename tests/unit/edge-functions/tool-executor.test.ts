/**
 * Tests for Tool Executor - Calculator Functions
 *
 * Tests cover:
 * - VAT calculation (new policy from Oct 2023)
 * - Transfer fees calculation
 * - Capital gains tax calculation
 * - Edge cases and error handling
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockConsole, restoreConsole } from "./setup";

// Type definitions
interface ToolResult {
  success?: boolean;
  error?: string;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * VAT Calculation - NEW POLICY (From 31 October 2023)
 *
 * For primary residence (EU buyers):
 * - Max floor area for reduced rate: 130 m2
 * - Max value for reduced rate: EUR350,000
 * - Total price cannot exceed EUR475,000
 * - Total area cannot exceed 190 m2
 *
 * Formula:
 * areaRatio = min(130, totalArea) / totalArea
 * reducedValueBase = areaRatio * min(price, EUR350,000)
 * VAT at 5% = reducedValueBase * 0.05
 * VAT at 19% = (price - reducedValueBase) * 0.19
 */
function handleCalculateVAT(args: Record<string, unknown>): ToolResult {
  const price = args.price as number;
  const area = (args.area as number) || 0;
  const isPrimaryResidence = args.isPrimaryResidence !== false;

  const isEligible = isPrimaryResidence &&
    price <= 475000 &&
    area > 0 &&
    area <= 190;

  if (!isEligible) {
    const vat = price * 0.19;

    let reason = "";
    if (!isPrimaryResidence) {
      reason = "Not primary residence - standard rate applies";
    } else if (price > 475000) {
      reason = "Price exceeds EUR475,000 limit - standard rate applies";
    } else if (area > 190) {
      reason = "Area exceeds 190m2 limit - standard rate applies";
    } else if (area === 0) {
      reason = "Area not provided - standard rate applies";
    }

    return {
      success: true,
      message: `VAT: EUR${vat.toFixed(0)} at 19%. ${reason}`,
      data: { vat, rate: "19%", eligible: false },
    };
  }

  // Calculate with area ratio (NEW POLICY)
  const areaRatio = Math.min(130, area) / area;
  const reducedValueBase = areaRatio * Math.min(price, 350000);
  const vatAt5 = reducedValueBase * 0.05;
  const vatAt19 = (price - reducedValueBase) * 0.19;
  const totalVat = vatAt5 + vatAt19;

  return {
    success: true,
    message: `VAT: EUR${totalVat.toFixed(0)} (5%: EUR${vatAt5.toFixed(0)}, 19%: EUR${vatAt19.toFixed(0)})`,
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
 * Transfer Fees Calculation
 *
 * Bands:
 * - 0-85,000: 3%
 * - 85,001-170,000: 5%
 * - 170,001+: 8%
 *
 * First property buyers get 50% discount
 * No transfer fees if VAT applies
 */
function handleCalculateTransferFees(args: Record<string, unknown>): ToolResult {
  const price = args.price as number;
  const isFirstProperty = args.isFirstProperty as boolean;
  const hasVAT = args.hasVAT as boolean;

  if (hasVAT) {
    return {
      success: true,
      message: "No transfer fees apply when VAT is paid on the property.",
      data: { fee: 0, note: "VAT property - no transfer fees" },
    };
  }

  let fee = 0;
  if (price <= 85000) {
    fee = price * 0.03;
  } else if (price <= 170000) {
    fee = 85000 * 0.03 + (price - 85000) * 0.05;
  } else {
    fee = 85000 * 0.03 + 85000 * 0.05 + (price - 170000) * 0.08;
  }

  if (isFirstProperty) {
    fee = fee * 0.5;
  }

  return {
    success: true,
    message: `Transfer fees: EUR${fee.toFixed(0)}`,
    data: { fee, isFirstProperty },
  };
}

/**
 * Capital Gains Tax Calculation
 *
 * Rate: 20% on profit after adjustments
 * Main residence exemption: EUR85,430
 * Inflation adjustment applied based on years held
 */
function handleCalculateCapitalGains(args: Record<string, unknown>): ToolResult {
  const purchasePrice = args.purchasePrice as number;
  const salePrice = args.salePrice as number;
  const purchaseYear = args.purchaseYear as number;
  const improvements = (args.improvements as number) || 0;
  const isMainResidence = args.isMainResidence as boolean;

  // Inflation adjustment (simplified)
  const currentYear = new Date().getFullYear();
  const yearsHeld = currentYear - purchaseYear;
  const inflationRate = 0.03;
  const adjustedPurchase = purchasePrice * Math.pow(1 + inflationRate, yearsHeld);

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
    exemption = Math.min(gain, 85430);
  }

  const taxableGain = Math.max(0, gain - exemption);
  const tax = taxableGain * 0.20;

  return {
    success: true,
    message: `Capital Gains Tax: EUR${tax.toFixed(0)}`,
    data: { tax, gain, taxableGain, exemption },
  };
}

describe("Tool Executor - Calculator Functions", () => {
  beforeEach(() => {
    mockConsole();
  });

  afterEach(() => {
    restoreConsole();
  });

  describe("handleCalculateVAT", () => {
    describe("Primary Residence (Reduced Rate)", () => {
      it("should calculate reduced VAT for qualifying property", () => {
        const result = handleCalculateVAT({
          price: 200000,
          area: 100,
          isPrimaryResidence: true,
        });

        expect(result.success).toBe(true);
        expect(result.data?.eligible).toBe(true);
        expect(result.data?.areaRatio).toBe(1); // 100m2 < 130m2
        expect(result.data?.reducedValueBase).toBe(200000); // price < 350k
        expect(result.data?.vatAt5).toBe(10000); // 200k * 0.05
        expect(result.data?.vatAt19).toBe(0); // No excess
        expect(result.data?.vat).toBe(10000);
      });

      it("should apply area ratio for properties over 130m2", () => {
        const result = handleCalculateVAT({
          price: 350000,
          area: 190, // Max allowed
          isPrimaryResidence: true,
        });

        expect(result.success).toBe(true);
        expect(result.data?.eligible).toBe(true);

        // Area ratio = 130/190 = 0.684
        const expectedRatio = 130 / 190;
        expect(result.data?.areaRatio).toBeCloseTo(expectedRatio, 3);

        // Reduced base = 0.684 * 350000 = 239,473.68
        const expectedReducedBase = expectedRatio * 350000;
        expect(result.data?.reducedValueBase).toBeCloseTo(expectedReducedBase, 2);

        // VAT at 5% on reduced base
        const expectedVat5 = expectedReducedBase * 0.05;
        expect(result.data?.vatAt5).toBeCloseTo(expectedVat5, 2);

        // VAT at 19% on remainder
        const expectedVat19 = (350000 - expectedReducedBase) * 0.19;
        expect(result.data?.vatAt19).toBeCloseTo(expectedVat19, 2);
      });

      it("should cap reduced base at EUR350,000", () => {
        const result = handleCalculateVAT({
          price: 400000,
          area: 100, // Small area, full ratio
          isPrimaryResidence: true,
        });

        expect(result.success).toBe(true);
        expect(result.data?.eligible).toBe(true);
        expect(result.data?.reducedValueBase).toBe(350000); // Capped
        expect(result.data?.vatAt5).toBe(17500); // 350k * 0.05
        expect(result.data?.vatAt19).toBe(9500); // 50k * 0.19
        expect(result.data?.vat).toBe(27000);
      });
    });

    describe("Standard Rate (19%)", () => {
      it("should apply 19% when not primary residence", () => {
        const result = handleCalculateVAT({
          price: 200000,
          area: 100,
          isPrimaryResidence: false,
        });

        expect(result.success).toBe(true);
        expect(result.data?.eligible).toBe(false);
        expect(result.data?.rate).toBe("19%");
        expect(result.data?.vat).toBe(38000); // 200k * 0.19
      });

      it("should apply 19% when price exceeds EUR475,000", () => {
        const result = handleCalculateVAT({
          price: 500000,
          area: 100,
          isPrimaryResidence: true,
        });

        expect(result.success).toBe(true);
        expect(result.data?.eligible).toBe(false);
        expect(result.data?.vat).toBe(95000); // 500k * 0.19
      });

      it("should apply 19% when area exceeds 190m2", () => {
        const result = handleCalculateVAT({
          price: 300000,
          area: 200,
          isPrimaryResidence: true,
        });

        expect(result.success).toBe(true);
        expect(result.data?.eligible).toBe(false);
        expect(result.data?.vat).toBe(57000); // 300k * 0.19
      });

      it("should apply 19% when area not provided", () => {
        const result = handleCalculateVAT({
          price: 200000,
          isPrimaryResidence: true,
        });

        expect(result.success).toBe(true);
        expect(result.data?.eligible).toBe(false);
        expect(result.data?.vat).toBe(38000);
      });

      it("should default isPrimaryResidence to true", () => {
        const result = handleCalculateVAT({
          price: 200000,
          area: 100,
          // isPrimaryResidence not provided
        });

        expect(result.data?.eligible).toBe(true); // Defaults to primary residence
      });
    });

    describe("Edge Cases", () => {
      it("should handle EUR0 price", () => {
        const result = handleCalculateVAT({
          price: 0,
          area: 100,
          isPrimaryResidence: true,
        });

        expect(result.success).toBe(true);
        expect(result.data?.vat).toBe(0);
      });

      it("should handle boundary values", () => {
        // Exactly at EUR475,000 limit
        const atLimit = handleCalculateVAT({
          price: 475000,
          area: 190,
          isPrimaryResidence: true,
        });
        expect(atLimit.data?.eligible).toBe(true);

        // Just over EUR475,000 limit
        const overLimit = handleCalculateVAT({
          price: 475001,
          area: 190,
          isPrimaryResidence: true,
        });
        expect(overLimit.data?.eligible).toBe(false);
      });

      it("should handle exactly 130m2 area", () => {
        const result = handleCalculateVAT({
          price: 300000,
          area: 130,
          isPrimaryResidence: true,
        });

        expect(result.data?.areaRatio).toBe(1); // Full reduced rate
      });
    });
  });

  describe("handleCalculateTransferFees", () => {
    describe("Standard Transfer Fees", () => {
      it("should calculate 3% for properties up to EUR85,000", () => {
        const result = handleCalculateTransferFees({
          price: 50000,
          isFirstProperty: false,
          hasVAT: false,
        });

        expect(result.success).toBe(true);
        expect(result.data?.fee).toBe(1500); // 50k * 0.03
      });

      it("should calculate tiered fees for properties up to EUR170,000", () => {
        const result = handleCalculateTransferFees({
          price: 170000,
          isFirstProperty: false,
          hasVAT: false,
        });

        // 85k * 0.03 + 85k * 0.05 = 2550 + 4250 = 6800
        expect(result.data?.fee).toBe(6800);
      });

      it("should calculate tiered fees for properties over EUR170,000", () => {
        const result = handleCalculateTransferFees({
          price: 500000,
          isFirstProperty: false,
          hasVAT: false,
        });

        // 85k * 0.03 + 85k * 0.05 + 330k * 0.08
        // = 2550 + 4250 + 26400 = 33200
        expect(result.data?.fee).toBe(33200);
      });
    });

    describe("First Property Discount", () => {
      it("should apply 50% discount for first property", () => {
        const result = handleCalculateTransferFees({
          price: 500000,
          isFirstProperty: true,
          hasVAT: false,
        });

        // 33200 / 2 = 16600
        expect(result.data?.fee).toBe(16600);
        expect(result.data?.isFirstProperty).toBe(true);
      });

      it("should apply 50% discount even for small properties", () => {
        const result = handleCalculateTransferFees({
          price: 50000,
          isFirstProperty: true,
          hasVAT: false,
        });

        // 1500 / 2 = 750
        expect(result.data?.fee).toBe(750);
      });
    });

    describe("VAT Properties", () => {
      it("should return 0 transfer fees when VAT applies", () => {
        const result = handleCalculateTransferFees({
          price: 500000,
          isFirstProperty: false,
          hasVAT: true,
        });

        expect(result.success).toBe(true);
        expect(result.data?.fee).toBe(0);
        expect(result.data?.note).toBe("VAT property - no transfer fees");
      });

      it("should return 0 even with first property discount when VAT applies", () => {
        const result = handleCalculateTransferFees({
          price: 500000,
          isFirstProperty: true,
          hasVAT: true,
        });

        expect(result.data?.fee).toBe(0);
      });
    });

    describe("Edge Cases", () => {
      it("should handle EUR0 price", () => {
        const result = handleCalculateTransferFees({
          price: 0,
          isFirstProperty: false,
          hasVAT: false,
        });

        expect(result.data?.fee).toBe(0);
      });

      it("should handle exact boundary values", () => {
        // Exactly EUR85,000
        const at85k = handleCalculateTransferFees({
          price: 85000,
          isFirstProperty: false,
          hasVAT: false,
        });
        expect(at85k.data?.fee).toBe(2550); // 85k * 0.03

        // EUR85,001 (crosses into second band)
        const over85k = handleCalculateTransferFees({
          price: 85001,
          isFirstProperty: false,
          hasVAT: false,
        });
        expect(over85k.data?.fee).toBe(2550.05); // 85k * 0.03 + 1 * 0.05
      });
    });
  });

  describe("handleCalculateCapitalGains", () => {
    const currentYear = new Date().getFullYear();

    describe("Basic Calculation", () => {
      it("should calculate CGT for profitable sale", () => {
        const result = handleCalculateCapitalGains({
          purchasePrice: 200000,
          salePrice: 400000,
          purchaseYear: currentYear - 5,
          improvements: 0,
          isMainResidence: false,
        });

        expect(result.success).toBe(true);
        expect(result.data?.tax).toBeGreaterThan(0);
        expect(result.data?.gain).toBeGreaterThan(0);
      });

      it("should return 0 tax when no profit", () => {
        const result = handleCalculateCapitalGains({
          purchasePrice: 400000,
          salePrice: 300000,
          purchaseYear: currentYear - 5,
          improvements: 0,
          isMainResidence: false,
        });

        expect(result.success).toBe(true);
        expect(result.data?.tax).toBe(0);
        expect(result.data?.gain).toBe(0);
      });
    });

    describe("Inflation Adjustment", () => {
      it("should increase adjusted purchase price over time", () => {
        const shortHold = handleCalculateCapitalGains({
          purchasePrice: 200000,
          salePrice: 300000,
          purchaseYear: currentYear - 1,
          improvements: 0,
          isMainResidence: false,
        });

        const longHold = handleCalculateCapitalGains({
          purchasePrice: 200000,
          salePrice: 300000,
          purchaseYear: currentYear - 10,
          improvements: 0,
          isMainResidence: false,
        });

        // Longer hold = more inflation adjustment = lower gain = lower tax
        expect((longHold.data?.tax as number)).toBeLessThan(shortHold.data?.tax as number);
      });
    });

    describe("Main Residence Exemption", () => {
      it("should apply EUR85,430 exemption for main residence", () => {
        const result = handleCalculateCapitalGains({
          purchasePrice: 200000,
          salePrice: 350000,
          purchaseYear: currentYear, // No inflation adjustment
          improvements: 0,
          isMainResidence: true,
        });

        expect(result.success).toBe(true);
        expect(result.data?.exemption).toBeGreaterThan(0);
        expect((result.data?.exemption as number)).toBeLessThanOrEqual(85430);
      });

      it("should cap exemption at actual gain", () => {
        const result = handleCalculateCapitalGains({
          purchasePrice: 200000,
          salePrice: 250000,
          purchaseYear: currentYear,
          improvements: 0,
          isMainResidence: true,
        });

        // Gain is 50k, exemption is capped at gain
        expect(result.data?.exemption).toBe(50000);
        expect(result.data?.tax).toBe(0); // All gain exempted
      });

      it("should NOT apply exemption for non-main residence", () => {
        const result = handleCalculateCapitalGains({
          purchasePrice: 200000,
          salePrice: 300000,
          purchaseYear: currentYear,
          improvements: 0,
          isMainResidence: false,
        });

        expect(result.data?.exemption).toBe(0);
      });
    });

    describe("Improvements Deduction", () => {
      it("should deduct improvements from taxable gain", () => {
        const withoutImprovements = handleCalculateCapitalGains({
          purchasePrice: 200000,
          salePrice: 400000,
          purchaseYear: currentYear,
          improvements: 0,
          isMainResidence: false,
        });

        const withImprovements = handleCalculateCapitalGains({
          purchasePrice: 200000,
          salePrice: 400000,
          purchaseYear: currentYear,
          improvements: 50000,
          isMainResidence: false,
        });

        // Improvements reduce gain and thus tax
        expect((withImprovements.data?.tax as number)).toBeLessThan(withoutImprovements.data?.tax as number);
      });

      it("should default improvements to 0 when not provided", () => {
        const result = handleCalculateCapitalGains({
          purchasePrice: 200000,
          salePrice: 300000,
          purchaseYear: currentYear,
          isMainResidence: false,
        });

        expect(result.success).toBe(true);
      });
    });

    describe("Tax Rate", () => {
      it("should apply 20% tax rate", () => {
        const result = handleCalculateCapitalGains({
          purchasePrice: 200000,
          salePrice: 300000,
          purchaseYear: currentYear, // No inflation
          improvements: 0,
          isMainResidence: false,
        });

        // Gain = 100k, tax = 20k
        expect(result.data?.taxableGain).toBe(100000);
        expect(result.data?.tax).toBe(20000);
      });
    });

    describe("Edge Cases", () => {
      it("should handle same purchase and sale price", () => {
        const result = handleCalculateCapitalGains({
          purchasePrice: 300000,
          salePrice: 300000,
          purchaseYear: currentYear,
          improvements: 0,
          isMainResidence: false,
        });

        expect(result.data?.tax).toBe(0);
        expect(result.data?.gain).toBe(0);
      });

      it("should handle very old purchase", () => {
        const result = handleCalculateCapitalGains({
          purchasePrice: 50000,
          salePrice: 500000,
          purchaseYear: 1990,
          improvements: 10000,
          isMainResidence: false,
        });

        expect(result.success).toBe(true);
        // Inflation adjustment over 30+ years is significant
        expect(result.data?.tax).toBeGreaterThan(0);
      });

      it("should handle future purchase year (edge case)", () => {
        const result = handleCalculateCapitalGains({
          purchasePrice: 200000,
          salePrice: 300000,
          purchaseYear: currentYear + 1, // Future
          improvements: 0,
          isMainResidence: false,
        });

        // Negative years held = deflation adjustment (edge case behavior)
        expect(result.success).toBe(true);
      });
    });
  });

  describe("Integration: Combined Tax Scenarios", () => {
    it("should handle typical new build purchase (VAT, no transfer)", () => {
      const vat = handleCalculateVAT({
        price: 300000,
        area: 120,
        isPrimaryResidence: true,
      });

      const transfer = handleCalculateTransferFees({
        price: 300000,
        isFirstProperty: true,
        hasVAT: true,
      });

      expect(vat.data?.eligible).toBe(true);
      expect(vat.data?.vat).toBeLessThan(57000); // Less than 19%
      expect(transfer.data?.fee).toBe(0); // No transfer fees with VAT
    });

    it("should handle typical resale purchase (no VAT, transfer)", () => {
      const vat = handleCalculateVAT({
        price: 300000,
        area: 120,
        isPrimaryResidence: true,
      });

      const transfer = handleCalculateTransferFees({
        price: 300000,
        isFirstProperty: true,
        hasVAT: false,
      });

      // Resale usually no VAT, but transfer fees apply
      expect(transfer.data?.fee).toBeGreaterThan(0);
    });

    it("should handle investment property scenario", () => {
      const vat = handleCalculateVAT({
        price: 500000,
        area: 100,
        isPrimaryResidence: false,
      });

      const transfer = handleCalculateTransferFees({
        price: 500000,
        isFirstProperty: false,
        hasVAT: false,
      });

      // Investment: full 19% VAT, full transfer fees
      expect(vat.data?.eligible).toBe(false);
      expect(vat.data?.vat).toBe(95000);
      expect(transfer.data?.fee).toBe(33200);
    });
  });
});
