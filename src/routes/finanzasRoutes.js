const express = require('express');
const router = express.Router();
const pool = require('../database/db'); // Verifica que la ruta a tu DB sea correcta

// Registrar un Gasto
router.post('/gasto', async (req, res) => {
    try {
        const { descripcion, monto, usuario_id, sucursal_id, categoria } = req.body;
        await pool.query(
            'INSERT INTO gastos (descripcion, monto, usuario_id, sucursal_id, categoria, fecha) VALUES ($1, $2, $3, $4, $5, NOW())',
            [descripcion, monto, usuario_id, sucursal_id, categoria || 'General']
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// NUEVA RUTA: Reporte SAT Detallado (Formato Contadora)
router.get('/reporte-sat-detallado', async (req, res) => {
    try {
        const { sucursal_id, inicio, fin } = req.query;
        
        // Query Avanzada: Une órdenes, clientes y agrupa los detalles en un solo texto
        const query = `
            SELECT 
                to_char(o.fecha_creacion, 'DD/MM/YYYY') as fecha, 
                o.folio, 
                COALESCE(c.razon_social, c.nombre, 'Público General') as razon_social, 
                COALESCE(c.rfc, 'XAXX010101000') as rfc, 
                COALESCE(c.regimen_fiscal, '616') as regimen_fiscal, 
                COALESCE(c.codigo_postal, '') as cp, 
                COALESCE(c.uso_cfdi, 'S01') as uso_cfdi,
                o.metodo_pago as pago,
                o.subtotal, 
                o.iva, 
                o.total,
                (
                    SELECT string_agg(d.cantidad || 'x ' || d.servicio || COALESCE(' ' || d.notas, ''), E'\n')
                    FROM detalle_orden d
                    WHERE d.orden_id = o.id
                ) as detalle_productos
            FROM ordenes o 
            LEFT JOIN clientes c ON o.cliente_id = c.id 
            WHERE o.sucursal_id = $1 
            AND o.estatus != 'cancelada' 
            AND o.fecha_creacion::date BETWEEN $2 AND $3 
            ORDER BY o.fecha_creacion ASC
        `;

        const r = await pool.query(query, [sucursal_id, inicio, fin]);
        res.json(r.rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Arqueo de Caja (Corte)
router.post('/arqueo', async (req, res) => {
    try {
        const { sucursal_id, monto_reportado } = req.body;
        
        // Calcular lo que el sistema cree que hay en efectivo hoy
        const ingresos = await pool.query("SELECT COALESCE(SUM(monto),0) as t FROM pagos WHERE sucursal_id=$1 AND metodo_pago ILIKE '%efectivo%' AND DATE(fecha)=CURRENT_DATE", [sucursal_id]);
        const egresos = await pool.query("SELECT COALESCE(SUM(monto),0) as t FROM gastos WHERE sucursal_id=$1 AND DATE(fecha)=CURRENT_DATE", [sucursal_id]);
        const conf = await pool.query("SELECT fondo_caja_default FROM configuracion WHERE sucursal_id=$1", [sucursal_id]);
        
        const fondo = parseFloat(conf.rows[0]?.fondo_caja_default || 0);
        const sistema = (fondo + parseFloat(ingresos.rows[0].t)) - parseFloat(egresos.rows[0].t);
        const diferencia = parseFloat(monto_reportado) - sistema;

        // Guardar la auditoría
        await pool.query("INSERT INTO auditoria (sucursal_id, accion, monto_reportado, diferencia, fecha) VALUES ($1, 'ARQUEO_CAJA', $2, $3, NOW())", [sucursal_id, monto_reportado, diferencia]);

        res.json({ success: true, sistema, reportado: parseFloat(monto_reportado), diferencia });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// NUEVA RUTA: Reporte SAT Detallado (Formato Contadora)
router.get('/reporte-sat-detallado', async (req, res) => {
    try {
        const { sucursal_id, inicio, fin } = req.query;
        
        // Query Avanzada: Une órdenes, clientes y agrupa los detalles en un solo texto
        const query = `
            SELECT 
                to_char(o.fecha_creacion, 'DD/MM/YYYY') as fecha, 
                o.folio, 
                COALESCE(c.razon_social, c.nombre, 'Público General') as razon_social, 
                COALESCE(c.rfc, 'XAXX010101000') as rfc, 
                COALESCE(c.regimen_fiscal, '616') as regimen_fiscal, 
                COALESCE(c.codigo_postal, '') as cp, 
                COALESCE(c.uso_cfdi, 'S01') as uso_cfdi,
                o.metodo_pago as pago,
                o.subtotal, 
                o.iva, 
                o.total,
                (
                    SELECT string_agg(d.cantidad || 'x ' || d.servicio || COALESCE(' ' || d.notas, ''), E'\n')
                    FROM detalle_orden d
                    WHERE d.orden_id = o.id
                ) as detalle_productos
            FROM ordenes o 
            LEFT JOIN clientes c ON o.cliente_id = c.id 
            WHERE o.sucursal_id = $1 
            AND o.estatus != 'cancelada' 
            AND o.fecha_creacion::date BETWEEN $2 AND $3 
            ORDER BY o.fecha_creacion ASC
        `;

        const r = await pool.query(query, [sucursal_id, inicio, fin]);
        res.json(r.rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router; // <--- ¡ESTO ES LO IMPORTANTE!