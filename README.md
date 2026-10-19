# Mi Casa V10

Finanzas compartidas de la casa: gastos, cuentas por pagar, saldos entre la familia, metas y cierre de mes.
Vanilla JS + Firebase (Auth + Firestore), servida desde GitHub Pages. Pasos de publicación en **DEPLOY.md**.

## Qué cambió desde V9.5.5

**Correcciones (todas reproducidas antes de arreglarlas)**
- «Generar PDF» del cierre no hacía nada (llamaba a una función inexistente).
- «Reabrir mes» no hacía nada, y un mes reabierto seguía saliendo «Cerrado» para siempre.
- Cerrar el mes no bloqueaba nada; ahora bloquea gastos y pagos de ese mes.
- De noche (después de las 7 pm) el gasto nuevo salía con la fecha de mañana (se usaba la hora UTC).
- Una cuenta pendiente de un mes anterior desaparecía de Cuentas.
- Las barras de «Ritmo de gastos» tenían los días mal etiquetados.
- «Marcar leído» no limpiaba el contador de avisos.
- Un gasto con 4 fotos no se podía guardar (límite de 1 MB por documento).
- En el teléfono no había forma de cerrar sesión.
- Una cuenta pendiente decía «Miembro pagó» en la lista.
- Los recurrentes no podían ser Transporte, Salud ni Comida.
- «Cubierto» aparecía en casi todos los gastos aunque nadie cubriera a nadie (solo era la etiqueta; los montos nunca cambiaron).

**Funciones nuevas**
- Una sola lista de categorías, con categorías propias.
- Vencimiento en cuentas por pagar; Cuentas agrupadas en Vencidas / Esta semana / Más adelante / Sin vencimiento / Pagadas.
- «Marcar pagada» desde el detalle de una cuenta, y borrar un pago registrado por error.
- Recurrentes completos: para quién son, edición, y la cuenta del mes que se crea sola (día 31 = último día del mes).
- Filtros de Gastos por los 5 estados, persona y mes; exportar CSV; respaldo completo en JSON.
- Un solo cierre de mes con revisión previa; un solo menú «Registrar».
- Metas con aportes y «cuánto falta por mes».
- Saldos muestra los meses anteriores que quedaron sin saldar (los saldos siguen calculándose por mes, como antes).

**Acceso**
- Roles Owner / Administrador / Miembro / Solo lectura, aplicados en la app y en `firestore.rules`.
- Invitación por enlace (Compartir, Copiar, WhatsApp, Correo) que deja el email ya escrito.
- Mostrar contraseña, email recordado, mensajes claros; «Activar acceso» con un email que ya tiene cuenta lleva a Entrar.
- Pausar y reactivar el acceso de una persona; última conexión en Admin → Accesos.
- Panel de preparación para publicar las reglas.

**Diseño**
- Paleta cálida en ciruela y caléndula con modo noche automático (o fijo desde Mi Casa → Tu cuenta).
- Íconos SVG propios, Inicio en tres partes (Resumen · Hoy · Explorar), montos tabulares, color por persona, estados con ícono y texto.
- Carga honesta: no se muestran «$0.00» ni «Todo saldado» mientras llegan los datos, y si algo falla se dice.
- Zoom permitido, hojas como diálogos accesibles, Esc cierra, botones con nombre.

## Modelo de datos (nuevo)
- `households/{h}/attachments/{id}` — un comprobante por documento (`expenseId, name, type, size, data, createdBy`). Los gastos guardan solo la ficha.
- `households/{h}/goalContributions/{id}` — `goalId, amount, memberId, date, note, createdBy`.
- `households/{h}/recurringRuns/{rid}_{YYYY-MM}` — marca de la cuenta creada por un recurrente.
- `households/{h}/settings/categories` — `custom: [..]`.
- `members/{id}`: `role`, `accessPaused`, `lastSeenAt`, `appVersion`. `users/{uid}.memberId`.
- `expenses/{id}`: `dueDate`, `month`, `recurringId`, `suggestedPayerId`.

## Pruebas
`node tests/v10.test.js .` — 50 pruebas de comportamiento en jsdom con un Firebase falso en memoria.
`node tools/build-preview.js . preview.html` — la app real con datos de ejemplo, sin red.
