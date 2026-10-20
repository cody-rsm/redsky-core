-- A database and login of its own for redsky-ocr on the existing Postgres:
-- it cannot read Twenty's data, and Twenty's tooling never touches it.
--
-- Run once as the Postgres superuser, with a fresh password:
--   psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v ocr_password="$(openssl rand -hex 24)" -f scripts/create-database.sql

\if :{?ocr_password}
\else
  \echo 'Pass the new role password with -v ocr_password=...'
  \quit
\endif

create role redsky_ocr login password :'ocr_password';
create database redsky_ocr owner redsky_ocr;
revoke all on database redsky_ocr from public;

\connect redsky_ocr
revoke create on schema public from public;
