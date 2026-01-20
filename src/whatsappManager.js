const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pool = require('./database/db'); 
const fs = require('fs');
const path = require('path');

const sessions = {};
let io; 
const QUEUE_INTERVAL = 5000;

// --- FUNCIÓN AUXILIAR ---
const getDatosSucursal = async (sucursalId) => {
    try {
        const res = await pool.query("SELECT * FROM sucursales WHERE id = $1", [sucursalId]);
        return res.rows[0];
    } catch (e) {
        return null;
    }
};

// --- INICIO ---
const initializeManager = (socketInstance) => {
    io = socketInstance;
    setInterval(processQueue, QUEUE_INTERVAL);
    console.log("🚀 WhatsApp Manager: ACTIVO");
};

const startSession = async (sucursalId) => {
    // Evitar iniciar sesión si ya existe
    if (sessions[sucursalId]) return;

    console.log(`🔌 Iniciando sesión WA Sucursal ${sucursalId}...`);
    
    // 1. GARANTIZAR QUE LA CARPETA EXISTA ANTES DE TODO
    const authPath = path.join(process.cwd(), 'auth_info_baileys', `sucursal_${sucursalId}`);
    try {
        if (!fs.existsSync(authPath)){ 
            fs.mkdirSync(authPath, { recursive: true }); 
        }
    } catch(err) {
        console.error("❌ Error creando carpeta de sesión:", err);
        return;
    }

    // 2. AHORA SÍ INICIAMOS LA LIBRERÍA
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    
    const sock = makeWASocket({ 
        auth: state, 
        printQRInTerminal: false,
        syncFullHistory: false,
        // Ignorar grupos para ahorrar memoria
        shouldIgnoreJid: jid => jid.endsWith('@g.us'),
        // Timeout más largo para evitar desconexiones rápidas
        connectTimeoutMs: 60000 
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && io) {
            io.emit(`wa_qr_${sucursalId}`, { qr });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            
            // Limpiar memoria
            delete sessions[sucursalId];
            if(io) io.emit(`wa_status_${sucursalId}`, { status: 'desconectado' });
            
            if (shouldReconnect) {
                console.log(`Reconectando Sucursal ${sucursalId}...`);
                setTimeout(() => startSession(sucursalId), 3000);
            }
        } else if (connection === 'open') {
            console.log(`✅ WhatsApp CONECTADO: Sucursal ${sucursalId}`);
            if(io) io.emit(`wa_status_${sucursalId}`, { status: 'conectado' });
            sessions[sucursalId] = sock;
        }
    });

    sock.ev.on('creds.update', saveCreds);
    sessions[sucursalId] = sock;
};

const logoutSession = async (id) => {
    const sock = sessions[id];
    if (sock) { 
        try { await sock.logout(); } catch(e){}
        delete sessions[id]; 
    }
    
    // Borrar carpeta físicamente
    const authPath = path.join(process.cwd(), 'auth_info_baileys', `sucursal_${id}`);
    if (fs.existsSync(authPath)) {
        fs.rm(authPath, { recursive: true, force: true }, ()=>{});
    }
    if(io) io.emit(`wa_status_${id}`, { status: 'desconectado' });
};

const getStatus = async (id) => { return sessions[id]?.user ? 'conectado' : 'esperando_qr'; };

const encolarMensaje = async (sucursalId, telefono, mensaje, mediaPath = null, mediaType = 'text') => {
    try {
        if (!telefono) return;
        let number = telefono.replace(/\D/g, '');
        if (number.length === 10) number = '52' + number; 
        
        await pool.query(
            "INSERT INTO cola_mensajes (sucursal_id, telefono, mensaje, media_path, media_type) VALUES ($1, $2, $3, $4, $5)", 
            [sucursalId, number, mensaje, mediaPath, mediaType]
        );
    } catch (e) { console.error("Error encolando mensaje:", e.message); }
};

const processQueue = async () => {
    try {
        const res = await pool.query("SELECT * FROM cola_mensajes WHERE estado = 'pendiente' AND intentos < 5 ORDER BY created_at ASC LIMIT 5");
        if (res.rows.length === 0) return;

        for (const item of res.rows) {
            // Intentar recuperar la sesión si se perdió
            if (!sessions[item.sucursal_id]) {
               // await startSession(item.sucursal_id); // Opcional: Auto-conectar si se desconectó
            }

            const sock = sessions[item.sucursal_id];
            if (sock && sock.user) {
                try {
                    const jid = `${item.telefono}@s.whatsapp.net`;
                    
                    if (item.media_type === 'location') {
                        const suc = await getDatosSucursal(item.sucursal_id);
                        const lat = suc && suc.latitud ? parseFloat(suc.latitud) : 19.4326;
                        const lon = suc && suc.longitud ? parseFloat(suc.longitud) : -99.1332;
                        
                        await sock.sendMessage(jid, { 
                            location: { degreesLatitude: lat, degreesLongitude: lon, name: suc ? suc.nombre : 'Lavandería' } 
                        });
                        if(item.mensaje) await sock.sendMessage(jid, { text: item.mensaje });
                    } else if (item.media_type === 'image' && item.media_path && fs.existsSync(item.media_path)) {
                        await sock.sendMessage(jid, { image: fs.readFileSync(item.media_path), caption: item.mensaje });
                    } else {
                        await sock.sendMessage(jid, { text: item.mensaje });
                    }
                    await pool.query("UPDATE cola_mensajes SET estado = 'enviado', updated_at = NOW() WHERE id = $1", [item.id]);
                } catch (sendError) {
                    console.error("Error enviando:", sendError);
                    await pool.query("UPDATE cola_mensajes SET intentos = intentos + 1 WHERE id = $1", [item.id]);
                }
            }
        }
    } catch (e) { console.error("Error cola:", e.message); }
};

module.exports = { initializeManager, startSession, logoutSession, getStatus, encolarMensaje };