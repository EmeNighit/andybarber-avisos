// Configuración del proyecto Firebase andybarber-afb6e
const firebaseConfig={apiKey:"AIzaSyDVB5sr1XVN-xTl5rIT14nkXW3mEpbkcz8",authDomain:"andybarber-afb6e.firebaseapp.com",projectId:"andybarber-afb6e",storageBucket:"andybarber-afb6e.firebasestorage.app",messagingSenderId:"796405050871",appId:"1:796405050871:web:c0fefe46da8de608c5d2f2"};
// Correo con el que Andy entra al panel
const OWNER_EMAIL="esmerlynantoniocb@gmail.com";
// Correo del barbero (cuenta propia, creada en Firebase > Authentication). El administrador (OWNER_EMAIL) puede suspenderle el acceso.
const BARBER_EMAIL="andybarber.panel@gmail.com";
// Clave pública VAPID (Firebase > Configuración > Cloud Messaging > Certificados push web). Mientras diga PEGA..., los avisos push quedan apagados.
const VAPID_KEY="BKk-nSWLQluoJ_GFYrYIgHBZsluvuR2s23dJEMt4FBZ0SaOSmfhfRb1eust96n_m_RFSpMxqxjjHbuC0V8hKUjI";
// Clave pública de Google Cloud Fraud Defense (reCAPTCHA Enterprise) para Firebase App Check. No lleva clave secreta.
const APPCHECK_KEY="6LdCaSMuAAAAAM3lhJi1sDDxArBabtTUZ9Ohjwnn";
