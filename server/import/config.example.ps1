# Copy to config.local.ps1 (gitignored). Restrict its NTFS ACL to the service
# account and administrators. Keep this file and data/ outside the IIS web root.
$env:BENTO_HOST = '127.0.0.1'  # Use 0.0.0.0 for direct LAN access.
$env:BENTO_PORT = '3080'
$env:BENTO_MAX_INPUT_MB = '500'
$env:BENTO_MAX_UNPACKED_MB = '1500'
$env:BENTO_MAX_JOBS = '4'
$env:BENTO_TIMEOUT_SECONDS = '900'
$env:BENTO_RETENTION_MINUTES = '60'
# Required for direct LAN binding; also recommended behind IIS.
# $env:BENTO_TOKEN = 'REPLACE_WITH_A_RANDOM_PASSWORD_AT_LEAST_16_CHARACTERS'
# Enable when the public URL uses HTTPS, including HTTPS terminated at IIS.
# $env:BENTO_SECURE_COOKIES = '1'
# Optional absolute paths (defaults are relative to the repository):
# $env:BENTO_SHELL = 'D:\bento\slides\dist-single\Bento_Slides.bento.html'
# $env:BENTO_DATA_DIR = 'D:\bento-private\import-data'
