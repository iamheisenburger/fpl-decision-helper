# xMins Prediction System - Implementation Roadmap

## Current Status: Phase 1 (Basic Heuristics) - 60% Complete

### ✅ Completed
- FPL API integration with rate limiting
- Player database with FPL IDs
- Historical appearance tracking
- Heuristic prediction engine (recency-weighted, role lock detection)
- FPL Team ID import
- Basic UI (Minutes Lab, Admin pages)
- Manual data sync

---

## 🚧 Phase 2: Automation & Data Quality (URGENT)

### Priority 1: Automatic Data Sync
- [ ] **Convex cron jobs** (STARTED)
  - Daily player sync (prices, injury status, form)
  - Daily fixture sync (changes, postponements)
  - Weekly prediction regeneration
  - Dynamic gameweek detection (not hardcoded GW10)

### Priority 2: Injury Status Tracking
- [ ] **Add injury tracking to schema**
  - Store FPL injury status (25%/50%/75%/unknown/fit)
  - Track injury type (knee, hamstring, ankle, etc.) via news scraping
  - Track expected return date

- [ ] **Injury impact modeling**
  - Reduce xMins for injured players based on status
  - Boost xMins for teammates when key player is out
  - Track historical return-from-injury performance

### Priority 3: Manager Change Tracking
- [ ] **Add manager tracking to schema**
  - Track current manager per team
  - Detect manager changes
  - Flag "new manager period" (first 5 games)

- [ ] **Adjust predictions for new managers**
  - Heavily weight recent games under new manager
  - Reduce confidence in predictions during transition

---

## 🎯 Phase 3: 14-Week Horizon Predictions

### Current: Only predicting NEXT gameweek (GW N+1)
### Target: Predict GW N+1 through GW N+14

**Required Changes:**

1. **Fixture-aware predictions**
   - Fetch opponent for each future gameweek
   - Adjust xMins based on fixture difficulty
   - Account for blank/double gameweeks

2. **Trend analysis**
   - Detect declining/rising playing time trends
   - Project trends forward
   - Add confidence decay (predictions get less accurate further out)

3. **Injury projection**
   - For injured players: estimate return date
   - Gradually ramp up xMins post-injury (recovery curve)
   - Track historical injury recovery patterns

4. **Rotation pattern detection**
   - Detect managerial rotation policies
   - Flag "rotation risk" players
   - Predict rotation based on fixture congestion

**Example Output:**
```
Player: Mohamed Salah
GW 11: xMins=85.2, P90=92%, Confidence=95%
GW 12: xMins=84.8, P90=91%, Confidence=90% (fixture: MCI away)
GW 13: xMins=83.5, P90=89%, Confidence=85%
...
GW 24: xMins=80.1, P90=82%, Confidence=60% (low confidence, distant future)
```

---

## 🤖 Phase 4: Machine Learning Models

### Current: Heuristics only (70-80% accuracy)
### Target: ML models (85-90% accuracy)

**Two-Stage Model Architecture:**

#### Stage A: Start Probability (Logistic Regression)
Features:
- Recent starts (last 3, 5, 8 games)
- Goals/assists in recent games
- Manager preference score
- Team form
- Fixture difficulty
- Rotation risk flags
- **Injury status** (fit/25%/50%/75%/out)
- **Manager tenure** (new manager flag)
- Position competition (depth score)

#### Stage B: Minutes Given Start (Weibull AFT Survival Model)
Features:
- Historical minute distribution
- Age (older players subbed earlier)
- Fixture context (winning/losing affects subs)
- Fixture difficulty (harder games → earlier subs)
- Recent form (inform players stay on longer)
- **Manager style** (aggressive vs conservative subs)
- Position (defenders play more 90s than attackers)

**Training:**
- Use 2023-24 + 2024-25 season data
- Train weekly on updated data
- Separate models per position (GK/DEF/MID/FWD)

---

## 📊 Phase 5: Advanced Features

### Context-Aware Predictions
- [ ] **Fixture difficulty integration**
  - Adjust xMins for tough vs easy fixtures
  - Account for home/away splits

- [ ] **Congestion modeling**
  - Reduce xMins for teams with 3 games in 7 days
  - Increase rotation risk

- [ ] **International breaks**
  - Reduce xMins for players traveling far
  - Account for injury risk from internationals

### Team-Level Analysis
- [ ] **Depth chart tracking**
  - Map positional competition
  - Boost xMins when backup players are injured
  - Reduce xMins when competition increases

### Validation & Monitoring
- [ ] **Prediction accuracy tracking**
  - Compare predicted xMins vs actual minutes
  - Calculate RMSE, MAE by player/position
  - Flag players with high prediction error

- [ ] **Confidence intervals**
  - Provide ranges (e.g., xMins: 72-88, 80% CI)
  - Show uncertainty visualization

---

## 🎯 Realistic Timeline

| Phase | Timeline | Complexity |
|-------|----------|------------|
| Phase 2 (Automation) | 1-2 weeks | Medium |
| Phase 3 (14-week horizon) | 2-3 weeks | High |
| Phase 4 (ML models) | 3-4 weeks | Very High |
| Phase 5 (Advanced features) | Ongoing | Variable |

---

## Next Immediate Actions

1. ✅ Fix Convex deployment errors (DONE)
2. 🔄 Test FPL Team sync with deployed schema
3. 🔄 Set up cron jobs for daily sync
4. 🔄 Add injury status tracking
5. 🔄 Extend to 14-week predictions
6. 🔄 Train and deploy ML models

---

## Key Challenges

### 1. **Data Quality**
- FPL injury status is vague (25%/50%/75%)
- Need to scrape injury news from external sources
- Manager changes not in FPL API (need manual tracking)

### 2. **Prediction Accuracy**
- Football is inherently unpredictable
- Manager decisions are subjective
- Injuries are random events
- Best realistic accuracy: ~85-90% for next GW, declining for future GWs

### 3. **Computational Complexity**
- 725 players × 14 gameweeks = 10,150 predictions to generate weekly
- ML model inference needs to be fast
- Need efficient batch processing

---

## User Expectations vs Reality

**What you're expecting:** Fully automated, ML-powered, 14-week horizon predictions accounting for injuries, manager changes, fixture difficulty, etc.

**What's currently built:** Manual heuristic predictions for next gameweek only, using simple averages.

**Gap:** Significant - we're at ~30% of the full vision.

**Recommendation:**
1. Test current heuristic system to validate it works
2. Prioritize automation (Phase 2) - get it updating daily
3. Then tackle 14-week horizon (Phase 3)
4. Finally, ML models (Phase 4)
