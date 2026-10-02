# Mi Casa · Gastos — V4 Usuarios & Admin

## Qué incluye
- Owner/Admin de Mi Casa.
- Invitaciones por email vinculadas a miembros existentes.
- Una cuenta invitada entra al MISMO hogar en vez de crear otro.
- Estado de acceso: Activo / Invitación pendiente / Sin acceso.
- Panel Admin.
- Owner puede eliminar miembros de su hogar.
- Owner puede enviar restablecimiento de contraseña.
- “Olvidé mi contraseña” en login.
- Reglas Firestore actualizadas.

## IMPORTANTE: contraseñas
Las contraseñas de Firebase Authentication no son visibles para el Owner ni para la app. Esto es intencional y seguro. El Owner puede enviar un restablecimiento, pero no leer la contraseña actual.

## Instalación
1. En Firebase Console → Firestore → Reglas, reemplaza TODO por `FIREBASE_RULES.txt` y pulsa Publicar.
2. En GitHub reemplaza los archivos de la app por los de este paquete.
3. Haz commit a `main` y espera el deployment de GitHub Pages.
4. En Firebase Authentication → Settings → Authorized domains agrega `josenela-apps.github.io`.

## Cómo entra Nela
1. Alberto entra como Owner.
2. En Miembros agrega a Nela usando EXACTAMENTE el email de su cuenta Firebase.
3. Nela cierra sesión e inicia sesión con su email.
4. Si su perfil no tiene hogar, la app busca automáticamente su invitación. También puede pulsar “Buscar invitación para mi email”.
5. Queda vinculada al mismo hogar.

## Si Nela ya creó un hogar accidental
Esta versión no borra automáticamente datos ajenos. Si esa cuenta ya tiene `householdId` propio, primero hay que desvincular/migrar ese perfil. No se debe borrar a ciegas porque podría contener datos.

## Super Admin global
Esta versión da a Alberto control total sobre SU hogar. Un super-admin capaz de administrar cuentas Authentication y hogares de toda la plataforma requiere Firebase Admin SDK en un backend/Cloud Function; no debe ponerse en JavaScript público de GitHub Pages.
