from typing import Any, Dict

import pymysql


class DatabaseService:
    """
    Handles connections to a customer's MySQL database.

    IMPORTANT:
    This service retrieves metadata only.
    It never retrieves actual business rows.
    """

    _consents: Dict[str, bool] = {}

    @classmethod
    def record_consent(
        cls,
        database_name: str,
        authorized: bool,
    ) -> bool:
        key = database_name.strip().lower()
        cls._consents[key] = authorized
        return authorized

    @classmethod
    def has_consent(cls, database_name: str) -> bool:
        key = database_name.strip().lower()
        return cls._consents.get(key, False)

    @staticmethod
    def _create_connection(payload: Dict[str, Any]):
        return pymysql.connect(
            host=payload["host"],
            port=payload["port"],
            user=payload["username"],
            password=payload["password"],
            database=payload["database_name"],
            connect_timeout=5,
            read_timeout=5,
            write_timeout=5,
        )

    @classmethod
    def test_connection(cls, payload: Dict[str, Any]) -> bool:
        connection = None

        try:
            connection = cls._create_connection(payload)
            return True

        except Exception:
            return False

        finally:
            if connection:
                connection.close()

    @classmethod
    def fetch_schema(cls, payload: Dict[str, Any]) -> Dict[str, Any]:
        database_name = payload["database_name"]

        if not cls.has_consent(database_name):
            raise PermissionError(
                "Metadata access permission has not been granted."
            )

        connection = None

        try:
            connection = cls._create_connection(payload)

            with connection.cursor() as cursor:

                table_query = """
                    SELECT TABLE_NAME
                    FROM INFORMATION_SCHEMA.TABLES
                    WHERE TABLE_SCHEMA = %s
                    AND TABLE_TYPE = 'BASE TABLE'
                    ORDER BY TABLE_NAME
                """

                cursor.execute(
                    table_query,
                    (database_name,),
                )

                table_rows = cursor.fetchall()

                tables = []

                for table_row in table_rows:
                    table_name = table_row[0]

                    column_query = """
                        SELECT
                            COLUMN_NAME,
                            DATA_TYPE,
                            IS_NULLABLE,
                            COLUMN_KEY
                        FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_SCHEMA = %s
                        AND TABLE_NAME = %s
                        ORDER BY ORDINAL_POSITION
                    """

                    cursor.execute(
                        column_query,
                        (
                            database_name,
                            table_name,
                        ),
                    )

                    column_rows = cursor.fetchall()

                    columns = []

                    for column in column_rows:
                        columns.append(
                            {
                                "name": column[0],
                                "data_type": column[1],
                                "nullable": column[2] == "YES",
                                "is_primary_key": column[3] == "PRI",
                            }
                        )

                    tables.append(
                        {
                            "name": table_name,
                            "columns": columns,
                        }
                    )

                return {
                    "database": database_name,
                    "tables": tables,
                }

        finally:
            if connection:
                connection.close()