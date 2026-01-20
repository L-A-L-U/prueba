const { Router } = require('express');
const router = Router();
const pool = require('../database/db');

// ====================================================================
// 🚨 RUTA DE REPARACIÓN DE EMERGENCIA (FUERZA BRUTA V2)
// ====================================================================
// VISITA ESTO: http://localhost:3000/api/admin/fuerza-bruta
router.get('/fuerza-bruta', async (req, res) => {
    let log = [];
    try {
        log.push("Iniciando reparación V2...");

        // 1. Agregar sucursal_id a CLIENTES
        try {
            await pool.query(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS sucursal_id INTEGER DEFAULT 1;`);
            log.push("✅ Columna 'sucursal_id' en CLIENTES.");
        } catch (err) { log.push(`⚠️ Clientes: ${err.message}`); }

        // 2. Agregar sucursal_id a INVENTARIO
        try {
            await pool.query(`ALTER TABLE inventario ADD COLUMN IF NOT EXISTS sucursal_id INTEGER DEFAULT 1;`);
            log.push("✅ Columna 'sucursal_id' en INVENTARIO.");
        } catch (err) { log.push(`⚠️ Inventario: ${err.message}`); }

        // 3. Agregar categoria a SERVICIOS
        try {
            await pool.query(`ALTER TABLE servicios ADD COLUMN IF NOT EXISTS categoria VARCHAR(50) DEFAULT 'General';`);
            log.push("✅ Columna 'categoria' en SERVICIOS.");
        } catch (err) { log.push(`⚠️ Servicios: ${err.message}`); }

        // 4. Agregar columnas FISCALES a ORDENES
        try {
            await pool.query(`ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS rfc_cliente VARCHAR(20);`);
            await pool.query(`ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS razon_social VARCHAR(150);`);
            await pool.query(`ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS regimen_fiscal VARCHAR(50);`);
            await pool.query(`ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS cp_fiscal VARCHAR(10);`);
            await pool.query(`ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS uso_cfdi VARCHAR(10);`);
            await pool.query(`ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS requiere_factura BOOLEAN DEFAULT false;`);
            log.push("✅ Columnas Fiscales en ORDENES.");
        } catch (err) { log.push(`⚠️ Ordenes Fiscal: ${err.message}`); }

        // 5. AGREGAR COLUMNAS DE DELIVERY (AQUÍ ESTABA TU ERROR)
        try {
            await pool.query(`ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS es_delivery BOOLEAN DEFAULT false;`);
            await pool.query(`ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS direccion_entrega TEXT;`);
            await pool.query(`ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS latitud VARCHAR(50);`);
            await pool.query(`ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS longitud VARCHAR(50);`);
            log.push("✅ Columnas Delivery (es_delivery) en ORDENES.");
        } catch (err) { log.push(`⚠️ Ordenes Delivery: ${err.message}`); }

        // 6. Crear tablas nuevas si no existen
        await pool.query(`CREATE TABLE IF NOT EXISTS logs_auditoria (id SERIAL PRIMARY KEY, usuario_id INTEGER, sucursal_id INTEGER, accion VARCHAR(50), detalle TEXT, ip VARCHAR(20), fecha TIMESTAMP DEFAULT NOW());`);
        await pool.query(`CREATE TABLE IF NOT EXISTS notas (id SERIAL PRIMARY KEY, sucursal_id INTEGER, mensaje TEXT NOT NULL, color VARCHAR(20) DEFAULT 'warning', creado_por VARCHAR(50), fecha TIMESTAMP DEFAULT NOW());`);
        
        res.send(`
            <div style="font-family: monospace; background: #222; color: #0f0; padding: 20px; line-height: 1.5;">
                <h1>REPORTE DE REPARACIÓN V2</h1>
                ${log.map(l => `<div>${l}</div>`).join('')}
                <br>
                <h2 style="color: #fff">LISTO. Intenta cobrar ahora.</h2>
                <a href="/" style="color: #fff; text-decoration: underline;">Volver al Inicio</a>
            </div>
        `);

    } catch (e) {
        res.status(500).send(`<h1>ERROR FATAL</h1><pre>${e.message}</pre>`);
    }
});

// --- EL RESTO DE TUS RUTAS NORMALES DE ADMIN ---

router.get('/auditoria', async (req, res) => {
    try {
        const r = await pool.query(`SELECT l.*, u.nombre as usuario FROM logs_auditoria l LEFT JOIN usuarios u ON l.usuario_id = u.id ORDER BY l.id DESC LIMIT 50`);
        res.json(r.rows);
    } catch (e) { res.json([]); }
});

router.get('/usuarios', async (req, res) => { try { const r = await pool.query("SELECT id, nombre, username, rol, sucursal_id FROM usuarios ORDER BY id DESC"); res.json(r.rows); } catch (e) { res.status(500).json({}); } });
router.post('/usuarios', async (req, res) => { try { await pool.query("INSERT INTO usuarios (nombre, username, password, rol, sucursal_id) VALUES ($1, $2, $3, $4, $5)", [req.body.nombre, req.body.username, req.body.password, req.body.rol, req.body.sucursal_id]); res.json({success:true}); } catch (e) { res.status(500).json({}); } });
router.delete('/usuarios/:id', async (req, res) => { try { await pool.query("DELETE FROM usuarios WHERE id=$1", [req.params.id]); res.json({success:true}); } catch(e){ res.status(500).json({}); } });

router.get('/servicios-admin', async (req, res) => { try { const r = await pool.query("SELECT * FROM servicios ORDER BY id ASC"); res.json(r.rows); } catch (e) { res.status(500).json({}); } });
router.post('/servicios', async (req, res) => { 
    try { await pool.query("INSERT INTO servicios (nombre, precio, categoria) VALUES ($1, $2, 'General')", [req.body.nombre, req.body.precio]); res.json({success:true}); } 
    catch (e) { try { await pool.query("INSERT INTO servicios (nombre, precio) VALUES ($1, $2)", [req.body.nombre, req.body.precio]); res.json({success:true}); } catch(e2) { res.status(500).json({ error: e2.message }); } } 
});
router.put('/servicios/:id', async (req, res) => { try { await pool.query("UPDATE servicios SET nombre=$1, precio=$2 WHERE id=$3", [req.body.nombre, req.body.precio, req.params.id]); res.json({success:true}); } catch(e){ res.status(500).json({}); } });
router.delete('/servicios/:id', async (req, res) => { try { await pool.query("DELETE FROM servicios WHERE id=$1", [req.params.id]); res.json({success:true}); } catch(e){ res.status(500).json({}); } });

router.get('/sucursales-crud', async (req, res) => { try { const r = await pool.query("SELECT * FROM sucursales ORDER BY id ASC"); res.json(r.rows); } catch (e) { res.status(500).json({}); } });
router.post('/sucursales', async (req, res) => { try { await pool.query("INSERT INTO sucursales (nombre, direccion, prefijo, latitud, longitud) VALUES ($1, $2, $3, $4, $5)", [req.body.nombre, req.body.direccion, req.body.prefijo, req.body.latitud, req.body.longitud]); res.json({success:true}); } catch (e) { res.status(500).json({}); } });
router.put('/sucursales/:id', async (req, res) => {
    try {
        const { nombre, direccion, prefijo, latitud, longitud, mensaje_footer } = req.body;
        await pool.query("UPDATE sucursales SET nombre=$1, direccion=$2, prefijo=$3, latitud=$4, longitud=$5, mensaje_footer=$6 WHERE id=$7", [nombre, direccion, prefijo, latitud, longitud, mensaje_footer, req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/sucursales/:id', async (req, res) => { try { await pool.query("DELETE FROM sucursales WHERE id=$1", [req.params.id]); res.json({success:true}); } catch(e){ res.status(500).json({}); } });

module.exports = router;