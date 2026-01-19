const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/apiTokenController');

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;


