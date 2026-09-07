; ============================================
; Harmonic - NSIS Installer Include
; Varsayılan kurulum dizini: %LOCALAPPDATA%\Harmonic
; ============================================

!macro customInit
  ; %LOCALAPPDATA% fallback ile güvenli kurulum dizini
  StrCpy $INSTDIR "$LOCALAPPDATA\Harmonic"
!macroend
