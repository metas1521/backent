const express = require('express');
const consultaController = require('../controllers/consultaController');
const router = express.Router();

// Rutas existentes
router.post('/web', consultaController.crearConsultaWeb);
router.post('/tg', consultaController.crearConsultaTG);
router.post('/web/credito', consultaController.acreditarSaldo);
router.post('/tg/credito', consultaController.acreditarSaldo);
router.get('/:canal/:userId/saldo', consultaController.obtenerSaldo);

// Nuevas rutas para Móvil Pro
router.post('/movil-pro', consultaController.crearConsultaMovilPro);
router.get('/usuario/:userId', consultaController.obtenerConsultasUsuario);
router.get('/:cq/respuestas', consultaController.obtenerRespuestasConsulta);
router.get('/:cq/estado', consultaController.obtenerEstadoConsulta);

module.exports = router;


