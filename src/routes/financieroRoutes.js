const express = require('express');
const router = express.Router();
const pool = require('../database/db');

router.get('/analytics', async (req, res) => {
    try {
        const v = await pool.query(`SELECT COALESCE(SUM(total), 0) as tot, COALESCE(SUM(CASE WHEN forma_pago='efectivo' THEN total ELSE 0 END), 0) as efec, COALESCE(SUM(CASE WHEN forma_pago!='efectivo' THEN total ELSE 0 END), 0) as banco, COUNT(*) as ord FROM ordenes WHERE sucursal_id=$1 AND fecha_creacion::date=CURRENT_DATE`, [req.query.sucursal_id]);
        let gas = 0; try { const g = await pool.query("SELECT accion FROM auditoria WHERE sucursal_id=$1 AND accion LIKE 'GASTO:%' AND fecha::date=CURRENT_DATE", [req.query.sucursal_id]); g.rows.forEach(r => { const p = r.accion.split('$'); if(p.length>1) gas += parseFloat(p[1].replace(/[^0-9.]/g, '')); }); } catch(e){}
        let sem=[], cat=[]; try { sem = (await pool.query("SELECT to_char(fecha_creacion, 'Dy') as dia, SUM(total) as total FROM ordenes WHERE sucursal_id=$1 AND fecha_creacion > CURRENT_DATE - INTERVAL '7 days' GROUP BY 1, fecha_creacion::date ORDER BY fecha_creacion::date ASC", [req.query.sucursal_id])).rows; cat = (await pool.query("SELECT COALESCE(i.categoria, 'General') as categoria, COUNT(*) as cantidad FROM detalle_orden d JOIN inventario i ON d.servicio = i.nombre JOIN ordenes o ON d.orden_id = o.id WHERE o.sucursal_id=$1 GROUP BY i.categoria LIMIT 5", [req.query.sucursal_id])).rows; } catch(e){}
        const d = v.rows[0];
        res.json({ kpis: { ingresos: parseFloat(d.tot), ingresos_efectivo: parseFloat(d.efec), ingresos_banco: parseFloat(d.banco), gastos: gas, utilidad: parseFloat(d.tot)-gas, ordenes_hoy: parseInt(d.ord) }, grafica_semana: sem, grafica_categorias: cat });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/corte-detallado', async (req, res) => {
    try {
        const resu = await pool.query(`SELECT COALESCE(SUM(total), 0) as tot, COALESCE(SUM(CASE WHEN forma_pago='efectivo' THEN total ELSE 0 END), 0) as efec, COALESCE(SUM(CASE WHEN forma_pago!='efectivo' THEN total ELSE 0 END), 0) as tar FROM ordenes WHERE sucursal_id=$1 AND fecha_creacion::date=$2`, [req.query.sucursal_id, req.query.fecha]);
        const gasR = await pool.query("SELECT accion, to_char(fecha, 'HH24:MI') as hora FROM auditoria WHERE sucursal_id=$1 AND accion LIKE 'GASTO:%' AND fecha::date=$2", [req.query.sucursal_id, req.query.fecha]);
        let totGas = 0; const lstGas = gasR.rows.map(g => { const p = g.accion.split('|'); const m = parseFloat(p[1].replace(/[^0-9.]/g, '')); totGas += m; return { hora: g.hora, concepto: p[0].replace('GASTO:', '').trim(), monto: m }; });
        const det = await pool.query(`SELECT o.folio, to_char(o.fecha_creacion, 'HH24:MI') as hora, c.nombre as cliente, o.total, o.forma_pago, (SELECT json_agg(json_build_object('cant', d.cantidad, 'serv', d.servicio)) FROM detalle_orden d WHERE d.orden_id = o.id) as items FROM ordenes o LEFT JOIN clientes c ON o.cliente_id = c.id WHERE o.sucursal_id=$1 AND o.fecha_creacion::date=$2 ORDER BY o.fecha_creacion DESC`, [req.query.sucursal_id, req.query.fecha]);
        res.json({ meta: { fecha: req.query.fecha }, financiero: { ingresos: parseFloat(resu.rows[0].tot), efectivo: parseFloat(resu.rows[0].efec), tarjeta: parseFloat(resu.rows[0].tar), gastos: totGas, caja_final: parseFloat(resu.rows[0].efec) - totGas }, gastos_lista: lstGas, ordenes_lista: det.rows });
    } catch(e) { res.status(500).json({ error: "Error corte" }); }
});

router.post('/arqueo', async (req, res) => {
    try {
        const ventas = await pool.query("SELECT COALESCE(SUM(total), 0) as efec FROM ordenes WHERE sucursal_id=$1 AND forma_pago='efectivo' AND fecha_creacion::date=CURRENT_DATE", [req.body.sucursal_id]);
        const gastos = await pool.query("SELECT accion FROM auditoria WHERE sucursal_id=$1 AND accion LIKE 'GASTO:%' AND fecha::date=CURRENT_DATE", [req.body.sucursal_id]);
        let totalGastos = 0; gastos.rows.forEach(r => { const p = r.accion.split('$'); if(p.length>1) totalGastos += parseFloat(p[1].replace(/[^0-9.]/g, '')); });
        const saldoSistema = parseFloat(ventas.rows[0].efec) - totalGastos;
        const diferencia = parseFloat(req.body.monto_reportado) - saldoSistema;
        await pool.query(`INSERT INTO auditoria (accion, sucursal_id, monto_reportado, diferencia) VALUES ($1, $2, $3, $4)`, [`CORTE CIEGO: Reportó $${req.body.monto_reportado} | Real $${saldoSistema}`, req.body.sucursal_id, req.body.monto_reportado, diferencia]);
        res.json({ success: true, diferencia, sistema: saldoSistema });
    } catch(e) { res.status(500).json({error: e.message}); }
});

router.get('/reporte-contador-sat', async (req, res) => {
    try { const r = await pool.query(`SELECT to_char(o.fecha_creacion, 'DD/MM/YYYY') as fecha, o.folio, o.forma_pago, COALESCE(c.rfc, 'XAXX010101000') as rfc, COALESCE(c.razon_social, c.nombre, 'PUBLICO') as razon_social, c.cp_fiscal, c.regimen_fiscal, c.uso_cfdi, o.subtotal, o.iva, o.total FROM ordenes o LEFT JOIN clientes c ON o.cliente_id = c.id WHERE o.sucursal_id=$1 AND o.requiere_factura=TRUE ORDER BY o.fecha_creacion DESC`, [req.query.sucursal_id]); res.json(r.rows); } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;