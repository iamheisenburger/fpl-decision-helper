# North Star Vision: Maximum xMins Accuracy

## The Ultimate Goal

**FPL Review has the best points projections in the FPL ecosystem. But their accuracy is limited by the quality of xMins inputs.**

Our singular mission:
> **Build the most advanced xMins prediction system possible to unlock FPL Review's full potential.**

```
Better xMins → Better FPL Review Suggestions → Higher EV → More Points
```

## Why This Matters

FPL Review's model is already optimized for:
- Points prediction (goals, assists, clean sheets, bonus)
- Fixture difficulty
- Form and trends
- Ownership and captaincy EV

**What they can't predict accurately: Minutes (xMins)**

Minutes are the foundation of everything:
- A player scores 0 points if they don't play
- xPoints = xMins × (points per 90)
- Inaccurate xMins = Garbage in, garbage out

**We control xMins. We make FPL Review better.**

---

## Current State (70% Complete)

### ✅ What Works
1. **Automated Data Pipeline**
   - Daily syncs (prices, injuries, fixtures)
   - 14-week predictions for 725 players
   - Zero manual work required

2. **Baseline Heuristics (70-80% accuracy)**
   - Recency-weighted averages (last 8 games)
   - Role lock detection (3+ consecutive 85+ starts)
   - Injury intelligence (return dates, recovery curves)
   - Fixture difficulty adjustments
   - Confidence decay (95% → 60% over 14 weeks)

3. **Infrastructure**
   - Convex serverless backend
   - Next.js UI with Minutes Lab
   - Audit trail (source, flags, confidence)
   - Batch processing (725 players in 25 minutes)

### ❌ What's Missing (30%)
**ML models to hit 85-90% accuracy**

Current heuristics are too simple:
- Can't learn complex rotation patterns
- Can't detect manager preferences
- Can't handle multi-factor interactions
- Limited feature engineering

---

## The Vision: Quant-Level xMins Prediction

### Think Like a Quantitative Trading Firm

Quant firms predict market movements with:
1. **Vast feature engineering** (100+ features, not 10)
2. **Advanced models** (XGBoost, neural networks, ensemble methods)
3. **Continuous learning** (retrain weekly with new data)
4. **Multi-horizon predictions** (short-term ML, long-term heuristics)
5. **Uncertainty quantification** (confidence intervals, risk metrics)
6. **Backtesting and validation** (measure accuracy, iterate)

**We need to apply the same rigor to xMins prediction.**

---

## Training Data: Quality Over Quantity

**Use only 2 seasons:**
- **2024-25** (full season, 38 gameweeks)
- **2025-26** (current season, GW1-9 so far)

**Why not older seasons?**
- Managers change (tactics, rotation patterns)
- Teams change (promoted/relegated, transfers)
- Meta changes (VAR, substitution rules, fixture congestion)
- **Recent data > Historical noise**

**Target dataset:**
- ~27,000 appearances (2024-25)
- ~9,000 appearances (2025-26 GW1-9)
- **Total: ~36,000 samples** (sufficient for gradient boosting)

---

## Advanced Features Needed

### Current Features (Basic)
- Recent form (3, 5, 8 game windows)
- Position (GK, DEF, MID, FWD)
- Role lock (consecutive 85+ starts)
- Home/away
- Temporal (gameweek, month)

### Missing Features (Advanced)

#### 1. Manager Rotation Patterns
- **Manager ID + rotation tendency** (Pep = high rotation, Arteta = stable)
- **Days since last start** (tired players rotated)
- **Upcoming fixture density** (UCL/Europa games → rotation)
- **Score state** (winning = early subs, losing = keep starters)

#### 2. Competition for Places (Depth Charts)
- **Position depth** (how many viable alternatives?)
- **Teammate injury status** (injury to starter → backup gets minutes)
- **Recent sub patterns** (who comes on for whom?)
- **Positional versatility** (can play multiple positions → more starts)

