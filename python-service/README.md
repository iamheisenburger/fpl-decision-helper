# xMins Prediction Service

FastAPI microservice for predicting expected minutes using ML models.

## Architecture

**Two-Stage Model:**

1. **Stage A**: Logistic regression → Start Probability
2. **Stage B**: Survival analysis (Weibull AFT) → Minutes given start + P90

## Local Development

### Install Dependencies

```bash
pip install -r requirements.txt
```

### Run Server

```bash
python -m app.main
```

Server runs on `http://localhost:8000`

### API Documentation

Visit `http://localhost:8000/docs` for interactive API documentation (Swagger UI).

## API Endpoints

### Health Check
```
GET /health
```

### Predict xMins (Single)
```
POST /predict
{
  "player_id": "abc123",
  "horizon_weeks": 1,
  "flags": {"exclude_injury": true}
}
```

### Predict xMins (Batch)
```
POST /predict/batch
{
  "players": [
    {"player_id": "abc123", "horizon_weeks": 1},
    {"player_id": "def456", "horizon_weeks": 1}
  ]
}
```

### Train Models
```
POST /train
{
  "convex_url": "https://your-convex-deployment.convex.cloud",
  "force": false
}
```

### Audit Trail
```
GET /audit?player_id=abc123&gameweek=10
```

### Model Info
```
GET /models/info
```

## Deployment

### Docker

Build image:
```bash
docker build -t xmins-service .
```

Run container:
```bash
docker run -p 8000:8000 xmins-service
```

### Render/Railway

1. Push code to GitHub
2. Connect repo to Render/Railway
3. Set build command: `pip install -r requirements.txt`
4. Set start command: `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables:
   - `PORT`: 8000
   - `CONVEX_URL`: Your Convex deployment URL

## Environment Variables

- `PORT`: Server port (default: 8000)
- `STAGE_A_MODEL_PATH`: Path to Stage A model file
- `STAGE_B_MODEL_PATH`: Path to Stage B model file
- `CONVEX_URL`: Convex deployment URL for data fetching

## Model Training

Models must be trained before making predictions:

1. Ensure historical data is populated in Convex (see data ingestion scripts)
2. Call `/train` endpoint
3. Models are saved to `models/` directory
4. Service automatically loads models on startup

## Features Used

- `num_healthy_starts`: Count of recent healthy starts
- `weighted_avg_minutes`: Recency-weighted average minutes
- `last_3_avg_minutes`: Average of last 3 starts
- `last_5_avg_minutes`: Average of last 5 starts
- `minutes_std`: Standard deviation of minutes
- `role_lock`: Boolean for 3+ consecutive 85+ minute starts
- `start_frequency`: Fraction of recent appearances as starter
- `congestion_flag`: Midweek fixture congestion
- `intl_window_flag`: Post-international break
- `avg_days_rest`: Average days since last match
- `viable_backups`: Manual rotation risk score
- `position_encoded`: Position (GK=0, DEF=1, MID=2, FWD=3)

## Model Persistence

Models are serialized using `pickle` and saved to disk. On startup, the service attempts to load existing models. If models don't exist, you must call `/train` first.

## Testing

```bash
# Test health check
curl http://localhost:8000/health

# Test prediction (after training)
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"player_id": "test", "horizon_weeks": 1}'
```

## Future Enhancements

- [ ] Integrate Convex data fetching in predict/train endpoints
- [ ] Add caching layer for predictions
- [ ] Implement model versioning
- [ ] Add monitoring/logging (Sentry, Datadog)
- [ ] Add authentication for production
- [ ] Implement A/B testing framework for model improvements
