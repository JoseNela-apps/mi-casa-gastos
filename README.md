# Mi Casa · Gastos — V4.1 OWNER ONLY

Esta versión cambia el modelo de acceso:

- Solo existe el hogar principal de Alberto.
- La aplicación web ya NO permite crear hogares nuevos.
- Los demás usuarios solamente pueden activar acceso si Alberto los agregó/invitó primero.
- Si un usuario sin invitación intenta registrarse, la app lo bloquea.
- Si Nela ya tenía un hogar accidental y Alberto la invita con el mismo email, la invitación tiene prioridad y su perfil se vincula al hogar de Alberto.
- Alberto sigue siendo Owner y puede borrar gastos/miembros dentro de su hogar.
- Firebase nunca muestra contraseñas; Alberto puede enviar restablecimientos.

## Instalación
1. Firebase Console → Firestore Database → Reglas.
2. Reemplaza TODO por `FIREBASE_RULES.txt` y pulsa Publicar.
3. Reemplaza los archivos del repositorio GitHub por los de este ZIP.
4. Commit a main y espera GitHub Pages.
5. Recarga la app.

## Nela
En la sesión de Alberto:
1. Si ya existe una ficha vieja de Nela sin el email correcto, elimínala o crea/actualiza la invitación usando `nela.berling@gmail.com`.
2. Nela inicia sesión con SU cuenta existente.
3. La app detecta la invitación y cambia su perfil al hogar de Alberto.

## Sobre borrar la cuenta/hogar accidental de Nela
V4.1 impide que vuelva a crearse otro hogar, pero NO intenta borrar automáticamente desde el navegador un hogar antiguo que pueda contener datos. El Owner no debe recibir permisos globales de borrado desde JavaScript público.

Después de que Nela quede vinculada a Alberto, el hogar antiguo puede eliminarse manualmente una sola vez en Firestore. Para un botón de Super Admin que elimine cuentas de Firebase Authentication y hogares globalmente se necesita Firebase Admin SDK/Cloud Functions (backend).
