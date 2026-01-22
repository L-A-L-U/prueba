const express = require('express');
const router = express.Router();
const pool = require('../database/db');

// --- HELPER PARA AUDITORIA ---
async function registrarLog(client, sucursal, usuario, modulo, accion, detalles) {
    try {
        const detStr = (typeof detalles === 'object') ? JSON.stringify(detalles) : detalles;
        // Soporte para cliente transaccional o pool directo
        const db = client || pool; 
        await db.query(
            `INSERT INTO logs_auditoria (sucursal_id, usuario_id, modulo, accion, detalles, fecha) VALUES ($1, $2, $3, $4, $5, NOW())`,
            [sucursal || 1, usuario || 1, modulo, accion, detStr]
        );
    } catch (e) { console.error("Error Log:", e.message); }
}

// =========================================================
// 1. INVENTARIO
// =========================================================
router.get('/inventario', async (req, res) => {
    try {
        const { sucursal_id } = req.query;
        const r = await pool.query("SELECT * FROM inventario WHERE sucursal_id = $1 ORDER BY nombre ASC", [sucursal_id || 1]);
        res.json(r.rows);
    } catch (e) { res.status(500).json([]); }
});

router.post('/inventario/guardar', async (req, res) => {
    try {
        const { id, nombre, tipo, precio, stock, sucursal_id, usuario_id } = req.body; 
        const logAccion = id ? 'EDITAR_PROD' : 'CREAR_PROD';
        
        if(id) {
            await pool.query("UPDATE inventario SET nombre=$1, tipo=$2, precio=$3, stock=$4 WHERE id=$5", [nombre, tipo, precio, stock, id]);
        } else {
            await pool.query("INSERT INTO inventario (nombre, tipo, precio, stock, sucursal_id) VALUES ($1, $2, $3, $4, $5)", [nombre, tipo, precio, stock, sucursal_id || 1]);
        }
        
        // AUDITORIA
        await registrarLog(pool, sucursal_id, usuario_id || 1, 'INVENTARIO', logAccion, `Producto: ${nombre} ($${precio})`);
        
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/inventario/borrar', async (req, res) => {
    try { 
        const info = await pool.query("SELECT nombre, sucursal_id FROM inventario WHERE id=$1", [req.body.id]);
        const prod = info.rows[0];
        
        await pool.query("DELETE FROM inventario WHERE id=$1", [req.body.id]);
        
        if(prod) await registrarLog(pool, prod.sucursal_id, req.body.usuario_id || 1, 'INVENTARIO', 'ELIMINAR_PROD', `Borró: ${prod.nombre}`);
        
        res.json({success:true}); 
    } catch(e){ res.status(500).json({}); } 
});

// =========================================================
// 2. CONFIGURACIÓN
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
        if (!sucursal_id) return res.status(400).json({ error: "Falta ID Sucursal" });

        const existe = await pool.query("SELECT id FROM configuracion WHERE sucursal_id = $1", [sucursal_id]);
        
        const vals = [c.ticket_header, c.direccion, c.telefono, c.ticket_footer, c.ticket_legal, parseInt(c.dias_entrega)||2, parseFloat(c.precio_kilo)||0, parseFloat(c.minimo_kilos)||0, parseFloat(c.fondo_caja_default)||0, parseInt(c.dias_abandono)||30, sucursal_id];

        if(existe.rows.length > 0) {
            await pool.query(`UPDATE configuracion SET ticket_header=$1, direccion=$2, telefono=$3, ticket_footer=$4, ticket_legal=$5, dias_entrega=$6, precio_kilo=$7, minimo_kilos=$8, fondo_caja_default=$9, dias_abandono=$10 WHERE sucursal_id=$11`, vals);
        } else {
            await pool.query(`INSERT INTO configuracion (sucursal_id, ticket_header, direccion, telefono, ticket_footer, ticket_legal, dias_entrega, precio_kilo, minimo_kilos, fondo_caja_default, dias_abandono) VALUES ($11,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, vals);
        }

        await registrarLog(pool, sucursal_id, c.usuario_id || 1, 'CONFIGURACION', 'MODIFICAR', `Cambio de parámetros globales`);

        res.json({success:true}); 
    } catch(e){ res.status(500).json({error:e.message}); } 
});

// =========================================================
// 3. USUARIOS
// =========================================================
router.get('/usuarios', async (req, res) => { try { const r = await pool.query("SELECT id, nombre, usuario, rol, sucursal_id FROM usuarios ORDER BY id DESC"); res.json(r.rows); } catch (e) { res.status(500).json([]); } });
router.post('/usuarios/crear', async (req, res) => { 
    try { 
        await pool.query("INSERT INTO usuarios (nombre, usuario, password, rol, sucursal_id) VALUES ($1, $2, $3, $4, $5)", [req.body.nombre, req.body.usuario, req.body.password, req.body.rol, req.body.sucursal_id]); 
        
        await registrarLog(pool, req.body.sucursal_id, 1, 'RRHH', 'CREAR_USUARIO', `Creó a: ${req.body.usuario} (${req.body.rol})`);
        res.json({success:true}); 
    } catch (e) { res.status(500).json({}); } 
});
router.post('/usuarios/borrar', async (req, res) => { 
    try { 
        await pool.query("DELETE FROM usuarios WHERE id=$1", [req.body.id]); 
        await registrarLog(pool, 1, 1, 'RRHH', 'BORRAR_USUARIO', `ID borrado: ${req.body.id}`);
        res.json({success:true}); 
    } catch(e){ res.status(500).json({}); } 
});

// =========================================================
// 4. SUCURSALES
// =========================================================
router.get('/sucursales', async (req, res) => { try { const r = await pool.query("SELECT * FROM sucursales ORDER BY id ASC"); res.json(r.rows); } catch (e) { res.status(500).json({}); } });
router.post('/sucursales/guardar', async (req, res) => {
    try {
        const { id, nombre, direccion, prefijo } = req.body;
        if(id) { await pool.query("UPDATE sucursales SET nombre=$1, prefijo=$2 WHERE id=$3", [nombre, prefijo, id]); }
        else { await pool.query("INSERT INTO sucursales (nombre, direccion, prefijo) VALUES ($1, $2, $3)", [nombre, direccion || '', prefijo]); }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// =========================================================
// 5. AUDITORÍA (Logs)
// =========================================================
router.get('/auditoria', async (req, res) => {
    try {
        let q = `SELECT l.*, u.nombre as usuario_nombre, s.nombre as sucursal_nombre 
                 FROM logs_auditoria l 
                 LEFT JOIN usuarios u ON l.usuario_id = u.id 
                 LEFT JOIN sucursales s ON l.sucursal_id = s.id`;
        const params = [];
        if(req.query.sucursal_id) {
            q += " WHERE l.sucursal_id = $1";
            params.push(req.query.sucursal_id);
        }
        q += " ORDER BY l.id DESC LIMIT 100";
        const r = await pool.query(q, params);
        res.json(r.rows);
    } catch (e) { res.json([]); }
});

// =========================================================
// 6. CAJA Y TURNOS (¡NUEVO SISTEMA PRO!) 🛡️💰
// =========================================================

// =========================================================
// 6. CAJA Y TURNOS (BLINDADO POR SUCURSAL) 🛡️💰
// =========================================================

// A) CONSULTAR ESTADO (Solo de MI sucursal)
router.get('/turno/estado', async (req, res) => {
    try {
        const { sucursal_id } = req.query;
        // ✅ FILTRO CRÍTICO: AND sucursal_id = $1
        const r = await pool.query("SELECT * FROM turnos WHERE sucursal_id = $1 AND estatus = 'abierto' ORDER BY id DESC LIMIT 1", [sucursal_id]);
        
        if (r.rows.length > 0) {
            res.json({ abierto: true, turno: r.rows[0] });
        } else {
            res.json({ abierto: false });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// B) ABRIR CAJA (Con registro OBLIGATORIO en Auditoría)
router.post('/turno/abrir', async (req, res) => {
    try {
        const { sucursal_id, usuario_id, monto_inicial } = req.body;
        
        // 1. Revisar si YA hay caja abierta
        const check = await pool.query("SELECT id FROM turnos WHERE sucursal_id = $1 AND estatus = 'abierto'", [sucursal_id]);
        if(check.rows.length > 0) return res.status(400).json({ error: 'Ya hay una caja abierta en esta sucursal' });

        // 2. Insertar el Turno en la base de datos
        await pool.query(
            "INSERT INTO turnos (sucursal_id, usuario_id_apertura, monto_inicial, estatus, fecha_apertura) VALUES ($1, $2, $3, 'abierto', NOW())",
            [sucursal_id, usuario_id, monto_inicial]
        );

        // 3. ✅ REGISTRAR EN AUDITORÍA (Esta es la parte que te faltaba)
        await registrarLog(
            pool, 
            sucursal_id, 
            usuario_id, 
            'CAJA', 
            'APERTURA', 
            `🟢 Caja Abierta. Fondo inicial: $${parseFloat(monto_inicial).toFixed(2)}`
        );

        res.json({ success: true });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: e.message }); 
    }
});

// C) CERRAR CAJA (Solo de MI sucursal y sumando SOLO mis ventas)
router.post('/turno/cerrar', async (req, res) => {
    const client = await pool.connect();
    try {
        const { sucursal_id, usuario_id, monto_reportado } = req.body; 
        await client.query('BEGIN');

        // 1. Obtener el turno abierto DE ESTA SUCURSAL
        const tQuery = await client.query("SELECT * FROM turnos WHERE sucursal_id = $1 AND estatus = 'abierto' LIMIT 1", [sucursal_id]);
        if(tQuery.rows.length === 0) throw new Error("No hay caja abierta para cerrar en esta sucursal");
        const turno = tQuery.rows[0];

        // 2. MATEMÁTICA FINANCIERA
        const inicial = parseFloat(turno.monto_inicial);

        // ✅ SUMAR VENTAS: Solo de ESTA sucursal y DESDE que se abrió este turno
        const ventasQ = await client.query(`
            SELECT COALESCE(SUM(monto),0) as total FROM pagos 
            WHERE sucursal_id = $1 
            AND metodo_pago ILIKE '%efectivo%' 
            AND fecha >= $2`, 
            [sucursal_id, turno.fecha_apertura]
        );
        const ventas = parseFloat(ventasQ.rows[0].total);

        // ✅ SUMAR GASTOS: Solo de ESTA sucursal y DESDE que se abrió
        const gastosQ = await client.query(`
            SELECT COALESCE(SUM(monto),0) as total FROM gastos 
            WHERE sucursal_id = $1 
            AND metodo_pago ILIKE '%efectivo%' 
            AND estatus != 'cancelado' 
            AND fecha >= $2`, 
            [sucursal_id, turno.fecha_apertura]
        );
        const gastos = parseFloat(gastosQ.rows[0].total);

        // 3. Comparación
        const esperado = (inicial + ventas) - gastos;
        const diferencia = parseFloat(monto_reportado) - esperado;

        // 4. Guardar Cierre (Registrando QUÉ usuario cerró)
        await client.query(`
            UPDATE turnos SET 
                fecha_cierre = NOW(), 
                usuario_id_cierre = $1, 
                monto_final_reportado = $2, 
                monto_sistema_calculado = $3, 
                diferencia = $4, 
                estatus = 'cerrado' 
            WHERE id = $5`,
            [usuario_id, monto_reportado, esperado, diferencia, turno.id]
        );

        // 5. Auditoría
        let veredicto = "✅ CUADRADO PERFECTO";
        if(diferencia < -1) veredicto = `🚨 FALTANTE DE $${Math.abs(diferencia).toFixed(2)}`;
        if(diferencia > 1) veredicto = `⚠️ SOBRANTE DE $${diferencia.toFixed(2)}`;

        await registrarLog(client, sucursal_id, usuario_id, 'CAJA', 'CIERRE_TURNO', 
            `Cierre: Reportó $${monto_reportado} | Sistema $${esperado.toFixed(2)} | ${veredicto}`
        );

        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            resultados: {
                esperado,
                reportado: parseFloat(monto_reportado),
                diferencia,
                ventas_turno: ventas,
                gastos_turno: gastos,
                inicial: inicial
            }
        });

    } catch (e) { 
        await client.query('ROLLBACK'); 
        res.status(500).json({ error: e.message }); 
    } finally { client.release(); }
});

module.exports = router;