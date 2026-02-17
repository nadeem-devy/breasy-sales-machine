const { parsePhoneNumberFromString } = require('libphonenumber-js');

function normalizePhone(phone) {
  if (!phone) return '';
  // Remove common formatting
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  // Try to parse
  const parsed = parsePhoneNumberFromString(cleaned, 'US');
  if (parsed && parsed.isValid()) {
    return parsed.format('E.164');
  }
  // Fallback: if it's 10 digits, add +1
  cleaned = cleaned.replace(/\D/g, '');
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith('1')) return `+${cleaned}`;
  return phone; // Return original if can't parse
}

function isValidPhone(phone) {
  const normalized = normalizePhone(phone);
  return /^\+1\d{10}$/.test(normalized);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

module.exports = { normalizePhone, isValidPhone, isValidEmail };
