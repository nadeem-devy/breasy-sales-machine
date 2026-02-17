const config = require('../config');

function replaceMergeTags(template, lead) {
  if (!template) return '';

  const tags = {
    '{{first_name}}': lead.first_name || 'there',
    '{{last_name}}': lead.last_name || '',
    '{{company_name}}': lead.company_name || 'your business',
    '{{industry}}': lead.industry || 'your industry',
    '{{service_type}}': lead.service_type || 'field service',
    '{{city}}': lead.city || 'your area',
    '{{video_link}}': lead.video_link || config.links.videoBaseUrl,
    '{{app_link}}': lead.app_download_link || config.links.appDownloadBaseUrl,
    '{{meeting_link}}': lead.meeting_link || config.links.meetingBaseUrl,
    '{{sender_name}}': 'Nadeem',
    '{{opt_out_link}}': `${config.baseUrl}/unsubscribe?lid=${lead.unique_id}`,
  };

  let result = template;
  for (const [tag, value] of Object.entries(tags)) {
    result = result.replace(new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return result;
}

module.exports = { replaceMergeTags };
