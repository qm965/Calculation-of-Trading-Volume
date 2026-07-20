# 加密仓位计算器

基于《一个交易者的资金管理系统》第10章：**2% 风险公式 + 交易量公式**，适配加密货币现货 / 永续合约。

**在线地址：** https://qm965.github.io/Calculation-of-Trading-Volume/

推送到 `main` 后，GitHub Actions 会自动构建并发布到 GitHub Pages（仓库 Settings → Pages → Source 需选 **GitHub Actions**）。

## 公式

```
风险金额 = 账户净值 × 风险%（默认 2%，永远基于本金）
有效价差 = |进场价 − 止损价| + 进场价 × 滑点%
仓位    = 风险金额 ÷ (有效价差 + 进场价 × 双边手续费率)
```

永续模式下杠杆只影响**所需保证金**，不改变风险金额。

## 本地开发

```bash
npm install
npm run dev
```

## 构建静态页面

```bash
npm run build
```

产物在 `dist/`，可直接部署到 GitHub Pages、Cloudflare Pages、Netlify，或任意静态服务器。

```bash
npm run preview   # 本地预览 dist
```

## 自测计算逻辑

```bash
npm run test:calc
```

## 使用提示

- 账户请填**当前净值**，盈亏后需更新
- 费率按交易所实际 maker/taker 填写（百分比）
- 建议保留 0.1%–0.3% 滑点缓冲
- 算出的仓位过小 → 价差太大，考虑放弃该笔交易
