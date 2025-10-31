# FPL Decision Helper - System Handoff

**Last Updated:** October 31, 2025
**Current Season:** 2025-26
**Current Gameweek:** 9
**System Completion:** ~70%

## Quick Links

- **GitHub:** https://github.com/iamheisenburger/fpl-decision-helper
- **Convex Dashboard:** https://dashboard.convex.dev/t/iamheisenburger/fpl-decision-helper-775/zany-tern-775
- **Production URL:** https://fpl-decision-helper.vercel.app
- **User's FPL Team ID:** 14125

## Tech Stack

- **Frontend:** Next.js 15 + TypeScript (strict mode) + Tailwind CSS
- **Backend:** Convex (serverless functions + database + cron jobs)
- **UI Components:** shadcn/ui + Radix UI
- **Data Source:** FPL Official API (https://fantasy.premierleague.com/api/)
- **ML Service (Not Yet Deployed):** FastAPI + scikit-learn (Logistic Regression + Weibull AFT)

## What This System Does

**Goal:** Predict expected minutes (xMins) for all 725 Premier League players over a 14-week horizon with 85-90% accuracy.

**Core Features:**
- 14-week predictions (GW+1 through GW+14) for every PL player
- Injury intelligence (parses return dates, models recovery curves)
- Fixture difficulty adjustments (position-specific: forwards most affected, GK least)
- Confidence decay (95% for GW+1 declining to 60% for GW+14)
- Teammate xMins boost (when starter injured, backup gets +70%/+30%)
- Fully automated daily syncs + weekly prediction regeneration
- Zero manual work required

## What's Complete ✅

### Phase 1: Core Infrastructure
- ✅ Database schema (players, appearances, xmins, overrides, fixtures, depthCharts, syncLogs)
- ✅ FPL API integration (bootstrap-static, fixtures, element-summary)
- ✅ Player data ingestion with injury tracking
- ✅ Basic heuristic engine (recency-weighted averages, role lock detection)
- ✅ Minutes Lab UI (search, filter by team/position, sort by xMins)
- ✅ Admin panel (manual sync buttons, sync status logs)

### Phase 2: Automation (COMPLETE)
- ✅ Daily player sync (2:00 AM UTC) - prices, injuries, news
- ✅ Daily context sync (2:15 AM UTC) - fixture congestion
- ✅ Daily fixture sync (2:30 AM UTC) - FDR ratings, kickoff times
- ✅ Weekly prediction generation (Saturday 6:00 AM UTC)
- ✅ Pre-deadline refresh (Friday 12:00 PM UTC)
- ✅ Audit trail logging (syncLogs table)
- ✅ Dynamic gameweek detection (no hardcoded GW numbers)

### Phase 3: 14-Week Predictions (COMPLETE)
- ✅ Multi-week prediction engine (GW+1 to GW+14)
- ✅ Injury intelligence:
  - Parse return dates from news ("out for 4 weeks", "season-ending")
  - Recovery curves (60% → 75% → 85% → 95% → 100% over 5 games)
- ✅ Fixture difficulty integration:
  - Position-specific adjustments (FWD ×1.2, MID ×1.0, DEF ×0.7, GK ×0.5)
  - FDR 1 (easy) = +10% xMins, FDR 5 (hard) = -10% xMins
- ✅ Confidence decay (exponential decay from 95% to 60%)
- ✅ Uncertainty bounds (wider for longer horizons)
- ✅ 14-week outlook modal (click any player in Minutes Lab)
- ✅ Batch generation for all 725 players
- ✅ Rate limiting (batches of 10, 2-second delays)

### Phase 4: Depth Charts Infrastructure
- ✅ depthCharts table (maps starters to backup1, backup2)
- ✅ Teammate boost calculation (+70% for backup1, +30% for backup2)
- ✅ CRUD operations (insert, update, query by team/position)
- ⚠️ **Empty by default** - needs population (manual or automated)

## What's Remaining ❌

### Phase 5: ML Models (Next Priority)
- ❌ Ingest 2024-25 historical season data (for training)
- ❌ Train two-stage ML model:
  1. Logistic regression for P(start)
  2. Weibull AFT survival model for E[minutes | start]
- ❌ Deploy FastAPI service to Render.com or Railway
- ❌ Integrate ML predictions with Convex
- ❌ Hybrid approach: ML for GW+1 to GW+4, blend for GW+5 to GW+8, heuristic for GW+9 to GW+14

### Optional Enhancements
- ⚠️ Populate depth charts (manual entry or automated inference)
- ⚠️ Manager rotation pattern learning (replace hardcoded rules)
- ⚠️ Press conference sentiment analysis (optional)
- ⚠️ European competition fixture tracking (UCL/Europa)
- ⚠️ Suspension tracking (yellow card accumulation)

## Current System State

### Automation Schedule (Active)
```
Daily   2:00 AM UTC → syncPlayers() - prices, injuries, news
Daily   2:15 AM UTC → syncGameweekContext() - fixture congestion
Daily   2:30 AM UTC → syncFixtures() - FDR ratings, postponements
Sat     6:00 AM UTC → generateAllPlayersMultiWeek() - 14-week predictions
Fri    12:00 PM UTC → preDeadlineRefresh() - latest injury news
```

### Database Status
- **Players:** ~725 Premier League players synced
- **Fixtures:** Ready to sync (FDR 1-5 for all fixtures)
- **Predictions:** Empty until first generation
- **Depth Charts:** Empty (infrastructure only)
- **Sync Logs:** Tracking all automated operations

### Key Files

**Convex Backend:**
- [convex/schema.ts](convex/schema.ts) - Database schema
- [convex/dataIngestion.ts](convex/dataIngestion.ts) - FPL API sync
- [convex/fixtures.ts](convex/fixtures.ts) - Fixture sync + FDR calculation
- [convex/engines/xMinsHeuristic.ts](convex/engines/xMinsHeuristic.ts) - Baseline prediction engine
- [convex/engines/multiWeekPredictor.ts](convex/engines/multiWeekPredictor.ts) - 14-week predictions
- [convex/utils/injuryIntelligence.ts](convex/utils/injuryIntelligence.ts) - Injury parsing + recovery curves
- [convex/crons.ts](convex/crons.ts) - Cron job definitions
- [convex/scheduledActions.ts](convex/scheduledActions.ts) - Internal action wrappers

**Next.js Frontend:**
- [app/minutes-lab/page.tsx](app/minutes-lab/page.tsx) - Main prediction UI
- [app/admin/page.tsx](app/admin/page.tsx) - Admin controls + sync status
- [components/ui/dialog.tsx](components/ui/dialog.tsx) - 14-week outlook modal

## How to Use the System

### First-Time Setup

1. **Sync Fixtures:**
   - Go to Admin page
   - Click "Sync Fixtures with FDR"
   - Wait ~30 seconds (should show success with fixture counts)

2. **Generate Predictions:**
   - Click "Generate 14-Week Predictions"
   - Wait ~20-25 minutes (725 players × 14 weeks = 10,150 predictions)
   - Progress logged in console

3. **View Predictions:**
   - Go to Minutes Lab
   - Search/filter players
   - See xMins for selected gameweek
   - Click any player for 14-week outlook

### Daily Workflow (Automated)

**You don't need to do anything!** The system runs automatically:
- Every night at 2:00 AM UTC: Syncs player prices, injuries, news
- Every night at 2:30 AM UTC: Updates fixture difficulty
- Every Saturday at 6:00 AM UTC: Regenerates all predictions
- Every Friday at noon UTC: Last-minute injury check

### Manual Overrides

If the system gets a prediction wrong, you can override:
1. Go to Data Entry page
2. Search for player
3. Set custom xMins for specific gameweek
4. Override takes precedence over heuristic

## Key Technical Decisions

### Why Heuristics First, ML Later?
- Heuristics achieve 70-80% accuracy (good baseline)
- ML models require full season of training data (we're at GW9)
- Hybrid approach: ML for near-term (confident), heuristics for long-term (uncertain)

### Why 14 Weeks?
- FPL allows transfers over multi-week periods
- Users need to plan around fixture swings
- Confidence naturally decays for longer horizons

### Why Position-Specific FDR?
- Forwards score more against weak defenses (+12% boost)
- Goalkeepers relatively unaffected by opponent quality (+5% boost)
- Research shows attackers' minutes vary more by fixture difficulty

### Why Teammate Boost?
- When Saka injured, Martinelli's minutes increase significantly
- Backup1 typically gets 70% of starter's baseline
- Backup2 gets 30% (rotation risk with other squad players)

## Known Issues and Warnings

### ⚠️ Season Context
**CRITICAL:** Always use correct season references:
- Current season: **2025-26**
- Previous season: **2024-25** (NOT 2023-24)
- Never hardcode season years

### ⚠️ Empty Depth Charts
The depth chart system is built but not populated. Until populated:
- Teammate boost won't activate
- Backup player predictions won't adjust when starters are injured
- System still works, just without this intelligence layer

### ⚠️ First Generation Time
Initial prediction generation takes 20-25 minutes:
- 725 players × 14 weeks = 10,150 predictions
- Rate limited to avoid FPL API blocks
- Batched in groups of 10 with 2-second delays
- Future runs are updates (faster)

## Development Workflow

### Making Changes

1. **Edit code locally**
2. **Test locally:** `npm run build` (MUST pass before pushing)
3. **Deploy Convex:** `npx convex deploy` (if backend changes)
4. **Commit and push:**
   ```bash
   git add -A
   git commit -m "Description of changes"
   git push origin main
   ```
5. **Verify Vercel deployment:** Check https://fpl-decision-helper.vercel.app

### Common Commands

```bash
# Start local dev server
npm run dev

# Build and test locally (MUST pass before pushing)
npm run build

# Deploy Convex functions
npx convex deploy

# Regenerate Convex types
npx convex codegen

# Clear Next.js build cache (if build issues)
rm -rf .next && npm run build
```

## Critical Context for New Chats

### User's Requirements (Non-Negotiable)
1. **FULL AUTOMATION** - Zero manual work weekly
2. **14-WEEK PREDICTIONS** - Not just next gameweek
3. **ALL 725 PLAYERS** - Not just user's squad
4. **85-90% ACCURACY** - ML-powered target
5. **INJURY TRACKING** - Including teammate impact
6. **LOCAL BUILD TESTING** - Always test before pushing

### User's Pet Peeves
1. **"MISINFORMATION KING"** - User gets upset about factual errors (wrong seasons, relegated teams, player transfers)
2. **Hardcoded data** - Everything must be dynamic from FPL API
3. **Incomplete features** - User wants 100% completion before feedback
4. **Build failures** - Always run `npm run build` before pushing

### Previous Errors to Avoid
- ❌ Referenced 2023-24 season (should be 2024-25 previous season)
- ❌ Mentioned Luton in 2025-26 (they were relegated in 2024-25)
- ❌ Said Sterling at Arsenal (verify current team before claiming)
- ❌ Pushed code with TypeScript errors to GitHub
- ❌ Forgot to run `npx convex deploy` before `npm run build`

## Next Chat Should Focus On

**Phase 5: ML Models**
1. Ingest 2024-25 historical data from FPL API
2. Train logistic regression for P(start)
3. Train Weibull AFT for E[minutes | start]
4. Deploy FastAPI service
5. Integrate ML predictions with Convex

**File to create:** `ml-service/main.py` (FastAPI)
**Endpoint:** `/predict` (accepts player features, returns xMins + confidence)
**Training data:** 2024-25 season appearances from FPL API

## Success Metrics

- ✅ System runs fully automated (no manual work weekly)
- ✅ 14-week predictions generated for all 725 players
- ⚠️ 85-90% accuracy target (currently 70-80% with heuristics)
- ✅ Sub-30 minute prediction generation time
- ✅ Zero build failures or type errors
- ⚠️ Depth charts populated for teammate boost

**Current Status:** Core system complete (70%), ML models remaining (30%)
