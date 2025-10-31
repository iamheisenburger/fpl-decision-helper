# Phase 5: ML Models Deployment Guide

Complete guide for deploying ML-powered xMins predictions with 85-90% accuracy target.

---

## Overview

**What's Been Built:**
- ✅ Historical data ingestion (3 seasons: 2022-23, 2023-24, 2024-25)
- ✅ Feature engineering (recency weights, role lock, position encoding, etc.)
- ✅ Two-stage ML models (Logistic Regression + Ridge Regression)
- ✅ FastAPI service with prediction endpoints
- ✅ Convex hybrid predictor (ML + heuristic blend)
- ✅ Schema updates to support "model" and "hybrid" sources

**What Remains:**
- ⏳ Train models locally (requires Python setup)
- ⏳ Deploy ML service to Render.com
- ⏳ Configure Convex environment variable
- ⏳ Test end-to-end pipeline
- ⏳ Verify 85-90% accuracy

---

## Step-by-Step Deployment

### Prerequisites

1. **Install Python 3.10+**
   - Download: https://www.python.org/downloads/
   - Verify: `python --version` or `py --version`

2. **Install Python dependencies**
   ```bash
   cd ml-service
   pip install -r requirements.txt
   ```

3. **Render.com account**
   - Sign up: https://render.com/ (free tier)
   - Connect your GitHub account

---

### Step 1: Train ML Models Locally

This will take 20-30 minutes on first run.

```bash
cd ml-service

# 1. Fetch 3 seasons of historical data
python scripts/ingest_historical_data.py

# Expected output:
#   ✅ 2022-23: ~27,000 appearances
#   ✅ 2023-24: ~27,000 appearances
#   ✅ 2024-25: ~9,000 appearances (GW1-9 so far)
#   💾 Saved to: data/training_data_raw.csv

# 2. Engineer ML features
python scripts/feature_engineering.py

# Expected output:
#   ✅ Added 24 features (recent form, role lock, position, temporal)
#   💾 Saved to: data/training_data_features.csv

# 3. Train two-stage models
python scripts/train_models.py

# Expected output:
#   Stage 1 (Start): 85-90% accuracy
#   Stage 2 (Minutes): 10-15 min MAE
#   Combined: 80-85% within ±15 min
#   💾 Saved models to: models/*.pkl
```

**Success Criteria:**
- ✅ `models/start_model.pkl` created
- ✅ `models/minutes_model.pkl` created
- ✅ Test accuracy >= 80% (if lower, see "Troubleshooting" below)

---

### Step 2: Test ML Service Locally

Before deploying, verify the API works:

```bash
# Start FastAPI server
cd ml-service
uvicorn app:app --reload
```

Open browser: http://localhost:8000/health

**Expected response:**
```json
{
  "status": "healthy",
  "modelVersion": "v1.0",
  "trainedAt": "2025-01-15T10:30:00"
}
```

**Test prediction:**
```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "test",
    "playerName": "Haaland",
    "position": "FWD",
    "team": "Man City",
    "price": 15.0,
    "gameweek": 9,
    "isHome": true,
    "appearances": [
      {
        "gameweek": 8,
        "season": "2024-25",
        "started": true,
        "minutes": 90,
        "date": 1730000000000,
        "homeAway": "home"
      },
      {
        "gameweek": 7,
        "season": "2024-25",
        "started": true,
        "minutes": 85,
        "date": 1729000000000,
        "homeAway": "away"
      }
    ]
  }'
```

**Expected response:**
```json
{
  "playerId": "test",
  "gameweek": 9,
  "startProb": 0.95,
  "xMinsStart": 85,
  "xMins": 80.75,
  "p90": 0.80,
  "source": "model",
  "modelVersion": "v1.0"
}
```

---

### Step 3: Commit ML Models to Git

**Option A: Include models in repo (quick start)**
```bash
git add ml-service/
git commit -m "Phase 5: Add ML service with trained models"
git push origin main
```

**Option B: Exclude models, retrain on deploy (slower, always fresh)**
- Uncomment `models/*.pkl` in `ml-service/.gitignore`
- Update `render.yaml` buildCommand to run training scripts
- **Not recommended for Render free tier** (slow cold starts)

---

### Step 4: Deploy to Render.com

1. **Go to Render Dashboard**
   - https://dashboard.render.com/
   - Click "New +" → "Web Service"

2. **Connect Repository**
   - Select your GitHub repo: `fpl-decision-helper`
   - Branch: `main`

