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
if ($env:DATABASE_URL.Contains('${{')) {
  Remove-Item Env:DATABASE_URL
  throw 'Pegaste la plantilla de Railway, no el valor. Copia la URL ya resuelta (con usuario, contraseña y servidor reales).'
}
if ($env:DATABASE_URL.Contains('railway.internal')) {
  Remove-Item Env:DATABASE_URL
  throw 'Esa es la URL interna (DATABASE_URL). Usa DATABASE_PUBLIC_URL: su servidor termina en proxy.rlwy.net.'
}

# El proxy público de Railway exige SSL. Redis local no hace falta aquí.
$env:DB_SSL = 'true'
$env:REDIS_URL = 'redis://127.0.0.1:1'
try {
  npm run demo -- --confirmar --produccion
} finally {
  Remove-Item Env:DATABASE_URL, Env:DB_SSL, Env:REDIS_URL -ErrorAction SilentlyContinue
}
