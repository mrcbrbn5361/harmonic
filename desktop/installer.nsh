; Harmonic - NSIS Installer Include
; Lisans butonları electron-builder'ın Turkish.nlf çevirisini kullanır — custom LicenseText kaldırıldı
!macro customInit
  StrCpy $INSTDIR "$LOCALAPPDATA\Harmonic"
  SetShellVarContext current
!macroend
!macro customInstall
  CreateShortCut "$SMPROGRAMS\Harmonic.lnk" "$INSTDIR\Harmonic.exe" "" "$INSTDIR\resources\assets\icon.ico"
!macroend
!macro customUnInstall
  RMDir /r "$APPDATA\Harmonic"
  RMDir /r "$TEMP\harmonic-chrome-profile"
  Delete "$INSTDIR\Uninstall Harmonic.exe"
  RMDir "$INSTDIR"
  Delete "$DESKTOP\Harmonic.lnk"
  Delete "$SMPROGRAMS\Harmonic.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Harmonic"
!macroend
