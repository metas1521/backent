const express = require('express');
const router = express.Router();
const webUserController = require('../controllers/webUserController');
const authMiddleware = require('../middlewares/authMiddleware');

// Aplicar middleware de autenticación a todas las rutas
router.use(authMiddleware);

// Rutas para gestión de usuarios web
router.get('/', webUserController.getAllWebUsers);
router.get('/stats', webUserController.getWebUsersStats);
router.get('/:id', webUserController.getWebUserById);

// Rutas para crear y modificar usuarios web
router.post('/', webUserController.createWebUser);
router.put('/:id', webUserController.updateWebUser);
router.delete('/:id', webUserController.deleteWebUser);

// Rutas para gestión de créditos
router.post('/:id/credits/add', webUserController.addCreditsToWebUser);
router.post('/:id/credits/remove', webUserController.removeCreditsFromWebUser);

// Rutas para gestión del bot
router.put('/:id/bot-activation', webUserController.toggleBotActivation);

// Rutas para gestión del estado
router.put('/:id/status', webUserController.changeWebUserStatus);

// ==== NUEVAS RUTAS PARA SISTEMA DE PLANES ====

// Verificar si un usuario web está activo (para verificación desde apps móviles)
router.get('/verificar/:email', webUserController.verificarWebUserActivo);

// Registrar nuevo usuario web desde el sistema (para registro automático)
router.post('/registrar', webUserController.registrarWebUser);

module.exports = router;

