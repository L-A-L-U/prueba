const express = require('express');
const router = express.Router();
const pool = require('../database/db'); 

// RUTAS DE CONFIGURACIÓN
router.get('/config', async (req, res) => { 
    try { 
        const r = await pool.query('SELECT * FROM configuracion WHERE sucursal_id=$1', [req.query.sucursal_id || 1]); 
        res.json(r.rows[0] || {}); 
    } catch (e) { res.status(500).json({ error: e.message }); } 
});

router.post('/config', async (req, res) => { 
    try { 
        // Agregamos dias_entrega
        const { sucursal_id, fondo, inicio, fin, sin_turno, direccion, telefono, rfc, header, footer, legal, precio_kilo, minimo_kilos, ancho_papel, dias_abandono, dias_entrega } = req.body; 
        
        const pKilo = parseFloat(precio_kilo) || 32; 
        const mKilos = parseFloat(minimo_kilos) || 3; 
        const fCaja = parseFloat(fondo) || 500; 
        const dAbandono = parseInt(dias_abandono) || 30;
        const dEntrega = parseInt(dias_entrega) || 2; // Default 2 días
        
        const c = await pool.query('SELECT id FROM configuracion WHERE sucursal_id=$1', [sucursal_id]); 
        
        if(c.rows.length > 0) { 
            await pool.query(`UPDATE configuracion SET fondo_caja_default=$1, hora_inicio_turno=$2, hora_fin_turno=$3, permitir_venta_sin_turno=$4, direccion=$5, telefono=$6, rfc=$7, ticket_header=$8, ticket_footer=$9, ticket_legal=$10, precio_kilo=$11, minimo_kilos=$12, ancho_papel=$14, dias_abandono=$15, dias_entrega=$16 WHERE sucursal_id=$13`, 
            [fCaja, inicio||'08:00', fin||'20:00', sin_turno, direccion, telefono, rfc, header, footer, legal, pKilo, mKilos, sucursal_id, ancho_papel||'58mm', dAbandono, dEntrega]); 
        } else { 
            await pool.query(`INSERT INTO configuracion (sucursal_id, fondo_caja_default, dias_abandono, dias_entrega) VALUES ($1, $2, $3, $4)`, [sucursal_id, fCaja, dAbandono, dEntrega]); 
        } 
        res.json({ success: true }); 
    } catch (e) { res.status(500).json({ error: e.message }); } 
});

