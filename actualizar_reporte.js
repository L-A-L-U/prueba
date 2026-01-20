const pool = require('./src/database/db'); 

async function actualizar() {
    console.log("🛠️  MEJORANDO BASE DE DATOS PARA REPORTES AUDITABLES...");
    
    // 1. Agregar quién hizo el pago (cobro)
    await pool.query("ALTER TABLE pagos ADD COLUMN IF NOT EXISTS usuario_id INTEGER;");
    
    // 2. Agregar quién registró el gasto
    await pool.query("ALTER TABLE gastos ADD COLUMN IF NOT EXISTS usuario_id INTEGER;");
    
    // 3. Agregar categoría al gasto si no existe (ej. Insumos, Comida, Renta)
    await pool.query("ALTER TABLE gastos ADD COLUMN IF NOT EXISTS categoria VARCHAR(50) DEFAULT 'General';");

    console.log("✅ Tablas listas para guardar el usuario responsable.");
    process.exit(0);
}

actualizar();