import { randomUUID } from 'node:crypto';

const EDIT_ACTIONS = new Set([
  'start', 'pause', 'resume', 'stop', 'delete', 'change_budget', 'change_roas_target',
]);
const GMS_EDIT_ACTIONS = new Set(['pause', 'resume', 'start', 'change_budget', 'change_roas_target']);

function positiveId(value, name) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new TypeError(`${name} must be a positive safe integer`);
  return id;
}

function positiveNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive number`);
  }
  return value;
}

function dateString(value, name) {
  if (typeof value !== 'string' || !/^\d{2}-\d{2}-\d{4}$/.test(value)) {
    throw new TypeError(`${name} must be DD-MM-YYYY`);
  }
  return value;
}

export class AdsService {
  constructor(session) {
    this.session = session;
  }

  async listCampaignIds(shopId, { adType = 'all', offset = 0, limit = 5000 } = {}) {
    if (!['all', 'auto', 'manual'].includes(adType)) throw new TypeError('invalid adType');
    if (!Number.isSafeInteger(offset) || offset < 0) throw new TypeError('offset must be non-negative');
    if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError('limit must be positive');
    const result = await this.session.request(shopId, {
      path: '/api/v2/ads/get_product_level_campaign_id_list',
      query: { ad_type: adType, offset, limit },
    });
    return result.response;
  }

  async getCampaignSettings(shopId, campaignIds, { infoTypes = [1, 2, 3, 4] } = {}) {
    if (!Array.isArray(campaignIds) || campaignIds.length < 1 || campaignIds.length > 100) {
      throw new TypeError('campaignIds must contain 1–100 IDs');
    }
    if (!Array.isArray(infoTypes) || !infoTypes.length || infoTypes.some(type => ![1, 2, 3, 4].includes(type))) {
      throw new TypeError('invalid infoTypes');
    }
    const result = await this.session.request(shopId, {
      path: '/api/v2/ads/get_product_level_campaign_setting_info',
      query: {
        campaign_id_list: campaignIds.map(id => positiveId(id, 'campaignId')).join(','),
        info_type_list: infoTypes.join(','),
      },
    });
    return result.response;
  }

  async getDailyPerformance(shopId, { campaignIds, startDate, endDate }) {
    if (!Array.isArray(campaignIds) || campaignIds.length < 1 || campaignIds.length > 100) {
      throw new TypeError('campaignIds must contain 1–100 IDs');
    }
    const result = await this.session.request(shopId, {
      path: '/api/v2/ads/get_product_campaign_daily_performance',
      query: {
        campaign_id_list: campaignIds.map(id => positiveId(id, 'campaignId')).join(','),
        start_date: dateString(startDate, 'startDate'),
        end_date: dateString(endDate, 'endDate'),
      },
    });
    return result.response;
  }

  async getHourlyPerformance(shopId, { campaignIds, performanceDate }) {
    if (!Array.isArray(campaignIds) || campaignIds.length < 1 || campaignIds.length > 100) {
      throw new TypeError('campaignIds must contain 1–100 IDs');
    }
    const result = await this.session.request(shopId, {
      path: '/api/v2/ads/get_product_campaign_hourly_performance',
      query: {
        campaign_id_list: campaignIds.map(id => positiveId(id, 'campaignId')).join(','),
        performance_date: dateString(performanceDate, 'performanceDate'),
      },
    });
    return result.response;
  }

  async createManualProductAd(shopId, {
    itemId, budget, startDate, endDate = '', roasTarget,
    biddingMethod = 'auto', selectedKeywords, discoveryAdsLocations,
    enhancedCpc, smartCreativeSetting, referenceId = randomUUID(),
  }) {
    dateString(startDate, 'startDate');
    if (endDate) dateString(endDate, 'endDate');
    if (!['auto', 'manual'].includes(biddingMethod)) throw new TypeError('invalid biddingMethod');
    if (biddingMethod === 'manual' && !selectedKeywords?.length) {
      throw new TypeError('manual bidding requires selectedKeywords');
    }
    const body = {
      reference_id: referenceId,
      item_id: positiveId(itemId, 'itemId'),
      budget: positiveNumber(budget, 'budget'),
      start_date: startDate,
      end_date: endDate,
      bidding_method: biddingMethod,
    };
    if (roasTarget !== undefined) {
      if (typeof roasTarget !== 'number' || !Number.isFinite(roasTarget) || roasTarget < 0) {
        throw new TypeError('roasTarget must be non-negative');
      }
      body.roas_target = roasTarget;
    }
    if (selectedKeywords !== undefined) body.selected_keywords = selectedKeywords;
    if (discoveryAdsLocations !== undefined) body.discovery_ads_locations = discoveryAdsLocations;
    if (enhancedCpc !== undefined) body.enhanced_cpc = Boolean(enhancedCpc);
    if (smartCreativeSetting !== undefined) body.smart_creative_setting = smartCreativeSetting;
    const result = await this.session.request(shopId, {
      path: '/api/v2/ads/create_manual_product_ads', method: 'POST', body,
    });
    return result.response;
  }

  async editManualProductAd(shopId, { campaignId, action, budget, roasTarget, referenceId = randomUUID() }) {
    if (!EDIT_ACTIONS.has(action)) throw new TypeError('invalid edit action');
    const body = { reference_id: referenceId, campaign_id: positiveId(campaignId, 'campaignId'), edit_action: action };
    if (action === 'change_budget') body.budget = positiveNumber(budget, 'budget');
    if (action === 'change_roas_target') {
      if (typeof roasTarget !== 'number' || !Number.isFinite(roasTarget) || roasTarget < 0) {
        throw new TypeError('roasTarget must be non-negative');
      }
      body.roas_target = roasTarget;
    }
    const result = await this.session.request(shopId, {
      path: '/api/v2/ads/edit_manual_product_ads', method: 'POST', body,
    });
    return result.response;
  }

  async checkGmsShopEligibility(shopId) {
    const result = await this.session.request(shopId, {
      path: '/api/v2/ads/check_create_gms_product_campaign_eligibility',
    });
    return result.response;
  }

  async createGmsShopCampaign(shopId, { startDate, endDate, dailyBudget,
    roasTarget, referenceId = randomUUID() }) {
    const body = {
      start_date: dateString(startDate, 'startDate'),
      daily_budget: positiveNumber(dailyBudget, 'dailyBudget'),
      reference_id: referenceId,
    };
    if (endDate !== undefined) body.end_date = dateString(endDate, 'endDate');
    if (roasTarget !== undefined) {
      if (typeof roasTarget !== 'number' || !Number.isFinite(roasTarget) || roasTarget < 0) {
        throw new TypeError('roasTarget must be non-negative');
      }
      body.roas_target = roasTarget;
    }
    const result = await this.session.request(shopId, {
      path: '/api/v2/ads/create_gms_product_campaign', method: 'POST', body,
    });
    return result.response;
  }

  async editGmsShopCampaign(shopId, { campaignId, action, dailyBudget,
    roasTarget, referenceId = randomUUID() }) {
    if (!GMS_EDIT_ACTIONS.has(action)) throw new TypeError('invalid GMS edit action');
    const body = { campaign_id: positiveId(campaignId, 'campaignId'), edit_action: action, reference_id: referenceId };
    if (action === 'change_budget') body.daily_budget = positiveNumber(dailyBudget, 'dailyBudget');
    if (action === 'change_roas_target') {
      if (typeof roasTarget !== 'number' || !Number.isFinite(roasTarget) || roasTarget < 0) {
        throw new TypeError('roasTarget must be non-negative');
      }
      body.roas_target = roasTarget;
    }
    const result = await this.session.request(shopId, {
      path: '/api/v2/ads/edit_gms_product_campaign', method: 'POST', body,
    });
    return result.response;
  }
}
