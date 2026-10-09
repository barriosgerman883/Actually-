@SETLOCAL
@IF EXIST "%~dp0\node.exe" (
  "%~dp0\node.exe"  "%~dp0\..\global\v11\a2a1f1211273b5268cd42562523a0ae1a7df6e32629e15d2d8088e46fe876b0c\node_modules\semver\bin\semver.js" %*
) ELSE (
  @SET PATHEXT=%PATHEXT:;.JS;=;%
  node  "%~dp0\..\global\v11\a2a1f1211273b5268cd42562523a0ae1a7df6e32629e15d2d8088e46fe876b0c\node_modules\semver\bin\semver.js" %*
)
