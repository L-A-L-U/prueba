const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// --- 1. CONFIGURACIÓN DB ---
let setupDB;
try {
    setupDB = require('./src/database/setup');
} catch (e) {
    console.error("⚠️  ALERTA: No se encontró el archivo 'src/database/setup.js'");
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// --- 2. DETECTOR DE RUTAS ROTAS ---
// Vamos a intentar cargar cada archivo uno por uno.
// Si uno falla, el servidor NO se caerá, solo te avisará.

function cargarRuta(nombre, pathArchivo, url) {
    try {
        const ruta = require(pathArchivo);
        
        // Verificamos si el archivo exportó algo válido
        if (typeof ruta === 'function' || (ruta && typeof ruta.handle === 'function')) {
            app.use(url, ruta);
            console.log(`✅ ${nombre}: Cargado correctamente`);
        } else {
            console.log(`❌ ${nombre}: EL ARCHIVO EXISTE PERO ESTÁ VACÍO O NO EXPORTA EL ROUTER.`);
            console.log(`   Solución: Agrega 'module.exports = router;' al final de ${pathArchivo}.js`);
        }
    } catch (error) {
        console.log(`🔥 ${nombre}: NO SE ENCONTRÓ EL ARCHIVO.`);
        console.log(`   Buscando en: ${pathArchivo}`);
        console.log(`   Error real: ${error.message}`);
    }
}

console.log('\n--- INICIANDO CARGA DE RUTAS ---');

// Intentamos cargar las 5 rutas vitales
cargarRuta('Auth',      './src/routes/authRoutes',     '/api/auth');
cargarRuta('Ordenes',   './src/routes/ordenesRoutes',  '/api/ordenes');
cargarRuta('Gestion',   './src/routes/gestionRoutes',  '/api/gestion');
cargarRuta('Finanzas',  './src/routes/finanzasRoutes', '/api/finanzas');
cargarRuta('Clientes',  './src/routes/clientesRoutes', '/api/clientes');

console.log('--------------------------------\n');

// --- 3. RUTA PRINCIPAL ---
app.get('/', (req, res) => {
    // Intenta servir el login, si falla manda un mensaje simple
    if (require('fs').existsSync(path.join(__dirname, 'login.html'))) {
        res.sendFile(path.join(__dirname, 'login.html'));
    } else {
        res.send('<h1>Sistema Lavandería</h1><p>Falta el archivo login.html</p>');
    }
});

// --- 4. ENCENDER SERVIDOR ---
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
    if (setupDB) await setupDB();
    console.log(`🚀 SERVIDOR ENCENDIDO EN: http://localhost:${PORT}`);
    console.log(`(Si ves alguna ❌ arriba, ese es el archivo que debes corregir)`);
});