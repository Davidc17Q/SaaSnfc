# Respaldo completo de la base de PRODUCCIÓN + tabla de redirecciones.
#
# Deja dos archivos en la carpeta respaldos\ (fuera de git):
#   nfcloud-AAAA-MM-DD_HHmm.dump          copia completa (formato de pg_restore)
#   redirecciones-AAAA-MM-DD_HHmm.csv     tarjeta -> destino, para Cloudflare
#                                         (documentos/CONTINGENCIA-SERVIDOR.md)
#
# Uso:  scripts\respaldo-produccion.ps1
# Pide la URL pública de Postgres sin mostrarla ni guardarla.
# Dónde está: Railway -> servicio Postgres -> Variables -> DATABASE_PUBLIC_URL.
# Necesita Docker Desktop abierto (usa pg_dump desde una imagen de Postgres).
#
# -Imagen: si pg_dump avisa "server version mismatch", usa la versión del
#          servidor, por ejemplo -Imagen postgres:18-alpine.
# -Url:    solo para pruebas contra la base local (no pide nada).
param(
  [string]$Imagen = 'postgres:17-alpine',
  [string]$Url
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

if ($Url) {
  $env:NFC_BACKUP_URL = $Url
  $ssl = 'prefer'
} else {
  $sec = Read-Host 'Pega DATABASE_PUBLIC_URL de Railway y presiona Enter' -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try {
    $env:NFC_BACKUP_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
  $ssl = 'require'
}
try {
  if (-not $env:NFC_BACKUP_URL.StartsWith('postgres')) {
    throw 'Eso no parece una URL de Postgres (debe empezar por postgresql://).'
  }
  if ($env:NFC_BACKUP_URL.Contains('${{')) {
    throw 'Pegaste la plantilla de Railway, no el valor. Copia la URL ya resuelta.'
  }
  if ($env:NFC_BACKUP_URL.Contains('railway.internal')) {
    throw 'Esa es la URL interna (DATABASE_URL). Usa DATABASE_PUBLIC_URL: su servidor termina en proxy.rlwy.net.'
  }

  $dir = Join-Path (Get-Location) 'respaldos'
  New-Item -ItemType Directory -Force $dir | Out-Null
  $stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
  $dump = "nfcloud-$stamp.dump"
  $csv = "redirecciones-$stamp.csv"

  # Una fila por punto activo: por código corto y por identificador largo.
  $sql = "SELECT 'nfcloudco.com/r/' || d.code AS origen, d.target_url AS destino, 302 AS estado FROM devices d WHERE d.status = 'active' AND d.code IS NOT NULL UNION ALL SELECT 'nfcloudco.com/r/' || d.id::text, d.target_url, 302 FROM devices d WHERE d.status = 'active' ORDER BY 1"

  # La consulta va en un archivo (sin problemas de comillas) y la URL viaja como
  # variable de entorno al contenedor (no queda en la línea de comandos).
  $sqlFile = Join-Path $dir '_redirecciones.sql'
  [IO.File]::WriteAllText($sqlFile, $sql)
  try {
    docker run --rm -e NFC_BACKUP_URL -e PGSSLMODE=$ssl -v "${dir}:/out" $Imagen sh -c "pg_dump --dbname=`"`$NFC_BACKUP_URL`" --format=custom --no-owner --no-privileges --file=/out/$dump && psql `"`$NFC_BACKUP_URL`" -v ON_ERROR_STOP=1 --csv -f /out/_redirecciones.sql -o /out/$csv"
    if ($LASTEXITCODE -ne 0) { throw "El respaldo falló (código $LASTEXITCODE). Revisa el mensaje de arriba." }
  } finally {
    Remove-Item $sqlFile -ErrorAction SilentlyContinue
  }

  $d = Get-Item (Join-Path $dir $dump)
  $c = Get-Item (Join-Path $dir $csv)
  if ($d.Length -lt 1000) { throw 'El archivo de respaldo quedó vacío.' }
  $puntos = (Get-Content $c.FullName | Measure-Object -Line).Lines - 1
  if ($puntos -lt 0) { throw 'No se pudo exportar la tabla de redirecciones.' }
  Write-Host ''
  Write-Host "Respaldo listo en $dir"
  Write-Host ("  {0}  ({1:N1} MB)" -f $dump, ($d.Length / 1MB))
  Write-Host "  $csv  ($puntos redirecciones)"
  Write-Host ''
  Write-Host 'Copia los dos archivos fuera de este equipo (Drive, disco externo).'
  Write-Host 'Contienen datos de clientes: no los subas a git ni los compartas.'
} finally {
  Remove-Item Env:NFC_BACKUP_URL -ErrorAction SilentlyContinue
}
