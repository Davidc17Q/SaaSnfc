# Genera los datos de demostración de Hogar y Moda en la base de PRODUCCIÓN.
# Pide la URL pública de Postgres sin mostrarla ni guardarla en el historial.
# Dónde está: Railway -> servicio Postgres -> Variables -> DATABASE_PUBLIC_URL.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

$sec = Read-Host 'Pega DATABASE_PUBLIC_URL de Railway y presiona Enter' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try {
  $env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
if (-not $env:DATABASE_URL.StartsWith('postgres')) {
  Remove-Item Env:DATABASE_URL
  throw 'Eso no parece una URL de Postgres (debe empezar por postgresql://).'
}

try {
  npm run demo -- --confirmar --produccion
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}
