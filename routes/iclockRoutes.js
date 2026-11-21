const express = require('express');
const router = express.Router();
const iclockController = require('../controllers/iclockController');

// eSSL / ZKTeco devices push raw plain-text or binary payloads
const rawTextParser = express.text({
    type: ['text/*', 'application/octet-stream', 'application/x-www-form-urlencoded', 'text/plain', '*/*'],
    limit: '10mb'
});

router.use(rawTextParser);

router.get('/cdata', iclockController.handleCDataGet);
router.post('/cdata', iclockController.handleCDataPost);
router.get('/getrequest', iclockController.handleGetRequest);
router.post('/devicecmd', iclockController.handleDeviceCmd);
router.post('/registry', iclockController.handleRegistry);
router.post('/push', iclockController.handleRegistry);

module.exports = router;
