import uuid

import psycopg
import pytest

from redsky_ocr.db import migrate
from redsky_ocr.provision import provision


def test_provision_creates_an_isolated_login_and_database(database_url):
    name = f"ocr_{uuid.uuid4().hex[:8]}"
    service_url = psycopg.conninfo.make_conninfo(database_url, user=name, password="synthetic-pass", dbname=name)
    try:
        provision(database_url, service_url)
        provision(database_url, service_url)  # idempotent

        migrate(service_url)
        with psycopg.connect(service_url) as connection:
            assert connection.execute("select count(*) from redsky_ocr.schema_migration").fetchone()[0] >= 1
            superuser = connection.execute("select rolsuper from pg_roles where rolname = current_user").fetchone()[0]
        assert superuser is False
        # The login cannot reach the admin database's tables.
        with pytest.raises(psycopg.Error):
            with psycopg.connect(psycopg.conninfo.make_conninfo(service_url, dbname="postgres")) as connection:
                connection.execute("create table intrusion (id int)")
    finally:
        with psycopg.connect(database_url, autocommit=True) as connection:
            connection.execute(f'drop database if exists "{name}" with (force)')
            connection.execute(f'drop role if exists "{name}"')
