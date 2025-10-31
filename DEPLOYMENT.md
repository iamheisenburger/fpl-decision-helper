# ML Service Deployment Guide

The ML models are trained and ready (86.58% accuracy), but need to be deployed to production so your Vercel app can use them.

## Why Deployment is Needed

Your Vercel app at https://fpl-decision-helper.vercel.app runs in the cloud and **cannot reach localhost:8000**. The ML service needs to be deployed to a public URL (like Railway or Render).

## Quick Deploy to Railway (Recommended - 5 minutes)

### 1. Create Railway Account
- Go to https://railway.app
- Sign up with GitHub
- It's free for hobby projects

### 2. Deploy ML Service
```bash
# In your terminal
cd "c:\Users\arshadhakim\OneDrive\Desktop\FPL eo helper"
railway login
railway init
railway up
```

Railway will:
- Detect `ml-service/requirements.txt`
- Install all dependencies
- Start the FastAPI service
- Give you a public URL like: `https://your-app.railway.app`

### 3. Configure Convex
- Go to https://dashboard.convex.dev
- Select your project
- Settings → Environment Variables
- Add new variable:
  - Key: `ML_SERVICE_URL`
  - Value: `https://your-app.railway.app` (from step 2)
- Save and deploy

### 4. Test It
- Go to https://fpl-decision-helper.vercel.app/admin
- Click "Sync Players from FPL" (wait ~30 seconds)
- Click "Generate 14-Week Predictions for ALL Players" (wait ~20 minutes)
- Go to Minutes Lab → you should see ML predictions

## Alternative: Deploy to Render

### 1. Create Render Account
- Go to https://render.com
- Sign up with GitHub

### 2. Create Web Service
- New → Web Service
- Connect your GitHub repo: `iamheisenburger/fpl-decision-helper`
- Root Directory: `ml-service`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn api:app --host 0.0.0.0 --port $PORT`
- Instance Type: Free
- Click "Create Web Service"

### 3. Get URL
- After deployment, Render gives you a URL like: `https://fpl-ml-service.onrender.com`

### 4. Configure Convex (same as Railway step 3)

## What If I Don't Deploy?

The system will fall back to **heuristic predictions** (no ML):
- Still works, but lower accuracy (~75-80%)
- No NORTH_STAR achievement visible
- Minutes Lab will show `source: "heuristic"` instead of `source: "model"`

## Files Created for Deployment

- `ml-service/requirements.txt` - All Python dependencies
- `ml-service/Procfile` - Railway/Heroku start command
- `ml-service/railway.json` - Railway configuration
- `ml-service/api.py` - FastAPI service

## Deployment Checklist

- [ ] Deploy ML service to Railway or Render
- [ ] Get public URL from deployment
- [ ] Set `ML_SERVICE_URL` in Convex environment
- [ ] Sync players in admin panel
- [ ] Generate predictions
- [ ] Verify Minutes Lab shows ML predictions

## Cost

Both Railway and Render have **free tiers** that should be enough:
- Railway: 500 hours/month free
- Render: Always-on free tier (spins down after inactivity)

## Need Help?

If deployment fails:
1. Check Railway/Render logs for errors
2. Verify `requirements.txt` installed correctly
3. Test health endpoint: `https://your-url/health`
4. Check Convex environment variable is set

---

**Once deployed, the system will automatically use ML models (86.58% accuracy) for all predictions.** 🎯
