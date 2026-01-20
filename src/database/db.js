const { Pool } = require('pg');
require('dotenv').config();

// Configuración dinámica para soportar Local y Nube
const config = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
    // IMPORTANTE PARA GOOGLE CLOUD:
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
};

const pool = new Pool(config);

pool.on('connect', (client) => {
    // Forzar zona horaria de México para evitar desfases en reportes
    client.query("SET TIME ZONE 'America/Mexico_City'; SET lc_time = 'es_MX.UTF-8';")
        .catch(err => console.error('Error configurando TimeZone:', err.message));
});

// Manejo de errores de conexión global
pool.on('error', (err) => {
    console.error('🔴 Error inesperado en el Pool de BD:', err);
});

module.exports = pool;