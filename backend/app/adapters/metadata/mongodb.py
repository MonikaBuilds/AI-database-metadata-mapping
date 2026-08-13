from typing import Any, Dict, List

from pymongo import MongoClient
from pymongo.errors import PyMongoError


class MongoDBMetadataExtractor:
    def __init__(
        self,
        config: Dict[str, Any],
        timeout_seconds: int = 5,
    ):
        self.config = config
        self.timeout_ms = timeout_seconds * 1000

    def _create_client(self) -> MongoClient:
        options = {
            "host": self.config["host"],
            "port": self.config["port"],
            "serverSelectionTimeoutMS": self.timeout_ms,
            "connectTimeoutMS": self.timeout_ms,
        }

        username = self.config.get("username")
        password = self.config.get("password")

        if username:
            options["username"] = username

        if password:
            options["password"] = password

        return MongoClient(**options)

    def test_connection(self) -> bool:
        client = None

        try:
            client = self._create_client()

            client.admin.command("ping")

            return True

        except PyMongoError:
            return False

        finally:
            if client is not None:
                client.close()

    def get_tables(self) -> List[str]:
        client = self._create_client()

        try:
            database = client[
                self.config["database_name"]
            ]

            return sorted(
                database.list_collection_names()
            )

        finally:
            client.close()

    def get_columns(
        self,
        collection_name: str,
    ) -> List[dict]:
        """
        Read MongoDB schema metadata from the collection
        validator only.

        No collection documents are read.

        If the collection does not define a $jsonSchema
        validator, an empty list is returned.
        """

        client = self._create_client()

        try:
            database = client[
                self.config["database_name"]
            ]

            collection = database[
                collection_name
            ]

            options = collection.options()

            validator = options.get(
                "validator",
                {},
            )

            json_schema = validator.get(
                "$jsonSchema",
                {},
            )

            if not json_schema:
                return []

            properties = json_schema.get(
                "properties",
                {},
            )

            required_fields = set(
                json_schema.get(
                    "required",
                    [],
                )
            )

            fields = []

            for field_name, field_schema in properties.items():
                bson_type = field_schema.get(
                    "bsonType",
                    "unknown",
                )

                if isinstance(
                    bson_type,
                    list,
                ):
                    data_type = " | ".join(
                        str(item)
                        for item in bson_type
                    )
                else:
                    data_type = str(
                        bson_type
                    )

                fields.append(
                    {
                        "name": field_name,
                        "data_type": data_type,
                        "nullable": (
                            field_name
                            not in required_fields
                        ),
                        "is_primary_key": (
                            field_name == "_id"
                        ),
                        "is_foreign_key": False,
                        "referenced_table": None,
                        "referenced_column": None,
                    }
                )

            return fields

        finally:
            client.close()

    def get_relationships(
        self,
    ) -> List[dict]:
        """
        MongoDB does not expose SQL-style
        foreign-key relationship metadata.
        """

        return []

    def get_indexes(
        self,
        collection_name: str,
    ) -> List[dict]:
        client = self._create_client()

        try:
            collection = client[
                self.config["database_name"]
            ][collection_name]

            indexes = []

            for index in collection.list_indexes():
                indexes.append(
                    {
                        "name": index.get(
                            "name"
                        ),

                        "keys": list(
                            index.get(
                                "key",
                                {},
                            ).items()
                        ),

                        "unique": index.get(
                            "unique",
                            False,
                        ),
                    }
                )

            return indexes

        finally:
            client.close()