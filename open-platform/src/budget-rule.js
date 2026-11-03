function minutes(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new TypeError(`invalid time window: ${value}`);
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

function taipeiMinutes(now) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  return Number(parts.find(part => part.type === 'hour').value) * 60
    + Number(parts.find(part => part.type === 'minute').value);
}

export function evaluateBudgetTopup({ rule, metrics, now = new Date() }) {
  const dailyBudget = Number(metrics.dailyBudgetTwd);
  const listSpend = Number(metrics.spendTwd);
  const liveSpend = metrics.liveSpendTwd == null ? listSpend : Number(metrics.liveSpendTwd);
  const addAmount = Number(rule.add_amount_twd);
  const cap = rule.max_budget_twd == null ? Infinity : Number(rule.max_budget_twd);
  if (![dailyBudget, listSpend, liveSpend, addAmount].every(Number.isFinite)
      || dailyBudget < 0 || listSpend < 0 || liveSpend < 0 || addAmount <= 0
      || !(cap > 0)) throw new TypeError('invalid budget rule or metrics');
  const result = (reason, extra = {}) => ({ eligible: false, reason, ...extra });
  const nowMinute = taipeiMinutes(now);
  if (nowMinute >= 23 * 60 + 55) return result('daily_reset_window');
  if (rule.time_windows?.length) {
    const inWindow = rule.time_windows.some(({ start, end }) => {
      const s = minutes(start);
      const e = Math.min(minutes(end), 23 * 60 + 55);
      return s < e ? nowMinute >= s && nowMinute < e : s > e && (nowMinute >= s || nowMinute < e);
    });
    if (!inWindow) return result('outside_time_window');
  }
  if (dailyBudget >= cap) return result('budget_cap_reached');
  const spend = Math.max(listSpend, liveSpend);
  const gap = Math.max(0, dailyBudget - spend);
  const min = rule.gap_range?.min;
  const max = rule.gap_range?.max;
  const threshold = max != null && max !== '' ? Number(max) : min != null && min !== '' ? Number(min) : 0;
  if (!Number.isFinite(threshold) || threshold < 0) throw new TypeError('invalid gap threshold');
  if (gap > threshold) return result('gap_not_reached', { gapTwd: gap });
  const click = Number(metrics.click ?? 0);
  const cpc = click > 0 ? listSpend / click : 0;
  const cpcLimit = Number(rule.cpc_limit ?? 0);
  if (cpcLimit > 0 && cpc > cpcLimit) return result('cpc_limit_exceeded', { gapTwd: gap, cpc });
  const roi = Number(metrics.roi ?? 0);
  const minRoi = Number(rule.min_roi ?? 0);
  if (minRoi > 0 && roi < minRoi) return result('roi_below_minimum', { gapTwd: gap, roi });
  const targetBudget = Math.min(dailyBudget + addAmount, cap);
  return {
    eligible: true,
    reason: 'matched',
    gapTwd: gap,
    targetBudgetTwd: targetBudget,
    actualIncreaseTwd: targetBudget - dailyBudget,
    delayMinutes: Math.max(0, Number(rule.delay_min ?? 0)),
  };
}
