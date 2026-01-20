const pool = require('./db');

const setupDB = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('🔄 Verificando base de datos...');

        // 1. TABLAS PRINCIPALES
        await client.query(`CREATE TABLE IF NOT EXISTS sucursales (id SERIAL PRIMARY KEY, nombre VARCHAR(100), direccion TEXT, telefono VARCHAR(20), rfc VARCHAR(13), prefijo VARCHAR(10), latitud VARCHAR(50), longitud VARCHAR(50), mensaje_footer TEXT)`);
        
        await client.query(`CREATE TABLE IF NOT EXISTS usuarios (id SERIAL PRIMARY KEY, nombre VARCHAR(100), usuario VARCHAR(50) UNIQUE, password VARCHAR(100), rol VARCHAR(20), sucursal_id INTEGER)`);
        
        await client.query(`CREATE TABLE IF NOT EXISTS configuracion (id SERIAL PRIMARY KEY, sucursal_id INTEGER, fondo_caja_default NUMERIC(10,2) DEFAULT 500, permitir_venta_sin_turno BOOLEAN DEFAULT FALSE, ticket_header TEXT, ticket_footer TEXT, ticket_legal TEXT, hora_inicio_turno TIME DEFAULT '08:00:00', hora_fin_turno TIME DEFAULT '20:00:00', precio_kilo NUMERIC(10,2), minimo_kilos NUMERIC(10,2), ancho_papel VARCHAR(10) DEFAULT '58mm', dias_abandono INTEGER DEFAULT 30, direccion TEXT, telefono TEXT, rfc TEXT, dias_entrega INTEGER DEFAULT 2)`);
        
        // 2. CLIENTES (Estandarizado direccion_principal)
        await client.query(`CREATE TABLE IF NOT EXISTS clientes (id SERIAL PRIMARY KEY, sucursal_id INTEGER, nombre VARCHAR(150), telefono VARCHAR(20), email VARCHAR(100), direccion_principal TEXT, rfc VARCHAR(20), regimen_fiscal VARCHAR(100), uso_cfdi VARCHAR(100), codigo_postal VARCHAR(10))`);
        
        // 3. OPERACIÓN
        await client.query(`CREATE TABLE IF NOT EXISTS turnos (id SERIAL PRIMARY KEY, sucursal_id INTEGER, usuario_id INTEGER, inicio TIMESTAMP DEFAULT NOW(), fin TIMESTAMP, estatus VARCHAR(20) DEFAULT 'abierto', ventas_efectivo NUMERIC(10,2) DEFAULT 0, gastos NUMERIC(10,2) DEFAULT 0, monto_sistema NUMERIC(10,2) DEFAULT 0, monto_real NUMERIC(10,2) DEFAULT 0, diferencia NUMERIC(10,2) DEFAULT 0, fondo_inicial NUMERIC(10,2) DEFAULT 0)`);
        
        await client.query(`CREATE TABLE IF NOT EXISTS ordenes (id SERIAL PRIMARY KEY, folio VARCHAR(50) UNIQUE, sucursal_id INTEGER, usuario_id INTEGER, cliente_id INTEGER, total NUMERIC(10, 2) DEFAULT 0, monto_pagado NUMERIC(10, 2) DEFAULT 0, estatus VARCHAR(20) DEFAULT 'pendiente', estado_pago VARCHAR(20) DEFAULT 'pendiente', metodo_pago VARCHAR(50), notas TEXT, fecha_creacion TIMESTAMP DEFAULT NOW(), fecha_entrega TIMESTAMP, solicita_factura BOOLEAN DEFAULT FALSE, tipo_entrega VARCHAR(20), direccion_entrega TEXT, subtotal NUMERIC(10,2), iva NUMERIC(10,2))`);
        
        await client.query(`CREATE TABLE IF NOT EXISTS detalle_orden (id SERIAL PRIMARY KEY, orden_id INTEGER, servicio VARCHAR(100), cantidad INTEGER, precio_unitario NUMERIC(10, 2), subtotal NUMERIC(10,2), notas TEXT, detalles_json TEXT)`);
        
        await client.query(`CREATE TABLE IF NOT EXISTS pagos (id SERIAL PRIMARY KEY, orden_id INTEGER, turno_id INTEGER, usuario_id INTEGER, sucursal_id INTEGER, monto NUMERIC(10, 2), metodo_pago VARCHAR(50), tipo VARCHAR(20), fecha TIMESTAMP DEFAULT NOW())`);
        
        // 4. INVENTARIO Y OTROS
        await client.query(`CREATE TABLE IF NOT EXISTS inventario (id SERIAL PRIMARY KEY, sucursal_id INTEGER, nombre VARCHAR(100), precio NUMERIC(10, 2), categoria VARCHAR(50), stock INTEGER DEFAULT 0, tipo VARCHAR(20) DEFAULT 'servicio')`);
        
        await client.query(`CREATE TABLE IF NOT EXISTS gastos (id SERIAL PRIMARY KEY, descripcion TEXT, monto NUMERIC(10,2), usuario_id INTEGER, sucursal_id INTEGER, categoria VARCHAR(50), fecha TIMESTAMP DEFAULT NOW())`);
        
        await client.query(`CREATE TABLE IF NOT EXISTS auditoria (id SERIAL PRIMARY KEY, usuario_id INTEGER, sucursal_id INTEGER, accion VARCHAR(100), detalle TEXT, monto_reportado NUMERIC(10,2), diferencia NUMERIC(10,2), fecha TIMESTAMP DEFAULT NOW())`);
        
        await client.query(`CREATE TABLE IF NOT EXISTS cola_mensajes (id SERIAL PRIMARY KEY, sucursal_id INTEGER, telefono VARCHAR(20), mensaje TEXT, media_path TEXT, media_type VARCHAR(20), estado VARCHAR(20) DEFAULT 'pendiente', intentos INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP)`);

        // Parche de seguridad para columnas nuevas
        await client.query(`ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS dias_entrega INTEGER DEFAULT 2`);
        await client.query(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS codigo_postal VARCHAR(10)`);

        await client.query('COMMIT');
        console.log('✅ Base de Datos Sincronizada y Correcta.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('⚠️ Error Setup:', e.message);
    } finally {
        client.release();
    }
};

module.exports = setupDB;