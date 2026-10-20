-- docker-compose.dev.yml only: a fixed password for a throwaway database.
\set ocr_password 'redsky_ocr_local'
\i /redsky-ocr/create-database.sql
