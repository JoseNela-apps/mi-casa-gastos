# Mi Casa Finance — V5

## Qué trae V5
- Dashboard financiero con comparación mensual, presupuesto usado e insights.
- Perfiles financieros por miembro.
- Nuevo gasto premium con división Igual / Monto / Porcentaje.
- Comprobantes pequeños guardados dentro del gasto (máximo recomendado: 350 KB).
- Presupuestos mensuales por categoría.
- Deudas simplificadas + botón “Marcar pagado” + historial.
- Calendario financiero mensual.
- Pagos recurrentes.
- Cierre y reapertura mensual para Owner.
- Reporte imprimible/PDF desde la pestaña Mes.
- Filtros de actividad.
- Mejoras visuales desktop + mobile/PWA.
- Mantiene Owner/Admin, invitaciones y acceso por miembros.

## Instalación
1. Firebase Console → Firestore → Reglas.
2. Reemplaza TODO con `FIREBASE_RULES.txt` y pulsa Publicar.
3. Sube/reemplaza en GitHub todos los archivos del ZIP.
4. Commit a `main`.
5. Espera el deployment de GitHub Pages.
6. Haz una recarga completa del navegador.

## Importante sobre comprobantes
Firebase Storage sigue sin estar habilitado en el plan Spark del proyecto. Para no bloquear V5, esta versión permite guardar comprobantes pequeños dentro del documento Firestore como Data URL. Se limita a 350 KB para reducir riesgo de superar el límite de tamaño de Firestore. Para fotos/PDF grandes y almacenamiento real compartido, el siguiente paso correcto es habilitar Firebase Storage (Blaze) o usar otro almacenamiento.

## Permisos
- Owner: miembros, admin, presupuestos, recurrentes, cierre/reapertura de mes.
- Members: gastos, balances, pagos y consulta.
- Nadie puede crear un segundo hogar desde la app.

## Nota
Los gastos existentes siguen siendo compatibles. Si no tienen `shares`, V5 calcula división igual usando `participantIds`.
