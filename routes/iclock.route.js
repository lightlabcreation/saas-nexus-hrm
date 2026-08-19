const express = require("express");
const router = express.Router();
const iclockController = require("../controllers/iclock.controller");

// ZKTeco ADMS (Push SDK) Endpoints
router.all("/cdata", iclockController.handleCdata);
router.get("/getrequest", iclockController.handleGetRequest);
router.post("/devicecmd", iclockController.handleDeviceCmd);

module.exports = router;