# Mueve los puntos de "Pruebas Hogar y Moda" (habladores de muestra) a la sede
# Junín Principal de la demo, en PRODUCCIÓN (src/db/mover-puntos.ts).
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
  npx tsx src/db/mover-puntos.ts --de "pruebas hogar" --a "Hogar y Moda" --sede "PRINCIPAL" --produccion
} finally {
  Remove-Item Env:DATABASE_URL, Env:DB_SSL, Env:REDIS_URL -ErrorAction SilentlyContinue
}
