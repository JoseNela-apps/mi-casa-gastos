# Mi Casa V6.1 — Mobile Performance

Corrección de estabilidad y rendimiento sobre V6.

Cambios:
- Corrige el error de V6 que detenía renderAll antes de calendario/miembros.
- Espera a que los 6 streams iniciales de Firestore estén listos.
- Agrupa actualizaciones Firebase en un solo render (debounce).
- Restaura el calendario mensual completo.
- Calendario móvil compacto con indicadores de gastos/recurrentes.
- Estados vacíos reales para pagos recurrentes.
- Skeletons mientras cargan Firebase.
- Menos blur/sombras costosas en Safari/iPhone.
- Scroll de navegación sin animación costosa.
- Service Worker V6.1 para evitar mezclar assets de versiones anteriores.
- Conserva Family Finance, perfiles, avatares, comprobantes, ES/EN, PDF, saldos y recurrentes.

No requiere cambios adicionales en Firebase Rules.
