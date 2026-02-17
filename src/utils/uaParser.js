/**
 * Lightweight user-agent parser (no external deps).
 */

function parseUA(ua) {
  ua = ua || '';
  const result = { device_type: 'desktop', browser: 'Unknown', os: 'Unknown' };

  // Device type
  if (/mobile|android|iphone|ipod/i.test(ua)) result.device_type = 'mobile';
  else if (/tablet|ipad/i.test(ua)) result.device_type = 'tablet';

  // Browser
  if (/edg/i.test(ua)) result.browser = 'Edge';
  else if (/chrome/i.test(ua)) result.browser = 'Chrome';
  else if (/firefox/i.test(ua)) result.browser = 'Firefox';
  else if (/safari/i.test(ua)) result.browser = 'Safari';

  // OS
  if (/windows/i.test(ua)) result.os = 'Windows';
  else if (/mac os/i.test(ua)) result.os = 'macOS';
  else if (/android/i.test(ua)) result.os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) result.os = 'iOS';
  else if (/linux/i.test(ua)) result.os = 'Linux';

  return result;
}

module.exports = { parseUA };
