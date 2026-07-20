/** 交易模式 */
export type TradeMode = "spot" | "perp";

export interface CalcInput {
  /** 账户净值（本金） */
  equity: number;
  /** 风险百分比，如 2 表示 2% */
  riskPercent: number;
  /** 进场价 */
  entry: number;
  /** 止损价 */
  stop: number;
  /** 开仓手续费率，如 0.1 表示 0.1% */
  entryFeePercent: number;
  /** 平仓手续费率，如 0.1 表示 0.1% */
  exitFeePercent: number;
  /** 滑点缓冲百分比，如 0.2 表示 0.2% */
  slippagePercent: number;
  /** 交易模式 */
  mode: TradeMode;
  /** 杠杆倍数（仅永续合约） */
  leverage: number;
  /** 心理舒适系数 0.7–1.0，表示使用公式仓位的比例 */
  comfortRatio: number;
}

export interface CalcResult {
  /** 是否有效 */
  ok: boolean;
  /** 错误或警告信息 */
  messages: string[];
  /** 单笔风险金额 = equity × risk% */
  riskAmount: number;
  /** 原始价差 |entry − stop| */
  rawDistance: number;
  /** 滑点缓冲金额 = entry × slippage% */
  slippageBuffer: number;
  /** 有效价差 = rawDistance + slippageBuffer */
  effectiveDistance: number;
  /** 双边费率（小数，如 0.002） */
  roundTripFeeRate: number;
  /** 公式最大仓位（币数量） */
  maxSize: number;
  /** 建议下单量 = maxSize × comfortRatio */
  suggestedSize: number;
  /** 名义价值 = size × entry（按公式仓位） */
  notional: number;
  /** 建议仓位名义价值 */
  suggestedNotional: number;
  /** 预估双边手续费（按公式仓位） */
  estimatedFees: number;
  /** 实际风险金额（应 ≈ riskAmount） */
  actualRisk: number;
  /** 实际风险占账户比例（%） */
  actualRiskPercent: number;
  /** 名义占用占账户比例（%，现货） */
  capitalUsagePercent: number;
  /** 所需保证金（合约） */
  marginRequired: number;
  /** 保证金是否超过账户 */
  marginExceedsEquity: boolean;
  /** 仓位是否过小建议放弃 */
  tooSmall: boolean;
}

const SIZE_DECIMALS = 6;
const MIN_MEANINGFUL_SIZE = 1e-8;

function pctToRate(percent: number): number {
  return percent / 100;
}

/** 向下截断到指定小数位（仓位宁少勿多，避免超风险） */
export function floorTo(value: number, decimals: number = SIZE_DECIMALS): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const factor = 10 ** decimals;
  return Math.floor(value * factor + Number.EPSILON) / factor;
}

export function calculatePosition(input: CalcInput): CalcResult {
  const messages: string[] = [];
  const empty: CalcResult = {
    ok: false,
    messages,
    riskAmount: 0,
    rawDistance: 0,
    slippageBuffer: 0,
    effectiveDistance: 0,
    roundTripFeeRate: 0,
    maxSize: 0,
    suggestedSize: 0,
    notional: 0,
    suggestedNotional: 0,
    estimatedFees: 0,
    actualRisk: 0,
    actualRiskPercent: 0,
    capitalUsagePercent: 0,
    marginRequired: 0,
    marginExceedsEquity: false,
    tooSmall: false,
  };

  const {
    equity,
    riskPercent,
    entry,
    stop,
    entryFeePercent,
    exitFeePercent,
    slippagePercent,
    mode,
    leverage,
    comfortRatio,
  } = input;

  if (!(equity > 0)) {
    messages.push("请输入有效的账户净值");
    return empty;
  }
  if (!(riskPercent > 0)) {
    messages.push("风险百分比必须大于 0");
    return empty;
  }
  if (!(entry > 0) || !(stop > 0)) {
    messages.push("请输入有效的进场价与止损价");
    return empty;
  }
  if (entry === stop) {
    messages.push("进场价与止损价不能相同");
    return empty;
  }
  if (entryFeePercent < 0 || exitFeePercent < 0 || slippagePercent < 0) {
    messages.push("费率与滑点不能为负数");
    return empty;
  }
  if (mode === "perp" && !(leverage >= 1)) {
    messages.push("杠杆倍数至少为 1");
    return empty;
  }
  if (!(comfortRatio > 0) || comfortRatio > 1) {
    messages.push("舒适系数需在 0–100% 之间");
    return empty;
  }

  const riskAmount = equity * pctToRate(riskPercent);
  const rawDistance = Math.abs(entry - stop);
  const slippageBuffer = entry * pctToRate(slippagePercent);
  const effectiveDistance = rawDistance + slippageBuffer;
  const roundTripFeeRate =
    pctToRate(entryFeePercent) + pctToRate(exitFeePercent);

  // size = risk / (effectiveDistance + entry × roundTripFeeRate)
  const denominator = effectiveDistance + entry * roundTripFeeRate;
  if (!(denominator > 0)) {
    messages.push("有效价差无效，无法计算");
    return empty;
  }

  const rawSize = riskAmount / denominator;
  const maxSize = floorTo(rawSize);
  const tooSmall = maxSize < MIN_MEANINGFUL_SIZE || rawSize < MIN_MEANINGFUL_SIZE;

  if (tooSmall) {
    messages.push("价差过大，公式仓位过小，建议放弃这笔交易");
  }

  const suggestedSize = floorTo(maxSize * comfortRatio);
  const notional = maxSize * entry;
  const suggestedNotional = suggestedSize * entry;
  const estimatedFees = notional * roundTripFeeRate;
  const actualRisk = maxSize * effectiveDistance + estimatedFees;
  const actualRiskPercent = equity > 0 ? (actualRisk / equity) * 100 : 0;
  const capitalUsagePercent = equity > 0 ? (notional / equity) * 100 : 0;

  let marginRequired = 0;
  let marginExceedsEquity = false;
  if (mode === "perp") {
    marginRequired = notional / leverage;
    marginExceedsEquity = marginRequired > equity;
    if (marginExceedsEquity) {
      messages.push(
        `所需保证金 ${formatMoney(marginRequired)} 超过账户净值，请降低杠杆或放弃`,
      );
    }
  }

  // 现货：名义价值超过账户时提示（可用现金不足）
  if (mode === "spot" && notional > equity) {
    messages.push(
      `名义占用 ${formatMoney(notional)} 超过账户净值，现货资金不足（可用杠杆购买力时请切换到永续模式）`,
    );
  }

  return {
    ok: !tooSmall && maxSize > 0,
    messages,
    riskAmount,
    rawDistance,
    slippageBuffer,
    effectiveDistance,
    roundTripFeeRate,
    maxSize,
    suggestedSize,
    notional,
    suggestedNotional,
    estimatedFees,
    actualRisk,
    actualRiskPercent,
    capitalUsagePercent,
    marginRequired,
    marginExceedsEquity,
    tooSmall,
  };
}

export function formatMoney(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatSize(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 1) {
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
  }
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export function formatPercent(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(decimals);
}
