const express = require('express');
const router = express.Router();
const pool = require('../database/db');

router.get('/', async (req, res) => {
    try {
        const { sucursal_id } = req.query;
        const result = await pool.query('SELECT * FROM clientes WHERE sucursal_id = $1 ORDER BY nombre ASC LIMIT 200', [sucursal_id || 1]);
        res.json(result.rows);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/buscar', async (req, res) => {
    try {
        const { q, sucursal_id } = req.query;
        if (!q) return res.json([]);
        const result = await pool.query("SELECT * FROM clientes WHERE sucursal_id = $1 AND (nombre ILIKE $2 OR telefono ILIKE $2) LIMIT 10", [sucursal_id, `%${q}%`]);
        res.json(result.rows);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/guardar', async (req, res) => {
    try {
        const { id, nombre, telefono, email, direccion_principal, rfc, regimen_fiscal, uso_cfdi, codigo_postal, sucursal_id } = req.body;
        let result;
        if (id) {
            result = await pool.query('UPDATE clientes SET nombre=$1, telefono=$2, email=$3, direccion_principal=$4, rfc=$5, regimen_fiscal=$6, uso_cfdi=$7, codigo_postal=$8 WHERE id=$9 RETURNING *',
                [nombre, telefono, email, direccion_principal, rfc, regimen_fiscal, uso_cfdi, codigo_postal, id]);
        } else {
            result = await pool.query('INSERT INTO clientes (nombre, telefono, email, direccion_principal, rfc, regimen_fiscal, uso_cfdi, codigo_postal, sucursal_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
                [nombre, telefono, email, direccion_principal, rfc, regimen_fiscal, uso_cfdi, codigo_postal, sucursal_id || 1]);
        }
        res.json(result.rows[0]);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;