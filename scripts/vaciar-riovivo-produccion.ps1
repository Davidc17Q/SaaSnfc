# Borra las interacciones de Rio Vivo en la base de PRODUCCION, sin tocar sus
# puntos (src/db/vaciar-interacciones.ts). Primero muestra cuantas hay y pide
# confirmacion. Pide la URL publica de Postgres sin mostrarla.
# Donde esta: Railway -> servicio Postgres -> Variables -> DATABASE_PUBLIC_URL.
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
  throw 'Pegaste la plantilla de Railway, no el valor. Copia la URL ya resuelta (con usuario, contrasena y servidor reales).'
}
if ($env:DATABASE_URL.Contains('railway.internal')) {
  Remove-Item Env:DATABASE_URL
  throw 'Esa es la URL interna (DATABASE_URL). Usa DATABASE_PUBLIC_URL: su servidor termina en proxy.rlwy.net.'
}

# El proxy publico de Railway exige SSL. Redis local no hace falta aqui.
$env:DB_SSL = 'true'
$env:REDIS_URL = 'redis://127.0.0.1:1'
try {
  npx tsx src/db/vaciar-interacciones.ts --empresa "r_o vivo" --produccion
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo identificar la empresa; no se borro nada.' }
  $ok = Read-Host 'Escribe BORRAR para eliminar esas interacciones (no se puede deshacer)'
  if ($ok -ceq 'BORRAR') {
    npx tsx src/db/vaciar-interacciones.ts --empresa "r_o vivo" --confirmar --produccion
  } else {
    Write-Host 'Cancelado: no se borro nada.'
  }
} finally {
  Remove-Item Env:DATABASE_URL, Env:DB_SSL, Env:REDIS_URL -ErrorAction SilentlyContinue
}
