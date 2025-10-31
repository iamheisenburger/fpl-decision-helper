@echo off
echo ========================================
echo FPL ML Service - Complete Setup
echo ========================================
echo.
echo This script will:
echo 1. Open your Railway dashboard
echo 2. Test your ML service URL
echo 3. Configure Convex automatically
echo 4. Verify the setup works
echo.
pause
echo.

echo [1/4] Opening Railway dashboard...
echo.
start https://railway.app/dashboard
echo.
echo ========================================
echo GET YOUR RAILWAY URL:
echo ========================================
echo.
echo In the Railway dashboard:
echo 1. Click on your "fpl-decision-helper" project
echo 2. Click on the "ml-service" deployment
echo 3. Go to "Settings" tab
echo 4. Under "Networking" find your "Public Domain"
echo 5. Copy the full URL (e.g., abc123.up.railway.app)
echo.
echo ========================================
echo.
set /p RAILWAY_URL="Paste your Railway URL here: "

echo.
echo [2/4] Testing ML service...
echo.
echo Testing: https://%RAILWAY_URL%/health
curl -s https://%RAILWAY_URL%/health
echo.
echo.

if errorlevel 1 (
    echo ERROR: Could not reach ML service!
    echo Please check:
    echo - Railway deployment shows "Deployed" status
    echo - The URL is correct
    echo - No "https://" prefix when pasting
    echo.
    pause
    exit /b 1
)

echo SUCCESS: ML service is responding!
echo.

echo [3/4] Configuring Convex...
echo.
cd /d "c:\Users\arshadhakim\OneDrive\Desktop\FPL eo helper"
npx convex env set ML_SERVICE_URL https://%RAILWAY_URL%
echo.

if errorlevel 1 (
    echo ERROR: Could not configure Convex!
    echo Please make sure you're logged into Convex.
    echo Try running: npx convex dev
    echo.
    pause
    exit /b 1
)

echo SUCCESS: Convex configured!
echo.

echo [4/4] Verifying setup...
echo.
npx convex env list
echo.

echo ========================================
echo SETUP COMPLETE!
echo ========================================
echo.
echo Your ML service is now connected!
echo.
echo Next steps:
echo 1. Go to: https://fpl-decision-helper.vercel.app/admin
echo 2. Click "Sync Players from FPL" (wait ~30 seconds)
echo 3. Click "Generate 14-Week Predictions for ALL Players" (wait ~20 minutes)
echo 4. Go to "Minutes Lab" to see ML predictions
echo.
echo Look for predictions with:
echo - source: "model" = ML working (86.58%% accuracy!)
echo - source: "heuristic" = fallback (~75-80%%)
echo.
echo ========================================
echo.
pause
