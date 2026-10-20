import logging
from importlib import resources

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

logger = logging.getLogger(__name__)

SCHEMA = "redsky_ocr"
# Any constant works; it only has to be the same in every process.
MIGRATION_LOCK_KEY = 7_311_852_004


def create_pool(database_url: str, max_size: int = 10) -> ConnectionPool:
    return ConnectionPool(
        database_url,
        min_size=1,
        max_size=max_size,
        kwargs={"row_factory": dict_row, "autocommit": False},
        open=True,
    )


def migrate(database_url: str) -> list[str]:
    applied: list[str] = []
    with psycopg.connect(database_url, autocommit=True) as connection:
        connection.execute("select pg_advisory_lock(%s)", (MIGRATION_LOCK_KEY,))
        try:
            connection.execute(f"create schema if not exists {SCHEMA}")
            connection.execute(
                f"create table if not exists {SCHEMA}.schema_migration ("
                " name text primary key,"
                " applied_at timestamptz not null default now())"
            )
            done = {
                row[0]
                for row in connection.execute(f"select name from {SCHEMA}.schema_migration")
            }
            migrations = sorted(
                (
                    entry
                    for entry in resources.files("redsky_ocr.migrations").iterdir()
                    if entry.name.endswith(".sql")
                ),
                key=lambda entry: entry.name,
            )
            for migration in migrations:
                if migration.name in done:
                    continue
                with connection.transaction():
                    connection.execute(migration.read_text())
                    connection.execute(
                        f"insert into {SCHEMA}.schema_migration (name) values (%s)",
                        (migration.name,),
                    )
                applied.append(migration.name)
                logger.info("applied migration", extra={"migration": migration.name})
        finally:
            connection.execute("select pg_advisory_unlock(%s)", (MIGRATION_LOCK_KEY,))
    return applied
