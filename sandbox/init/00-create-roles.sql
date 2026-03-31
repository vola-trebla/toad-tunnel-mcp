-- Read-only role for stage/prod environments.
-- default_transaction_read_only = ON means even if the router blocklist
-- is bypassed, the database itself will reject any mutation attempt.
CREATE ROLE toad_reader WITH LOGIN PASSWORD 'toad_secret';
ALTER ROLE toad_reader SET default_transaction_read_only = ON;
