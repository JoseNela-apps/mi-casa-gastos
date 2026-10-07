# Mi Casa V9.5.3 — Saldos + Global Sync

Base: V9.5.2 Payments + UI Repair. V9.6 is NOT included.

Changes:
- Saldos is now its own navigation tab on desktop and mobile.
- Recorded partial payments update all current balances, not only “Quién paga a quién”.
- Home “Te deben / Tú debes” uses current balance after payments.
- Mi Casa member balances use current balance after payments.
- Individual member profile balance uses current balance after payments.
- Monthly people summary uses current balance after payments.
- Global PDF now shows: paid expenses, responsibility, payments made, and current balance.
- Global PDF’s summary is updated immediately after a payment is registered.
- Individual PDF also shows payments made and current balance.
- Fixed report language/member argument handling.
- Existing partial-payment and invoice-payment logic remains intact.

Example:
If Marita originally owes Alberto $658.21 and records a $300 payment, all views and the global report now show Marita’s remaining balance as $358.21.

No new Firebase collections or rules are required.