// ------ BLOQUE DE CIERRE Y CORTE ------
router.get('/corte/preliminar', async (req, res) => {
    try {
        const { sucursal_id } = req.query;
        const turno = await pool.query("SELECT * FROM turnos WHERE sucursal_id=$1 AND fin IS NULL ORDER BY id DESC LIMIT 1", [sucursal_id]);
        if(turno.rows.length === 0) return res.json({ error: 'No hay turno abierto' });
        const t = turno.rows[0];
        const ventas = await pool.query(`SELECT COALESCE(SUM(monto),0) as total FROM pagos WHERE sucursal_id=$1 AND metodo_pago='efectivo' AND fecha >= $2`, [sucursal_id, t.inicio]);
        const gastos = await pool.query(`SELECT COALESCE(SUM(monto),0) as total FROM gastos WHERE sucursal_id=$1 AND fecha >= $2`, [sucursal_id, t.inicio]);
        const fondo = parseFloat(t.fondo_inicial) || 0;
        res.json({ turno_id: t.id, inicio: t.inicio, fondo_inicial: fondo, ventas_efectivo: parseFloat(ventas.rows[0].total), gastos: parseFloat(gastos.rows[0].total), esperado_en_caja: (fondo + parseFloat(ventas.rows[0].total) - parseFloat(gastos.rows[0].total)) });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/corte/cerrar', async (req, res) => {
    const client = await pool.connect();
    try {
        const { sucursal_id, usuario_id, monto_reportado } = req.body;
        await client.query('BEGIN');
        const turnoQ = await client.query("SELECT * FROM turnos WHERE sucursal_id=$1 AND fin IS NULL ORDER BY id DESC LIMIT 1", [sucursal_id]);
        if(turnoQ.rows.length === 0) throw new Error("No hay turno");
        const t = turnoQ.rows[0];
        const ventasQ = await client.query("SELECT COALESCE(SUM(monto),0) as total FROM pagos WHERE sucursal_id=$1 AND metodo_pago='efectivo' AND fecha >= $2", [sucursal_id, t.inicio]);
        const gastosQ = await client.query("SELECT COALESCE(SUM(monto),0) as total FROM gastos WHERE sucursal_id=$1 AND fecha >= $2", [sucursal_id, t.inicio]);
        const fondo = parseFloat(t.fondo_inicial);
        const ventas = parseFloat(ventasQ.rows[0].total);
        const gastos = parseFloat(gastosQ.rows[0].total);
        const sistema = fondo + ventas - gastos;
        const real = parseFloat(monto_reportado);
        const diferencia = real - sistema;
        await client.query(`UPDATE turnos SET fin = NOW(), ventas_efectivo = $1, gastos = $2, monto_sistema = $3, monto_real = $4, diferencia = $5 WHERE id = $6`, [ventas, gastos, sistema, real, diferencia, t.id]);
        await client.query(`INSERT INTO auditoria (sucursal_id, usuario_id, accion, detalle, monto_reportado, diferencia, fecha) VALUES ($1, $2, 'CORTE_Z', $3, $4, $5, NOW())`, [sucursal_id, usuario_id, `Cierre Turno #${t.id}`, real, diferencia]);
        const configQ = await client.query("SELECT fondo_caja_default FROM configuracion WHERE sucursal_id=$1", [sucursal_id]);
        const nuevoFondo = parseFloat(configQ.rows[0]?.fondo_caja_default || 500);
        const nuevoTurno = await client.query(`INSERT INTO turnos (sucursal_id, usuario_id, inicio, fondo_inicial) VALUES ($1, $2, NOW(), $3) RETURNING id`, [sucursal_id, usuario_id, nuevoFondo]);
        await client.query('COMMIT');
        res.json({ success: true, resumen: { turno_cerrado: t.id, nuevo_turno: nuevoTurno.rows[0].id, ventas, gastos, sistema, real, diferencia, nuevo_fondo: nuevoFondo } });
    } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

router.get('/sucursales', async (req, res) => { try { const r = await pool.query("SELECT * FROM sucursales ORDER BY id ASC"); res.json(r.rows); } catch (e) { res.status(500).json({}); } });
router.post('/sucursales/guardar', async (req, res) => { try { const { id, nombre, prefijo, direccion, telefono } = req.body; if (id) await pool.query('UPDATE sucursales SET nombre=$1, prefijo=$2, direccion=$3, telefono=$4 WHERE id=$5', [nombre, prefijo, direccion, telefono, id]); else await pool.query('INSERT INTO sucursales (nombre, prefijo, direccion, telefono) VALUES ($1, $2, $3, $4)', [nombre, prefijo, direccion, telefono]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/inventario', async (req, res) => { try { const r = await pool.query("SELECT * FROM inventario ORDER BY nombre ASC"); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post('/inventario/guardar', async (req, res) => { try { const { id, nombre, tipo, precio, stock, sucursal_id } = req.body; if (id) { await pool.query('UPDATE inventario SET nombre=$1, tipo=$2, precio=$3, stock=$4 WHERE id=$5', [nombre, tipo||'servicio', parseFloat(precio), parseFloat(stock), id]); } else { await pool.query('INSERT INTO inventario (nombre, tipo, precio, stock, sucursal_id) VALUES ($1, $2, $3, $4, $5)', [nombre, tipo||'servicio', parseFloat(precio), parseFloat(stock), sucursal_id || 1]); } res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post('/inventario/borrar', async (req, res) => { try { const { id } = req.body; await pool.query('DELETE FROM inventario WHERE id = $1', [id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/usuarios', async(r,s)=>{try{const x=await pool.query('SELECT id,nombre,usuario,rol FROM usuarios ORDER BY id');s.json(x.rows)}catch(e){s.status(500).json({error:e.message})}});
router.post('/usuarios/crear', async(r,s)=>{try{const{nombre,usuario,password,rol,sucursal_id}=r.body;await pool.query('INSERT INTO usuarios (nombre,usuario,password,rol,sucursal_id) VALUES($1,$2,$3,$4,$5)',[nombre,usuario,password,rol,sucursal_id]);s.json({success:true})}catch(e){s.status(500).json({error:e.message})}});
router.post('/usuarios/borrar', async(r,s)=>{try{const{id}=r.body;if(id==1)return s.status(400).json({error:'No borrar admin'});await pool.query('DELETE FROM usuarios WHERE id=$1',[id]);s.json({success:true})}catch(e){s.status(500).json({error:e.message})}});
router.get('/turno/activo', async(r,s)=>{try{const x=await pool.query('SELECT * FROM turnos WHERE sucursal_id=$1 AND usuario_id=$2 AND fin IS NULL',[r.query.sucursal_id,r.query.usuario_id]);s.json(x.rows[0]||null)}catch(e){s.status(500).json({error:e.message})}});
router.post('/turno/abrir', async(r,s)=>{try{const x=await pool.query('INSERT INTO turnos (sucursal_id,usuario_id,inicio,fondo_inicial) VALUES($1,$2,NOW(),$3) RETURNING *',[r.body.sucursal_id,r.body.usuario_id,r.body.fondo]);s.json(x.rows[0])}catch(e){s.status(500).json({error:e.message})}});
router.get('/auditoria', async (req, res) => { try { const r = await pool.query(`SELECT a.*, u.nombre as usuario FROM auditoria a LEFT JOIN usuarios u ON a.usuario_id = u.id WHERE a.sucursal_id = $1 ORDER BY a.fecha DESC LIMIT 50`, [req.query.sucursal_id || 1]); res.json(r.rows); } catch (e) { res.json([]); } });

module.exports = router;