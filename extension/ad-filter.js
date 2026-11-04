export function matchesCampaignMetrics(metrics, criteria, mode = 'any') {
  if (!['any', 'all'].includes(mode)) throw new TypeError('invalid match mode');
  const checks = [];
  if (criteria.clicksAtLeast !== null) checks.push(metrics.clicks >= criteria.clicksAtLeast);
  if (criteria.cpcAtMost !== null) {
    checks.push(metrics.cpc !== null && metrics.cpc <= criteria.cpcAtMost);
  }
  if (criteria.roiAtLeast !== null) {
    checks.push(metrics.roi !== null && metrics.roi >= criteria.roiAtLeast);
  }
  if (criteria.spendAtLeast !== null) checks.push(metrics.spend >= criteria.spendAtLeast);
  return checks.length === 0 || (mode === 'all' ? checks.every(Boolean) : checks.some(Boolean));
}

export function matchesMetricConditions(values, conditions, mode = 'any') {
  if (!['any', 'all'].includes(mode)) throw new TypeError('invalid match mode');
  if (!Array.isArray(conditions)) throw new TypeError('conditions must be an array');
  if (conditions.length === 0) return true;
  const checks = conditions.map(({ metric, op, value, upper }) => {
    if (op === 'view_no_click') {
      return Number.isFinite(values.impressions) && values.impressions > 0 && values.clicks === 0;
    }
    const actual = values[metric];
    if (!Number.isFinite(actual)) return false;
    if (op === 'eq') return actual === value;
    if (op === 'gt') return actual > value;
    if (op === 'lt') return actual < value;
    if (op === 'range') return actual >= value && actual <= upper;
    throw new TypeError(`invalid operator: ${op}`);
  });
  return mode === 'all' ? checks.every(Boolean) : checks.some(Boolean);
}

export function dateRangeFromPreset(today, preset) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new TypeError('invalid date');
  const days = { today: 0, yesterday: 1, last7: 6, last30: 29, last90: 89 }[preset];
  if (days === undefined) throw new TypeError('invalid date preset');
  const end = new Date(`${today}T00:00:00Z`);
  if (!Number.isFinite(end.getTime())) throw new TypeError('invalid date');
  if (preset === 'yesterday') end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  if (preset !== 'yesterday') start.setUTCDate(start.getUTCDate() - days);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function summarizeDailyMetrics(metrics) {
  if (!Array.isArray(metrics)) throw new TypeError('metrics must be an array');
  const sum = key => {
    const numbers = metrics.map(item => item?.[key])
      .filter(value => value !== null && value !== undefined && value !== '')
      .map(Number).filter(Number.isFinite);
    return numbers.length ? numbers.reduce((total, value) => total + value, 0) : null;
  };
  const impressions = sum('impression');
  const clicks = sum('clicks');
  const spend = sum('expense');
  const gmv = sum('broad_gmv');
  return {
    impressions, clicks, spend,
    cpc: clicks > 0 && spend !== null ? spend / clicks : null,
    roi: spend > 0 && gmv !== null ? gmv / spend : null,
  };
}
