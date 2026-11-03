; Al desinstalar CV Chat (no al actualizar), borrar "Abrir al iniciar Windows" (main.js lo anota con
; el AppUserModelId como nombre; por las dudas tambien el nombre que Electron usa si no hay uno)
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "club.circulovicioso.chat"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "club.circulovicioso.chat"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.CV Chat"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "electron.app.CV Chat"
  ${endIf}
!macroend
