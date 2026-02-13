
import { describe, it, expect, vi } from "vitest";

// Mock external URL imports using the exact string found in the source file
vi.mock("https://esm.sh/docx@8.5.0", () => ({
  Document: class {},
  Paragraph: class {},
  TextRun: class {},
  Table: class {},
  TableRow: class {},
  TableCell: class {},
  WidthType: { PERCENTAGE: "percentage" },
  AlignmentType: { CENTER: "center", LEFT: "left" },
  BorderStyle: { SINGLE: "single", NONE: "none" },
}));

// Mock logger to avoid clutter
vi.mock("../../../supabase/functions/sophia-bot/utils/logger.ts", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  LogCategory: { GENERAL: "general" },
}));

// Import formatPropertyInfo as well
import { parseMarketingAgreementData, formatPropertyInfo } from "../../../supabase/functions/sophia-bot/docx/templates/marketing-agreement.ts";

describe("Marketing Agreement Parsing", () => {
  const agentName = "Test Agent";

  it("should parse a fully populated marketing agreement", () => {
    const aiResponse = `
Here is the marketing agreement you requested:

**Marketing Agreement**

This agreement made on the: 14th February 2026

BETWEEN: CSC Zyprus Property Group LTD
CREA Reg No. 742, CREA License Number 378/E (hereinafter referred to as the ''Agent'')

And

John Doe……………………………………………………………………………………………………………………

(Hereinafter referred to as the 'Seller'). Whereas the Seller is the owner of Property with Registration No. 0/12345 in Tala, Paphos
(hereinafter referred to as 'the Property') which the seller wishes to promote for sale.

Service
1. The Agent may advertise the Property...
4. The Agent's fee is... 5.0%...
5. The initial agreed marketing price is €350,000

General
...
    `;

    const result = parseMarketingAgreementData(aiResponse, agentName);

    expect(result).not.toBeNull();
    expect(result?.sellerFullName).toBe("John Doe");
    expect(result?.propertyRegistration).toContain("0/12345");
    expect(result?.marketingPrice).toBe("350000");
  });

  it("should parse 'Property Reg: 0/12345'", () => {
    const aiResponse = `
**Marketing Agreement**
...
Seller: John Doe
Property Reg: 0/12345 in Limassol
...
Price: €100,000
    `;
    const result = parseMarketingAgreementData(aiResponse, agentName);
    
    expect(result).not.toBeNull();
    expect(result?.propertyRegistration).toContain("0/12345");
  });

   it("should parse 'Property: Reg No 0/12345'", () => {
    const aiResponse = `
**Marketing Agreement**
...
Seller: John Doe
Property: Reg No 0/12345
...
Price: €100,000
    `;
    const result = parseMarketingAgreementData(aiResponse, agentName);
    
    expect(result).not.toBeNull();
    expect(result?.propertyRegistration).toContain("0/12345");
  });

  it("should parse when property info is formatted differently", () => {
     const aiResponse = `
**Marketing Agreement**
...
And

Maria Smith
...
Whereas the Seller is the owner of Property Registration No. 0/98765 Cynthiana Complex, Paphos
...
5. The initial agreed marketing price is 420000 EUR
...
    `;

    const result = parseMarketingAgreementData(aiResponse, agentName);

    expect(result).not.toBeNull();
    expect(result?.sellerFullName).toBe("Maria Smith");
    expect(result?.propertyRegistration).toContain("0/98765");
    expect(result?.propertyRegistration).toContain("Cynthiana");
    expect(result?.marketingPrice).toBe("420000");
  });

  it("should parse when signature section has Name: Value format", () => {
    const aiResponse = `
...
This agreement shall continue for 30 days...

Signed:
Agent: ...
Seller: ...

On behalf of The Agent: Charalambos Pitros

The Seller:
Name: Andreas Georgiou
    `;
    
    // Add property to make it valid
    const fullResponse = aiResponse + "\nProperty with Reg No. 0/55555";
    
    const result = parseMarketingAgreementData(fullResponse, agentName);
    
    expect(result).not.toBeNull();
    expect(result?.sellerFullName).toBe("Andreas Georgiou");
    expect(result?.propertyRegistration).toContain("0/55555");
  });

  it("should fail gracefully and return null if required fields are missing", () => {
    const aiResponse = `
**Marketing Agreement**
...
This agreement is between the Agent and the Seller.
Property details not provided.
...
    `;

    const result = parseMarketingAgreementData(aiResponse, agentName);

    expect(result).toBeNull();
  });

  it("should parse when AI includes 'Property Details:' prefix", () => {
      const aiResponse = `
Here is the document.

**Marketing Agreement**

...
And

Elena Papageorgiou...

(Hereinafter referred to as the 'Seller'). Whereas the Seller is the owner of Property Details: Registration No. 0/11223, Sea Caves, Paphos
...
Price: €1,200,000
      `;

      const result = parseMarketingAgreementData(aiResponse, agentName);

      expect(result).not.toBeNull();
      expect(result?.sellerFullName).toBe("Elena Papageorgiou");
      expect(result?.propertyRegistration).toContain("0/11223");
      expect(result?.marketingPrice).toBe("1200000");
  });
  
  it("should handle 'Registration Number' instead of 'No.'", () => {
      const aiResponse = `
...
And
George Michael...
...
owner of Property with Registration Number 0/77777 in Limassol
...
      `;
      
       const result = parseMarketingAgreementData(aiResponse, agentName);

      expect(result).not.toBeNull();
      expect(result?.sellerFullName).toBe("George Michael");
      expect(result?.propertyRegistration).toContain("0/77777");
  });

  // NEW FAILING TEST
  it("should parse when property has no registration number", () => {
    const aiResponse = `
**Marketing Agreement**
...
Seller: John Doe
Property: Beautiful villa in Paphos, near the sea
...
Price: €500,000
    `;
    const result = parseMarketingAgreementData(aiResponse, agentName);
    
    // This expects to with current logic because regex requires \d+/\d+
    expect(result).not.toBeNull();
    expect(result?.propertyRegistration).toContain("Beautiful villa");
  });
});

describe("Property Info Formatting", () => {
  it("should format standard registration string", () => {
    const input = "Registration No. 0/12345 in Tala, Paphos (Cynthiana Complex, Flat 105)";
    const result = formatPropertyInfo(input);
    expect(result.description).toContain("0/12345");
  });
  
  it("should handle messy input", () => {
    const input = "0/12345 Cynthiana Complex, Paphos";
    const result = formatPropertyInfo(input);
    expect(result.description).toContain("0/12345");
  });
});
