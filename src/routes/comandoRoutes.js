const express = require('express');
const router = express.Router();
const comandoController = require('../controllers/comandoController');

// Obtener niveles de acceso
router.get('/niveles', comandoController.getNiveles);

// CRUD de comandos
router.get('/', comandoController.getComandos);
router.get('/:id', comandoController.getComando);
router.post('/', comandoController.createComando);
router.put('/:id', comandoController.updateComando);
router.delete('/:id', comandoController.deleteComando);
router.patch('/:id/toggle', comandoController.toggleComando);

module.exports = router; 