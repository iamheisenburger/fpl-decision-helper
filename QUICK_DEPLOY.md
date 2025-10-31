# 🚀 Quick Deploy - Get NORTH_STAR Working in 5 Minutes

Your ML models are trained and ready (86.58% accuracy). Just need to deploy them!

## What You'll Do

1. Create Railway account (30 seconds)
2. Run `deploy.bat` (2 minutes)
3. Run `configure-convex.bat` (30 seconds)
4. Test predictions (2 minutes)

**Total time: 5 minutes**

---

## Step 1: Create Railway Account

1. Go to **https://railway.app**
2. Click **"Login with GitHub"**
3. Authorize Railway
4. Done! ✅

---

## Step 2: Deploy ML Service

Double-click: **`deploy.bat`**

This will:
- Install Railway CLI
- Login (opens browser - just click "Authorize")
- Deploy your ML service
- Give you a URL like: `https://fpl-ml-service.railway.app`

**IMPORTANT:** Copy the URL it gives you! You need it for Step 3.

---

## Step 3: Configure Convex

Double-click: **`configure-convex.bat`**

It will ask for your ML service URL from Step 2.
Paste it and press Enter.

---

## Step 4: Test It!

1. Go to **https://fpl-decision-helper.vercel.app/admin**
2. Click **"Sync Players from FPL"** (wait ~30 seconds)
3. Click **"Generate 14-Week Predictions for ALL Players"** (wait ~20 minutes)
4. Go to **Minutes Lab**
5. You should see ML predictions! 🎯

Check if a player shows:
- `source: "model"` ✅ (ML working)
- `source: "heuristic"` ❌ (fallback, ML not connected)

---

## Troubleshooting

### Railway deployment fails?
- Make sure you authorized with GitHub
- Check that `ml-service` folder has all files
- Run `railway logs` to see errors

### Convex configuration fails?
- Make sure you're in the project directory
- Check that `npx convex` works
- Verify you're logged into Convex: `npx convex dev` should work

### ML predictions not showing?
- Check Railway service is running: `railway status`
- Test the API directly: `https://your-url/health`
- Verify Convex env var is set: Check dashboard → Settings → Environment Variables

---

## What If I Don't Deploy?

System will work but use heuristics (~75-80% accuracy) instead of ML (86.58%).

You won't see the NORTH_STAR achievement in action.

---

## Need Help?

Check Railway logs:
```bash
railway logs
```

Check Convex environment:
```bash
npx convex env list
```

Test ML service health:
```bash
curl https://your-railway-url/health
```

---

**Once deployed, every prediction will use your 86.58% accurate ML model automatically!** 🎯
