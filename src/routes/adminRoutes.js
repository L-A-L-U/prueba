const { Router } = require('express');
const router = Router();
const pool = require('../database/db');

// --- RUTA DE DEPURACIÓN PARA VER SI EL ARCHIVO SE ACTUALIZÓ ---
console.log("--> CARGANDO RUTAS DE ADMINISTRACIÓN NUEVAS (V2)");

// 1. INVENTARIO
router.get('/inventario', async (req, res) => {
    try {
        const { sucursal_id } = req.query;
        const r = await pool.query("SELECT * FROM inventario WHERE sucursal_id = $1 ORDER BY nombre ASC", [sucursal_id || 1]);
        res.json(r.rows);
    } catch (e) { res.status(500).json([]); }
});

router.post('/inventario/guardar', async (req, res) => {
    try {
        const { id, nombre, tipo, precio, stock, sucursal_id } = req.body;
        if(id) {
            await pool.query("UPDATE inventario SET nombre=$1, tipo=$2, precio=$3, stock=$4 WHERE id=$5", [nombre, tipo, precio, stock, id]);
        } else {
            await pool.query("INSERT INTO inventario (nombre, tipo, precio, stock, sucursal_id) VALUES ($1, $2, $3, $4, $5)", [nombre, tipo, precio, stock, sucursal_id]);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/inventario/borrar', async (req, res) => {
    try { await pool.query("DELETE FROM inventario WHERE id=$1", [req.body.id]); res.json({success:true}); } catch(e){ res.status(500).json({}); } 
});

// 2. SUCURSALES
router.get('/sucursales', async (req, res) => { try { const r = await pool.query("SELECT * FROM sucursales ORDER BY id ASC"); res.json(r.rows); } catch (e) { res.status(500).json({}); } });
router.post('/sucursales/guardar', async (req, res) => {
    try {
        const { id, nombre, direccion, prefijo } = req.body;
        if(id) { await pool.query("UPDATE sucursales SET nombre=$1, prefijo=$2 WHERE id=$3", [nombre, prefijo, id]); }
        else { await pool.query("INSERT INTO sucursales (nombre, direccion, prefijo) VALUES ($1, $2, $3)", [nombre, direccion || '', prefijo]); }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. USUARIOS
router.get('/usuarios', async (req, res) => { try { const r = await pool.query("SELECT id, nombre, username, rol, sucursal_id FROM usuarios ORDER BY id DESC"); res.json(r.rows); } catch (e) { res.status(500).json({}); } });
router.post('/usuarios/crear', async (req, res) => { try { await pool.query("INSERT INTO usuarios (nombre, username, password, rol, sucursal_id) VALUES ($1, $2, $3, $4, $5)", [req.body.nombre, req.body.usuario, req.body.password, req.body.rol, req.body.sucursal_id]); res.json({success:true}); } catch (e) { res.status(500).json({}); } });
router.post('/usuarios/borrar', async (req, res) => { try { await pool.query("DELETE FROM usuarios WHERE id=$1", [req.body.id]); res.json({success:true}); } catch(e){ res.status(500).json({}); } });

// =========================================================
// 4. CONFIGURACIÓN (AQUÍ ESTABA EL PROBLEMA)
// =========================================================
router.get('/config', async (req, res) => { 
    try { 
        const sucursal_id = parseInt(req.query.sucursal_id);
        if(!sucursal_id) return res.json({});
        const r = await pool.query("SELECT * FROM configuracion WHERE sucursal_id = $1", [sucursal_id]); 
        res.json(r.rows[0] || {}); 
    } catch (e) { res.json({}); } 
});

router.post('/config', async (req, res) => { 
    try { 
        const c = req.body;
        const sucursal_id = parseInt(c.sucursal_id); 

        // --- MENSAJE CHISMOSO PARA LA TERMINAL ---
        console.log(`✅ RECIBIDO SAVE PARA SUCURSAL ${sucursal_id}`);
        console.log(`   Header: ${c.ticket_header}`);
        console.log(`   Legal: ${c.ticket_legal}`);
        // -----------------------------------------

        if (!sucursal_id) return res.status(400).json({ error: "Falta ID Sucursal" });

        const existe = await pool.query("SELECT id FROM configuracion WHERE sucursal_id = $1", [sucursal_id]);
        
        if(existe.rows.length > 0) {
            // UPDATE COMPLETO (Incluyendo textos nuevos)
            await pool.query(`
                UPDATE configuracion SET 
                    ticket_header=$1, direccion=$2, telefono=$3, ticket_footer=$4, ticket_legal=$5, 
                    dias_entrega=$6, precio_kilo=$7, minimo_kilos=$8, fondo_caja_default=$9, dias_abandono=$10 
                WHERE sucursal_id=$11`, 
            [
                c.ticket_header, c.direccion, c.telefono, c.ticket_footer, c.ticket_legal, 
                parseInt(c.dias_entrega)||2, parseFloat(c.precio_kilo)||0, parseFloat(c.minimo_kilos)||0, 
                parseFloat(c.fondo_caja_default)||0, parseInt(c.dias_abandono)||30, 
                sucursal_id
            ]);
        } else {
            // INSERT COMPLETO
            await pool.query(`
                INSERT INTO configuracion (
                    sucursal_id, ticket_header, direccion, telefono, ticket_footer, ticket_legal, 
                    dias_entrega, precio_kilo, minimo_kilos, fondo_caja_default, dias_abandono
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
                sucursal_id, c.ticket_header, c.direccion, c.telefono, c.ticket_footer, c.ticket_legal, 
                parseInt(c.dias_entrega)||2, parseFloat(c.precio_kilo)||0, parseFloat(c.minimo_kilos)||0, 
                parseFloat(c.fondo_caja_default)||0, parseInt(c.dias_abandono)||30
            ]);
        }
        res.json({success:true}); 
    } catch(e){ 
        console.error("❌ ERROR AL GUARDAR:", e);
        res.status(500).json({error:e.message}); 
    } 
});

// 5. AUDITORIA, TURNOS Y CORTES
router.get('/auditoria', async (req, res) => { try { const r = await pool.query(`SELECT l.*, u.nombre as usuario FROM logs_auditoria l LEFT JOIN usuarios u ON l.usuario_id = u.id WHERE l.sucursal_id = $1 ORDER BY l.id DESC LIMIT 50`, [req.query.sucursal_id]); res.json(r.rows); } catch (e) { res.json([]); } });
router.get('/turno/activo', async (req, res) => { try { const r = await pool.query("SELECT * FROM turnos WHERE sucursal_id=$1 AND fecha_cierre IS NULL", [req.query.sucursal_id]); res.json(r.rows[0] || {}); } catch(e){ res.json({}); } });
router.post('/turno/abrir', async (req, res) => { try { await pool.query("INSERT INTO turnos (sucursal_id, usuario_id, fecha_apertura, fondo_inicial) VALUES ($1,$2,NOW(),$3)", [req.body.sucursal_id, req.body.usuario_id, req.body.fondo]); res.json({success:true}); } catch(e){ res.status(500).json({}); } });
router.get('/corte/preliminar', async (req, res) => { try { const pagos = await pool.query("SELECT SUM(monto) as total FROM pagos WHERE sucursal_id=$1 AND fecha >= CURRENT_DATE", [req.query.sucursal_id]); const gastos = await pool.query("SELECT SUM(monto) as total FROM gastos WHERE sucursal_id=$1 AND fecha >= CURRENT_DATE", [req.query.sucursal_id]); const fondo = await pool.query("SELECT fondo_caja_default FROM configuracion WHERE sucursal_id=$1", [req.query.sucursal_id]); const total = (parseFloat(pagos.rows[0].total)||0) - (parseFloat(gastos.rows[0].total)||0) + (parseFloat(fondo.rows[0].fondo_caja_default)||0); res.json({ esperado_en_caja: total }); } catch(e){ res.json({esperado_en_caja:0}); } });
router.post('/corte/cerrar', async (req, res) => { try { await pool.query("UPDATE turnos SET fecha_cierre=NOW(), monto_cierre=$1 WHERE sucursal_id=$2 AND fecha_cierre IS NULL", [req.body.monto_reportado, req.body.sucursal_id]); res.json({success:true, resumen:{nuevo_fondo:0}}); } catch(e){ res.status(500).json({}); } });

module.exports = router;