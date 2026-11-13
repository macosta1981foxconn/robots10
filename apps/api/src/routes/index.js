const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'api', timestamp: new Date().toISOString() });
});

router.use('/auth', require('./auth'));
router.use('/geofences', requireAuth, require('./geofences'));
router.use('/sites', requireAuth, require('./sites'));
router.use('/robots', requireAuth, require('./robots'));
router.use('/trips', requireAuth, require('./trips'));
router.use('/locations', requireAuth, require('./locations'));
router.use('/dashboard', requireAuth, require('./dashboard'));
router.use('/load-balancing', requireAuth, require('./loadbalance'));
router.use('/reports', requireAuth, require('./reports'));

module.exports = router;
