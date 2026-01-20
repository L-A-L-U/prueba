const express = require('express');
const router = express.Router();
const pool = require('../database/db'); 

// ==========================================
// LOGIN (CORREGIDO PARA TU HTML)
// ==========================================
router.post('/login', async (req, res) => {
    try {
        const { usuario, password } = req.body;
        
        console.log(`📡 Intentando login para: ${usuario}`); // Log para depurar en terminal

        // 1. Buscar usuario en la base de datos
        const result = await pool.query('SELECT * FROM usuarios WHERE usuario = $1', [usuario]);
        
        // Si no existe el usuario
        if (result.rows.length === 0) {
            console.log("❌ Usuario no encontrado");
            return res.status(401).json({ success: false, error: 'Usuario no encontrado' });
        }

        const user = result.rows[0];

        // 2. Verificar contraseña (comparación directa por ahora)
        if (password !== user.password) {
            console.log("❌ Contraseña incorrecta");
            return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
        }

        // 3. ÉXITO: ENVIAR LA ESTRUCTURA EXACTA QUE ESPERA EL HTML
        console.log("✅ Login exitoso");
        
        res.json({
            success: true,
            user: {
                id: user.id,              // <--- ESTO ES LO QUE BUSCA TU HTML (u.id)
                nombre: user.nombre,
                usuario: user.usuario,
                rol: user.rol,
                sucursal_id: user.sucursal_id || 1
            }
        });

    } catch (err) {
        console.error("🔥 Error en servidor:", err.message);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// ==========================================
// REGISTRO RÁPIDO (Por si no tienes usuarios)
// ==========================================
router.post('/register', async (req, res) => {
    try {
        const { nombre, usuario, password, rol, sucursal_id } = req.body;
        // Verificar si ya existe
        const check = await pool.query('SELECT * FROM usuarios WHERE usuario = $1', [usuario]);
        if (check.rows.length > 0) return res.status(400).json({ error: 'El usuario ya existe' });

        const newUser = await pool.query(
            'INSERT INTO usuarios (nombre, usuario, password, rol, sucursal_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [nombre, usuario, password, rol, sucursal_id || 1]
        );
        res.json({ success: true, message: 'Usuario creado', user: newUser.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Error al registrar' });
    }
});

module.exports = router;