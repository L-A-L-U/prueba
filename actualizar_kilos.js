const pool = require('./src/database/db'); 

async function actualizarKilos() {
    console.log("⚖️  AGREGANDO CONFIGURACIÓN DE KILOS...");
    
    // 1. Agregar precio por kilo a la configuración
    await pool.query("ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS precio_kilo DECIMAL(10,2) DEFAULT 32.00;");
    
    // 2. Agregar mínimo de kilos
    await pool.query("ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS minimo_kilos DECIMAL(10,2) DEFAULT 3.00;");

    console.log("✅ Base de datos lista para pesaje.");
    process.exit(0);
}

actualizarKilos();