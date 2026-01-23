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
    } catch (e) { console.error("Error Log:", e.message); }
}

// =========================================================
// 1. NUEVA VENTA
// =========================================================
router.post('/nueva', async (req, res) => {
    const client = await pool.connect();
    try {
        const { sucursal_id, usuario_id, cliente, items, opciones } = req.body;
        await client.query('BEGIN');

        if(!sucursal_id) throw new Error("Falta sucursal_id");

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

        const resOrden = await client.query(`
            INSERT INTO ordenes (
                sucursal_id, usuario_id, cliente_id, folio, total, monto_pagado, 
                estado_pago, estatus, tipo_entrega, direccion_entrega, metodo_pago, 
                notas, fecha_creacion, solicita_factura, fecha_entrega, horario_entrega
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendiente', $8, $9, $10, $11, NOW(), $12, $13, $14) RETURNING id`, 
            [sucursal_id, usuario_id||1, cliente_id_final, folio, total, totalPagado, estado_pago, opciones.entrega||'tienda', opciones.direccion||'', metodoPrincipal, opciones.notas||'', opciones.factura||false, opciones.fecha_entrega, opciones.horario_entrega]
        );
        const orden_id = resOrden.rows[0].id;

        for (const item of items) {
            await client.query(`INSERT INTO detalle_orden (orden_id, servicio, cantidad, precio_unitario, subtotal, notas, detalles_json) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [orden_id, item.n, item.cantidad, item.p, (item.p*item.cantidad), item.nota, item.detalles?JSON.stringify(item.detalles):null]);
            if (item.id && ![999,666,888,777,99999].includes(item.id)) { await client.query('UPDATE inventario SET stock = stock - $1 WHERE id = $2', [item.cantidad, item.id]).catch(()=>{}); }
        }

        for (const pago of listaPagos) {
            await client.query(`INSERT INTO pagos (orden_id, sucursal_id, usuario_id, monto, metodo_pago, tipo, fecha, cliente_id) VALUES ($1, $2, $3, $4, $5, 'anticipo', NOW(), $6)`, 
            [orden_id, sucursal_id, usuario_id||1, pago.monto, pago.metodo, cliente_id_final]);
        }

        await registrarLog(client, sucursal_id, usuario_id, 'VENTAS', 'NUEVA_ORDEN', `Folio: ${folio} | Total: $${total}`);
        await client.query('COMMIT');
        res.json({ success: true, folio });
    } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

// =========================================================
// 2. EDITAR ORDEN
// =========================================================
router.post('/editar', async (req, res) => {
    const client = await pool.connect();
    try {
        const { orden_id, items, opciones } = req.body;
        await client.query('BEGIN');

        const itemsViejos = await client.query("SELECT * FROM detalle_orden WHERE orden_id = $1", [orden_id]);
        for(const viejo of itemsViejos.rows) {
             const inv = await client.query("SELECT id FROM inventario WHERE nombre = $1", [viejo.servicio]);
             if(inv.rows.length > 0) { await client.query("UPDATE inventario SET stock = stock + $1 WHERE id = $2", [viejo.cantidad, inv.rows[0].id]); }
        }
        await client.query("DELETE FROM detalle_orden WHERE orden_id = $1", [orden_id]);

        const totalItems = items.reduce((sum, i) => sum + (parseFloat(i.p) * (i.cantidad)), 0);
        const envio = parseFloat(opciones.costo_envio || 0);
        const totalNuevo = totalItems + envio;
        const infoOrden = await client.query("SELECT monto_pagado, sucursal_id FROM ordenes WHERE id=$1", [orden_id]);
        const pagado = parseFloat(infoOrden.rows[0].monto_pagado);
        const sucursal_id = infoOrden.rows[0].sucursal_id;
        const estado_pago = (pagado >= totalNuevo - 0.5) ? 'pagado' : (pagado > 0 ? 'parcial' : 'pendiente');

        await client.query(`UPDATE ordenes SET total = $1, estado_pago = $2, tipo_entrega = $3, direccion_entrega = $4, notas = $5, solicita_factura = $6, fecha_entrega = $8, horario_entrega = $9 WHERE id = $7`, 
            [totalNuevo, estado_pago, opciones.entrega, opciones.direccion, opciones.notas, opciones.factura, orden_id, opciones.fecha_entrega, opciones.horario_entrega]);

        for (const item of items) {
            await client.query(`INSERT INTO detalle_orden (orden_id, servicio, cantidad, precio_unitario, subtotal, notas, detalles_json) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [orden_id, item.n, item.cantidad, item.p, (item.p*item.cantidad), item.nota, item.detalles?JSON.stringify(item.detalles):null]);
            if (item.id && ![999,666,888,777,99999].includes(item.id)) { await client.query('UPDATE inventario SET stock = stock - $1 WHERE id = $2', [item.cantidad, item.id]).catch(()=>{}); }
        }
        
        await registrarLog(client, sucursal_id, 1, 'VENTAS', 'EDITAR_ORDEN', `Orden ID ${orden_id} editada. Nuevo Total: $${totalNuevo}`);
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

// =========================================================
// 3. ESTATUS, LIQUIDAR Y CANCELAR
// =========================================================
router.post('/estatus', async (req, res) => {
    try {
        const { id, estatus } = req.body;
        const info = await pool.query("SELECT sucursal_id, folio FROM ordenes WHERE id = $1", [id]);
        const sucID = info.rows[0]?.sucursal_id || 1;
        const folio = info.rows[0]?.folio || '';

        if (estatus === 'entregado') {
            await pool.query("UPDATE ordenes SET estatus = $1, fecha_real_entrega = NOW() WHERE id = $2", [estatus, id]);
        } else {
            await pool.query("UPDATE ordenes SET estatus = $1 WHERE id = $2", [estatus, id]);
        }
        await registrarLog(pool, sucID, 1, 'PROCESOS', 'CAMBIO_ESTATUS', `Orden ${folio} -> ${estatus}`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/liquidar', async (req, res) => { 
    try { 
        const { orden_id, monto, metodo_pago, usuario_id, sucursal_id } = req.body; 
        const info = await pool.query("SELECT cliente_id, folio FROM ordenes WHERE id = $1", [orden_id]);
        const clienteReal = info.rows[0]?.cliente_id;
        const folio = info.rows[0]?.folio;

        await pool.query(`UPDATE ordenes SET monto_pagado = monto_pagado + $1, estado_pago = CASE WHEN (monto_pagado + $1) >= total THEN 'pagado' ELSE 'parcial' END WHERE id = $2`, [monto, orden_id]); 
        await pool.query('INSERT INTO pagos (orden_id, sucursal_id, usuario_id, monto, metodo_pago, tipo, fecha, cliente_id) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)', 
            [orden_id, sucursal_id, usuario_id || 1, monto, metodo_pago, 'liquidacion', clienteReal]); 

        await registrarLog(pool, sucursal_id, usuario_id, 'FINANZAS', 'COBRO_DEUDA', `Cobrado $${monto} de Orden ${folio}`);
        res.json({ success: true }); 
    } catch (error) { res.status(500).json({ error: error.message }); } 
});

router.post('/cancelar', async (req, res) => { 
    try { 
        const { id, motivo, usuario_id } = req.body;
        const info = await pool.query("SELECT sucursal_id, folio FROM ordenes WHERE id=$1", [id]);
        
        await pool.query(`UPDATE ordenes SET estatus = 'cancelada', notas = notas || ' [CANCELADA: ' || $2 || ']' WHERE id = $1`, [id, motivo]); 
        
        if(info.rows.length > 0) {
            await registrarLog(pool, info.rows[0].sucursal_id, usuario_id || 1, 'VENTAS', 'CANCELAR', `Orden ${info.rows[0].folio}. Motivo: ${motivo}`);
        }
        res.json({ success: true }); 
    } catch (e) { res.status(500).json({ error: e.message }); } 
});

// =========================================================
// 4. REPORTES Y LISTADOS
// =========================================================
router.get('/reporte-completo', async (req, res) => {
    try {
        const { sucursal_id, inicio, fin } = req.query;
        const fInicio = `${inicio} 00:00:00`;
        const fFin = `${fin} 23:59:59`;
        
        const ingresosQ = await pool.query(`
            SELECT p.fecha, p.monto as abono, UPPER(p.metodo_pago) as metodo_pago, 
            o.folio, o.estatus, o.total as total_orden, (o.total - o.monto_pagado) as deuda_actual, 
            COALESCE(c_pago.nombre, c_orden.nombre, 'Público General') as cliente 
            FROM pagos p 
            LEFT JOIN ordenes o ON p.orden_id = o.id 
            LEFT JOIN clientes c_orden ON o.cliente_id = c_orden.id
            LEFT JOIN clientes c_pago ON p.cliente_id = c_pago.id
            WHERE p.sucursal_id = $1 AND p.fecha BETWEEN $2 AND $3 
            ORDER BY p.fecha DESC`, [sucursal_id, fInicio, fFin]
        );

        const canceladasQ = await pool.query(`
            SELECT o.fecha_creacion as fecha, 0 as abono, 'CANCELADO' as metodo_pago, 
            o.folio, 'cancelada' as estatus, o.total as total_orden, 0 as deuda_actual, 
            COALESCE(c.nombre, 'Público General') as cliente 
            FROM ordenes o LEFT JOIN clientes c ON o.cliente_id = c.id
            WHERE o.sucursal_id = $1 AND o.estatus = 'cancelada' 
            AND o.fecha_creacion BETWEEN $2 AND $3
            AND NOT EXISTS (SELECT 1 FROM pagos p WHERE p.orden_id = o.id)
        `, [sucursal_id, fInicio, fFin]);
        
        const listaFinal = [...ingresosQ.rows, ...canceladasQ.rows];
        listaFinal.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        let egresos = []; 
        try { 
            const eq = await pool.query(`SELECT * FROM gastos WHERE sucursal_id = $1 AND fecha BETWEEN $2 AND $3`, [sucursal_id, fInicio, fFin]); 
            egresos = eq.rows; 
        } catch (err) {}
        
        let totalIngresos = 0; 
        let porMetodo = { efectivo: 0, tarjeta: 0, transferencia: 0, otros: 0 };
        
        listaFinal.forEach(i => { 
            if (i.estatus === 'cancelada') return;
            const m = parseFloat(i.abono)||0; 
            const met = (i.metodo_pago||'').toLowerCase(); 
            totalIngresos += m; 
            if(met.includes('efectivo')) porMetodo.efectivo+=m; 
            else if(met.includes('tarjeta')) porMetodo.tarjeta+=m; 
            else if(met.includes('transferencia')) porMetodo.transferencia+=m; 
            else porMetodo.otros+=m; 
        });

        const totalEgresos = egresos.reduce((s, e) => {
            return s + (e.estatus === 'cancelado' ? 0 : parseFloat(e.monto));
        }, 0);
        
        res.json({ 
            balance: { 
                ingresos_totales: totalIngresos, 
                egresos_totales: totalEgresos, 
                utilidad: totalIngresos - totalEgresos, 
                desglose: porMetodo 
            }, 
            movimientos: { ingresos: listaFinal, egresos: egresos } 
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/listado', async (req, res) => { try { const r = await pool.query(`SELECT o.*, c.nombre as cliente, c.telefono, c.direccion_principal, (o.total - o.monto_pagado) as saldo FROM ordenes o JOIN clientes c ON o.cliente_id = c.id WHERE o.sucursal_id = $1 ORDER BY o.id DESC LIMIT 150`, [req.query.sucursal_id]); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });

// =========================================================
// RASTREO CON CHISMOSOS 🕵️‍♂️
// =========================================================
router.get('/rastreo/:busqueda', async (req, res) => {
    try {
        const { busqueda } = req.params;
        const { sucursal_id } = req.query;
        const termino = `%${busqueda}%`;

        console.log("--------------------------------------------------");
        console.log("👀 CHISMOSO BACKEND: Iniciando búsqueda...");
        console.log(`🔎 Término: "${busqueda}"`);
        console.log(`🏢 Sucursal ID: ${sucursal_id}`);

        // SQL
        const sql = `
            SELECT o.*, c.nombre AS cliente_nombre 
            FROM ordenes o
            LEFT JOIN clientes c ON o.cliente_id = c.id
            WHERE o.sucursal_id = $1 
            AND (
                CAST(o.folio AS TEXT) ILIKE $2 
                OR 
                c.nombre ILIKE $2
            )
            ORDER BY o.id DESC LIMIT 50`;
        
        console.log("⚙️ Ejecutando SQL...");
        const matches = await pool.query(sql, [sucursal_id, termino]);

        console.log(`✅ Resultados encontrados: ${matches.rows.length}`);

        // CASO A: NO HAY RESULTADOS
        if (matches.rows.length === 0) {
            console.log("⚠️ No se encontró nada. Respondiendo { found: false }");
            return res.json({ found: false });
        }

        // CASO B: LISTA (Múltiples)
        if (matches.rows.length > 1) {
            console.log("📋 Se encontraron varios. Enviando lista...");
            return res.json({ 
                found: true, 
                multiple: true, 
                resultados: matches.rows 
            });
        }

        // CASO C: DETALLE (Uno solo)
        console.log("🎯 Se encontró uno exacto. Buscando detalles...");
        const orden = matches.rows[0];
        
        // Chismoso extra para verificar si trae el nombre
        console.log(`👤 Cliente detectado: ${orden.cliente_nombre}`);

        const itemsQ = await pool.query("SELECT * FROM detalles_orden WHERE orden_id = $1", [orden.id]);
        const pagosQ = await pool.query("SELECT * FROM pagos WHERE orden_id = $1 ORDER BY id DESC", [orden.id]);

        let deliveryInfo = {};
        if (orden.estatus === 'entregado') {
            deliveryInfo = { entregado_por: 'Staff', fecha: orden.fecha_entrega_real };
        }

        res.json({
            found: true,
            multiple: false,
            orden: orden,
            items: itemsQ.rows,
            pagos: pagosQ.rows,
            delivery_info: deliveryInfo
        });

    } catch (e) {
        console.error("❌ ERROR CRÍTICO EN SQL:", e.message); 
        res.status(500).json({ error: e.message });
    }
});

router.get('/:id/detalles', async (req, res) => { try { const r = await pool.query('SELECT * FROM detalle_orden WHERE orden_id = $1', [req.params.id]); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });

router.get('/:folio/full', async (req, res) => { 
    try { 
        const { folio } = req.params; 
        const { sucursal_id } = req.query; 
        let query = "SELECT o.*, c.nombre as cliente, c.telefono, c.direccion_principal as direccion_entrega FROM ordenes o JOIN clientes c ON o.cliente_id = c.id WHERE o.folio = $1";
        let params = [folio];
        if(sucursal_id && !isNaN(sucursal_id) && parseInt(sucursal_id) > 0) {
            query += " AND o.sucursal_id = $2";
            params.push(parseInt(sucursal_id));
        }
        const info = await pool.query(query, params); 
        if(info.rows.length === 0) return res.status(404).json({error: 'No existe'}); 
        const items = await pool.query("SELECT * FROM detalle_orden WHERE orden_id = $1", [info.rows[0].id]); 
        res.json({ info: info.rows[0], items: items.rows }); 
    } catch (e) { res.status(500).json({ error: e.message }); } 
});

module.exports = router;