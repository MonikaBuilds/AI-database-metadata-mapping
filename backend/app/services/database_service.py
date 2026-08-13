from typing import Any, Dict

import pymysql

from app.adapters.metadata.mongodb import MongoDBMetadataExtractor


class DatabaseService:
    """
    Handles metadata-only database access.

    Supported databases:
    - MySQL / MariaDB
    - MongoDB

    Actual business records are never queried.
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
    def has_consent(
        cls,
        database_name: str,
    ) -> bool:
        key = database_name.strip().lower()
        return cls._consents.get(key, False)

    @staticmethod
    def _get_db_type(
        payload: Dict[str, Any],
    ) -> str:
        return (
            payload.get("db_type", "mysql")
            .strip()
            .lower()
        )

    @staticmethod
    def _create_mysql_connection(
        payload: Dict[str, Any],
    ):
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

    @staticmethod
    def _create_mongodb_extractor(
        payload: Dict[str, Any],
    ) -> MongoDBMetadataExtractor:
        return MongoDBMetadataExtractor(
            config=payload,
            timeout_seconds=5,
        )

    @classmethod
    def test_connection(
        cls,
        payload: Dict[str, Any],
    ) -> bool:
        db_type = cls._get_db_type(payload)

        if db_type == "mysql":
            return cls._test_mysql_connection(
                payload
            )

        if db_type == "mongodb":
            return cls._test_mongodb_connection(
                payload
            )

        return False

    @classmethod
    def _test_mysql_connection(
        cls,
        payload: Dict[str, Any],
    ) -> bool:
        connection = None

        try:
            connection = (
                cls._create_mysql_connection(
                    payload
                )
            )

            return True

        except Exception:
            return False

        finally:
            if connection:
                connection.close()

    @classmethod
    def _test_mongodb_connection(
        cls,
        payload: Dict[str, Any],
    ) -> bool:
        try:
            extractor = (
                cls._create_mongodb_extractor(
                    payload
                )
            )

            return extractor.test_connection()

        except Exception:
            return False

    @classmethod
    def fetch_schema(
        cls,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        database_name = payload[
            "database_name"
        ]

        if not cls.has_consent(
            database_name
        ):
            raise PermissionError(
                "Metadata access permission has not been granted."
            )

        db_type = cls._get_db_type(payload)

        if db_type == "mysql":
            return cls._fetch_mysql_schema(
                payload
            )

        if db_type == "mongodb":
            return cls._fetch_mongodb_schema(
                payload
            )

        raise ValueError(
            f"Unsupported database type: {db_type}"
        )

    @classmethod
    def _fetch_mysql_schema(
        cls,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        database_name = payload[
            "database_name"
        ]

        connection = None

        try:
            connection = (
                cls._create_mysql_connection(
                    payload
                )
            )

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

                    column_rows = (
                        cursor.fetchall()
                    )

                    columns = []

                    for column in column_rows:
                        columns.append(
                            {
                                "name": column[0],
                                "data_type": column[1],
                                "nullable": (
                                    column[2]
                                    == "YES"
                                ),
                                "is_primary_key": (
                                    column[3]
                                    == "PRI"
                                ),
                            }
                        )

                    tables.append(
                        {
                            "name": table_name,
                            "columns": columns,
                        }
                    )

                return {
                    "db_type": "mysql",
                    "database": database_name,
                    "tables": tables,
                    "relationships": [],
                }

        finally:
            if connection:
                connection.close()

    @classmethod
    def _fetch_mongodb_schema(
        cls,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        database_name = payload[
            "database_name"
        ]

        extractor = (
            cls._create_mongodb_extractor(
                payload
            )
        )

        if not extractor.test_connection():
            raise ConnectionError(
                "Unable to connect to MongoDB."
            )

        collection_names = (
            extractor.get_tables()
        )

        tables = []

        for collection_name in collection_names:
            columns = extractor.get_columns(
                collection_name
            )

            indexes = extractor.get_indexes(
                collection_name
            )

            tables.append(
                {
                    "name": collection_name,
                    "columns": columns,
                    "indexes": indexes,
                }
            )

        return {
            "db_type": "mongodb",
            "database": database_name,
            "tables": tables,
            "relationships": (
                extractor.get_relationships()
            ),
        }