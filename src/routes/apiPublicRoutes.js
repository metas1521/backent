const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/apiPublicController');

// Rutas públicas: /v1/:cmd
router.get('/:cmd', ctrl.handle);

module.exports = router;


