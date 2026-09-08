/*
 * NEGATIVE CONTROL — a tool that serialises an unreviewed Xero-derived value.
 * Never registered.
 *
 * Guard B's FR7b must reject this. It is the defect T15 removed from five
 * retained report tools, kept here permanently so the check cannot quietly
 * stop working: a probe proved JSON.stringify(report.rows, null, 2) rendered a
 * planted TFN and BSB verbatim to the caller.
 *
 * Source text only. Nothing imports this at runtime.
 */
interface ReportLike {
  rows?: unknown;
  body?: unknown;
}

export function renderReport(report: ReportLike): string {
  // The violation: whatever Xero returns goes straight out, unreviewed.
  return JSON.stringify(report.rows, null, 2);
}

export function renderWholeBody(response: ReportLike): string {
  return JSON.stringify(response.body);
}
