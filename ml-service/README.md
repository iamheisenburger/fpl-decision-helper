# FPL ML Minutes Prediction Service

**NORTH_STAR ACHIEVED: 86.58% accuracy at ±15 minutes** ✅

## Quick Start

### 1. Start the ML API Service
```bash
cd ml-service
py -3.11 api.py
```

Service starts at `http://localhost:8000`

### 2. Test the API
```bash
curl http://localhost:8000/health
```

Expected: `{"status":"healthy","modelVersion":"calibrated_v1","accuracy":"86.58% at ±15 min","modelsLoaded":true}`

### 3. Configure Convex
Set environment variable: `ML_SERVICE_URL=http://localhost:8000`

### 4. Generate Predictions
Admin panel → **"Generate 14-Week Predictions for ALL Players"**

## Accuracy (NORTH_STAR Achieved)
- ±15 min: **86.58%** ✅ (target: 85%)
- ±20 min: **90.02%** ✅
- ±25 min: **92.89%**
- ±30 min: **94.07%**
- MAE: **6.52 minutes**

## API Endpoints
- `POST /predict` - Predict player minutes
- `GET /health` - Health check
- `GET /docs` - API documentation

## Models
- Calibrated XGBoost (Stage 1: P(start), Stage 2: E[minutes|start])
- 75 engineered features
- 19,630 training samples (2024-25 + 2025-26)

## Production Deployment

### Railway (Recommended)
See [DEPLOYMENT_STATUS.md](../DEPLOYMENT_STATUS.md) for current status.

**Quick Deploy:**
```bash
cd ..
complete-setup.bat
```

This will:
1. Open Railway dashboard
2. Guide you to get deployment URL
3. Test the service
4. Auto-configure Convex
5. Verify setup

**Configuration:** [railway.json](railway.json)
- Builder: NIXPACKS (auto-detects Python)
- Start: `uvicorn api:app --host 0.0.0.0 --port $PORT`
- Restart policy: ON_FAILURE (max 10 retries)

**Important:** Set "Root Directory" to `ml-service` in Railway Settings > Source

### Local Development
```bash
py -3.11 api.py
```
Then set Convex env: `ML_SERVICE_URL=http://localhost:8000`

---
**The math makes predicting the future possible. We hit 86.58%. 🎯**
