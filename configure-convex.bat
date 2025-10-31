@echo off
echo ========================================
echo Convex Configuration
echo ========================================
echo.
echo IMPORTANT: Replace YOUR_ML_SERVICE_URL below with the URL from Railway
echo Example: https://fpl-ml-service.railway.app
echo.
set /p ML_URL="Enter your ML service URL: "

cd /d "c:\Users\arshadhakim\OneDrive\Desktop\FPL eo helper"

echo.
echo Setting ML_SERVICE_URL in Convex...
npx convex env set ML_SERVICE_URL %ML_URL%

echo.
echo ========================================
echo CONFIGURATION COMPLETE!
echo ========================================
echo.
echo ML service is now connected to your app.
echo Go test it at: https://fpl-decision-helper.vercel.app/admin
echo.
pause
