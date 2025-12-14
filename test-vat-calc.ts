import { calculateVATTool } from "./lib/ai/tools/calculate-vat";

// Test the VAT calculation with the values from the WhatsApp conversation
async function testVAT() {
  const params = {
    price: 500000,
    buildable_area: 150,
    is_main_residence: false
  };
  
  console.log("Testing VAT calculation with:");
  console.log(params);
  console.log("\n");
  
  try {
    const result = await calculateVATTool.execute(params, {} as any);
    if (typeof result === 'object' && result.content) {
      console.log("Result:");
      console.log(JSON.stringify(result.content, null, 2));
    } else if (typeof result === 'string') {
      console.log("Result:");
      console.log(result);
    } else {
      console.log("Raw result:", result);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

testVAT();
