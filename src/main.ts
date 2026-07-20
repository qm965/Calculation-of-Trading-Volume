import "./styles.css";
import {
  calculatePosition,
  formatMoney,
  formatPercent,
  formatSize,
  type CalcInput,
  type TradeMode,
} from "./calc";

const STORAGE_KEY = "trader-amount-cal:v1";

interface StoredPrefs {
  equity: string;
  riskPercent: string;
  entryFeePercent: string;
  exitFeePercent: string;
  slippagePercent: string;
  leverage: string;
  comfortPercent: string;
  mode: TradeMode;
  entry: string;
  stop: string;
}

const defaults: StoredPrefs = {
  equity: "100000",
  riskPercent: "2",
  entryFeePercent: "0.04",
  exitFeePercent: "0.04",
  slippagePercent: "0.2",
  leverage: "5",
  comfortPercent: "100",
  mode: "spot",
  entry: "100",
  stop: "97",
};

function loadPrefs(): StoredPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

function savePrefs(prefs: StoredPrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

function num(el: HTMLInputElement): number {
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : NaN;
}

const prefs = loadPrefs();

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <header class="header">
    <h1>仓位计算器</h1>
    <p>用 2% 风险公式把「能亏多少」换成「该买多少」——风险基于本金，不基于杠杆购买力。</p>
  </header>

  <div class="mode-toggle" role="tablist" aria-label="交易模式">
    <button type="button" data-mode="spot" id="btn-spot">现货</button>
    <button type="button" data-mode="perp" id="btn-perp">永续合约</button>
  </div>

  <div class="layout">
    <section class="panel">
      <h2>输入参数</h2>
      <div class="field-grid">
        <div class="field">
          <label for="equity">账户净值（USDT）</label>
          <input id="equity" type="number" min="0" step="any" value="${prefs.equity}" />
          <span class="hint">使用当前净值，不是初始入金</span>
        </div>
        <div class="field">
          <label for="riskPercent">单笔风险 %</label>
          <input id="riskPercent" type="number" min="0" step="0.1" value="${prefs.riskPercent}" />
          <span class="hint">默认 2%；永远乘以本金</span>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="entry">进场价</label>
            <input id="entry" type="number" min="0" step="any" value="${prefs.entry}" />
          </div>
          <div class="field">
            <label for="stop">止损价</label>
            <input id="stop" type="number" min="0" step="any" value="${prefs.stop}" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="entryFee">开仓费率 %</label>
            <input id="entryFee" type="number" min="0" step="0.01" value="${prefs.entryFeePercent}" />
          </div>
          <div class="field">
            <label for="exitFee">平仓费率 %</label>
            <input id="exitFee" type="number" min="0" step="0.01" value="${prefs.exitFeePercent}" />
          </div>
        </div>
        <div class="field">
          <label for="slippage">滑点缓冲 %</label>
          <input id="slippage" type="number" min="0" step="0.05" value="${prefs.slippagePercent}" />
          <span class="hint">加在价差上，防止实际亏损超预算</span>
        </div>
        <div class="field perp-only" id="leverage-field">
          <label for="leverage">杠杆倍数</label>
          <input id="leverage" type="number" min="1" step="1" value="${prefs.leverage}" />
          <span class="hint">只影响保证金，不放大风险 %</span>
        </div>
        <div class="field slider-field">
          <div class="slider-head">
            <label for="comfort">心理舒适仓位</label>
            <span id="comfort-label">${prefs.comfortPercent}%</span>
          </div>
          <input id="comfort" type="range" min="70" max="100" step="1" value="${prefs.comfortPercent}" />
          <span class="hint">建议下单名义 = 公式仓位名义 × 该比例</span>
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>计算结果 <span id="side-tag" class="side-tag"></span></h2>
      <div class="results-hero">
        <div class="label">公式最大仓位</div>
        <div class="value" id="out-max-size">—</div>
        <div class="sub">建议下单量 <strong id="out-suggested">—</strong></div>
      </div>
      <div class="metric-grid">
        <div class="metric">
          <div class="m-label">风险金额</div>
          <div class="m-value" id="out-risk">—</div>
        </div>
        <div class="metric">
          <div class="m-label">实际风险</div>
          <div class="m-value" id="out-actual-risk">—</div>
        </div>
        <div class="metric">
          <div class="m-label">名义价值</div>
          <div class="m-value" id="out-notional">—</div>
        </div>
        <div class="metric">
          <div class="m-label">预估双边手续费</div>
          <div class="m-value" id="out-fees">—</div>
        </div>
        <div class="metric" id="metric-usage">
          <div class="m-label">资金占用</div>
          <div class="m-value" id="out-usage">—</div>
        </div>
        <div class="metric perp-only" id="metric-margin">
          <div class="m-label">所需保证金</div>
          <div class="m-value" id="out-margin">—</div>
        </div>
      </div>
      <div class="messages" id="messages"></div>
      <details class="steps">
        <summary>展开公式步骤</summary>
        <div class="steps-body" id="steps-body"></div>
      </details>
    </section>

    <section class="panel quick-card">
      <h2>速查卡 · 先算后买</h2>
      <pre id="quick-card"></pre>
    </section>
  </div>

  <p class="footer-note">依据《一个交易者的资金管理系统》第10章 · 风险永远基于本金</p>
`;

const els = {
  equity: document.querySelector<HTMLInputElement>("#equity")!,
  riskPercent: document.querySelector<HTMLInputElement>("#riskPercent")!,
  entry: document.querySelector<HTMLInputElement>("#entry")!,
  stop: document.querySelector<HTMLInputElement>("#stop")!,
  entryFee: document.querySelector<HTMLInputElement>("#entryFee")!,
  exitFee: document.querySelector<HTMLInputElement>("#exitFee")!,
  slippage: document.querySelector<HTMLInputElement>("#slippage")!,
  leverage: document.querySelector<HTMLInputElement>("#leverage")!,
  comfort: document.querySelector<HTMLInputElement>("#comfort")!,
  comfortLabel: document.querySelector<HTMLSpanElement>("#comfort-label")!,
  btnSpot: document.querySelector<HTMLButtonElement>("#btn-spot")!,
  btnPerp: document.querySelector<HTMLButtonElement>("#btn-perp")!,
  sideTag: document.querySelector<HTMLSpanElement>("#side-tag")!,
  outMaxSize: document.querySelector<HTMLElement>("#out-max-size")!,
  outSuggested: document.querySelector<HTMLElement>("#out-suggested")!,
  outRisk: document.querySelector<HTMLElement>("#out-risk")!,
  outActualRisk: document.querySelector<HTMLElement>("#out-actual-risk")!,
  outNotional: document.querySelector<HTMLElement>("#out-notional")!,
  outFees: document.querySelector<HTMLElement>("#out-fees")!,
  outUsage: document.querySelector<HTMLElement>("#out-usage")!,
  outMargin: document.querySelector<HTMLElement>("#out-margin")!,
  metricMargin: document.querySelector<HTMLElement>("#metric-margin")!,
  metricUsage: document.querySelector<HTMLElement>("#metric-usage")!,
  messages: document.querySelector<HTMLElement>("#messages")!,
  stepsBody: document.querySelector<HTMLElement>("#steps-body")!,
  quickCard: document.querySelector<HTMLElement>("#quick-card")!,
  leverageField: document.querySelector<HTMLElement>("#leverage-field")!,
};

let mode: TradeMode = prefs.mode === "perp" ? "perp" : "spot";

function setMode(next: TradeMode) {
  mode = next;
  els.btnSpot.classList.toggle("active", mode === "spot");
  els.btnPerp.classList.toggle("active", mode === "perp");
  document.querySelectorAll(".perp-only").forEach((el) => {
    el.classList.toggle("hidden", mode !== "perp");
  });
  recalculate();
}

function collectInput(): CalcInput {
  return {
    equity: num(els.equity),
    riskPercent: num(els.riskPercent),
    entry: num(els.entry),
    stop: num(els.stop),
    entryFeePercent: num(els.entryFee),
    exitFeePercent: num(els.exitFee),
    slippagePercent: num(els.slippage),
    mode,
    leverage: num(els.leverage) || 1,
    comfortRatio: (num(els.comfort) || 100) / 100,
  };
}

function persist() {
  savePrefs({
    equity: els.equity.value,
    riskPercent: els.riskPercent.value,
    entryFeePercent: els.entryFee.value,
    exitFeePercent: els.exitFee.value,
    slippagePercent: els.slippage.value,
    leverage: els.leverage.value,
    comfortPercent: els.comfort.value,
    mode,
    entry: els.entry.value,
    stop: els.stop.value,
  });
}

function recalculate() {
  const comfortPct = els.comfort.value;
  els.comfortLabel.textContent = `${comfortPct}%`;

  const input = collectInput();
  const result = calculatePosition(input);
  persist();

  const entry = input.entry;
  const stop = input.stop;
  if (entry > 0 && stop > 0 && entry !== stop) {
    const isLong = entry > stop;
    els.sideTag.textContent = isLong ? "做多" : "做空";
    els.sideTag.className = `side-tag ${isLong ? "long" : "short"}`;
  } else {
    els.sideTag.textContent = "";
    els.sideTag.className = "side-tag";
  }

  if (!result.ok && result.maxSize === 0) {
    els.outMaxSize.textContent = "—";
    els.outSuggested.textContent = "—";
  } else {
    els.outMaxSize.textContent = `${formatSize(result.maxSize)} 币`;
    els.outSuggested.textContent = `${formatMoney(result.suggestedNotional)} USDT`;
  }

  els.outRisk.textContent = `${formatMoney(result.riskAmount)} USDT`;
  els.outActualRisk.textContent = `${formatMoney(result.actualRisk)}（${formatPercent(result.actualRiskPercent)}%）`;
  els.outNotional.textContent = `${formatMoney(result.notional)} USDT`;
  els.outFees.textContent = `${formatMoney(result.estimatedFees)} USDT`;
  els.outUsage.textContent = `${formatPercent(result.capitalUsagePercent)}% 账户`;
  els.outMargin.textContent = `${formatMoney(result.marginRequired)} USDT`;

  els.metricMargin.classList.toggle("danger", result.marginExceedsEquity);
  els.metricUsage.classList.toggle(
    "warn",
    mode === "spot" && result.notional > input.equity && result.notional > 0,
  );

  els.messages.innerHTML = result.messages
    .map((m) => {
      const danger =
        m.includes("放弃") || m.includes("超过") || m.includes("不足");
      return `<div class="msg${danger ? " danger" : ""}">${m}</div>`;
    })
    .join("");

  const feePct =
    input.entryFeePercent + input.exitFeePercent;
  els.stepsBody.innerHTML = `
    <div>1. 风险金额 = ${formatMoney(input.equity)} × ${formatPercent(input.riskPercent)}% = <code>${formatMoney(result.riskAmount)} USDT</code></div>
    <div>2. 原始价差 = |${input.entry} − ${input.stop}| = <code>${formatMoney(result.rawDistance, 4)}</code></div>
    <div>3. 滑点缓冲 = ${input.entry} × ${formatPercent(input.slippagePercent)}% = <code>${formatMoney(result.slippageBuffer, 4)}</code></div>
    <div>4. 有效价差 = ${formatMoney(result.rawDistance, 4)} + ${formatMoney(result.slippageBuffer, 4)} = <code>${formatMoney(result.effectiveDistance, 4)}</code></div>
    <div>5. 双边费率 = ${formatPercent(feePct, 4)}% → 分母附加 = entry × 费率 = <code>${formatMoney(input.entry * result.roundTripFeeRate, 4)}</code></div>
    <div>6. 仓位 = 风险 ÷ (有效价差 + 费率附加) = <code>${formatSize(result.maxSize)}</code></div>
    <div>7. 建议下单 = 名义 × ${comfortPct}% = <code>${formatMoney(result.suggestedNotional)} USDT</code>（${formatSize(result.suggestedSize)} 币）</div>
    ${
      mode === "perp"
        ? `<div>8. 保证金 = 名义价值 ÷ ${input.leverage}x = <code>${formatMoney(result.marginRequired)} USDT</code>（风险仍按本金 ${formatPercent(input.riskPercent)}%）</div>`
        : ""
    }
  `;

  els.quickCard.innerHTML = `风险金额 = 账户 × 风险% = <span class="hl">${formatMoney(input.equity)} × ${formatPercent(input.riskPercent)}% = ${formatMoney(result.riskAmount)}</span>
交易量 = 风险 ÷ (有效价差 + 进场价×双边费率)
       = <span class="hl">${formatMoney(result.riskAmount)} ÷ (${formatMoney(result.effectiveDistance, 4)} + ${formatMoney(input.entry * result.roundTripFeeRate, 4)}) = ${formatSize(result.maxSize)}</span>
建议下单 = ${formatMoney(result.notional)} × ${comfortPct}% = <span class="hl">${formatMoney(result.suggestedNotional)} USDT</span>（${formatSize(result.suggestedSize)} 币）`;
}

els.btnSpot.addEventListener("click", () => setMode("spot"));
els.btnPerp.addEventListener("click", () => setMode("perp"));

const inputs = [
  els.equity,
  els.riskPercent,
  els.entry,
  els.stop,
  els.entryFee,
  els.exitFee,
  els.slippage,
  els.leverage,
  els.comfort,
];

for (const el of inputs) {
  el.addEventListener("input", recalculate);
}

setMode(mode);
