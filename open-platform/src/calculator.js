export const DEFAULT_CALCULATOR_SETTINGS = Object.freeze({
  platformFee: 8.5,
  serviceFee: 11.5,
  twToCnyRate: 4.6,
  cnyToTwRate: 4.5,
  labelFee: 3.5,
  shippingFee: 12,
  deliveryFee: 0,
  domesticShipping: 0,
  freeShipping: 0,
  otherFee: 0,
});

export function calculateProfit(inputs = {}) {
  const values = { ...DEFAULT_CALCULATOR_SETTINGS, ...inputs };
  for (const [name, value] of Object.entries(values)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new TypeError(`${name} must be a non-negative finite number`);
    }
  }
  const { sellPrice = 0, purchasePrice = 0, weight = 0 } = values;
  const { platformFee, serviceFee, twToCnyRate, cnyToTwRate,
    labelFee, shippingFee, deliveryFee, domesticShipping, freeShipping, otherFee } = values;
  if (platformFee >= 100 || serviceFee >= 100) throw new RangeError('fee percentages must be below 100');
  if (twToCnyRate === 0 || cnyToTwRate === 0) throw new RangeError('exchange rates must be positive');
  const rmbValue = sellPrice * (1 - platformFee / 100) * (1 - serviceFee / 100) / twToCnyRate;
  const totalCost = purchasePrice + labelFee + shippingFee * weight + deliveryFee / cnyToTwRate
    + domesticShipping + freeShipping / cnyToTwRate + otherFee;
  const profit = rmbValue - totalCost;
  return {
    rmbValue,
    totalCost,
    profit,
    profitRate: sellPrice > 0 ? profit / (sellPrice / twToCnyRate) * 100 : null,
    roi: profit > 0 ? sellPrice / (profit * cnyToTwRate) : null,
  };
}
