# AndyBarber en Firebase (gratis)

## 1. Crear el proyecto (en console.firebase.google.com)
1. "Crear proyecto" -> nombre: andybarber (puedes desactivar Analytics).
2. Compilación > **Firestore Database** > Crear base de datos (modo producción).
3. Compilación > **Authentication** > Comenzar > activa estos dos métodos: **Anónimo** y **Correo/contraseña**.
4. En Authentication > Usuarios > "Agregar usuario": el correo y contraseña de Andy.
5. Configuración del proyecto (engranaje) > "Tus apps" > icono Web `</>` > registra la app y copia el objeto `firebaseConfig`.

## 2. Editar 3 cosas
- `firebase-config.js`: pega tu `firebaseConfig` y pon el correo de Andy en `OWNER_EMAIL`.
- `firestore.rules`: cambia `andy@ejemplo.com` por el mismo correo.
- En Firestore > Reglas: pega el contenido de `firestore.rules` y publica (o lo hace el comando de abajo).

## 3. Publicar (necesitas Node.js instalado: nodejs.org)
Abre una terminal DENTRO de esta carpeta y ejecuta:

    npm install -g firebase-tools
    firebase login
    firebase deploy

Ya incluye el proyecto (.firebaserc) y las reglas de seguridad: no hace falta firebase init ni pegar las reglas a mano.
Tu app queda en https://andybarber-afb6e.web.app (ese enlace es el que compartes y el del QR).

## 4. Instalar en el celular
- Android/Chrome: botón "Instalar AndyBarber" en el inicio, o menú > Instalar aplicación.
- iPhone/Safari: Compartir > Agregar a pantalla de inicio.

## Notas
- Andy entra con su correo y contraseña real (ya no hay contraseña escrita en el código).
- Los avisos con sonido funcionan con la app abierta; al entrar al panel, acepta el permiso de notificaciones.
- Los datos de la versión anterior (en claude.ai) no se pasan solos a Firebase.

## 5. Notificaciones y recordatorios automáticos (gratis, con GitHub)
Los avisos llegan al celular aunque la app esté cerrada: recordatorio ~2 horas y ~30 minutos antes de la cita, cita cancelada o con cambio propuesto (cliente) y cita nueva o cancelada (barbero). Se revisan cada 5 minutos, por eso pueden llegar con unos minutos de diferencia.

1. **Clave VAPID:** Firebase > Configuración del proyecto > pestaña **Cloud Messaging** > "Certificados push web" > **Generar par de claves**. Copia la clave y pégala en `firebase-config.js` en `VAPID_KEY`.
2. **Llave de servicio:** Firebase > Configuración del proyecto > pestaña **Cuentas de servicio** > **Generar nueva clave privada**. Se descarga un archivo .json. NO lo subas a ningún lado ni lo pongas en esta carpeta; es una contraseña.
3. **GitHub:** crea un repositorio **público** (github.com/new) y sube el contenido de esta carpeta (incluida la carpeta `notificar`). Si no se sube la carpeta oculta `.github`, crea el archivo a mano: Add file > Create new file, nombre `.github/workflows/recordatorios.yml`, y pega el contenido de `notificar/recordatorios.yml`.
4. En el repositorio: Settings > Secrets and variables > Actions > **New repository secret**. Nombre `FIREBASE_SERVICE_ACCOUNT`, valor: todo el contenido del .json del paso 2.
5. Pestaña **Actions** > acepta activarlas > "Recordatorios y avisos" > **Run workflow** para probar. Debe terminar en verde.
6. Publica la app otra vez: `firebase deploy` (sube también las reglas nuevas `push` y `bajas`).

Notas:
- El cliente debe aceptar el permiso de notificaciones (la app se lo exige al registrarse). En iPhone solo funciona con la app agregada a la pantalla de inicio (iOS 16.4 o más).
- El barbero recibe avisos de citas nuevas: entra al panel, acepta el permiso de notificaciones una vez.
- Si no pones la clave VAPID, la app funciona igual pero sin avisos push ni pantalla obligatoria.

## 6. Lista de espera
- Si actualizas desde la versión 0.4: sube a GitHub los archivos nuevos `notificar/logica.js` y `notificar/enviar.js` (reemplaza los anteriores) y haz `firebase deploy` (trae reglas nuevas para `espera`).
- Cuando alguien cancela y hay gente en la lista, el panel del barbero muestra el mensaje "¿Quieres poner ese espacio disponible...?". Mientras el barbero decide (máximo 3 horas) ese turno no se le muestra a otros clientes.
- A las 7:00 PM del día en que se anotaron, a quien siga en espera se le avisa que agende para mañana; si no agenda, sale solo de la lista al terminar el día siguiente. Esa limpieza la hace el programa de GitHub (cada ~5 minutos).
