#!/bin/sh
# Fixture script (sh): it must never run during publish or read. If it runs, it writes the marker file.
printf 'scripts/tools/tool-03.sh\n' > "${SKILLX_FIXTURE_MARKER:-/dev/null}"
exit 4
