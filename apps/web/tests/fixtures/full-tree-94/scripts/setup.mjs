// Fixture script (node): it must never run during publish or read. If it runs, it writes the marker file.
import { writeFileSync } from "node:fs";
globalThis.__skillxFullTreeFixtureExecuted = "scripts/setup.mjs";
if (process.env.SKILLX_FIXTURE_MARKER) writeFileSync(process.env.SKILLX_FIXTURE_MARKER, "scripts/setup.mjs\n");