#### 3. Form and Quality Signals
- **Goals + assists last 5 games** (in-form players start more)
- **xG + xA trends** (underlying quality)
- **Minutes trend** (increasing → nailed, decreasing → rotated)
- **Manager quotes** (if available: "He'll start Saturday")

#### 4. Fixture Context
- **Opponent strength** (already have FDR, but can improve)
- **Tactical matchup** (does manager favor certain players vs certain opponents?)
- **Historical head-to-head** (player X always starts vs Team Y)

#### 5. Physical Load
- **Minutes in last 7 days** (congestion metric)
- **International break flag** (returned late → rested)
- **Yellow card accumulation** (4 yellows → risk rotation to avoid suspension)
- **Red card history** (disciplinary record)

#### 6. Age and Contract
- **Age** (young = rotated for development, old = rested)
- **Contract situation** (leaving → less minutes, new signing → more)
- **Transfer rumors** (if tracked)

#### 7. Injury Intelligence (CRITICAL)
**Problem:** FPL only shows injury availability percentages (0%, 25%, 50%, 75%) with no context.

**What we need:**
- **Injury type** (hamstring, knee, concussion, muscle strain, etc.)
- **Injury severity** (minor knock vs long-term absence)
- **Expected recovery timeline** (1 week, 3 weeks, 2 months)
- **Historical recovery curves** (player X's hamstrings take 3 weeks on average)
- **Cascading effects** (Player A injured → Player B gets more minutes)
- **Return-from-injury ramp-up** (first game back = 60 min, second game = 75 min, third game = 90 min)

**Example:**
- Player at 75% availability with minor knock → 80% chance to start
- Player at 75% availability with hamstring tear → 20% chance to start
- FPL doesn't distinguish - we need to

**Impact on other players:**
- Injured starter → backup gets temporary boost in xMins
- When starter returns → backup xMins decreases
- Need to model both injured player AND affected teammates

#### 8. Outlier Event Filtering (CRITICAL)
**Problem:** Minutes per start can be misleading due to rare events that shouldn't influence predictions.

**Events to filter/handle specially:**
- **Early injury substitution** (player forced off after 15 min → don't penalize avg)
- **Red card** (forced early sub → outlier, not tactical decision)
- **Yellow card precaution** (subbed at 70 min to avoid second yellow → tactical, but shouldn't lower normal xMins)
- **Blowout games** (5-0 lead → early subs for rest, not indicative of normal minutes)
- **Dead rubber matches** (already qualified/relegated → heavy rotation)

**Solution:**
- Detect outlier appearances (red cards, injuries < 30 min)
- Either exclude from training data OR add binary flags (is_outlier, red_card, injury_sub)
- Don't let one freak event (e.g., 10 min red card) tank a player's predicted xMins
- Weight recent "clean" appearances more than outlier events

---

## Model Architecture: Best-in-Class

### Current Approach (Phase 5 - COMPLETED ✅)
- **Stage 1:** XGBoost Classifier (P(start)) - **85.23% accuracy**
- **Stage 2:** XGBoost Regressor (E[minutes | start]) - **16.18 min MAE**
- **Combined:** 67.15% accuracy within ±15 minutes
- **Status:** Deployed baseline XGBoost, needs advanced features for 85-90% target

### Upgrade Path

#### Option A: Gradient Boosting (Recommended)
```
XGBoost or LightGBM
- Handles non-linear interactions
- Automatic feature importance
- Fast training and inference
- 85-90% accuracy achievable
```

#### Option B: Ensemble (Maximum Accuracy)
```
Combine multiple models:
1. XGBoost (primary)
2. Random Forest (diversity)
3. Neural Network (deep features)
4. Heuristic baseline (safety)

Weighted average based on validation performance
Target: 90-95% accuracy
```

#### Option C: Survival Analysis (Advanced)
```
Weibull AFT (Accelerated Failure Time)
- Models minutes as time-to-event
- Handles censoring (subbed off vs full 90)
- Outputs probability distribution, not just point estimate
- More complex, but theoretically superior
```

**Recommendation: Start with XGBoost (Option A), upgrade to Ensemble (Option B) if needed**

---

## Hybrid Prediction Strategy

### Short-Term (GW+1 to GW+4): 100% ML
- Rich recent data (last 8 games)
- Stable team news
- **Target: 85-90% accuracy**

### Medium-Term (GW+5 to GW+8): 70% ML + 30% Heuristic
- Blend to handle uncertainty
- Heuristic handles injuries better (recovery curves)
- **Target: 75-85% accuracy**

### Long-Term (GW+9 to GW+14): 100% Heuristic
- Too far out for ML reliability
- Injury projections dominant factor
- **Target: 65-75% accuracy** (acceptable for planning)

**Why this works:**
- FPL decisions are made 1-2 weeks ahead (GW+1 to GW+4 most important)
- Maximizes accuracy where it matters
- Graceful degradation for longer horizons

---

## Missing Components for 90%+ Accuracy

### Immediate Priorities

1. **Depth Chart System**
   - Manually curate or auto-infer from sub patterns
   - Track who is #1, #2, #3 choice at each position
   - Boost predictions when starter is injured

2. **Manager Rotation Learning**
   - Build "manager profiles" from historical data
   - Pep's rotation % vs Arteta's rotation %
   - Learn which gameweeks trigger rotation (post-UCL, vs weak opponents)

3. **Advanced Feature Engineering**
   - Add 20-30 more features (see above)
   - Interaction terms (position × opponent, manager × fixture density)
   - Embeddings (player embeddings, team embeddings)

4. **Model Upgrade**
   - Replace Logistic + Linear with XGBoost
   - Hyperparameter tuning (grid search, cross-validation)
   - Ensemble if single model < 85%

5. **Automated Retraining**
   - Weekly retraining with latest gameweek data
   - Store model versions, A/B test new models
   - Rollback if accuracy degrades

6. **Backtesting Framework**
   - Compare predictions vs actual minutes (MAE, RMSE)
   - Track accuracy by position, team, gameweek distance
   - Identify weak spots, iterate

### Future Enhancements

7. **Press Conference Scraping**
   - FPL Rockstar, team websites
   - NLP sentiment: "He's fit and ready to start"
   - Binary flags: confirmed_start, injury_doubt, rotation_risk

8. **European Competition Tracking**
   - UCL/Europa fixture dates
   - Rotation risk after midweek games
   - Learn which managers rotate more (Pep) vs less (Klopp)

9. **Suspension System**
   - Yellow card accumulation (5 = 1 game ban, 10 = 2 games, 15 = 3 games)
   - Predict when players are rested to avoid suspension
   - Red card tracking (automatic 1-3 game bans)

10. **Transfer Impact**
    - New signings (minutes ramp-up curve)
    - Players leaving (minutes decrease before exit)
    - Loans returning (integration period)

11. **Uncertainty Quantification**
    - Not just point estimates, but probability distributions
    - "70% chance of 80-90 minutes, 20% chance of 60-70, 10% chance of 0-30"
    - Enables risk-adjusted decisions

12. **Multi-Objective Optimization**
    - Optimize for accuracy AND calibration
    - Ensure predicted 70% actually means 70% (not 80%)
    - Brier score, log loss, not just MAE

---

## Success Metrics

### Minimum Viable (MVP)
- ✅ 14-week predictions automated
- ⏳ **80-85% accuracy (within ±15 minutes) for GW+1**
- ⏳ Zero manual work weekly

### Target (Phase 5)
- ⏳ **85-90% accuracy for GW+1 to GW+4**
- ⏳ 75-85% accuracy for GW+5 to GW+8
- ⏳ Sub-30 minute prediction generation (all 725 players)

### Stretch Goal (Future)
- **90-95% accuracy for GW+1** (best-in-class)
- Real-time updates (within 1 hour of team news)
- Probabilistic predictions (distributions, not point estimates)
- Public API (share with FPL community)

---

## How to Measure Success

### Weekly Accuracy Check
After each gameweek completes:
1. Compare predicted xMins vs actual minutes
2. Calculate MAE (Mean Absolute Error): avg(|predicted - actual|)
3. Calculate % within ±15 minutes: accuracy metric
4. Break down by:
   - Position (GK, DEF, MID, FWD)
   - Team (which teams are hardest to predict?)
   - Prediction horizon (GW+1 vs GW+4)

### Benchmarks
- **Naive baseline:** "Last gameweek's minutes" → ~60% accuracy
- **Current heuristics:** ~70-80% accuracy
- **Target ML:** 85-90% accuracy
- **Best-in-class:** 90-95% accuracy (quant-level)

### Regression Testing
- Store predictions from multiple model versions
- A/B test: does new model beat old model?
- Never deploy a model that's worse than current production

---

## The Path Forward

### Phase 5: ML Foundation (Current)
- ✅ Data ingestion (2024-25, 2025-26)
- ✅ Feature engineering (24 features)
- ✅ Two-stage model (Logistic + Linear)
- ⏳ Deploy and test (target: 80-85% accuracy)

### Phase 6: Advanced Features
- Depth charts (manual or auto-inferred)
- Manager rotation patterns (learn from data)
- Physical load metrics (minutes last 7 days, intl breaks)
- Form signals (goals, assists, xG trends)

### Phase 7: Model Upgrade
- Replace Linear/Logistic with XGBoost
- Hyperparameter tuning (max_depth, learning_rate, n_estimators)
- Cross-validation (5-fold)
- Target: 85-90% accuracy

### Phase 8: Production Hardening
- Automated weekly retraining
- Backtesting framework (track accuracy over time)
- Model versioning and rollback
- A/B testing (new vs old model)

### Phase 9: Advanced Enhancements
- Press conference scraping (NLP)
- European competition tracking
- Suspension system (yellow/red cards)
- Ensemble models (XGBoost + RF + NN)
- Target: 90-95% accuracy

---

## Non-Negotiables

1. **No Misinformation**
   - Verify all facts (current season, teams, players)
   - 2025-26 is current season, NOT 2024-25
   - Check HANDOFF.md for ground truth

2. **Training Data Recency**
   - Use only 2024-25 and 2025-26 seasons
   - More data ≠ better (meta changes)

3. **Full Automation**
   - Zero manual work weekly
   - Automated retraining, deployment, monitoring

4. **Build Before Testing**
   - ALWAYS run `npm run build` before pushing
   - Convex deploy before Next.js build
   - Test locally first

5. **Math-Driven Approach**
   - Quantitative, data-driven decisions
   - Measure everything (accuracy, latency, coverage)
   - Iterate based on metrics, not intuition

---

## Final Vision

**We are building the most advanced xMins prediction system in the FPL ecosystem.**

FPL Review has the best points model. We give them the best xMins. Together, we maximize EV and points.

This isn't just a hobby project. This is:
- **Quantitative finance** applied to FPL
- **Machine learning** at production scale
- **Data engineering** for full automation
- **Predictive modeling** with 90%+ accuracy

**Every decision should ask: Does this improve xMins accuracy?**

If yes → build it.
If no → deprioritize.

**The math makes predicting the future possible. Let's build the math.**

---

## Quick Reference

**Current Season:** 2025-26, Gameweek 9
**Training Data:** 2024-25 (full) + 2025-26 (GW1-9)
**Current Accuracy:** 70-80% (heuristics)
**Target Accuracy:** 85-90% (ML), 90-95% (advanced)
**Primary Metric:** % within ±15 minutes for GW+1
**North Star:** Unlock FPL Review's full potential with perfect xMins

---

**This is our north star. All future work aligns with this vision.**
