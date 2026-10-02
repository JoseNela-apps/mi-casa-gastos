# Mi Casa · V6 PREMIUM FAMILY FINANCE

Rediseño visual completo, mobile-first.

## Incluye
- Inicio premium con gráfico mensual, balances y avatares familiares.
- Family Spaces por categoría.
- Estadística semanal.
- Mi Casa Insight calculado con datos reales.
- Saldos rediseñados con avatares.
- Actividad, Mes, Miembros y Admin adaptados al nuevo sistema visual.
- Fotos de perfil comprimidas, avatares prediseñados y color personal.
- Múltiples comprobantes + previsualización de fotos/PDF.
- ES/EN, PDF bilingüe, recurrentes, cierre mensual, Owner/Member.
- Service Worker V6 y aviso de actualización.
- Responsive real para iPhone/mobile y desktop.

## IMPORTANTE — regla de perfil
Esta versión incluye `FIREBASE_RULES_PROFILE_PATCH.txt` únicamente porque es NECESARIO para que un Member pueda cambiar su propia foto/avatar.
No reemplaza tus reglas completas: reemplaza solamente el bloque `members/{memberId}` indicado en el archivo.

Si no aplicas ese pequeño patch:
- Alberto/Owner podrá personalizar perfiles.
- Un Member normal verá el editor de su perfil, pero Firebase rechazará el guardado.

## Fotos
Para evitar Firebase Storage/Blaze, la foto se recorta y comprime en el navegador a 320x320 JPEG antes de guardarse en el documento del miembro.
Esto es adecuado para pequeños avatares de perfil. Los comprobantes conservan el sistema existente.

## Publicación
Sube/reemplaza:
- index.html
- app.js
- styles.css
- manifest.json
- service-worker.js
- update-notifier.js
- icons/icon.svg

README y FIREBASE_RULES_PROFILE_PATCH.txt son documentación y no necesitan publicarse en GitHub Pages para que la app funcione.
