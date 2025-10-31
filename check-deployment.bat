@echo off
echo ========================================
echo Railway Deployment Status Check
echo ========================================
echo.
echo Opening your Railway dashboard...
echo.
start https://railway.app/dashboard
echo.
echo ========================================
echo INSTRUCTIONS:
echo ========================================
echo.
echo 1. In the Railway dashboard that just opened:
echo    - Find your "fpl-decision-helper" project
echo    - Click on it to view the service
echo    - Look for "ml-service" deployment
echo.
echo 2. Check the deployment status:
echo    - If it says "Deployed" (green) = SUCCESS!
echo    - If it says "Building" (yellow) = Wait a few minutes
echo    - If it says "Failed" (red) = Check the logs
echo.
echo 3. Get your public URL:
echo    - In the service page, click "Settings"
echo    - Look for "Domains" or "Public Domain"
echo    - Copy the URL (looks like: xxx.up.railway.app)
echo.
echo 4. Once you have the URL:
echo    - Run: configure-convex.bat
echo    - Paste your Railway URL when prompted
echo.
echo ========================================
echo.
echo Press any key to test if service is already deployed...
pause > nul
echo.
echo Testing common Railway URLs...
echo.
curl -s https://fpl-ml-service-production.up.railway.app/health
echo.
curl -s https://ml-service-production.up.railway.app/health
echo.
curl -s https://fpl-decision-helper-production.up.railway.app/health
echo.
echo ========================================
echo.
echo If you see a health check response above, copy that URL!
echo Otherwise, get the URL from your Railway dashboard.
echo.
pause
