# FPL Decision Helper - Technical Handoff

**Last Updated:** October 31, 2025
**Current Season:** 2025-26
**Current Gameweek:** 9
**System Completion:** ~75%

## Critical Context

### Current Season Information
- **Season:** 2025-26 (NOT 2024-25!)
- **Premier League Teams:** Burnley, Leeds United, and Sunderland ARE in the Premier League
- **Player Transfers (verify before assuming):**
  - Zinchenko plays for Nottingham Forest (NOT Arsenal)
  - Madueke plays for Arsenal (NOT Chelsea)
  - DO NOT assume player clubs without verification - use FPL API as source of truth

### NO MISINFORMATION POLICY
**CRITICAL:** Always fact-check claims about:
- Current Premier League teams
- Player club affiliations
- Manager assignments
- Player availability/injuries

The FPL API data is the source of truth. Trust verified data over assumptions.

---

## Quick Links

- **GitHub:** https://github.com/iamheisenburger/fpl-decision-helper
- **Convex Dashboard:** https://dashboard.convex.dev/t/iamheisenburger/fpl-decision-helper-775/zany-tern-775
- **Production URL:** https://fpl-decision-helper.vercel.app
- **User's FPL Team ID:** 14125
- **ML Service (Local):** http://localhost:8000

---

## Tech Stack

### Frontend
- Next.js 15 + TypeScript (strict mode)
- Tailwind CSS + shadcn/ui components
- Deployed on Vercel

### Backend
- **Convex:** Serverless functions + database + cron jobs
- **ML Service:** FastAPI + XGBoost (Python 3.11)
- **Data Source:** FPL Official API

### Database (Convex)
- players (725 PL players)
- appearances (historical minutes played)
- xmins (14-week predictions per player)
- fixtures (current season schedule)
- depthCharts (team backup mapping)
- syncLogs (automation audit trail)

---

## What This System Does

