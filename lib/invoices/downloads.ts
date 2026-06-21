import { getUnifiedFilename } from "@/lib/invoices/format";
import {
  asArrayBuffer,
  buildDocumentPdfBlob,
  buildDocumentPdfBytes,
} from "@/lib/invoices/pdf";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";

export function downloadDocumentPdf(document: InvoiceDocument) {
  downloadBlob(buildDocumentPdfBlob(document), getUnifiedFilename(document));
}

export function downloadBackupJson(documents: InvoiceDocument[]) {
  const snapshot = {
    exportedAt: new Date().toISOString(),
    documents,
  };

  downloadBlob(
    new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }),
    `sophia-invoice-backup-${new Date().toISOString().slice(0, 10)}.json`
  );
}

export function downloadDocumentsZip(documents: InvoiceDocument[]) {
  const files = documents.map((document) => ({
    name: getUnifiedFilename(document),
    bytes: new Uint8Array(buildDocumentPdfBytes(document)),
  }));

  downloadBlob(
    new Blob([asArrayBuffer(buildZip(files))], { type: "application/zip" }),
    `sophia-invoices-${new Date().toISOString().slice(0, 10)}.zip`
  );
}

function buildZip(
  files: Array<{ name: string; bytes: Uint8Array }>
): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const crc = crc32(file.bytes);
    const local = concat([
      u32(0x04_03_4b_50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.bytes.length),
      u32(file.bytes.length),
      u16(name.length),
      u16(0),
      name,
      file.bytes,
    ]);
    const centralRecord = concat([
      u32(0x02_01_4b_50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.bytes.length),
      u32(file.bytes.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);

    chunks.push(local);
    central.push(centralRecord);
    offset += local.length;
  }

  const centralBody = concat(central);
  const end = concat([
    u32(0x06_05_4b_50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralBody.length),
    u32(offset),
    u16(0),
  ]);

  return concat([...chunks, centralBody, end]);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 255, (value >> 8) & 255]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    value & 255,
    (value >> 8) & 255,
    (value >> 16) & 255,
    (value >> 24) & 255,
  ]);
}

function crc32(bytes: Uint8Array): number {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xed_b8_83_20 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