3. **Configure Service**
   - **Name:** `fpl-ml-service`
   - **Region:** Oregon (free tier available)
   - **Branch:** `main`
   - **Root Directory:** `ml-service` ⚠️ **IMPORTANT**
   - **Environment:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app:app --host 0.0.0.0 --port $PORT`

4. **Set Environment Variables**
   - **PYTHON_VERSION:** `3.11`
   - **MODEL_VERSION:** `v1.0`

5. **Select Plan**
   - **Free** (0.1 CPU, 512 MB RAM, sleeps after 15 min)
   - Upgrade to **Starter** ($7/month) if you need always-on

6. **Deploy**
   - Click "Create Web Service"
   - Wait 5-10 minutes for first deploy
   - Monitor logs for errors

7. **Verify Deployment**
   - Render will provide a URL: `https://fpl-ml-service.onrender.com`
   - Test health endpoint: `https://fpl-ml-service.onrender.com/health`
   - Should return: `{"status": "healthy", "modelVersion": "v1.0"}`

---

### Step 5: Configure Convex Environment Variable

Connect Convex to your deployed ML service:

```bash
# Set ML service URL
npx convex env set ML_SERVICE_URL https://fpl-ml-service.onrender.com

# Verify
npx convex env list
```

**Expected output:**
```
ML_SERVICE_URL = https://fpl-ml-service.onrender.com
```

---

### Step 6: Deploy Convex Changes

Deploy the updated Convex code (mlPredictor, multiWeekPredictor, schema):

```bash
# Deploy Convex functions
npx convex deploy

# Wait for deployment to complete (~1 minute)
```

**Expected output:**
```
✔ Deployment complete!
  convex/engines/mlPredictor.ts (3 functions)
  convex/engines/multiWeekPredictor.ts (updated)
  convex/schema.ts (updated)
```

---

### Step 7: Test End-to-End Pipeline

1. **Open Admin Page**
   - Go to: https://fpl-decision-helper.vercel.app/admin
   - Or run locally: `npm run dev` → http://localhost:3000/admin

2. **Check ML Service Health**
   - The admin page should show ML service status
   - If not visible, manually test:
   ```bash
   curl https://fpl-ml-service.onrender.com/health
   ```

3. **Generate Test Predictions**
   - Click "Generate 14-Week Predictions for All Players"
   - **First request to Render free tier will be slow** (~30s cold start)
   - Subsequent requests faster (~2-5s per player)
   - Watch console logs for `[ML]` and `[HYBRID]` messages

4. **Verify Predictions in Minutes Lab**
   - Go to: https://fpl-decision-helper.vercel.app/minutes-lab
   - Search for a star player (e.g., "Haaland", "Salah")
   - Click player row to see 14-week outlook
   - Check `source` field:
     - **GW+1 to GW+4:** Should show "model" (100% ML)
     - **GW+5 to GW+8:** Should show "hybrid" (70% ML + 30% heuristic)
     - **GW+9 to GW+14:** Should show "heuristic" (100% heuristic)

5. **Verify Predictions Are Different from Heuristics**
   - ML predictions should be more accurate for near-term (GW+1 to GW+4)
   - Compare xMins values with previous heuristic-only predictions
   - ML should handle role locks, rotation patterns, and form better

---

### Step 8: Build and Deploy Frontend

```bash
# Local build test (MUST pass)
npm run build

# If build passes, deploy
git add .
git commit -m "Phase 5: ML pipeline integrated and tested"
git push origin main

# Vercel will auto-deploy
# Monitor: https://vercel.com/your-project/deployments
```

---

## Hybrid Prediction Logic

The system intelligently blends ML and heuristic predictions based on prediction horizon:

| Gameweek Distance | ML Weight | Heuristic Weight | Source Tag | Rationale |
|------------------|-----------|------------------|------------|-----------|
| GW+1 to GW+4 | 100% | 0% | "model" | ML most accurate for near-term |
| GW+5 to GW+8 | 70% | 30% | "hybrid" | Blend for medium-term |
| GW+9 to GW+14 | 0% | 100% | "heuristic" | Too far for ML reliability |

**Why this approach?**
- **Near-term (GW+1-4):** ML has rich feature data (last 8 games, recent form)
- **Medium-term (GW+5-8):** Blend reduces overfitting risk
- **Long-term (GW+9-14):** Heuristics better for injury projections and recovery curves

---

## Monitoring & Maintenance

### Check ML Service Health

**Via API:**
```bash
curl https://fpl-ml-service.onrender.com/health
```

**Via Render Dashboard:**
- https://dashboard.render.com/
- Select `fpl-ml-service`
- Check "Logs" tab for errors
- Check "Metrics" for request latency

### Accuracy Monitoring

**Manual check:**
1. After each gameweek, compare predictions vs actual minutes
2. Calculate MAE (Mean Absolute Error):
   - For GW+1 predictions only
   - Target: < 15 minutes MAE
3. If accuracy drops below 80%, retrain models

**Future: Automated monitoring**
- Add Convex query to compare predictions vs actuals
- Store accuracy metrics in `modelMetrics` table
- Alert if accuracy drops below threshold

