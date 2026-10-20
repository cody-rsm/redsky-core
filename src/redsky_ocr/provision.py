import logging

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo

logger = logging.getLogger(__name__)


def provision(admin_url: str, service_url: str) -> None:
    # Creates the login and database named in service_url, owned by that
    # login, on the server admin_url points at. Safe to run on every start.
    target = conninfo_to_dict(service_url)
    role, password, database = target.get("user"), target.get("password"), target.get("dbname")
    if not role or not password or not database:
        raise SystemExit("REDSKY_OCR_DATABASE_URL must name a user, a password and a database")

    with psycopg.connect(admin_url, autocommit=True) as connection:
        exists = connection.execute("select 1 from pg_roles where rolname = %s", (role,)).fetchone()
        statement = "alter role {} login password {}" if exists else "create role {} login password {}"
        connection.execute(sql.SQL(statement).format(sql.Identifier(role), sql.Literal(password)))
        if connection.execute("select 1 from pg_database where datname = %s", (database,)).fetchone() is None:
            connection.execute(
                sql.SQL("create database {} owner {}").format(sql.Identifier(database), sql.Identifier(role))
            )
            logger.info("created database", extra={"database": database})
        connection.execute(sql.SQL("revoke all on database {} from public").format(sql.Identifier(database)))

    admin_on_target = make_conninfo(admin_url, dbname=database)
    with psycopg.connect(admin_on_target, autocommit=True) as connection:
        connection.execute("revoke create on schema public from public")
