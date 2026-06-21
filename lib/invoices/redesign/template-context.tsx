"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { ENTITY } from "./data";

export type TemplateText = {
  name: string;
  regNo: string;
  address: string;
  contactLine: string;
  vatNo: string;
  creaLicense: string;
  creaReg: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  iban: string;
  bic: string;
  settlementNote: string;
  receiptNote: string;
};

export const TEMPLATE_DEFAULTS: TemplateText = {
  name: "CSC ZYPRUS PROPERTY GROUP LTD",
  regNo: "HE344546",
  address: "Tombs of the Kings Avenue 96, 8046 Paphos, Cyprus",
  contactLine: "T: 77776477 E: info@zyprus.com",
  vatNo: "10344546O",
  creaLicense: "378/E",
  creaReg: "742",
  bankName: "Hellenic Bank",
  accountName: "CSC ZYPRUS PROPERTY GROUP LTD",
  accountNumber: "502-01-734364-01",
  iban: "CY97 0050 0502 0005 0201 7343 6401",
  bic: "HEBACY2N",
  settlementNote:
    "Payment due within the stated terms. Please use the invoice number as the payment reference.",
  receiptNote: "This receipt confirms payment in full. Thank you.",
};

const STORAGE_KEY = "sophia.invoice.template";

const TemplateContext = createContext<{
  text: TemplateText;
  setText: (next: TemplateText) => void;
}>({
  text: TEMPLATE_DEFAULTS,
  setText: () => {},
});

export function TemplateProvider({ children }: { children: ReactNode }) {
  const [text, setTextState] = useState<TemplateText>(TEMPLATE_DEFAULTS);

  useEffect(() => {
    try {
      const raw =
        typeof window !== "undefined"
          ? window.localStorage.getItem(STORAGE_KEY)
          : null;
      if (raw) setTextState({ ...TEMPLATE_DEFAULTS, ...JSON.parse(raw) });
    } catch {
      // ignore malformed storage
    }
  }, []);

  const setText = (next: TemplateText) => {
    setTextState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — keep in-memory only
    }
  };

  return (
    <TemplateContext.Provider value={{ text, setText }}>
      {children}
    </TemplateContext.Provider>
  );
}

export const useTemplateText = () => useContext(TemplateContext);
