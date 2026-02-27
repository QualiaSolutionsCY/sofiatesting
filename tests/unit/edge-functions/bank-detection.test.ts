import { describe, it, expect } from 'vitest';
import {
  detectBankFromUrl,
  isBankPropertyUrl,
  isValidBankName,
  getSupportedBanks,
  VALID_BANK_NAMES
} from '../../../supabase/functions/sophia-bot/rules/bank-detection.ts';

describe('bank-detection', () => {
  describe('detectBankFromUrl', () => {
    // REMU - both domains
    it('detects REMU from remuproperties.com', () => {
      expect(detectBankFromUrl('https://remuproperties.com/property/123')).toBe('REMU');
      expect(detectBankFromUrl('remuproperties.com')).toBe('REMU');
    });

    it('detects REMU from remu.com.cy', () => {
      expect(detectBankFromUrl('https://remu.com.cy/listings')).toBe('REMU');
      expect(detectBankFromUrl('remu.com.cy')).toBe('REMU');
    });

    // Altamira - both domains
    it('detects Altamira from altamira-amc.com', () => {
      expect(detectBankFromUrl('https://altamira-amc.com/property/456')).toBe('Altamira');
      expect(detectBankFromUrl('altamira-amc.com')).toBe('Altamira');
    });

    it('detects Altamira from altamira-npl.com', () => {
      expect(detectBankFromUrl('https://altamira-npl.com/listings')).toBe('Altamira');
      expect(detectBankFromUrl('altamira-npl.com')).toBe('Altamira');
    });

    // Gordian - both domains
    it('detects Gordian from gogordian.com', () => {
      expect(detectBankFromUrl('https://gogordian.com/property/789')).toBe('Gordian');
      expect(detectBankFromUrl('gogordian.com')).toBe('Gordian');
    });

    it('detects Gordian from gordian.com.cy', () => {
      expect(detectBankFromUrl('https://gordian.com.cy/listings')).toBe('Gordian');
      expect(detectBankFromUrl('gordian.com.cy')).toBe('Gordian');
    });

    // Bank of Cyprus - both domains
    it('detects Bank of Cyprus from bankofcyprus.com', () => {
      expect(detectBankFromUrl('https://bankofcyprus.com/property/321')).toBe('Bank of Cyprus');
      expect(detectBankFromUrl('bankofcyprus.com')).toBe('Bank of Cyprus');
    });

    it('detects Bank of Cyprus from boc.com.cy', () => {
      expect(detectBankFromUrl('https://boc.com.cy/listings')).toBe('Bank of Cyprus');
      expect(detectBankFromUrl('boc.com.cy')).toBe('Bank of Cyprus');
    });

    // Hellenic Bank - both domains
    it('detects Hellenic Bank from hellenic-bank.com', () => {
      expect(detectBankFromUrl('https://hellenic-bank.com/property/654')).toBe('Hellenic Bank');
      expect(detectBankFromUrl('hellenic-bank.com')).toBe('Hellenic Bank');
    });

    it('detects Hellenic Bank from hellenicbank.com', () => {
      expect(detectBankFromUrl('https://hellenicbank.com/listings')).toBe('Hellenic Bank');
      expect(detectBankFromUrl('hellenicbank.com')).toBe('Hellenic Bank');
    });

    // Case insensitivity
    it('detects banks case-insensitively', () => {
      expect(detectBankFromUrl('REMUPROPERTIES.COM')).toBe('REMU');
      expect(detectBankFromUrl('ALTAMIRA-AMC.COM')).toBe('Altamira');
      expect(detectBankFromUrl('GOGORDIAN.COM')).toBe('Gordian');
    });

    // Full URLs
    it('detects banks from full URLs with paths', () => {
      expect(detectBankFromUrl('https://www.remuproperties.com/property/123?ref=abc')).toBe('REMU');
      expect(detectBankFromUrl('https://www.altamira-amc.com/en/property/456#details')).toBe('Altamira');
    });

    // Invalid inputs
    it('returns null for non-bank URL', () => {
      expect(detectBankFromUrl('https://google.com')).toBeNull();
      expect(detectBankFromUrl('https://example.com')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(detectBankFromUrl('')).toBeNull();
    });

    it('returns null for invalid input', () => {
      expect(detectBankFromUrl(null as any)).toBeNull();
      expect(detectBankFromUrl(undefined as any)).toBeNull();
    });
  });

  describe('isBankPropertyUrl', () => {
    it('returns true for bank URLs', () => {
      expect(isBankPropertyUrl('https://remuproperties.com/property/123')).toBe(true);
      expect(isBankPropertyUrl('https://altamira-amc.com')).toBe(true);
    });

    it('returns false for non-bank URLs', () => {
      expect(isBankPropertyUrl('https://google.com')).toBe(false);
      expect(isBankPropertyUrl('')).toBe(false);
    });
  });

  describe('isValidBankName', () => {
    it('returns true for valid bank names', () => {
      expect(isValidBankName('REMU')).toBe(true);
      expect(isValidBankName('Altamira')).toBe(true);
      expect(isValidBankName('Gordian')).toBe(true);
      expect(isValidBankName('Bank of Cyprus')).toBe(true);
      expect(isValidBankName('Hellenic Bank')).toBe(true);
    });

    it('returns false for invalid bank names', () => {
      expect(isValidBankName('Unknown Bank')).toBe(false);
      expect(isValidBankName('')).toBe(false);
      expect(isValidBankName('remu')).toBe(false); // case-sensitive
    });
  });

  describe('getSupportedBanks', () => {
    it('returns all 5 supported banks', () => {
      const banks = getSupportedBanks();
      expect(banks).toHaveLength(5);
      expect(banks).toContain('REMU');
      expect(banks).toContain('Altamira');
      expect(banks).toContain('Gordian');
      expect(banks).toContain('Bank of Cyprus');
      expect(banks).toContain('Hellenic Bank');
    });

    it('returns readonly array', () => {
      const banks = getSupportedBanks();
      expect(banks).toBe(VALID_BANK_NAMES); // Same reference
    });
  });
});
