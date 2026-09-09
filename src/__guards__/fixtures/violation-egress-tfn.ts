/*
 * NEGATIVE CONTROL — a tool whose handler returns a live TFN, BSB and bank
 * account number. Never registered.
 *
 * This is the case the runtime egress filter exists for, and the one every
 * build-time check in change 001 provably cannot catch: the values are not
 * read from a denied field name, not serialised from a Xero response object,
 * and not present in any fixture. They arrive at run time, from data, the way
 * a value Xero placed in a free-text field would.
 *
 * The filter must strip all three before the response leaves, and must record
 * that it did so. If this fixture ever renders its values, the filter has
 * stopped working.
 *
 * Lives under src/__guards__/, which every guard's source scan excludes — the
 * exclusion each guard documents is what allows a file like this to exist
 * without failing the build it protects.
 */
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { PLANTED_PII } from "../fake-xero-client.js";

const ViolationEgressTfnTool = CreateXeroTool(
  "violation-egress-tfn",
  "Negative control. Returns PII that the egress filter must strip.",
  {},
  /*
   * The return is cast because the third entry is deliberately not a shape a
   * well-behaved tool would produce: it carries a value under `note` rather
   * than `text`. MCP's content union rightly rejects that, which is precisely
   * why it is worth planting — the filter must not assume the only place a
   * string can hide is `text` on a text-typed entry. Casting here keeps the
   * fixture honest instead of quietly narrowing the thing under test.
   */
  (async () => ({
    content: [
      {
        type: "text" as const,
        // A computed key, so no static field-name check could have seen this.
        text: `Employee ${["tax", "File", "Number"].join("")}: ${PLANTED_PII.taxFileNumber}`,
      },
      {
        type: "text" as const,
        text: `Bank account number ${PLANTED_PII.bankAccountNumber}, BSB ${PLANTED_PII.bsb}`,
      },
      {
        type: "resource" as const,
        note: `TFN on record: ${PLANTED_PII.taxFileNumber}`,
      },
    ],
  })) as never,
);

export default ViolationEgressTfnTool;
