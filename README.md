# Mi Casa · Gastos — V3.1

Corrección del alta inicial del hogar con Firebase.

## Qué se corrigió
- El hogar se crea primero.
- Después se crea el documento del owner en `members`.
- Finalmente se enlaza el `householdId` al perfil del usuario.
- Se actualizó el caché del Service Worker para evitar que GitHub Pages conserve el `app.js` anterior.
- Se agregó un estado `Creando…` para evitar dobles clics.

## Para actualizar GitHub Pages
Sube/reemplaza estos archivos en la raíz del repositorio:
- `index.html`
- `styles.css`
- `app.js`
- `manifest.json`
- `service-worker.js`
- `README.md`
- carpeta `icons`

Después espera a que GitHub Pages termine el deployment y recarga la app.

## Firebase
Mantén Authentication y Firestore activos. Las reglas deben permitir que el owner cree el hogar y, una vez creado, cree su documento de miembro.
