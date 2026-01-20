const pool = require('../database/db');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const login = async (req, res) => {
    const { username, password } = req.body;

    try {
        const response = await pool.query('SELECT * FROM usuarios WHERE username = $1', [username]);
        
        if (response.rows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        const usuario = response.rows[0];

        if (password !== usuario.password) {
            return res.status(401).json({ message: 'Contraseña incorrecta' });
        }

        const token = jwt.sign(
            { id: usuario.id, rol: usuario.rol },
            process.env.JWT_SECRET || 'secreto',
            { expiresIn: '12h' }
        );

        res.json({
            message: 'Bienvenido',
            token: token,
            user: { id: usuario.id, nombre: usuario.nombre, username: usuario.username }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error en el servidor' });
    }
};

module.exports = { login };