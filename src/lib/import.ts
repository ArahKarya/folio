import type { ImportReport } from "@/types";

/** One sentence covering every outcome of an import run. */
export function describeImport(report: ImportReport): string {
  const parts: string[] = [];
  if (report.imported.length) parts.push(`${report.imported.length} added`);
  if (report.duplicates.length) parts.push(`${report.duplicates.length} already in the library`);
  if (report.failures.length) parts.push(`${report.failures.length} could not be read`);
  return parts.length ? parts.join(", ") : "Nothing to import";
}
