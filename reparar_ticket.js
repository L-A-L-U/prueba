const pool = require('./src/database/db'); 

async function repararTicket() {
    console.log("📏 AGREGANDO OPCIÓN DE TAMAÑO DE PAPEL...");
    try {
        // Solo agregamos la columna de ancho de papel
        await pool.query("ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS ancho_papel VARCHAR(10) DEFAULT '58mm';");
        
        console.log("✅ ¡LISTO! Ahora el sistema soporta 58mm y 80mm.");
        process.exit(0);
    } catch (e) {
        console.error("❌ Error:", e.message);
        process.exit(1);
    }
}
repararTicket();