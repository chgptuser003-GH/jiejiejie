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
