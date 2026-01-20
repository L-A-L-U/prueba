const express = require('express');
const router = express.Router();
const pool = require('../database/db');

router.post('/nueva', async (req, res) => {
    const { sucursal_id, total, items } = req.body; // items = [{n: 'Lavado', p: 50}]
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // Calcular desglose fiscal
        const subtotal = total / 1.16;
        const iva = total - subtotal;
        const folio = `TK-${Date.now().toString().slice(-6)}`;

        // Insertar Orden
        const ordenRes = await client.query(`
            INSERT INTO ordenes (folio, total, subtotal, iva, sucursal_id)
            VALUES ($1, $2, $3, $4, $5) RETURNING id
        `, [folio, total, subtotal, iva, sucursal_id]);

        const ordenId = ordenRes.rows[0].id;

        // Insertar Detalles
        for (let item of items) {
            await client.query(`
                INSERT INTO detalle_orden (orden_id, servicio, cantidad, precio_unitario)
                VALUES ($1, $2, 1, $3)
            `, [ordenId, item.n, item.p]);
        }

        await client.query('COMMIT');
        res.json({ success: true, folio });

    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

module.exports = router;