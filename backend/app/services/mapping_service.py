from copy import deepcopy
from typing import Dict, List, Optional

from app.schemas.mapping import SaveTableMappingRequest


class MappingService:
    """Temporary in-memory storage for table mappings."""

    _mappings: Dict[str, dict] = {}

    @staticmethod
    def _normalize(value: str, field_name: str) -> str:
        if not value or not value.strip():
            raise ValueError(f"{field_name} is required.")

        return value.strip().lower()

    @classmethod
    def _build_key(
        cls,
        database_name: str,
        table_name: str,
    ) -> str:
        database = cls._normalize(
            database_name,
            "Database name",
        )

        table = cls._normalize(
            table_name,
            "Table name",
        )

        return f"{database}:{table}"

    @classmethod
    def save_mapping(
        cls,
        request: SaveTableMappingRequest,
        database_name: str,
    ) -> dict:
        key = cls._build_key(
            database_name,
            request.table_name,
        )

        mapping = request.model_dump()

        mapping["database_name"] = cls._normalize(
            database_name,
            "Database name",
        )

        mapping["table_name"] = cls._normalize(
            request.table_name,
            "Table name",
        )

        mapping["column_mappings"] = (
            mapping.get("column_mappings") or []
        )

        mapping["custom_mappings"] = (
            mapping.get("custom_mappings") or []
        )

        cls._mappings[key] = deepcopy(mapping)

        return deepcopy(mapping)

    @classmethod
    def get_mapping(
        cls,
        database_name: str,
        table_name: str,
    ) -> Optional[dict]:
        key = cls._build_key(
            database_name,
            table_name,
        )

        mapping = cls._mappings.get(key)

        if mapping is None:
            return None

        return deepcopy(mapping)

    @classmethod
    def get_all_mappings(
        cls,
        database_name: str,
    ) -> List[dict]:
        database = cls._normalize(
            database_name,
            "Database name",
        )

        prefix = f"{database}:"

        return [
            deepcopy(mapping)
            for key, mapping in cls._mappings.items()
            if key.startswith(prefix)
        ]

    @classmethod
    def delete_mapping(
        cls,
        database_name: str,
        table_name: str,
    ) -> bool:
        key = cls._build_key(
            database_name,
            table_name,
        )

        if key not in cls._mappings:
            return False

        del cls._mappings[key]

        return True