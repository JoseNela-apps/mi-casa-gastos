# Mi Casa V9.5.2 — Payments + UI Repair

Base: V9.5.1 Professional PDF. V9.6 is NOT included.

New payment logic:
- A person can make a partial payment toward an existing balance (example: Marita pays Alberto $300).
- The recorded payment immediately reduces the remaining total in Saldos because it is stored in the existing settlements collection.
- “Registrar pago” opens a payment form instead of forcing the entire balance to be marked paid.
- A payment can be linked to one specific expense/invoice.
- From an expense action, “Registrar pago de esta cuenta” lets you settle all or part of the responsible person's outstanding share for that exact bill.
- Specific-bill payments also reduce the global balance.
- Payment history identifies payments tied to a specific bill.

UI repair:
- Only one sheet/window can be visible at a time.
- Opening an expense from Calendar, Activity, Member Detail, Search, etc. automatically closes the previous sheet.
- This fixes the overlapping right-side panels shown in the screenshot.
- Body scroll is locked while a sheet is open.

No new Firebase collections or rule changes are required. Settlements reuse the existing collection and add optional expenseId/expenseDescription/note fields.
