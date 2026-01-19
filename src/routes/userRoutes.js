const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.get('/', userController.getAll);
router.get('/:id', userController.getById);
router.get('/verificar/:user_id', userController.verificarActivo);
router.post('/registrar', userController.registrar);
router.put('/:id', userController.updateById);
router.delete('/:id', userController.deleteById);

module.exports = router;
