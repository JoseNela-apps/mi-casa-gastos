# Mi Casa V6.2 — Calendar Fix

Esta versión corrige el bloqueo de carga de V6.1.

Causa encontrada:
las reglas finales anteriores no incluían las colecciones `budgets` y `recurring`.
La V6.1 esperaba que los 6 streams terminaran antes de renderizar, así que un
`permission-denied` en esas colecciones dejaba calendario, miembros y resumen
mostrando skeletons indefinidamente.

V6.2:
- restaura el calendario completo;
- agrega manejo de errores por stream: una colección opcional nunca congela la app;
- conserva la carga agrupada para rendimiento móvil;
- conserva calendario compacto en iPhone;
- incluye las reglas Firestore completas corregidas con `budgets` y `recurring`;
- actualiza el Service Worker para forzar assets V6.2.

Para esta corrección SÍ es necesario publicar FIREBASE_RULES_FINAL_V6.2.txt.
