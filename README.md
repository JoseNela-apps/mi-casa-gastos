# Mi Casa V9.3 — Admin Fix

Correcciones principales:
- Botón Editar para cada usuario en Administración.
- Owner puede editar nombre y email de contacto/invitación.
- Botón Avatar para editar foto, preset y color de cualquier miembro.
- Restablecimiento de contraseña desde Admin para cuentas activas.
- Estados Activo / Pendiente / Sin acceso.
- Reenvío/preparación de invitación al guardar email.
- Prevención de emails duplicados.
- Limpieza de invitación pendiente al eliminar un miembro.
- Corrección crítica de membresía: los member document IDs no tienen que ser iguales al Firebase Auth UID.
- Reglas nuevas para `invites`.
- Mantiene compresión automática de comprobantes a <= 200 KB y reportes globales/individuales.

IMPORTANTE:
Publica FIREBASE_RULES_FINAL_V9.3.txt en Firestore Rules.

Seguridad:
La app NO guarda contraseñas en Firestore. Un Owner puede enviar restablecimiento. Cambiar directamente email/password de otra cuenta activa requiere Firebase Admin SDK en un backend seguro.
