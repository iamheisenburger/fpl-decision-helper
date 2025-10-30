# FPL Decision Helper

An EO-aware Fantasy Premier League assistant that helps you make smart captaincy and XI decisions by balancing **Expected Value (EV)**, **Expected Ownership (EO)**, and **Realized Minutes (rMins)**.

Built for FPL managers competing for top ranks while managing rank-risk through intelligent EO decisions.

## 🎯 Features

### **Captain Decision Engine**
- Manual input for 2 captain candidates
- Tolerance-based decision logic (0.1 EV per 10% EO gap, capped at 1.0 EV)
- Accounts for rMins upside (EV95 × P90)
- Shows full breakdown: EO gap, tolerance, EV gap (raw vs effective), reasoning
- Visual indicators: Shield high-EO (green) vs Chase EV (blue)
- Instant client-side calculations

### **XI Optimizer**
- Manual input for 15-player squad
- Smart Greedy + Local Search algorithm
- Maximizes Risk-Adjusted EV (RAEV) = EV + EO shield bonus
- Formation flexibility (4-4-2, 3-5-2, 4-3-3, 3-4-3, 5-4-1, 5-3-2)
- Shows optimized starting XI, bench, and total RAEV
- Quick Fill button for testing with sample data
- Instant client-side optimization

## 🚀 Tech Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS
- **UI Components**: shadcn/ui
- **Backend**: Convex (serverless functions, reactive database)
- **Deployment**: Vercel

## 📦 Quick Start

1. Clone and install:
```bash
git clone https://github.com/iamheisenburger/fpl-decision-helper.git
cd fpl-decision-helper
npm install
```

2. Set up Convex:
```bash
npx convex dev
```

3. Run the app:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## 📖 Usage Guide

1. **Captain**: Enter stats for 2 captain candidates and get instant recommendation
2. **XI**: Enter your 15-player squad stats and optimize your starting lineup
3. **Settings**: Configure your risk profile (optional - currently uses default values)

## 🧮 Core Formulas

**P90 Calculation:**
- xMins ≥ 88: 1.0
- xMins 85-87: 0.7
- xMins 81-84: 0.4
- xMins < 81: 0.0

**Captaincy Decision:**
```
Tolerance = min(1.0, (EO_gap / 10) × 0.1)
EV_gap_effective = EV_gap_raw + rMins_surcharge
If EV_gap_effective ≤ Tolerance: Shield high-EO
Else: Chase higher-EV
```

**Risk-Adjusted EV:**
```
RAEV = EV - rMins_surcharge + EO_shield_bonus
```

## 🚀 Deploy to Vercel

1. Push to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project
3. Import repository
4. Add environment variable: `NEXT_PUBLIC_CONVEX_URL`
5. Deploy

## 📝 License

MIT

---

**Happy FPL managing! 🚀⚽**# Trigger redeploy
