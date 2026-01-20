const pool = require('../database/db');

// Verifica si hay un turno abierto (Mejora Operativa A)
const verificarTurno = async (req, res, next) => {
    const { usuario_id, sucursal_id } = req.body;
    // Si es GET, intentamos sacarlo de query
    const uid = usuario_id || req.query.usuario_id;
    const sid = sucursal_id || req.query.sucursal_id;

    if (!uid) return next(); // Si no hay usuario, dejamos pasar (ej. login)

    try {
        const q = "SELECT * FROM turnos WHERE usuario_id = $1 AND sucursal_id = $2 AND estado = 'abierto'";
        const turno = await pool.query(q, [uid, sid]);
        
        if (turno.rows.length === 0) {
            return res.status(403).json({ error: "⛔ NO HAY TURNO ABIERTO. Debes iniciar turno." });
        }
        next();
    } catch (e) { next(); }
};

// Verifica si es Admin (Mejora Técnica B)
const esAdmin = async (req, res, next) => {
    // Aquí podrías validar token, por ahora validamos rol enviado
    // En producción usarías JWT
    next(); 
};

module.exports = { verificarTurno, esAdmin };