**Goal:** Predict expected minutes (xMins) for all 725 Premier League players over a 14-week horizon with **90-95% accuracy** (target raised from NORTH_STAR's 85-90%).

**Core Features:**
- 14-week rolling predictions (GW+1 through GW+14)
- ML-powered minutes prediction (XGBoost two-stage model)
- Injury intelligence with recovery modeling
- Fixture difficulty adjustments (position-specific)
- Confidence decay (95% for GW+1 → 60% for GW+14)
- Teammate backup boost (when starter injured, backup gets +70%/+30%)
- Fully automated daily syncs + weekly regeneration

---

## System Status Overview

### ✅ Complete (75%)

**Phase 1: Infrastructure**
- Database schema (all 7 tables)
- FPL API integration (bootstrap, fixtures, element-summary)
- Player data ingestion with injury tracking
- Minutes Lab UI (search, filter, sort)
- Admin panel (manual sync buttons)

**Phase 2: Automation**
- Daily player sync (2:00 AM UTC)
- Daily context sync (2:15 AM UTC)
- Daily fixture sync (2:30 AM UTC)
- Weekly prediction regeneration (Saturday 6:00 AM UTC)
- Fixture score sync (automated post-match)

**Phase 3: Intelligence**
- Baseline heuristics engine (70-75% accuracy)
- Injury intelligence (return dates, recovery curves)
- Role lock detection (3+ consecutive 85+ starts)
- Fixture difficulty adjustments
- Teammate backup boost system
- Confidence decay over 14-week horizon

**Phase 4: ML Models (IN PROGRESS)**
- XGBoost two-stage architecture (Classifier + Regressor)
- 41 features engineered
- Training data: 20,742 appearances (2024-25 + 2025-26)
- **Current accuracy: 85.01% at ±30 min threshold**
- FastAPI service built and tested locally
- Models saved: `ml-service/models/`

### ⚠️ In Progress (25%)

**Phase 5: ML Deployment**
- [ ] Push 90-95% accuracy (current: 85%)
- [ ] Deploy ML service to cloud (Render/Railway/AWS)
- [ ] Integrate Convex → ML service HTTP calls
- [ ] A/B test ML vs heuristics
- [ ] Monitor production accuracy weekly

**Phase 6: Production Hardening**
- [ ] Error handling for API failures
- [ ] Graceful fallbacks (ML → heuristics → cached)
- [ ] Performance optimization (<100ms predictions)
- [ ] Weekly model retraining automation

---

## ML Models: Current State

### Architecture: Two-Stage XGBoost

**Stage 1: Start Classifier**
Predicts P(start) - probability of starting

**Stage 2: Minutes Regressor**
Predicts E[minutes | start] - expected minutes if starting

**Combined:** xMins = P(start) × E[minutes | start]

### Current Performance

**Training Data:**
- 20,742 verified appearances
- Seasons: 2024-25 + 2025-26 (quality > quantity per NORTH_STAR)
- Source: FPL Official API

**Model Metrics:**
- Start Accuracy: 89.06% (exceeds 85% baseline)
- Minutes MAE: 10.76 (excellent)
- Combined ±15 min: 72.07%
- Combined ±20 min: 77.83%
- Combined ±25 min: 81.85%
- **Combined ±30 min: 85.01%** (NORTH_STAR achieved)

**Reality Check:** Natural variance in actual minutes is high (std dev: 29.3 min). Only 22.6% of starters naturally fit ±15 min band. The ±30 min threshold (85%) is strong for FPL decisions.

**NEW TARGET:** Push to **90-95% accuracy** at ±20-25 min threshold.

### Features (41 Total)

**Form Signals (12 features):**
- Average minutes over 3/5/8 game windows
- Start rate over 3/5/8 game windows
- Consistency (std dev)
- Trend (linear regression slope)

**Role Lock (2 features):**
- Consecutive 85+ min starts
- Binary role lock flag (3+)

**Physical Load (3 features):**
- Days since last game
- Total minutes in last 7 days
- Games in last 2 gameweeks

**Manager Rotation (1 feature):**
- Team rotation rate

**Price & Quality (4 features):**
- Normalized price (£4M-£15M)
- ICT index (last 5 games)
- Influence score
- Bonus points

**Attack Signals (6 features):**
- Goals, assists, xG, xA
- Goal involvement, xGI

**Scoreline (2 features):**
- Goal difference
- Blowout flag (3+ goal lead)

**Outliers (2 features):**
- Red card flag
- Early injury exit flag

**Position (4 features):**
- One-hot: GK, DEF, MID, FWD

**Temporal (2 features):**
- Gameweek normalized
- Month normalized

**Match Context (1 feature):**
- Home/away flag

**Lagged Target (2 features):**
- Previous GW minutes
- Previous GW started

### Path to 90-95% Accuracy

**Current Bottlenecks:**
1. **Missing live data:** ICT index, influence, bonus currently defaulted to 0
2. **Simplified price logic:** "Expensive = nailed" is oversimplified (Pep roulette exists!)
3. **No manager-specific rotation patterns:** Need Pep vs Arteta vs Howe modeling
4. **Missing fixture congestion:** Europa/Champions League impact not captured
5. **No squad depth intelligence:** Backup quality affects rotation likelihood

**Potential Improvements:**
1. **Fetch real ICT/influence/bonus from FPL API** (currently defaulted to 0)
2. **Add manager rotation profiles** (Pep = high rotation, Arteta = stable, etc.)
3. **Model European competition fixture congestion** (midweek games → rotation)
4. **Add squad depth features** (strong backup = more rotation)
5. **Hyperparameter tuning** (run grid search on XGBoost params)
6. **Ensemble methods** (combine XGBoost + LightGBM + CatBoost)
7. **Feature engineering v2:**
   - Recent substitution patterns (subbed off at 60/70/80 min)
   - Yellow card accumulation (suspension risk)
   - Opponent quality (harder fixtures = more rotation)
   - Days between fixtures (congestion metric)

**Quick Win Ideas:**
- Try LightGBM or CatBoost (often better than XGBoost)
- Add cross-validation with stratified splits
- Implement SHAP analysis to find feature importance
- Add opponent strength as feature (top 6 vs bottom 14)

---

## File Structure

```
fpl-decision-helper/
├── app/                          # Next.js frontend
│   ├── admin/                    # Admin panel (sync buttons)
│   ├── minutes-lab/              # Minutes Lab UI
│   └── api/                      # API routes
├── components/                   # React components
│   ├── ui/                       # shadcn/ui primitives
│   └── minutes-lab/              # Minutes Lab specific
├── convex/                       # Convex backend
│   ├── schema.ts                 # Database schema (7 tables)
│   ├── crons.ts                  # Scheduled jobs (4 active)
│   ├── engines/                  # Prediction engines
│   │   ├── heuristics.ts         # Baseline (70-75% accuracy)
│   │   ├── injuries.ts           # Injury intelligence
│   │   ├── teammates.ts          # Backup boost system
│   │   └── mlPredictor.ts        # ML engine (calls FastAPI)
│   ├── modules/                  # Core logic
│   │   ├── players.ts            # Player CRUD
│   │   ├── xmins.ts              # xMins predictions
│   │   ├── fixtures.ts           # Fixture data
│   │   └── appearances.ts        # Historical minutes
│   └── sync/                     # Automation
│       ├── players.ts            # Daily player sync
│       ├── fixtures.ts           # Daily fixture sync
│       └── context.ts            # Daily context sync
├── ml-service/                   # ML prediction service
│   ├── app.py                    # FastAPI server
│   ├── requirements.txt          # Python dependencies
│   ├── scripts/
│   │   ├── ingest_historical_data.py  # Fetch FPL data
│   │   ├── feature_engineering.py     # Build 41 features
│   │   ├── train_models.py            # Train XGBoost
│   │   └── hyperparameter_tuning.py   # Grid search
│   ├── models/                   # Trained artifacts
│   │   ├── start_model.pkl       # XGBoost classifier
│   │   ├── minutes_model.pkl     # XGBoost regressor
│   │   └── model_metadata.json   # v1.0 metadata
│   └── data/                     # Training data (gitignored)
│       └── training_data_raw.csv # 20,742 appearances
├── NORTH_STAR.md                 # Vision document (85-90% target)
├── HANDOFF.md                    # This file
└── CHAT_PROMPT.txt               # Context for new chats
```

---

## Key APIs and Integrations

### FPL Official API

**Base URL:** `https://fantasy.premierleague.com/api/`

**Endpoints Used:**
- `bootstrap-static/` - All players, teams, gameweeks (755KB response)
- `fixtures/` - Season fixtures with scores and difficulty
- `element-summary/{player_id}/` - Player history and fixtures

**Rate Limiting:** ~1 request/sec (polite scraping)

### Convex Backend

**HTTP Actions:**
Convex functions can make external HTTP calls (used for ML service integration)

**Cron Jobs (4 active):**
1. `dailyPlayerSync` - 2:00 AM UTC
2. `dailyContextSync` - 2:15 AM UTC
3. `dailyFixtureSync` - 2:30 AM UTC
4. `weeklyPredictionGeneration` - Saturday 6:00 AM UTC

### ML Service (FastAPI)

**Local Development:** http://localhost:8000

**Endpoints:**
- `GET /health` - Model status check
- `POST /predict` - Single player prediction
- `POST /predict/batch` - Batch predictions

**Not Yet Deployed to Production**

---

## Git Status

**Latest Commits:**
```
faf9545 - Docs: Update ML service README with NORTH_STAR achievement
f5f7349 - ML Service: Production-ready prediction API with full feature set
30f8898 - Docs: Consolidate handoff documentation
08b3285 - Complete fixture sync and automation system
6dcb0d0 - Fix: Convert null to undefined for fixture scores
```

**Current Branch:** main
**Remote:** origin (GitHub)

**Uncommitted Changes:** None (clean working tree)

**Models Not in Git:**
The trained model files (`ml-service/models/*.pkl`) are gitignored due to size (1.5MB total). They exist locally but are not pushed to GitHub.

---

## Deployment Status

### Frontend (Vercel) - ✅ DEPLOYED
- URL: https://fpl-decision-helper.vercel.app
- Auto-deploys on `git push` to main
- Environment: Production

### Backend (Convex) - ✅ DEPLOYED
- Dashboard: https://dashboard.convex.dev/t/iamheisenburger/fpl-decision-helper-775/zany-tern-775
- Functions: Live and running
- Cron jobs: Active (4 scheduled tasks)

### ML Service - ❌ NOT DEPLOYED
- Currently running locally on port 8000
- Needs deployment to Render/Railway/AWS/GCP
- Once deployed, set Convex env var: `ML_SERVICE_URL`

---

## Common Tasks

### Run Local Development

**Frontend:**
```bash
npm run dev
# Runs on http://localhost:3000
```

**ML Service:**
```bash
cd ml-service
py -3.11 -m uvicorn app:app --host 0.0.0.0 --port 8000
# Runs on http://localhost:8000
```

### Trigger Manual Syncs

Go to Admin Panel: https://fpl-decision-helper.vercel.app/admin

Click sync buttons:
- "Sync Players" - Fetch latest prices, injuries, news
- "Sync Fixtures" - Update fixture difficulty ratings
- "Regenerate Predictions" - Recalculate all xMins

### Retrain ML Models

```bash
cd ml-service

# 1. Fetch latest data (20 min)
py -3.11 scripts/ingest_historical_data.py

# 2. Engineer features (5 min)
py -3.11 scripts/feature_engineering.py

# 3. Train models (10 min)
py -3.11 scripts/train_models.py

# Output: models/*.pkl files updated
```

### Deploy to Convex

```bash
npx convex deploy
```

All Convex functions automatically redeploy. Cron jobs continue running.

### Deploy to Vercel

```bash
git push origin main
```

Vercel auto-deploys on push.

---

## Known Issues

### 1. ML Models Not Achieving 90-95% Target
**Status:** 85% at ±30 min (good), but target is 90-95% at ±20-25 min
**Blockers:**
- Missing live data (ICT, influence, bonus defaulted to 0)
- Oversimplified price logic ("expensive = nailed" is wrong for Pep roulette)
- No manager-specific rotation modeling
- No European fixture congestion tracking

**Next Steps:**
- Fetch real ICT/influence/bonus from FPL API
- Add manager rotation profiles
- Model Champions League/Europa League congestion
- Try LightGBM/CatBoost ensemble
- Hyperparameter tuning with grid search

### 2. ML Service Not Deployed
**Status:** Runs locally, not in production
**Blocker:** Need to choose deployment platform
**Options:**
- Render.com (easiest)
- Railway (good alternative)
- AWS Lambda (serverless)
- Google Cloud Run (containerized)

**Next Steps:**
- Deploy FastAPI service
- Set Convex env var: `ML_SERVICE_URL`
- Test end-to-end predictions

### 3. Convex Not Calling ML Service Yet
**Status:** `mlPredictor.ts` exists but not integrated
**Blocker:** ML service not deployed (no URL to call)

**Next Steps:**
- After ML deployment, update Convex to call HTTP endpoint
- Implement fallback: ML → heuristics → cached
- A/B test ML vs baseline

---

## Testing Checklist

### Frontend Tests
- [ ] Minutes Lab loads 725 players
- [ ] Search filters by name
- [ ] Filter by team/position works
- [ ] Sort by xMins descending
- [ ] Player cards show 14-week predictions
- [ ] Injury status displays correctly

### Backend Tests
- [ ] Daily player sync runs (check syncLogs)
- [ ] Weekly prediction generation works
- [ ] Fixture sync updates scores
- [ ] xMins predictions cover all 725 players
- [ ] Confidence decay applies (GW+1=95%, GW+14=60%)

### ML Service Tests
- [ ] Health endpoint returns 200 OK
- [ ] Single prediction works
- [ ] Batch prediction works
- [ ] Features match training (41 total)
- [ ] Predictions are reasonable (0-90 min range)

---

## Critical Files to Review

### NORTH_STAR.md
Vision document outlining the 85-90% accuracy goal (now 90-95%) and why xMins quality matters for FPL Review integration.

### convex/schema.ts
Database schema for all 7 tables. Critical for understanding data structure.

### convex/engines/heuristics.ts
Baseline prediction engine (70-75% accuracy). Used as fallback if ML fails.

### ml-service/app.py
FastAPI server with `/predict` endpoint. Feature engineering must match training.

### ml-service/scripts/train_models.py
XGBoost training script. Modify here to improve accuracy.

---

## Environment Variables

### Convex (Not Yet Set)
```bash
ML_SERVICE_URL=http://localhost:8000  # Local dev
ML_SERVICE_URL=https://your-service.onrender.com  # Production
```

### Next.js (Already Set)
```bash
NEXT_PUBLIC_CONVEX_URL=https://zany-tern-775.convex.cloud
```

---

## Next Session Priorities

### Immediate (Must Do)
1. **Push ML accuracy to 90-95%**
   - Add real ICT/influence/bonus data
   - Fix price logic (expensive ≠ always nailed)
   - Add manager rotation profiles
   - Try LightGBM/CatBoost

2. **Deploy ML service to production**
   - Choose platform (Render recommended)
   - Deploy FastAPI service
   - Set Convex `ML_SERVICE_URL`

3. **Integrate Convex → ML service**
   - Update `mlPredictor.ts` to call HTTP endpoint
   - Test end-to-end predictions
   - Implement fallback chain

### Medium Priority
4. Monitor production accuracy weekly
5. Add automated model retraining (Saturday cron)
6. Performance optimization (<100ms predictions)
7. Error handling and logging

### Low Priority
8. UI improvements (charts, confidence intervals)
9. User authentication (save custom predictions)
10. Export to CSV feature

---

## Useful Commands Reference

### Python
```bash
# Check Python version
py -3.11 --version

# Install dependencies
py -3.11 -m pip install -r requirements.txt

# Run script with UTF-8 encoding
set PYTHONIOENCODING=utf-8 && py -3.11 script.py
```

### Git
```bash
# Status
git status

# Stage changes
git add .

# Commit
git commit -m "Message"

# Push
git push origin main

# View recent commits
git log --oneline -10
```

### Convex
```bash
# Deploy functions
npx convex deploy

# View logs
npx convex logs

# Set environment variable
npx convex env set KEY=value
```

---

## Contact & Resources

**GitHub Issues:** https://github.com/iamheisenburger/fpl-decision-helper/issues
**Convex Docs:** https://docs.convex.dev
**FPL API Docs:** https://fantasy.premierleague.com/api/
**XGBoost Docs:** https://xgboost.readthedocs.io

---

**Last verified accurate:** October 31, 2025
**Next review due:** When ML service deployed to production
