const express = require('express');
const planController = require('../controllers/planController');
const consultaController = require('../controllers/consultaController');
const router = express.Router();

// Rutas de planes
router.get('/planes', planController.getAll);
router.get('/planes/:id', planController.getById);
router.get('/planes/tipo/:tipo', planController.getByTipo);
router.post('/planes', planController.create);
router.put('/planes/:id', planController.update);
router.delete('/planes/:id', planController.remove);

// Rutas de activación de planes
router.post('/planes/activar', planController.activarPlan);
router.get('/planes/usuario/:userId/estado', planController.verificarEstadoPlan);
router.post('/planes/renovar', planController.renovarPlan);

// Rutas de consultas del Móvil Pro
router.post('/consultas/movil-pro', consultaController.crearConsultaMovilPro);
router.get('/consultas/usuario/:userId', consultaController.obtenerConsultasUsuario);
router.get('/consultas/:cq/respuestas', consultaController.obtenerRespuestasConsulta);
router.get('/consultas/:cq/estado', consultaController.obtenerEstadoConsulta);

// Rutas de créditos
router.post('/creditos/acreditar', consultaController.acreditarSaldo);
router.get('/creditos/:canal/:userId/saldo', consultaController.obtenerSaldo);

module.exports = router;



