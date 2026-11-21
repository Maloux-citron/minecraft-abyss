@echo off
rem ============================================================
rem  Abysse - lance le fond d'ecran en plein ecran
rem  (sans Wallpaper Engine). Quitte avec Alt+F4 ou Echap.
rem ============================================================
setlocal
set "PAGE=%~dp0index.html"
set "URL=file:///%PAGE:\=/%"

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if exist "%EDGE%" (
  start "" "%EDGE%" --kiosk "%URL%" --edge-kiosk-type=fullscreen --allow-file-access-from-files --user-data-dir="%TEMP%\mcabyss-profile"
  goto :eof
)
if exist "%CHROME%" (
  start "" "%CHROME%" --kiosk "%URL%" --allow-file-access-from-files --user-data-dir="%TEMP%\mcabyss-profile"
  goto :eof
)
start "" "%PAGE%"
