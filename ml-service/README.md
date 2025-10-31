# FPL ML Service

Machine learning service for predicting player minutes (xMins) with 85-90% accuracy target.

## Architecture

**Two-Stage ML Model:**
1. **Stage 1 (Logistic Regression):** Predicts P(start) - probability of starting
2. **Stage 2 (Linear Regression):** Predicts E[minutes | start] - expected minutes if starting
3. **Combined:** xMins = P(start) × E[minutes | start]

## Setup Instructions

### 1. Install Python Dependencies

```bash
cd ml-service
pip install -r requirements.txt
```

**Required Python version:** 3.10 or higher

### 2. Ingest Historical Data

Fetch 3 seasons of FPL data (2022-23, 2023-24, 2024-25):

```bash
python scripts/ingest_historical_data.py
```

**Output:**
- `data/training_data_raw.csv` (~80k appearances)
- `data/dataset_summary.json`

**Estimated time:** 20-30 minutes (rate-limited API calls)

### 3. Engineer Features

Transform raw data into ML-ready features:

```bash
python scripts/feature_engineering.py
```

**Output:**
- `data/training_data_features.csv`
- `data/feature_config.json`

**Features engineered:**
- Recent form (3, 5, 8 game windows)
- Role lock detection
- Position encoding
- Temporal features
- Match context

### 4. Train Models

Train two-stage ML models:

```bash
python scripts/train_models.py
```

**Output:**
- `models/start_model.pkl` (Logistic Regression)
- `models/start_scaler.pkl`
- `models/minutes_model.pkl` (Ridge Regression)
- `models/minutes_scaler.pkl`
- `models/model_metadata.json`

**Expected performance:**
- Start prediction: 85-90% accuracy
- Minutes prediction: 10-15 min MAE
- Combined: 80-85% within ±15 minutes

### 5. Test Locally

Run the FastAPI service locally:

```bash
uvicorn app:app --reload
```

**Endpoints:**
- `GET /` - Service info
- `GET /health` - Health check
- `POST /predict` - Single player prediction
- `POST /predict/batch` - Batch predictions

**Test prediction:**
```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "test123",
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
      }
    ]
  }'
```

**Expected response:**
```json
{
  "playerId": "test123",
  "gameweek": 9,
  "startProb": 0.95,
  "xMinsStart": 85,
  "xMins": 80.75,
  "p90": 0.80,
  "source": "model",
  "modelVersion": "v1.0",
  "flags": {
    "sparse_data": false,
    "role_lock": true
  }
}
```

## Deployment to Render.com

### Option A: Deploy via GitHub (Recommended)

1. **Push ml-service to GitHub:**
   ```bash
   git add ml-service/
   git commit -m "Add ML service for xMins predictions"
   git push
   ```

2. **Connect to Render.com:**
   - Go to https://render.com/
   - Sign in with GitHub
   - Click "New +" → "Web Service"
   - Connect your repository
   - Select `ml-service/` as root directory
   - Render will auto-detect `render.yaml` configuration

3. **Important: Upload model artifacts**
   - Render free tier doesn't persist disk storage
   - Upload trained models to cloud storage (S3/GCS) OR
   - Include models in Git repo (not ideal for large files) OR
   - Retrain on first deploy (add to buildCommand)

   **Option 1: Include models in repo (quick start)**
   ```bash
   git add ml-service/models/*.pkl
   git commit -m "Add trained model artifacts"
   git push
   ```

   **Option 2: Train on deploy (slower, but always fresh)**
   Update `render.yaml`:
   ```yaml
   buildCommand: |
     pip install -r requirements.txt
     python scripts/ingest_historical_data.py
     python scripts/feature_engineering.py
     python scripts/train_models.py
   ```

4. **Deploy:**
   - Render will build and deploy automatically
   - Monitor logs for errors
   - Test health endpoint: `https://your-service.onrender.com/health`

### Option B: Manual Deploy

```bash
# Install Render CLI
npm install -g @render-cli/cli

# Login
render login

# Deploy
render deploy
```

## Integration with Convex

Once deployed, update Convex with your ML service URL:

1. **Get Render URL:**
   - Example: `https://fpl-ml-service.onrender.com`

2. **Create Convex environment variable:**
   ```bash
   npx convex env set ML_SERVICE_URL https://fpl-ml-service.onrender.com
   ```

3. **Convex will call ML service via HTTP action** (see `convex/engines/mlPredictor.ts`)

## Monitoring & Maintenance

### Performance Monitoring

Check model accuracy in production:
```bash
curl https://your-service.onrender.com/health
```

### Weekly Retraining (Automated)

