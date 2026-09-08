/*
 * Hand-mapped rendering of Xero report rows.
 *
 * WHY THIS EXISTS
 * ---------------
 * Five retained accounting tools — trial balance, profit and loss, balance
 * sheet, aged payables by contact, aged receivables by contact — used to render
 * their report bodies as `JSON.stringify(report.rows, null, 2)`. That is a raw
 * Xero response object going straight to the MCP caller, which is exactly what
 * `CLAUDE.md` hard rule 2 forbids: "Every tool returns a hand-defined shape;
 * raw Xero response objects never pass through to the caller."
 *
 * It was not a theoretical concern. A probe run during T8 planted a
 * checksum-valid TFN (`123456782`) and a BSB (`083-004`) into report row cells
 * and confirmed **all five tools rendered both values verbatim**. Report rows
 * are the widest egress on the whole retained surface: an arbitrary, recursive,
 * free-text grid whose column set the org controls, not us. A guard that passed
 * over `JSON.stringify` would have been ceremonial on the one place most likely
 * to leak.
 *
 * So this module hand-maps the recursive row structure to a declared shape —
 * `rowType`, `title`, `cells: string[]`, nested `rows` — and drops everything
 * else. `attributes` goes. Anything Xero adds to `ReportRow`/`ReportCell` in a
 * future spec version goes too, without anyone having to notice, because the
 * mapper only ever copies fields it was told about. That is the whole point:
 * new upstream fields must not reach a caller unreviewed.
 *
 * WHAT THIS IS NOT
 * ----------------
 * This is a **shape guard, not a redactor.** If a TFN or a BSB sits in a report
 * cell's text, `formatReportRows` still renders it — deliberately. Cell text is
 * the report's own content: the account names, contact names and amounts the
 * caller asked for. Deciding that a digit run inside financial report text is
 * PII rather than an invoice number is a redaction judgement, and it belongs in
 * the PII matcher and its guards, not here. What this module closes is
 * *unreviewed passthrough* of the Xero object graph — the structural hole, not
 * the content question.
 */

/** An arbitrary object off the wire, before anything has been believed about it. */
interface UnknownRecord {
  [key: string]: unknown;
}

/**
 * The declared shape a report row is mapped to. Nothing outside these four
 * fields survives the mapping.
 */
export interface MappedReportRow {
  rowType: string;
  title: string;
  cells: string[];
  rows: MappedReportRow[];
}

/**
 * Rows deeper than this are dropped.
 *
 * Real Xero reports nest two levels (section → row). The cap is not about
 * Xero's shape, it is about not letting a malformed or cyclic payload turn a
 * read into a stack overflow — the mapper is the first thing to touch untrusted
 * response data.
 */
const MAX_ROW_DEPTH = 8;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function mapString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  // null, undefined, objects, arrays, functions: dropped rather than
  // stringified. A nested object arriving where a scalar was declared is an
  // unreviewed shape, and hard rule 2 says it does not reach the caller.
  return "";
}

function mapCells(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  // Only `cell.value` is carried across. `cell.attributes` is dropped.
  return value.map((cell) => (isRecord(cell) ? mapString(cell.value) : ""));
}

function mapRow(value: unknown, depth: number): MappedReportRow {
  const row = isRecord(value) ? value : {};
  return {
    rowType: mapString(row.rowType),
    title: mapString(row.title),
    cells: mapCells(row.cells),
    rows: depth < MAX_ROW_DEPTH ? mapReportRows(row.rows, depth + 1) : [],
  };
}

/**
 * Map Xero's recursive report rows onto {@link MappedReportRow}.
 *
 * Accepts `unknown` on purpose. The input is a live API payload; typing it as
 * `ReportRows[]` would assert a shape we have not checked, and the mapper's job
 * is precisely to stop trusting that assertion.
 */
export function mapReportRows(
  rows: unknown,
  depth = 0,
): MappedReportRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => mapRow(row, depth));
}

function renderRow(row: MappedReportRow, indent: string): string[] {
  // `rowType` is Xero's own row classification (Header / Section / Row /
  // SummaryRow). It is kept because it is what makes an indented dump of a
  // financial report readable — it says whether a line is a column header, a
  // section label or a total.
  const label = row.title
    ? `${row.rowType || "Row"} ${row.title}`
    : row.rowType || "Row";
  const line =
    row.cells.length > 0 ? `${indent}${label}: ${row.cells.join(" | ")}` : `${indent}${label}`;

  return [
    line,
    ...row.rows.flatMap((child) => renderRow(child, `${indent}  `)),
  ];
}

/**
 * Render report rows as indented text for an MCP caller.
 *
 * Text rather than JSON because the caller is a model reading a financial
 * report: the row labels and the numbers are the payload, and an indented
 * outline carries the section structure in a fraction of the tokens that
 * pretty-printed JSON spends on braces and field names. The rendering is driven
 * entirely off the mapped shape, so no Xero object can reach the output even if
 * the rendering changes later.
 */
export function formatReportRows(rows: unknown): string {
  const mapped = mapReportRows(rows);
  if (mapped.length === 0) return "No report rows returned.";
  return mapped.flatMap((row) => renderRow(row, "")).join("\n");
}
