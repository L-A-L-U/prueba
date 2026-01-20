const express = require('express');
const router = express.Router();
const pool = require('../database/db');

router.post('/nueva', async (req, res) => {
    const client = await pool.connect();
    try {
        const { sucursal_id, usuario_id, cliente, items, opciones } = req.body;
        await client.query('BEGIN');

        let cliente_id_final;
        if (cliente.id) { cliente_id_final = cliente.id; } 
        else {
            const resNewCli = await client.query(`INSERT INTO clientes (nombre, telefono, direccion_principal, sucursal_id) VALUES ($1, $2, $3, $4) RETURNING id`, [cliente.nombre, cliente.telefono || null, cliente.direccion || '', sucursal_id]);
            cliente_id_final = resNewCli.rows[0].id;
        }

        const resCount = await client.query("SELECT COUNT(*) FROM ordenes WHERE sucursal_id = $1", [sucursal_id]);
        const nextId = parseInt(resCount.rows[0].count) + 1;
        const resConf = await client.query("SELECT prefijo FROM sucursales WHERE id = $1", [sucursal_id]);
        const prefijo = resConf.rows[0]?.prefijo || 'GRAL';
        const folio = `${prefijo}-${String(nextId).padStart(5, '0')}`;

        const totalItems = items.reduce((sum, i) => sum + (parseFloat(i.p) * (i.cantidad)), 0);
        const envio = parseFloat(opciones.costo_envio || 0);
        const total = totalItems + envio;

        let totalPagado = 0; let listaPagos = [];
        if (opciones.pagos_mixtos && Array.isArray(opciones.pagos_mixtos)) {
            opciones.pagos_mixtos.forEach(p => { if(parseFloat(p.monto)>0) { totalPagado+=parseFloat(p.monto); listaPagos.push(p); } });
        }

        const estado_pago = (totalPagado >= total - 0.5) ? 'pagado' : (totalPagado > 0 ? 'parcial' : 'pendiente');
        const metodoPrincipal = listaPagos.length > 0 ? (listaPagos.length > 1 ? 'mixto' : listaPagos[0].metodo) : 'pendiente';

        // Reemplaza el INSERT original con este:

        const resOrden = await client.query(`INSERT INTO ordenes (sucursal_id, usuario_id, cliente_id, folio, total, monto_pagado, estado_pago, estatus, tipo_entrega, direccion_entrega, metodo_pago, notas, fecha_creacion, solicita_factura, fecha_entrega) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendiente', $8, $9, $10, $11, NOW(), $12, $13) RETURNING id`, 
        [
            sucursal_id, 
            usuario_id||1, 
            cliente_id_final, 
            folio, 
            total, 
            totalPagado, 
            estado_pago, 
            opciones.entrega||'tienda', 
            opciones.direccion||'', 
            metodoPrincipal, 
            opciones.notas||'', 
            opciones.factura||false, 
            opciones.fecha_entrega // <--- AQUÍ ESTÁ EL CAMBIO IMPORTANTE ($13)
        ]
        );
        const orden_id = resOrden.rows[0].id;

        for (const item of items) {
            await client.query(`INSERT INTO detalle_orden (orden_id, servicio, cantidad, precio_unitario, subtotal, notas, detalles_json) VALUES ($1, $2, $3, $4, $5, $6, $7)`, 
                [orden_id, item.n, item.cantidad, item.p, (item.p*item.cantidad), item.nota, item.detalles?JSON.stringify(item.detalles):null]);
            
            // Descontar inventario (si es un producto real)
            if (item.id && ![999,666,888,777,99999].includes(item.id)) {
                 await client.query('UPDATE inventario SET stock = stock - $1 WHERE id = $2', [item.cantidad, item.id]).catch(()=>{});
            }
        }

        for (const pago of listaPagos) {
            await client.query(`INSERT INTO pagos (orden_id, sucursal_id, usuario_id, monto, metodo_pago, tipo, fecha) VALUES ($1, $2, $3, $4, $5, 'anticipo', NOW())`, [orden_id, sucursal_id, usuario_id||1, pago.monto, pago.metodo]);
        }

        await client.query('COMMIT');
        res.json({ success: true, folio });
    } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

router.post('/editar', async (req, res) => {
    const client = await pool.connect();
    try {
        const { orden_id, items, opciones } = req.body;
        await client.query('BEGIN');

        // 1. DEVOLVER STOCK ANTERIOR
        const itemsViejos = await client.query("SELECT * FROM detalle_orden WHERE orden_id = $1", [orden_id]);
        for(const viejo of itemsViejos.rows) {
             // Buscamos el ID por nombre para devolver stock correctamente
             const inv = await client.query("SELECT id FROM inventario WHERE nombre = $1", [viejo.servicio]);
             if(inv.rows.length > 0) {
                 await client.query("UPDATE inventario SET stock = stock + $1 WHERE id = $2", [viejo.cantidad, inv.rows[0].id]);
             }
        }

        // 2. BORRAR DETALLES VIEJOS
        await client.query("DELETE FROM detalle_orden WHERE orden_id = $1", [orden_id]);

        // 3. RECALCULAR
        const totalItems = items.reduce((sum, i) => sum + (parseFloat(i.p) * (i.cantidad)), 0);
        const envio = parseFloat(opciones.costo_envio || 0);
        const totalNuevo = totalItems + envio;

        const infoOrden = await client.query("SELECT monto_pagado FROM ordenes WHERE id=$1", [orden_id]);
        const pagado = parseFloat(infoOrden.rows[0].monto_pagado);
        const estado_pago = (pagado >= totalNuevo - 0.5) ? 'pagado' : (pagado > 0 ? 'parcial' : 'pendiente');

        await client.query(`UPDATE ordenes SET total = $1, estado_pago = $2, tipo_entrega = $3, direccion_entrega = $4, notas = $5, solicita_factura = $6 WHERE id = $7`, 
            [totalNuevo, estado_pago, opciones.entrega, opciones.direccion, opciones.notas, opciones.factura, orden_id]);

        // 4. INSERTAR NUEVOS Y DESCONTAR STOCK
        for (const item of items) {
            await client.query(`INSERT INTO detalle_orden (orden_id, servicio, cantidad, precio_unitario, subtotal, notas, detalles_json) VALUES ($1, $2, $3, $4, $5, $6, $7)`, 
                [orden_id, item.n, item.cantidad, item.p, (item.p*item.cantidad), item.nota, item.detalles?JSON.stringify(item.detalles):null]);

            // Descontar: Si tiene ID válido (evitamos 99999 si no es real)
            if (item.id && ![999,666,888,777,99999].includes(item.id)) {
                 await client.query('UPDATE inventario SET stock = stock - $1 WHERE id = $2', [item.cantidad, item.id]).catch(()=>{});
            }
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

router.post('/cancelar', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id, motivo } = req.body;
        await client.query('BEGIN');
        const items = await client.query("SELECT * FROM detalle_orden WHERE orden_id = $1", [id]);
        for(const item of items.rows) {
             const inv = await client.query("SELECT id FROM inventario WHERE nombre = $1", [item.servicio]);
             if(inv.rows.length > 0) {
                 await client.query("UPDATE inventario SET stock = stock + $1 WHERE id = $2", [item.cantidad, inv.rows[0].id]);
             }
        }
        await client.query(`UPDATE ordenes SET estatus = 'cancelada', notas = notas || ' [CANCELADA: ' || $2 || ']' WHERE id = $1`, [id, motivo || 'Sin motivo']);
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

// REPORTES Y LISTADOS
router.get('/listado', async (req, res) => { 
    try { 
        const mostrarCanceladas = req.query.ver_canceladas === 'true';
        let query = `SELECT o.*, c.nombre as cliente, c.telefono, c.direccion_principal, (o.total - o.monto_pagado) as saldo FROM ordenes o JOIN clientes c ON o.cliente_id = c.id WHERE o.sucursal_id = $1 `;
        if (!mostrarCanceladas) { query += ` AND o.estatus != 'cancelada' `; }
        query += ` ORDER BY o.id DESC LIMIT 150`;
        const r = await pool.query(query, [req.query.sucursal_id]); 
        res.json(r.rows); 
    } catch (e) { res.status(500).json({ error: e.message }); } 
});

router.get('/reporte-completo', async (req, res) => {
    try {
        const { sucursal_id, inicio, fin } = req.query;
        // Fix de fechas para reporte
        const fInicio = `${inicio} 00:00:00`;
        const fFin = `${fin} 23:59:59`;
        
        const ingresosQ = await pool.query(`SELECT p.fecha, p.monto as abono, UPPER(p.metodo_pago) as metodo_pago, o.folio, o.total as total_orden, (o.total - o.monto_pagado) as deuda_actual, COALESCE(c.nombre, 'Público') as cliente FROM pagos p LEFT JOIN ordenes o ON p.orden_id = o.id LEFT JOIN clientes c ON o.cliente_id = c.id WHERE p.sucursal_id = $1 AND o.estatus != 'cancelada' AND p.fecha BETWEEN $2 AND $3 ORDER BY p.fecha DESC`, [sucursal_id, fInicio, fFin]);
        
        let egresos = []; try { const eq = await pool.query(`SELECT * FROM gastos WHERE sucursal_id = $1 AND fecha BETWEEN $2 AND $3`, [sucursal_id, fInicio, fFin]); egresos = eq.rows; } catch (err) {}
        
        let totalIngresos = 0; let porMetodo = { efectivo: 0, tarjeta: 0, transferencia: 0, otros: 0 };
        ingresosQ.rows.forEach(i => { 
            const m = parseFloat(i.abono)||0; const met = (i.metodo_pago||'').toLowerCase(); 
            totalIngresos+=m; 
            if(met.includes('efectivo')) porMetodo.efectivo+=m; 
            else if(met.includes('tarjeta')) porMetodo.tarjeta+=m; 
            else if(met.includes('transferencia')) porMetodo.transferencia+=m; 
            else porMetodo.otros+=m; 
        });
        const totalEgresos = egresos.reduce((s, e) => s + parseFloat(e.monto), 0);
        const conf = await pool.query("SELECT fondo_caja_default FROM configuracion WHERE sucursal_id=$1", [sucursal_id]);
        
        res.json({ balance: { ingresos_totales: totalIngresos, egresos_totales: totalEgresos, utilidad: totalIngresos - totalEgresos, caja_teorica: ((parseFloat(conf.rows[0]?.fondo_caja_default)||0) + porMetodo.efectivo) - totalEgresos, desglose: porMetodo }, movimientos: { ingresos: ingresosQ.rows, egresos: egresos } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// OTROS
router.get('/reporte-fiscal', async (req, res) => { try { const { sucursal_id, inicio, fin } = req.query; const r = await pool.query(`SELECT to_char(o.fecha_creacion, 'DD/MM/YYYY') as fecha, o.folio, o.total, o.metodo_pago, c.nombre as razon_social, c.rfc, c.regimen_fiscal, c.codigo_postal as cp_fiscal, c.uso_cfdi FROM ordenes o JOIN clientes c ON o.cliente_id = c.id WHERE o.sucursal_id = $1 AND o.solicita_factura = TRUE AND o.estatus != 'cancelada' AND o.fecha_creacion BETWEEN $2 AND $3 ORDER BY o.fecha_creacion ASC`, [sucursal_id, `${inicio} 00:00:00`, `${fin} 23:59:59`]); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/:id/detalles', async (req, res) => { try { const r = await pool.query('SELECT * FROM detalle_orden WHERE orden_id = $1', [req.params.id]); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/:folio/full', async (req, res) => { try { const { folio } = req.params; const info = await pool.query("SELECT o.*, c.nombre as cliente, c.telefono, c.direccion_principal as direccion_entrega, to_char(o.fecha_creacion, 'DD/MM/YYYY HH24:MI') as fecha_fmt FROM ordenes o JOIN clientes c ON o.cliente_id = c.id WHERE o.folio = $1", [folio]); if(info.rows.length === 0) return res.status(404).json({error: 'No existe'}); const items = await pool.query("SELECT * FROM detalle_orden WHERE orden_id = $1", [info.rows[0].id]); res.json({ info: info.rows[0], items: items.rows }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post('/liquidar', async (req, res) => { try { const { orden_id, monto, metodo_pago, usuario_id, sucursal_id } = req.body; await pool.query(`UPDATE ordenes SET monto_pagado = monto_pagado + $1, estado_pago = CASE WHEN (monto_pagado + $1) >= total THEN 'pagado' ELSE 'parcial' END WHERE id = $2`, [monto, orden_id]); await pool.query('INSERT INTO pagos (orden_id, sucursal_id, usuario_id, monto, metodo_pago, tipo, fecha) VALUES ($1, $2, $3, $4, $5, $6, NOW())', [orden_id, sucursal_id, usuario_id || 1, monto, metodo_pago, 'liquidacion']); res.json({ success: true }); } catch (error) { res.status(500).json({ error: error.message }); } });
router.post('/estatus', async (req, res) => { try { const { id, estatus } = req.body; await pool.query('UPDATE ordenes SET estatus = $1 WHERE id = $2', [estatus, id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

module.exports = router;