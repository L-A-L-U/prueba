const { Router } = require('express');
const router = Router();

// IMPORTANTE: Usamos '..' para salir de la carpeta 'routes' y buscar en 'src'
const waManager = require('../whatsappManager'); 

// GET: Obtener estado
router.get('/status/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const status = await waManager.getStatus(id);
        res.json({ status });
    } catch (e) {
        res.status(500).json({ status: 'error', error: e.message });
    }
});

// POST: Reiniciar conexión
router.post('/restart/:id', async (req, res) => {
    try {
        const id = req.params.id;
        await waManager.logoutSession(id);
        await waManager.startSession(id);
        res.json({ success: true, message: 'Reiniciando...' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST: Cerrar sesión
router.post('/logout/:id', async (req, res) => {
    try {
        await waManager.logoutSession(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;