const pool = require('./src/database/db'); 

async function auditoria() {
    console.log("🦅 IMPLEMENTANDO SISTEMA OJO DE HALCÓN...");
    
    try {
        // 1. Tabla de Bitácora (Logs)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bitacora (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER,
                sucursal_id INTEGER,
                accion VARCHAR(50),      -- Ej: "BORRAR_PRODUCTO", "CAMBIO_PRECIO"
                detalle TEXT,            -- Ej: "Borró el producto ID 5: Jabón Ariel"
                fecha TIMESTAMP DEFAULT NOW()
            );
        `);

        // 2. Aseguramos que existan índices para búsquedas rápidas
        await pool.query("CREATE INDEX IF NOT EXISTS idx_bitacora_fecha ON bitacora(fecha);");

        console.log("✅ Sistema de Auditoría listo. La base de datos ahora tiene memoria fotográfica.");
        process.exit(0);
    } catch (e) {
        console.error("❌ Error:", e.message);
        process.exit(1);
    }
}

auditoria();