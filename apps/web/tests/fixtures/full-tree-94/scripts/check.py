#!/usr/bin/env python3
# Fixture script (python): it must never run during publish or read. If it runs, it writes the marker file.
import os
marker = os.environ.get("SKILLX_FIXTURE_MARKER")
if marker:
    open(marker, "w").write("scripts/check.py\n")
