const db = require('../database/db');
const config = require('../config');

function getActiveProvider() {
  try {
    const setting = db.prepare(
      "SELECT value FROM system_settings WHERE key = 'telephony_provider'"
    ).get();
    return (setting && setting.value) || config.telephonyProvider || 'twilio';
  } catch (e) {
    return config.telephonyProvider || 'twilio';
  }
}

function getProvider() {
  const provider = getActiveProvider();
  if (provider === 'dialpad') {
    return require('./dialpad');
  }
  return require('./twilio');
}

module.exports = {
  sendSMS: (...args) => getProvider().sendSMS(...args),
  sendQuickSMS: (...args) => getProvider().sendQuickSMS(...args),
  initiateManualCall: (...args) => getProvider().initiateManualCall(...args),
  getNextPhoneNumber: () => getProvider().getNextPhoneNumber(),
  getActiveProvider,
};
