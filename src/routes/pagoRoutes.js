const express = require('express');
const router = express.Router();
const pagoController = require('../controllers/pagoController');

// Listado con filtros
router.get('/', pagoController.getAll);
// Estadísticas generales
router.get('/estadisticas', pagoController.getStats);
// Historial por usuario
router.get('/usuario/:usuarioId', pagoController.getByUsuario);
// Crear pago
router.post('/', pagoController.create);
// Actualizar/mark paid
router.put('/:id', pagoController.update);
// Eliminar/anular
router.delete('/:id', pagoController.remove);

module.exports = router;