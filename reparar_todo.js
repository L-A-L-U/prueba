const pool = require('./src/database/db'); 

async function repararTodo() {
    console.log("🛠️  ACTUALIZANDO BASE DE DATOS PARA REPORTES...");

    const comandos = [
        // 1. Agregar columna usuario_id a PAGOS (quién cobró)
        "ALTER TABLE pagos ADD COLUMN IF NOT EXISTS usuario_id INTEGER DEFAULT 1;",
        
        // 2. Agregar columna usuario_id a GASTOS (quién gastó)
        "ALTER TABLE gastos ADD COLUMN IF NOT EXISTS usuario_id INTEGER DEFAULT 1;",
        
        // 3. Agregar columna categoria a GASTOS (si falta)
        "ALTER TABLE gastos ADD COLUMN IF NOT EXISTS categoria VARCHAR(50) DEFAULT 'General';",
        
        // 4. Agregar columna usuario_id a ORDENES (quién creó la orden)
        "ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS usuario_id INTEGER DEFAULT 1;"
    ];

    try {
        for (const sql of comandos) {
            await pool.query(sql);
            console.log("   -> Ejecutado: " + sql.substring(0, 40) + "...");
        }
        console.log("✅ ¡LISTO! Tu base de datos ya soporta los reportes avanzados.");
        console.log("👉 Reinicia el servidor y prueba de nuevo.");
        process.exit(0);
    } catch (e) {
        console.error("❌ Error al actualizar:", e.message);
        process.exit(1);
    }
}

repararTodo();