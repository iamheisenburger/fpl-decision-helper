@echo off
echo ========================================
echo FPL ML Service - Railway Deployment
echo ========================================
echo.

cd /d "c:\Users\arshadhakim\OneDrive\Desktop\FPL eo helper\ml-service"

echo [1/3] Installing Railway CLI...
npm install -g @railway/cli

echo.
echo [2/3] Logging into Railway...
echo (A browser window will open - authorize with GitHub)
railway login

echo.
echo [3/3] Deploying ML service...
railway init --name fpl-ml-service
railway up

echo.
echo ========================================
echo DEPLOYMENT COMPLETE!
echo ========================================
echo.
echo Your ML service URL is shown above.
echo Copy it and save it - you'll need it for Step 3.
echo.
echo It looks like: https://fpl-ml-service.railway.app
echo.
pause
