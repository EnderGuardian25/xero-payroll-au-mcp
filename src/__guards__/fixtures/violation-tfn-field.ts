/*
 * NEGATIVE CONTROL — a hand-written mapper that reads a denied field.
 * Never registered.
 *
 * This is the exact shape that defeated the draft version of Guard B, and the
 * reason the guard is field-level rather than object-level. The returned object
 * is NOT a raw Xero SDK response — it was mapped by hand, field by field — so
 * an object-provenance check passes it cleanly while it emits precisely the
 * value CLAUDE.md rule 2 forbids.
 *
 * Guard B's FR7a must reject it, in both access forms.
 */
interface XeroEmployeeLike {
  employeeID?: string;
  taxFileNumber?: string;
  bankAccountNumber?: string;
}

export function mapEmployee(employee: XeroEmployeeLike) {
  return {
    id: employee.employeeID,
    // The violation: reading a denied field into a hand-defined shape.
    tfn: employee.taxFileNumber,
    account: employee["bankAccountNumber"],
  };
}
