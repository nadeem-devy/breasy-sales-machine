/**
 * Parse an ad platform URL or raw campaign ID to extract platform + campaign ID.
 *
 * Supported URL formats:
 * Facebook: facebook.com/ads/manager/campaign/... or ?campaign_ids=456
 * Google: ads.google.com/aw/campaigns?campaignId=123
 * LinkedIn: linkedin.com/campaignmanager/accounts/123/campaigns/456
 * Reddit: ads.reddit.com/campaigns/t2_abc123
 */

function parseAdUrl(input) {
  input = (input || '').trim();
  if (!input) return null;

  try {
    const url = new URL(input);
    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname;
    const params = url.searchParams;

    // Facebook / Instagram (Meta)
    if (hostname.includes('facebook.com') || hostname.includes('fb.com')) {
      const campaignIds = params.get('campaign_ids');
      if (campaignIds) return { platform: 'facebook', campaignId: campaignIds.split(',')[0], url: input };

      const match = pathname.match(/campaign[s]?\/(\d+)/);
      if (match) return { platform: 'facebook', campaignId: match[1], url: input };

      const numMatch = pathname.match(/(\d{10,})/);
      if (numMatch) return { platform: 'facebook', campaignId: numMatch[1], url: input };

      return { platform: 'facebook', campaignId: null, url: input };
    }

    if (hostname.includes('instagram.com')) {
      return { platform: 'instagram', campaignId: null, url: input };
    }

    // Google Ads
    if (hostname.includes('google.com') && (pathname.includes('/aw/') || pathname.includes('/ads/'))) {
      const campaignId = params.get('campaignId') || params.get('campaign_id');
      if (campaignId) return { platform: 'google', campaignId, url: input };

      const match = pathname.match(/campaigns?\/(\d+)/);
      if (match) return { platform: 'google', campaignId: match[1], url: input };

      return { platform: 'google', campaignId: null, url: input };
    }

    // LinkedIn Campaign Manager
    if (hostname.includes('linkedin.com') && pathname.includes('campaignmanager')) {
      const match = pathname.match(/campaigns?\/(\d+)/);
      if (match) return { platform: 'linkedin', campaignId: match[1], url: input };

      return { platform: 'linkedin', campaignId: null, url: input };
    }

    // Reddit Ads
    if (hostname.includes('reddit.com') && (pathname.includes('/ads/') || pathname.includes('/campaigns/'))) {
      const match = pathname.match(/campaigns?\/([a-zA-Z0-9_]+)/);
      if (match) return { platform: 'reddit', campaignId: match[1], url: input };

      return { platform: 'reddit', campaignId: null, url: input };
    }
  } catch (e) {
    // Not a valid URL — treat as raw campaign ID
  }

  // Raw ID (user must select platform separately)
  if (/^[a-zA-Z0-9_-]{3,}$/.test(input)) {
    return { platform: null, campaignId: input, url: null };
  }

  return null;
}

module.exports = { parseAdUrl };
