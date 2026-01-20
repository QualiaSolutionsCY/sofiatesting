/**
 * Number to Words Utility
 *
 * Converts numeric amounts to written words for legal documents.
 * Handles euro amounts up to millions.
 */

const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen'
];

const TENS = [
  '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'
];

const SCALES = ['', 'thousand', 'million', 'billion'];

/**
 * Convert a number less than 1000 to words
 */
function convertHundreds(num: number): string {
  let result = '';

  if (num >= 100) {
    result += ONES[Math.floor(num / 100)] + ' hundred';
    num %= 100;
    if (num > 0) {
      result += ' and ';
    }
  }

  if (num >= 20) {
    result += TENS[Math.floor(num / 10)];
    num %= 10;
    if (num > 0) {
      result += ' ' + ONES[num];
    }
  } else if (num > 0) {
    result += ONES[num];
  }

  return result;
}

/**
 * Convert a number to words
 *
 * @param num - The number to convert (up to billions)
 * @returns The number in words (e.g., "one hundred and sixty thousand")
 *
 * @example
 * numberToWords(160000) // "one hundred and sixty thousand"
 * numberToWords(5000)   // "five thousand"
 * numberToWords(350000) // "three hundred and fifty thousand"
 */
export function numberToWords(num: number): string {
  if (num === 0) return 'zero';
  if (num < 0) return 'negative ' + numberToWords(Math.abs(num));

  // Round to nearest integer
  num = Math.round(num);

  const parts: string[] = [];
  let scaleIndex = 0;

  while (num > 0) {
    const chunk = num % 1000;
    if (chunk > 0) {
      const chunkWords = convertHundreds(chunk);
      const scale = SCALES[scaleIndex];
      if (scale) {
        parts.unshift(chunkWords + ' ' + scale);
      } else {
        parts.unshift(chunkWords);
      }
    }
    num = Math.floor(num / 1000);
    scaleIndex++;
  }

  // Join with "and" for better readability
  if (parts.length > 1) {
    const last = parts.pop();
    return parts.join(' ') + ' and ' + last;
  }

  return parts.join(' ');
}

/**
 * Format a number with currency words
 *
 * @param amount - The amount in the smallest unit (e.g., cents for euro)
 * @param currency - The currency name (default: "euro")
 * @returns The amount in words with currency
 *
 * @example
 * formatCurrencyWords(160000, "euro") // "one hundred and sixty thousand euro"
 */
export function formatCurrencyWords(amount: number, currency: string = "euro"): string {
  const words = numberToWords(amount);
  return `${words} ${currency}`;
}

