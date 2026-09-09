; Harmonic - Professional NSIS Installer
Unicode true

!macro customHeader
  !system "echo Harmonic NSIS custom header loaded"
!macroend

!macro customInit
  StrCpy $INSTDIR "$LOCALAPPDATA\Harmonic"
  SetShellVarContext current
!macroend

!macro customInstall
  CreateShortCut "$SMPROGRAMS\Harmonic.lnk" "$INSTDIR\Harmonic.exe" "" "$INSTDIR\resources\assets\icon.ico"
!macroend

!macro customUnInstall
  ; Sadece gecici profil ve kisayollari sil — kullanici verisi korunur (deleteAppDataOnUninstall:false)
  RMDir /r "$TEMP\harmonic-chrome-profile"
  Delete "$DESKTOP\Harmonic.lnk"
  Delete "$SMPROGRAMS\Harmonic.lnk"
!macroend
