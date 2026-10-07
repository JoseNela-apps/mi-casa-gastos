# Mi Casa V9.4 — Bills & Family Coverage

## Nuevo
- Cuentas pendientes: puedes registrar luz, agua, basura, internet, etc. aunque nadie las haya pagado todavía.
- Una cuenta pendiente NO acredita dinero a ninguna persona y NO entra en “quién paga a quién”.
- Cuando alguien la paga, edita la cuenta, cambia a “Ya fue pagada” y selecciona quién pagó.
- Cobertura familiar permanente: el Owner puede definir quién cubre económicamente a quién.
- Ejemplo: Alberto cubre a Nela y Marianela; Juana puede cubrir a Timothy.
- La app conserva la participación original, pero transfiere la responsabilidad final al coverer.
- Cada gasto puede ignorar la cobertura familiar con un switch.
- Dashboard muestra cuentas pendientes separadas.
- Actividad identifica claramente “DEUDA PENDIENTE”.
- PDF global incluye cuentas pendientes sin mezclarlas con saldos.
- PDF individual indica cuando una persona está cubierta por otra.
- Conserva Admin Fix V9.3, reportes, compresión de comprobantes <=200 KB y todas las funciones anteriores.

## Firebase
V9.4 agrega `/households/{householdId}/settings/coverage`.
Publica `FIREBASE_RULES_FINAL_V9.4.txt`.