Add to Convex cron schedule (`convex/crons.ts`):
```typescript
crons.weekly(
  "retrain-ml-models",
  { dayOfWeek: "saturday", hourUTC: 4, minuteUTC: 0 },
  api.mlService.triggerRetraining
);
```

This will:
1. Fetch latest 2024-25 data
2. Retrain models with new appearances
3. Deploy updated models to Render

### Upgrading to XGBoost (if needed)

If simple models don't hit 85% accuracy:

1. **Update requirements.txt:**
   ```
   xgboost>=2.0.0
   lightgbm>=4.0.0
   ```

2. **Update train_models.py:**
   ```python
   from xgboost import XGBClassifier, XGBRegressor

   # Stage 1: XGBoost Classifier
   start_model = XGBClassifier(
       n_estimators=100,
       max_depth=6,
       learning_rate=0.1,
       random_state=42
   )

   # Stage 2: XGBoost Regressor
   minutes_model = XGBRegressor(
       n_estimators=100,
       max_depth=6,
       learning_rate=0.1,
       random_state=42
   )
   ```

3. **Retrain and redeploy**

## Troubleshooting

### "Models not loaded" error

**Cause:** Model files not found in `models/` directory

**Fix:**
```bash
python scripts/train_models.py  # Retrain locally
# OR
git add ml-service/models/*.pkl  # Commit to repo
git push
```

### Low accuracy (<80%)

**Potential fixes:**
1. Add more training data (4+ seasons)
2. Upgrade to XGBoost/LightGBM
3. Add more features (fixture difficulty, depth charts)
4. Tune hyperparameters

### API timeout on Render free tier

**Cause:** Free tier has 15-second timeout, batch predictions may be slow

**Fix:**
1. Upgrade to paid tier ($7/month, 30s timeout)
2. Optimize batch endpoint (parallel processing)
3. Implement caching (Redis)

### Render service sleeping (free tier)

**Cause:** Free tier sleeps after 15 min inactivity

**Fix:**
1. First request will be slow (cold start)
2. Convex fallback to heuristics handles this gracefully
3. Upgrade to paid tier for always-on service

## File Structure

```
ml-service/
├── app.py                    # FastAPI service
├── requirements.txt          # Python dependencies
├── render.yaml              # Render.com config
├── README.md                # This file
├── scripts/
│   ├── ingest_historical_data.py    # Fetch 3 seasons of FPL data
│   ├── feature_engineering.py       # Transform into ML features
│   └── train_models.py              # Train two-stage models
├── data/                    # Training data (gitignored)
│   ├── training_data_raw.csv
│   ├── training_data_features.csv
│   ├── feature_config.json
│   └── dataset_summary.json
└── models/                  # Trained models (gitignored or committed)
    ├── start_model.pkl
    ├── start_scaler.pkl
    ├── minutes_model.pkl
    ├── minutes_scaler.pkl
    └── model_metadata.json
```

## API Reference

### POST /predict

Predict xMins for a single player.

**Request body:**
```json
{
  "playerId": "string",
  "playerName": "string",
  "position": "GK|DEF|MID|FWD",
  "team": "string",
  "price": 10.5,
  "gameweek": 9,
  "isHome": true,
  "appearances": [
    {
      "gameweek": 8,
      "season": "2024-25",
      "started": true,
      "minutes": 90,
      "injExit": false,
      "redCard": false,
      "date": 1730000000000,
      "homeAway": "home"
    }
  ]
}
```

**Response:**
```json
{
  "playerId": "string",
  "gameweek": 9,
  "startProb": 0.85,
  "xMinsStart": 80,
  "xMins": 68,
  "p90": 0.60,
  "uncertaintyLo": null,
  "uncertaintyHi": null,
  "source": "model",
  "modelVersion": "v1.0",
  "flags": {
    "sparse_data": false,
    "role_lock": true
  }
}
```

### POST /predict/batch

Batch predictions for multiple players.

**Request body:**
```json
{
  "players": [
    { /* PredictionRequest */ },
    { /* PredictionRequest */ }
  ]
}
```

**Response:**
```json
[
  { /* PredictionResponse */ },
  { /* PredictionResponse */ }
]
```

## Next Steps

1. ✅ Data ingestion complete
2. ✅ Feature engineering complete
3. ✅ Model training complete
4. ✅ FastAPI service built
5. ⏳ **Deploy to Render.com** (you are here)
6. ⏳ **Integrate with Convex** (see `convex/engines/mlPredictor.ts`)
7. ⏳ **Test end-to-end accuracy**
8. ⏳ **Add automated weekly retraining**

---

**Questions?** Check the main [HANDOFF.md](../HANDOFF.md) or raise an issue on GitHub.
