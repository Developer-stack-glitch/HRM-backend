const express = require('express');
const router = express.Router();

const iclockController = require('../controllers/iclockController');

const rawTextParser = express.text({
    type: [
        'text/*',
        'application/octet-stream',
        'application/x-www-form-urlencoded',
        'text/plain',
        '*/*'
    ],
    limit: '10mb'
});

router.use(rawTextParser);

// Device data
router.get('/cdata', iclockController.handleCDataGet);
router.post('/cdata', iclockController.handleCDataPost);

router.get('/cdata.aspx', iclockController.handleCDataGet);
router.post('/cdata.aspx', iclockController.handleCDataPost);

// Device polling
router.get('/getrequest', iclockController.handleGetRequest);
router.get('/getrequest.aspx', iclockController.handleGetRequest);

// Commands
router.post('/devicecmd', iclockController.handleDeviceCmd);

// Registration
router.post('/registry', iclockController.handleRegistry);
router.post('/push', iclockController.handleRegistry);

module.exports = router;