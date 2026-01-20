const cron = require('node-cron');
const pool = require('../database/db');
const { enviarMensaje } = require('./whatsappService');

const iniciarTareasProgramadas = () => {
    console.log("⏰ Monitor de Recordatorios Cíclicos (Cada 5 Días) ACTIVO");

    // Ejecutar revisión DIARIAMENTE a las 10:00 AM
    // (El horario es solo para que el servidor despierte y revise, 
    // pero el filtro de 5 días lo hace la base de datos)
    cron.schedule('0 10 * * *', async () => {
        try {
            console.log("🔍 Revisando órdenes para recordatorio de 5 días...");

            // LÓGICA DE 5 DÍAS:
            // Buscamos órdenes que estén LISTAS y cuya última modificación (updated_at)
            // fue hace 5 días o más.
            const res = await pool.query(`
                SELECT id, folio, cliente_nombre, telefono_cliente, saldo_pendiente 
                FROM ordenes 
                WHERE estado = 'listo' 
                AND updated_at <= NOW() - INTERVAL '5 days'
            `);

            if (res.rows.length === 0) return console.log("✅ Todo al día. Nadie cumple ciclo de 5 días hoy.");

            for (let orden of res.rows) {
                if (orden.telefono_cliente) {
                    // 1. Mensaje un poco más urgente
                    const msg = `👋 Hola *${orden.cliente_nombre}*.\n\n` +
                                `Te recordamos que tu orden *${orden.folio}* sigue esperando en sucursal.\n` +
                                `🗓️ Han pasado otros *5 días* y no has pasado por ella.\n\n` +
                                `🧺 Por favor ayúdanos a liberar espacio recogiendo tus prendas.\n` +
                                (parseFloat(orden.saldo_pendiente) > 0 ? `💰 Saldo pendiente: $${orden.saldo_pendiente}` : `✅ Tu cuenta está pagada.`) +
                                `\n\n📍 Escribe 'ubicacion' si necesitas el mapa.`;

                    // 2. Enviar WhatsApp
                    await enviarMensaje(orden.telefono_cliente, msg);
                    console.log(`📩 Recordatorio cíclico enviado a: ${orden.cliente_nombre} (${orden.folio})`);
                    
                    // 3. EL TRUCO DEL CICLO:
                    // Actualizamos la fecha a "HOY". Así el sistema esperará 
                    // OTROS 5 días exactos antes de volver a encontrarla en la consulta.
                    await pool.query("UPDATE ordenes SET updated_at = NOW() WHERE id=$1", [orden.id]);
                }
            }
        } catch (error) {
            console.error("❌ Error en Cron Job:", error);
        }
    });
};

module.exports = { iniciarTareasProgramadas };