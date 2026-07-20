import { calculatePosition, type CalcInput } from "./calc.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function approxEqual(a: number, b: number, tol = 0.02): boolean {
  return Math.abs(a - b) <= tol;
}

// 案例 1：固定佣金语义的加密改写
// 账户 25000，2% = 500；进场 60，止损 58.5，价差 1.5
// 无百分比手续费、无滑点时：size = 500 / 1.5 ≈ 333.333 → floor 333.333333
{
  const r = calculatePosition({
    equity: 25000,
    riskPercent: 2,
    entry: 60,
    stop: 58.5,
    entryFeePercent: 0,
    exitFeePercent: 0,
    slippagePercent: 0,
    mode: "spot",
    leverage: 1,
    comfortRatio: 1,
  });
  assert(approxEqual(r.riskAmount, 500), `riskAmount=${r.riskAmount}`);
  assert(approxEqual(r.maxSize, 333.333333, 1e-6), `maxSize=${r.maxSize}`);
  assert(approxEqual(r.actualRisk, 500, 0.01), `actualRisk=${r.actualRisk}`);
  console.log("✓ case1: spot no-fee size from 2% risk");
}

// 案例 2：杠杆不改变风险金额
{
  const base: CalcInput = {
    equity: 50000,
    riskPercent: 2,
    entry: 100,
    stop: 97,
    entryFeePercent: 0.04,
    exitFeePercent: 0.04,
    slippagePercent: 0.2,
    mode: "perp",
    leverage: 5,
    comfortRatio: 1,
  };
  const r5 = calculatePosition(base);
  const r20 = calculatePosition({ ...base, leverage: 20 });
  assert(approxEqual(r5.riskAmount, r20.riskAmount), "risk must ignore leverage");
  assert(approxEqual(r5.maxSize, r20.maxSize), "size must ignore leverage");
  assert(r5.marginRequired > r20.marginRequired, "higher leverage → lower margin");
  assert(approxEqual(r5.riskAmount, 1000), `risk=${r5.riskAmount}`);
  console.log("✓ case2: leverage changes margin only");
}

// 案例 3：百分比手续费闭式解，actualRisk ≈ riskAmount
{
  const r = calculatePosition({
    equity: 100000,
    riskPercent: 2,
    entry: 100,
    stop: 97,
    entryFeePercent: 0.1,
    exitFeePercent: 0.1,
    slippagePercent: 0,
    mode: "spot",
    leverage: 1,
    comfortRatio: 1,
  });
  // size = 2000 / (3 + 100*0.002) = 2000/3.2 = 625
  assert(approxEqual(r.maxSize, 625, 1e-6), `maxSize=${r.maxSize}`);
  assert(approxEqual(r.actualRisk, 2000, 0.05), `actualRisk=${r.actualRisk}`);
  console.log("✓ case3: percent fee closed-form");
}

// 案例 4：舒适系数
{
  const r = calculatePosition({
    equity: 100000,
    riskPercent: 2,
    entry: 100,
    stop: 97,
    entryFeePercent: 0,
    exitFeePercent: 0,
    slippagePercent: 0,
    mode: "spot",
    leverage: 1,
    comfortRatio: 0.8,
  });
  assert(approxEqual(r.maxSize, 666.666666, 1e-6), `maxSize=${r.maxSize}`);
  assert(approxEqual(r.suggestedSize, 533.333332, 1e-5), `suggested=${r.suggestedSize}`);
  console.log("✓ case4: comfort ratio");
}

console.log("\nAll calc tests passed.");
