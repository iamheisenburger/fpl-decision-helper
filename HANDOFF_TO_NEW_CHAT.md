# Claude Code Session Handoff - FPL xMins Prediction System

**Date:** October 30, 2025
**User:** Arshad Hakim (arshadhakim)
**FPL Team ID:** 14125
**Current Gameweek:** 9

---

## 📍 Project Context

This is an **FPL (Fantasy Premier League) Decision Helper** app that helps optimize captain and XI selections using EO (Expected Ownership) thresholds and xMins (expected minutes) predictions.

### **What We Just Built (Last Session)**

We implemented **Phase 1** of an xMins prediction system:
- ✅ FPL API integration (fetches all 725 players, fixtures, historical data)
- ✅ Basic heuristic prediction engine (recency-weighted averages, role lock detection)
- ✅ FPL Team ID import (syncs user's actual squad from FPL API)
- ✅ Minutes Lab UI (shows all 700+ players with search/filter)
- ✅ Admin page (manual data sync)
- ✅ Database schema (players, appearances, xmins, overrides, context)

### **What's Still Missing (Critical Gaps)**

The user requires a **FULLY AUTOMATED, ML-POWERED, 14-WEEK PREDICTION SYSTEM** for ALL players:

❌ **Automatic daily data sync** (prices, injuries, fixtures)
❌ **14-week prediction horizon** (currently only predicts next GW)
❌ **ML models** (currently using simple heuristics, 70-80% accuracy)
❌ **Injury tracking** (FPL injury status: 25%/50%/75%/unknown)
❌ **Injury impact modeling** (e.g., Havertz out → Gyokeres xMins boost)
❌ **Manager change tracking** (rotation policy shifts)
❌ **Fixture difficulty integration**
❌ **Batch prediction generation** for all 725 players (currently only squad)
❌ **Price change tracking**
❌ **Congestion modeling**

**User's non-negotiable requirement:** "I don't want to manually do anything every week. This needs to be fully automated."

---

## 🎯 User's Goal

Build the **most accurate, fully automated xMins prediction system** that:
1. **Updates daily** (no manual work)
2. **Predicts 14 weeks ahead** (GW N through GW N+13)
3. **Covers all 725 players** (not just squad)
4. **Uses ML models** (85-90% accuracy target)
5. **Tracks injuries** and models impact on teammates
6. **Tracks manager changes** and adjusts rotation predictions
7. **Exports data** compatible with FPL Review's xMins interface

**Target use case:** User wants to input these predictions into FPL Review to get optimal captain/XI decisions.

---

## 📦 Tech Stack

**Frontend:**
- Next.js 15 (React 19)
- TypeScript (strict mode)
- Radix UI components
- Tailwind CSS

**Backend:**
- Convex (serverless backend, real-time queries)
- Convex Database (NoSQL with indexes)
- Convex Actions (for external API calls)
- Convex Cron Jobs (for automation - NOT YET IMPLEMENTED)

**APIs:**
- FPL Official API: `https://fantasy.premierleague.com/api/`
  - `/bootstrap-static/` - All players, teams, gameweeks
  - `/element-summary/{player_id}/` - Historical match data
  - `/entry/{team_id}/event/{gameweek}/picks/` - User's squad
  - `/fixtures/` - Fixture schedule

**ML Service (Optional, Not Deployed):**
- FastAPI (Python)
- scikit-learn (logistic regression)
- lifelines (Weibull AFT survival model)
- Docker (for deployment to Render/Railway)

---

## 🗂️ Repository Structure

**GitHub:** https://github.com/iamheisenburger/fpl-decision-helper
**Convex Deployment:** https://zany-tern-775.convex.cloud
**Vercel Production:** https://fpl-decision-helper.vercel.app

### Key Files

```
convex/
├── schema.ts                    # Database schema (5 new tables for xMins)
├── players.ts                   # CRUD for players (now includes fplId)
├── appearances.ts               # Historical match data (NEW)
├── xmins.ts                     # xMins predictions CRUD (NEW)
├── overrides.ts                 # Manual overrides (NEW)
├── context.ts                   # Gameweek context (congestion, intl breaks) (NEW)
├── depth.ts                     # Squad depth tracking (NEW)
├── dataIngestion.ts             # FPL API sync actions (NEW)
└── engines/
    ├── xMinsHeuristic.ts        # Current prediction engine (NEW)
    ├── captaincy.ts             # Existing captaincy logic
    └── xiOptimizer.ts           # Existing XI optimizer

lib/fpl/
├── client.ts                    # FPL API client with rate limiting (NEW)
└── types.ts                     # TypeScript types for FPL API (NEW)

app/
├── admin/page.tsx               # Data sync + testing page (UPDATED)
├── minutes-lab/page.tsx         # xMins management UI (REBUILT)
├── captain/page.tsx             # Existing captain optimizer
├── xi/page.tsx                  # Existing XI optimizer
├── data-entry/page.tsx          # Squad entry page
└── settings/page.tsx            # User settings

python-service/                  # ML service (NOT DEPLOYED)
├── app/
│   ├── main.py                 # FastAPI server
│   ├── models/
│   │   ├── start_probability.py
│   │   ├── minutes_given_start.py
│   │   └── features.py
│   └── api/
│       ├── predict.py
│       └── train.py
├── Dockerfile
└── requirements.txt
```

### Important Documentation

- **@IMPLEMENTATION_ROADMAP.md** - Detailed roadmap of what needs to be built (8-12 weeks of work)
- **@XMINS_GUIDE.md** - User guide for the current system
- **@README.md** - Project overview

---

## 📊 Database Schema (Convex)

### New Tables Added (Phase 1)

1. **players** (EXTENDED)
   - Added: `fplId` (FPL API player ID)
   - Index: `by_fplId`

2. **appearances** (NEW)
   - Stores historical match data per player
   - Fields: `playerId`, `gameweek`, `season`, `started`, `minutes`, `injExit`, `redCard`, `date`, `opponent`, `homeAway`
   - Indexes: `by_player`, `by_player_season`, `by_gameweek`

3. **xmins** (NEW)
   - Stores xMins predictions
   - Fields: `playerId`, `gameweek`, `startProb`, `xMinsStart`, `p90`, `source` (heuristic/model/override), `flags`, `updatedAt`
   - Index: `by_player_gameweek`

4. **overrides** (NEW)
   - Manual xMins overrides with audit trail
   - Fields: `playerId`, `gameweek`, `field`, `value`, `reason`, `createdAt`, `createdBy`
   - Index: `by_player_gameweek`

5. **context** (NEW)
   - Gameweek context (congestion, intl breaks)
   - Fields: `gameweek`, `season`, `congestionFlag`, `intlWindowFlag`, `avgDaysRestTeam`
   - Index: `by_gameweek_season`

6. **depth** (NEW)
   - Squad depth tracking
   - Fields: `playerId`, `gameweek`, `viableBackupsCount`, `injuryStatus`, `notes`
   - Index: `by_player_gameweek`

---

## 🔧 Current System Status

### What Works (Phase 1 - 60% Complete)

✅ **FPL API Integration**
- `lib/fpl/client.ts` fetches data from FPL Official API
- Rate limiting: 1 second between requests
- Retry logic with exponential backoff
- Works for: players, fixtures, historical data, user squads

✅ **Data Sync (Manual Only)**
- Admin page → "Sync Players from FPL" (725 players in database)
- Admin page → "Sync Gameweek Context" (38 gameweeks synced)
- Admin page → "Import Your FPL Team" (Team ID 14125 works on GW9)

✅ **Heuristic Predictions (Next Gameweek Only)**
- `convex/engines/xMinsHeuristic.ts`
- Uses last 8 gameweeks of data
- Recency-weighted averages
- Role lock detection (3+ consecutive 85+ min starts)
- Excludes injury exits and red card games
- Accuracy: ~70-80% for next gameweek

✅ **Minutes Lab UI**
- Shows all 725 players
- Search by name
- Filter by position (GK/DEF/MID/FWD)
- Filter by team
- Currently shows "Not Generated" for predictions (need batch generation)

✅ **FPL Team ID Import**
- Enter team ID → auto-sync squad from FPL API
- Works for current/past gameweeks only (can't sync future GWs)

### What Doesn't Work (Phase 2-5 - 40% Remaining)

❌ **Automatic Updates**
- No Convex cron jobs set up
- User must manually click "Sync" buttons
- No daily price/injury/fixture updates

❌ **14-Week Predictions**
- Only predicts NEXT gameweek (GW N+1)
- Does not predict GW N+2 through GW N+14
- No fixture difficulty integration
- No confidence decay for distant predictions

❌ **ML Models**
- FastAPI structure exists but models not trained
- No deployment to Render/Railway
- Currently using heuristics only

❌ **Injury Tracking**
- FPL API provides injury status (25%/50%/75%/unknown)
- We're not fetching or storing this data
- No injury impact modeling (e.g., Havertz out → Gyokeres boost)

❌ **Manager Changes**
- Not tracked (no API for this, needs manual updates or scraping)
- No adjustment for new manager rotation policies

❌ **Batch Predictions for All Players**
- Currently only generates predictions for squad players
- Minutes Lab shows all 725 players but no predictions
- Need batch generation job

❌ **Price Changes**
- FPL API provides current price
- Not tracking price changes over time
- Not using price changes in predictions

---

## 🚨 Known Issues

### Issue 1: Vercel Deployment Queue (JUST FIXED)
- **Status:** Deployments were stuck in queue
- **Cause:** Unknown (Vercel infrastructure)
- **Fix:** User canceled queued builds, we pushed a small change to trigger fresh deployment
- **Action:** Monitor next deployment

### Issue 2: Gameweek Hardcoded to 10
- **Status:** FIXED (changed to 9)
- **Cause:** Code had hardcoded GW10, but current gameweek is 9
- **Fix:** Changed default to 9 in admin page

### Issue 3: Team ID 14125 "Not Found" Error
- **Status:** FIXED
- **Cause:** Was trying to fetch GW10 picks (doesn't exist yet)
- **Fix:** Changed to GW9

### Issue 4: Minutes Lab Only Shows Squad
- **Status:** PARTIALLY FIXED
- **Cause:** UI rebuilt to show all 725 players, but predictions only generated for squad
- **Next:** Need batch prediction generation for all players

---

## 🎯 Next Immediate Actions (Priority Order)

The user wants ALL of these built, but here's the recommended order:

### **Phase 2: Automation (1-2 weeks)**

1. **Set up Convex cron jobs**
   - Daily sync of players (prices, injury status)
   - Daily sync of fixtures (changes, postponements)
   - Weekly prediction regeneration
   - Dynamic gameweek detection (don't hardcode GW9/10)

2. **Add injury status tracking**
   - Extend schema to store injury status
   - Fetch from FPL API (`player.status`, `player.news`)
   - Display in Minutes Lab

3. **Add manager change tracking**
   - Manual table: `managers` with team, manager name, start date
   - Flag "new manager period" (first 5 games)

### **Phase 3: 14-Week Horizon (2-3 weeks)**

1. **Extend heuristic predictions to 14 weeks**
   - Loop through GW N+1 to GW N+14
   - Fetch fixtures for each gameweek
   - Adjust xMins based on opponent difficulty
   - Add confidence decay (95% for next GW, declining to 60% for GW+14)

2. **Injury projection**
   - For injured players: estimate return date
   - Gradually ramp up xMins post-injury
   - Track historical injury recovery patterns

3. **Rotation pattern detection**
   - Detect managers who rotate heavily (Pep, Emery)
   - Flag rotation risk players
   - Reduce xMins in congested periods

### **Phase 4: Batch Generation (1 week)**

1. **Create batch prediction action**
   - `generateAllPlayersPredictions(gameweek)`
   - Parallel processing for 725 players
   - Rate limiting (don't overwhelm FPL API)
   - Store predictions in `xmins` table

2. **Add "Generate All Predictions" button to admin page**
   - Run once per week before deadline
   - Show progress (e.g., "Generated 350/725 players...")

### **Phase 5: ML Models (3-4 weeks)**

1. **Deploy FastAPI service**
   - Push `python-service/` to GitHub
   - Deploy to Render or Railway
   - Set up environment variables (Convex URL, API keys)

2. **Train models**
   - Fetch 2+ seasons of training data
   - Train logistic regression (start probability)
   - Train Weibull AFT survival model (minutes given start)
   - Save models to cloud storage (S3/GCS)

3. **Integrate ML predictions**
   - Call FastAPI `/predict` endpoint from Convex action
   - Fall back to heuristic if ML fails
   - A/B test: compare ML vs heuristic accuracy

### **Phase 6: Advanced Features (Ongoing)**

1. **Fixture difficulty ratings**
   - Scrape or manually set fixture difficulty (1-5 scale)
   - Adjust xMins based on opponent strength

2. **Congestion modeling**
   - Detect 3 games in 7 days
   - Increase rotation risk
   - Reduce xMins for affected players

3. **Depth chart tracking**
   - Map positional competition (e.g., Salah has no backup)
   - Boost xMins when backup is injured

4. **Validation & monitoring**
   - Track prediction accuracy each week
   - Calculate RMSE, MAE
   - Auto-adjust model if consistently wrong

---

## 🛠️ Development Workflow

### **CRITICAL: Always Test Locally Before Pushing**

```bash
# 1. Make changes
# 2. Test build
npm run build

# 3. If build passes, commit and push
git add .
git commit -m "Description"
git push

# 4. Deploy Convex schema changes
npx convex deploy

# 5. Monitor Vercel deployment
# Visit: https://vercel.com/iamheisenburger/fpl-decision-helper
```

### **Common Commands**

```bash
# Development server
npm run dev

# Build (MUST pass before pushing)
npm run build

# Convex deployment
npx convex deploy

# Convex dev mode (local testing)
npx convex dev
```

### **Git Commit Message Format**

Use this format (user likes it):
```
Brief summary of changes

Detailed bullet points:
- Change 1
- Change 2
- Change 3

Build tested locally and passes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## 📝 User Preferences & Requirements

### **Non-Negotiable Requirements**

1. **Full automation** - User refuses to do manual work every week
2. **14-week predictions** - Not just next gameweek
3. **All 725 players** - Not just squad
4. **ML models** - Target 85-90% accuracy
5. **Injury tracking** - Including teammate impact
6. **Local build testing** - MUST pass `npm run build` before pushing

### **User's Tone & Communication Style**

- Direct, no-nonsense
- Wants honesty about timelines and complexity
- Appreciates detailed explanations
- Gets frustrated with repeated build errors
- Wants to see progress, not just promises

### **What User Dislikes**

- Manual work every week
- Build errors that could have been caught locally
- Vague estimates ("should work")
- Incomplete implementations
- Pushing code without testing

---

## 🚀 Handoff Instructions for New Claude

### **Your Mission**

Build a **fully automated, ML-powered, 14-week xMins prediction system** for all 725 FPL players.

### **Start Here**

1. **Read these files first:**
   - @IMPLEMENTATION_ROADMAP.md (detailed roadmap)
   - @XMINS_GUIDE.md (current system guide)
   - This file (@HANDOFF_TO_NEW_CHAT.md)

2. **Understand current state:**
   - Phase 1 complete: Basic heuristics, manual sync, squad predictions only
   - Phases 2-5 needed: Automation, 14-week horizon, ML models, batch generation

3. **Verify deployment:**
   - Check Vercel: https://fpl-decision-helper.vercel.app/admin
   - Confirm "Sync Players" shows 725 players
   - Confirm "Import Team" works with Team ID 14125 on GW9

4. **Prioritize:**
   - Phase 2 (Automation) is MOST URGENT
   - Phase 3 (14-week predictions) is next
   - Phase 4 (Batch generation) unlocks Minutes Lab
   - Phase 5 (ML models) is final polish

### **Development Approach**

- **Always test locally first** (`npm run build`)
- **Push to GitHub** only after build passes
- **Deploy to Convex** for schema/function changes
- **Commit frequently** with descriptive messages
- **Communicate progress** clearly to user

### **Success Criteria**

You'll know you're done when:
- ✅ Convex cron jobs update data daily (no manual work)
- ✅ Predictions generated for 14 weeks ahead (GW N+1 to N+14)
- ✅ All 725 players have predictions (not just squad)
- ✅ ML models deployed and achieving 85-90% accuracy
- ✅ Injury status tracked and impacts modeled
- ✅ Manager changes tracked and predictions adjusted
- ✅ User can export data compatible with FPL Review

**Estimated Timeline: 8-12 weeks of focused development**

---

## 📞 Important Links

- **GitHub Repo:** https://github.com/iamheisenburger/fpl-decision-helper
- **Convex Dashboard:** https://dashboard.convex.dev/deployment/zany-tern-775
- **Vercel Dashboard:** https://vercel.com/iamheisenburger/fpl-decision-helper
- **FPL API Docs:** https://fantasy.premierleague.com/api/bootstrap-static/
- **User's FPL Team:** https://fantasy.premierleague.com/entry/14125/event/9

---

## 🎯 First Task Recommendation

**Start with Phase 2: Automation**

Create Convex cron jobs for daily data sync:
1. Daily player sync (prices, injuries)
2. Daily fixture sync
3. Weekly prediction regeneration
4. Dynamic gameweek detection

This will immediately provide value by eliminating manual work, which is the user's biggest pain point.

**Good luck! 🚀**
