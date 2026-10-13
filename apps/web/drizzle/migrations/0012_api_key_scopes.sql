-- Scoped API keys for CI release publishing (issue #54)
--
-- Strictly additive: one nullable column. Existing keys keep scopes NULL and stay
-- legacy full-account keys. A key with a JSON array of scopes (for example
-- ["releases:publish:@handle"]) works only where a scope grants access and is
-- rejected by every legacy endpoint.
--
-- Rollback (SQLite/D1 support DROP COLUMN since 3.35; take a D1 time-travel bookmark first).
-- Revoke scoped keys before rolling back, or they turn into full-account keys. The last
-- statement removes the wrangler bookkeeping row, so a later `migrations apply` re-applies 0012:
--   UPDATE api_keys SET revoked_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE scopes IS NOT NULL AND revoked_at IS NULL;
--   ALTER TABLE api_keys DROP COLUMN scopes;
--   DELETE FROM d1_migrations WHERE name = '0012_api_key_scopes.sql';

ALTER TABLE `api_keys` ADD `scopes` text;
