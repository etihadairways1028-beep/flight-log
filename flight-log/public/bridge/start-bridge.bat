@echo off
REM Flight Log sim bridge — double-click to start. Requires Python 3.9+ from python.org
cd /d "%~dp0"
python -m pip install --quiet -r requirements.txt
python flightlog_bridge.py %*
pause
