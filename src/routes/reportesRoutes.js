const { Router } = require('express');
const router = Router();
const pool = require('../database/db');

// REPORTE PARA FACTURACIÓN (SOLICITUDES DE FACTURA)
router.get('/contadora', async (req, res) => {
    const { fecha_inicio, fecha_fin, sucursal_id } = req.query;
    
    const inicio = fecha_inicio ? `${fecha_inicio} 00:00:00` : new Date().toISOString().slice(0, 10);
    const fin = fecha_fin ? `${fecha_fin} 23:59:59` : new Date().toISOString().slice(0, 10);
    const sucId = sucursal_id || 1;

    try {
        // Seleccionamos solo las órdenes que marcaron "Requiere Factura"
        const r = await pool.query(`
            SELECT 
                TO_CHAR(created_at, 'DD/MM/YYYY') as fecha,
                folio,
                cliente_nombre as cliente,
                rfc_cliente as rfc,
                razon_social,
                total as monto,
                metodo_pago
            FROM ordenes 
            WHERE sucursal_id = $1 
            AND created_at BETWEEN $2 AND $3
            AND requiere_factura = true
            ORDER BY created_at ASC`, 
            [sucId, inicio, fin]
        );

        res.json({
            lista_facturas: r.rows
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/ventas', async (req, res) => {
    try {
        const { sucursal_id } = req.query;
        const r = await pool.query(`SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as dia, SUM(total) as venta FROM ordenes WHERE sucursal_id = $1 AND created_at > NOW() - INTERVAL '7 days' GROUP BY dia ORDER BY dia`, [sucursal_id || 1]);
        res.json(r.rows);
    } catch (e) { res.json([]); }
});

module.exports = router;