@echo off
rem Double-clic : lance l'interface web de Trajectoire et l'ouvre dans le navigateur.
rem Fermer cette fenetre arrete le serveur.
cd /d "%~dp0"
if not exist ".venv\Scripts\trajectoire-web.exe" (
  echo L'environnement n'est pas installe. Dans ce dossier, lance :
  echo    python -m venv .venv
  echo    .venv\Scripts\pip install -e .
  pause
  exit /b 1
)
echo Trajectoire demarre sur http://127.0.0.1:8765  (ferme cette fenetre pour arreter)
".venv\Scripts\trajectoire-web.exe"
pause
