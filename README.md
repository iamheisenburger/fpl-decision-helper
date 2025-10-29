# FPL Decision Helper

An EO-aware Fantasy Premier League assistant that helps you make smart captaincy, XI, and transfer decisions by balancing **Expected Value (EV)**, **Expected Ownership (EO)**, and **Realized Minutes (rMins)** according to your risk profile.

Built for FPL managers competing for top ranks while managing rank-risk through intelligent EO decisions.

## 🎯 Features

### **Captain Decision Engine**
- Compare two captain candidates side-by-side
- Tolerance-based decision logic (0.1 EV per 10% EO gap, capped at 1.0 EV)
- Accounts for rMins upside (EV95 × P90)
- Shows full breakdown: EO gap, tolerance, EV gap (raw vs effective), reasoning
- Visual indicators: Shield high-EO (green) vs Chase EV (blue)

### **XI Optimizer**
- Smart Greedy + Local Search algorithm
- Maximizes Risk-Adjusted EV (RAEV) = EV + EO shield bonus - rMins surcharge
- Formation flexibility (any, 4-4-2, 3-5-2, 4-3-3, 3-4-3, 5-4-1, 5-3-2)
- Shows optimized starting XI, bench, and top 3 pivot options
- Displays total RAEV, EV, and XI bleed

### **Data Management**
- **Player Database**: Add/manage FPL players (name, position, price, team)
- **Squad Selection**: Pick your 15-man squad for each gameweek
- **Weekly Stats**: Enter EV, EV95, xMins, EO for each player
- All-in-one interface - no external spreadsheets needed

### **Risk Profile Settings**
Customize your tolerance levels:
- Captaincy EO rate & cap
- XI EO rate & cap
- rMins weight
- xMins penalty
- Weekly bleed budget (default: 0.8 EV)

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

1. **Settings**: Configure your risk profile
2. **Data Entry** → Add players, select squad, enter weekly stats
3. **Captain**: Compare candidates and get recommendation
4. **XI**: Optimize your starting lineup

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

**Happy FPL managing! 🚀⚽**