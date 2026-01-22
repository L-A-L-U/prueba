const express = require('express');
const router = express.Router();
const pool = require('../database/db'); 

// --- HELPER PARA AUDITORIA ---
async function registrarLog(client, sucursal, usuario, modulo, accion, detalles) {
    try {
        const detStr = (typeof detalles === 'object') ? JSON.stringify(detalles) : detalles;
        const db = client || pool; 
        await db.query(
            `INSERT INTO logs_auditoria (sucursal_id, usuario_id, modulo, accion, detalles, fecha) VALUES ($1, $2, $3, $4, $5, NOW())`,
            [sucursal || 1, usuario || 1, modulo, accion, detStr]
        );
    } catch (e) { console.error("Error Log Finanzas:", e.message); }
}

// 1. REGISTRAR NUEVO GASTO
router.post('/gasto', async (req, res) => {
    try {
        const { sucursal_id, usuario_id, monto, descripcion, proveedor, tiene_factura, categoria, metodo_pago } = req.body;
        
        await pool.query(`
            INSERT INTO gastos (sucursal_id, usuario_id, monto, descripcion, proveedor, tiene_factura, categoria, metodo_pago, fecha, estatus)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 'aplicado')
        `, [sucursal_id, usuario_id || 1, monto, descripcion, proveedor || '', tiene_factura || false, categoria || 'General', metodo_pago || 'Efectivo']);

        // Auditoría
        const infoFactura = tiene_factura ? ' [CON FACTURA]' : '';
        await registrarLog(pool, sucursal_id, usuario_id, 'FINANZAS', 'NUEVO_GASTO', `Monto: -$${monto} | ${descripcion} (${proveedor})${infoFactura}`);

        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. OBTENER REPORTE DE GASTOS (CORREGIDO PARA CANCELADOS)
router.get('/reporte-gastos', async (req, res) => {
    try {
        const { sucursal_id, inicio, fin } = req.query;
        const fInicio = `${inicio} 00:00:00`;
        const fFin = `${fin} 23:59:59`;

        const r = await pool.query(`
            SELECT g.*, u.nombre as usuario
            FROM gastos g
            LEFT JOIN usuarios u ON g.usuario_id = u.id
            WHERE g.sucursal_id = $1 AND g.fecha BETWEEN $2 AND $3
            ORDER BY g.fecha DESC
        `, [sucursal_id, fInicio, fFin]);

        let total = 0;
        let deducible = 0;
        
        // Calculamos totales (IGNORANDO LOS CANCELADOS)
        r.rows.forEach(g => {
            if (g.estatus === 'cancelado') return; // Saltamos los cancelados en la suma

            const m = parseFloat(g.monto);
            total += m;
            if(g.tiene_factura) deducible += m;
        });

        res.json({ gastos: r.rows, totales: { total, deducible, no_deducible: total - deducible } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. CANCELAR GASTO (Soft Delete)
router.post('/gasto/borrar', async (req, res) => {
    try {
        const { id, usuario_id } = req.body; // Asegúrate de mandar usuario_id desde el front

        // 1. Datos previos para el log
        const info = await pool.query("SELECT * FROM gastos WHERE id = $1", [id]);
        const gasto = info.rows[0];

        // 2. MARCAR COMO CANCELADO (NO BORRAR)
        await pool.query("UPDATE gastos SET estatus = 'cancelado' WHERE id = $1", [id]);

        // 3. Auditoría
        if(gasto) {
            await registrarLog(pool, gasto.sucursal_id, usuario_id || 1, 'FINANZAS', 'CANCELAR_GASTO', `Canceló gasto de $${gasto.monto}: ${gasto.descripcion}`);
        }

        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ... (MANTENER LAS OTRAS RUTAS DE REPORTES SAT Y ARQUEO IGUAL QUE ANTES) ...
router.get('/reporte-sat-detallado', async (req, res) => { try { const { sucursal_id, inicio, fin } = req.query; const query = `SELECT to_char(o.fecha_creacion, 'DD/MM/YYYY') as fecha, o.folio, COALESCE(c.razon_social, c.nombre, 'Público General') as razon_social, COALESCE(c.rfc, 'XAXX010101000') as rfc, COALESCE(c.regimen_fiscal, '616') as regimen_fiscal, COALESCE(c.codigo_postal, '') as cp, COALESCE(c.uso_cfdi, 'S01') as uso_cfdi, o.metodo_pago as pago, o.subtotal, o.iva, o.total, (SELECT string_agg(d.cantidad || 'x ' || d.servicio || COALESCE(' ' || d.notas, ''), E'\n') FROM detalle_orden d WHERE d.orden_id = o.id) as detalle_productos FROM ordenes o LEFT JOIN clientes c ON o.cliente_id = c.id WHERE o.sucursal_id = $1 AND o.estatus != 'cancelada' AND o.fecha_creacion::date BETWEEN $2 AND $3 ORDER BY o.fecha_creacion ASC`; const r = await pool.query(query, [sucursal_id, inicio, fin]); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post('/arqueo', async (req, res) => { try { const { sucursal_id, monto_reportado, usuario_id } = req.body; const ingresos = await pool.query("SELECT COALESCE(SUM(monto),0) as t FROM pagos WHERE sucursal_id=$1 AND metodo_pago ILIKE '%efectivo%' AND DATE(fecha)=CURRENT_DATE", [sucursal_id]); const egresos = await pool.query("SELECT COALESCE(SUM(monto),0) as t FROM gastos WHERE sucursal_id=$1 AND estatus != 'cancelado' AND DATE(fecha)=CURRENT_DATE", [sucursal_id]); const conf = await pool.query("SELECT fondo_caja_default FROM configuracion WHERE sucursal_id=$1", [sucursal_id]); const fondo = parseFloat(conf.rows[0]?.fondo_caja_default || 0); const sistema = (fondo + parseFloat(ingresos.rows[0].t)) - parseFloat(egresos.rows[0].t); const diferencia = parseFloat(monto_reportado) - sistema; await registrarLog(pool, sucursal_id, usuario_id || 1, 'CAJA', 'ARQUEO', `Reportado: $${monto_reportado} | Diferencia: $${diferencia.toFixed(2)}`); res.json({ success: true, sistema, reportado: parseFloat(monto_reportado), diferencia }); } catch (e) { res.status(500).json({ error: e.message }); } });

module.exports = router;