### Weekly Model Retraining (Manual)

**When to retrain:**
- Every 4-6 weeks (as season progresses)
- When accuracy drops below 80%
- After major meta shifts (e.g., managerial changes)

**How to retrain:**
```bash
cd ml-service

# 1. Fetch latest data
python scripts/ingest_historical_data.py

# 2. Engineer features
python scripts/feature_engineering.py

# 3. Train models
python scripts/train_models.py

# 4. Commit and push
git add models/*.pkl
git commit -m "Retrain models with GW1-X data"
git push

# 5. Render will auto-redeploy (~5 minutes)
```

---

## Troubleshooting

### Issue: ML Service Returns 503 (Service Unavailable)

**Cause:** Render free tier sleeping (15 min inactivity)

**Fix:**
- First request wakes service (~30s cold start)
- Convex automatically falls back to heuristics
- Subsequent requests fast
- **Solution:** Upgrade to Starter plan ($7/month) for always-on

---

### Issue: Predictions Stuck on "heuristic" Source

**Possible causes:**
1. **ML_SERVICE_URL not set**
   ```bash
   npx convex env set ML_SERVICE_URL https://fpl-ml-service.onrender.com
   ```

2. **ML service not deployed**
   - Check: https://fpl-ml-service.onrender.com/health
   - Should return `{"status": "healthy"}`

3. **Convex deploy not run**
   ```bash
   npx convex deploy
   ```

---

### Issue: Low Accuracy (<80%)

**Potential fixes:**

1. **Upgrade models to XGBoost**
   ```python
   # In ml-service/scripts/train_models.py
   from xgboost import XGBClassifier, XGBRegressor

   start_model = XGBClassifier(n_estimators=100, max_depth=6)
   minutes_model = XGBRegressor(n_estimators=100, max_depth=6)
   ```

2. **Add more features**
   - Fixture difficulty (already in system, integrate into ML features)
   - Depth chart position (boost if no competition)
   - Manager rotation patterns (learn from historical subs)

3. **Fetch more training data**
   - Add 2021-22, 2020-21 seasons
   - More data = better generalization

4. **Tune hyperparameters**
   - Use cross-validation grid search
   - Optimize C (regularization) for Logistic Regression
   - Optimize alpha for Ridge Regression

---

### Issue: Render Free Tier Too Slow

**Symptoms:**
- Prediction generation takes > 30 minutes
- Timeouts on batch predictions
- Cold starts > 30s

**Solutions:**
1. **Upgrade to Starter plan** ($7/month)
   - Always-on (no cold starts)
   - More CPU/RAM
   - 30s request timeout

2. **Optimize batch endpoint**
   - Add Redis caching
   - Parallelize predictions
   - Pre-compute common features

3. **Move to AWS Lambda**
   - Pay-per-request
   - Auto-scaling
   - Faster cold starts (~3s)

---

## Success Metrics

**Phase 5 is complete when:**
- ✅ ML service deployed and healthy
- ✅ Convex calling ML service successfully
- ✅ Predictions show "model" source for GW+1-4
- ✅ Test accuracy >= 85% (within ±15 minutes)
- ✅ End-to-end pipeline < 30 minutes for all 725 players
- ✅ Frontend shows 14-week outlook with ML predictions

**Current Status:**
| Task | Status |
|------|--------|
| Data ingestion script | ✅ Complete |
| Feature engineering script | ✅ Complete |
| Model training script | ✅ Complete |
| FastAPI service | ✅ Complete |
| Convex integration | ✅ Complete |
| **Python setup & model training** | ⏳ **Your next step** |
| **Deploy to Render.com** | ⏳ Pending |
| **End-to-end testing** | ⏳ Pending |
| **Accuracy verification** | ⏳ Pending |

---

## Next Steps

1. **Install Python and train models** (see Step 1)
2. **Deploy to Render.com** (see Step 4)
3. **Configure Convex** (see Step 5)
4. **Test predictions** (see Step 7)
5. **Monitor accuracy over next 2-3 gameweeks**
6. **Iterate on features if accuracy < 85%**

---

## Optional Enhancements (Post-MVP)

Once ML pipeline is stable, consider:

1. **Depth Charts** - Manual or auto-inferred from sub patterns
2. **Suspension Tracking** - Yellow card accumulation (5/10/15 thresholds)
3. **European Competition** - UCL/Europa fixture impact
4. **Press Conference Sentiment** - Scrape FPL Rockstar for manager quotes
5. **Automated Retraining** - GitHub Actions weekly workflow
6. **Advanced Models** - Weibull AFT survival model for minutes distribution

---

**Questions?** Check the main [HANDOFF.md](./HANDOFF.md) or the ml-service [README.md](./ml-service/README.md).

**Good luck hitting 85-90% accuracy! 🎯**
