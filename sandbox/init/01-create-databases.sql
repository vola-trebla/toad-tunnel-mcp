-- Create all 4 environment databases
CREATE DATABASE sandbox_dev;
CREATE DATABASE sandbox_stage;
CREATE DATABASE sandbox_prod;
CREATE DATABASE sandbox_dev2;

-- Grant toad_reader connect access to read-only environments
GRANT CONNECT ON DATABASE sandbox_stage TO toad_reader;
GRANT CONNECT ON DATABASE sandbox_prod TO toad_reader;
