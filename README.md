# Mi Casa · Gastos — V3.2 Root Fix

Esta versión elimina la dependencia circular que bloqueaba la creación inicial del hogar.

## CAMBIO IMPORTANTE
El primer hogar usa el UID del propietario como ID del hogar. Esto permite que las reglas de Firestore validen el alta inicial usando directamente `request.auth.uid`.

## PASO 1 — Firebase (obligatorio)
Abre Firebase Console → Firestore Database → Reglas.

Copia TODO el contenido de `FIREBASE_RULES.txt`, reemplaza las reglas actuales y pulsa **Publicar**.

Subir `FIREBASE_RULES.txt` a GitHub NO cambia las reglas de Firebase: hay que publicarlas en Firebase Console.

## PASO 2 — GitHub
Reemplaza los archivos del repositorio con los de este paquete y haz commit a `main`.

## PASO 3 — Espera el deployment
Espera a que GitHub Pages termine. Después cierra la pestaña anterior y vuelve a abrir la app.

## Nota OAuth
El aviso amarillo sobre dominio autorizado no causa el error de Firestore de creación del hogar. Antes de usar Google Sign-In, agrega `josenela-apps.github.io` a Authentication → Settings → Authorized domains.
