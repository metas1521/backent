const express = require('express');
const router = express.Router();
const { securityAPI } = require('../middleware/securityMiddleware');
const { requireAdmin, verifyToken } = require('../controllers/authController');

// Todas las rutas requieren autenticación de administrador
router.use(verifyToken, requireAdmin);

// GET /api/security/logs - Obtener logs de ataques
router.get('/logs', securityAPI.getAttackLogs);

// POST /api/security/block - Bloquear IP manualmente
router.post('/block', securityAPI.blockIP);

// DELETE /api/security/unblock/:ip - Desbloquear IP
router.delete('/unblock/:ip', securityAPI.unblockIP);

// GET /api/security/stats - Obtener estadísticas de seguridad
router.get('/stats', securityAPI.getSecurityStats);

module.exports = router;
