import { describe, it, expect } from "vitest";
import {
  formatReportRows,
  mapReportRows,
} from "../format-report-rows.js";

/**
 * A section/row/cell payload shaped the way Xero actually returns a report,
 * plus the fields the mapper must refuse to carry: `attributes` on a cell and
 * an extra top-level field on a row.
 */
const xeroLikeRows = [
  {
    rowType: "Header",
    cells: [
      { value: "Account" },
      { value: "Debit" },
      { value: "Credit" },
    ],
  },
  {
    rowType: "Section",
    title: "Revenue",
    rows: [
      {
        rowType: "Row",
        cells: [
          {
            value: "Sales",
            attributes: [{ id: "account", value: "acc-uuid-1" }],
          },
          { value: "0.00" },
          { value: "1000.00" },
        ],
      },
      {
        rowType: "SummaryRow",
        cells: [{ value: "Total Revenue" }, { value: "0.00" }, { value: "1000.00" }],
      },
    ],
  },
];

describe("mapReportRows", () => {
  it("maps a nested section/row/cell structure to the declared shape", () => {
    expect(mapReportRows(xeroLikeRows)).toEqual([
      {
        rowType: "Header",
        title: "",
        cells: ["Account", "Debit", "Credit"],
        rows: [],
      },
      {
        rowType: "Section",
        title: "Revenue",
        cells: [],
        rows: [
          {
            rowType: "Row",
            title: "",
            cells: ["Sales", "0.00", "1000.00"],
            rows: [],
          },
          {
            rowType: "SummaryRow",
            title: "",
            cells: ["Total Revenue", "0.00", "1000.00"],
            rows: [],
          },
        ],
      },
    ]);
  });

  it("drops cell attributes", () => {
    const [, section] = mapReportRows(xeroLikeRows);
    const [salesRow] = section.rows;

    expect(salesRow).not.toHaveProperty("attributes");
    expect(JSON.stringify(salesRow)).not.toContain("acc-uuid-1");
  });

  it("drops any field the shape does not declare, including new upstream ones", () => {
    const withExtras = [
      {
        rowType: "Row",
        title: "Wages",
        cells: [{ value: "1000.00", attributes: [{ id: "x", value: "y" }] }],
        // Fields Xero does not send today. If it starts sending them, they must
        // not reach the caller without someone reviewing them first.
        taxFileNumber: "123456782",
        bankAccountDetails: "083-004 12345678",
        someFutureField: { nested: "value" },
      },
    ];

    const mapped = mapReportRows(withExtras);

    expect(Object.keys(mapped[0]).sort()).toEqual([
      "cells",
      "rowType",
      "rows",
      "title",
    ]);
    const serialised = JSON.stringify(mapped);
    expect(serialised).not.toContain("123456782");
    expect(serialised).not.toContain("083-004");
    expect(serialised).not.toContain("someFutureField");
  });

  it("handles missing rows, cells and title", () => {
    expect(mapReportRows([{ rowType: "Section" }])).toEqual([
      { rowType: "Section", title: "", cells: [], rows: [] },
    ]);
  });

  it("handles an empty array and non-array input", () => {
    expect(mapReportRows([])).toEqual([]);
    expect(mapReportRows(undefined)).toEqual([]);
    expect(mapReportRows(null)).toEqual([]);
    expect(mapReportRows("rows")).toEqual([]);
  });

  it("coerces numeric cell values and empties null ones", () => {
    expect(
      mapReportRows([
        { rowType: "Row", cells: [{ value: 1000 }, { value: null }, {}, "junk"] },
      ])[0].cells,
    ).toEqual(["1000", "", "", ""]);
  });

  it("drops an object arriving where a scalar cell value was declared", () => {
    expect(
      mapReportRows([
        { rowType: "Row", cells: [{ value: { tfn: "123456782" } }] },
      ])[0].cells,
    ).toEqual([""]);
  });

  it("stops recursing past the depth cap rather than overflowing the stack", () => {
    // A cyclic payload cannot come from Xero, but the mapper is the first thing
    // to touch untrusted response data and must not be the thing that dies.
    const cyclic: Record<string, unknown> = { rowType: "Section" };
    cyclic.rows = [cyclic];

    expect(() => mapReportRows([cyclic])).not.toThrow();
  });
});

describe("formatReportRows", () => {
  it("renders the mapped shape as indented text with labels and numbers", () => {
    expect(formatReportRows(xeroLikeRows)).toBe(
      [
        "Header: Account | Debit | Credit",
        "Section Revenue",
        "  Row: Sales | 0.00 | 1000.00",
        "  SummaryRow: Total Revenue | 0.00 | 1000.00",
      ].join("\n"),
    );
  });

  it("never renders cell attributes", () => {
    expect(formatReportRows(xeroLikeRows)).not.toContain("acc-uuid-1");
  });

  it("reports empty input rather than rendering nothing", () => {
    expect(formatReportRows([])).toBe("No report rows returned.");
    expect(formatReportRows(undefined)).toBe("No report rows returned.");
  });

  it("labels a row that arrives with no rowType", () => {
    expect(formatReportRows([{ cells: [{ value: "Sales" }] }])).toBe(
      "Row: Sales",
    );
  });

  /*
   * THE LOAD-BEARING TEST.
   *
   * `formatReportRows` is a shape guard, not a redactor. A TFN or a BSB sitting
   * in a report cell's *text* is the report's own content — it came back inside
   * the data the caller asked Xero for — and it still renders. Redaction is a
   * content judgement that belongs in the PII matcher and its guards; what this
   * module closes is unreviewed passthrough of the Xero object graph.
   *
   * This test exists so nobody "fixes" the formatter into a silent redactor and
   * makes the PII guards look green for the wrong reason.
   */
  it("still maps a TFN or BSB that lives in cell text — it is a shape guard, not a redactor", () => {
    const rows = [
      {
        rowType: "Row",
        cells: [{ value: "TFN 123456782" }, { value: "BSB 083-004" }],
      },
    ];

    expect(mapReportRows(rows)[0].cells).toEqual([
      "TFN 123456782",
      "BSB 083-004",
    ]);
    expect(formatReportRows(rows)).toBe("Row: TFN 123456782 | BSB 083-004");
  });
});
