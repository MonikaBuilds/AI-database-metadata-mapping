from typing import Dict, List, Optional

from app.schemas.mapping import SaveTableMappingRequest


class MappingService:
    """
    Temporary in-memory mapping store.

    This is suitable for Day 2 development/testing only.
    Later this should be replaced with PostgreSQL persistence.
    """

    _mappings: Dict[str, dict] = {}

    @classmethod
    def save_mapping(
        cls,
        mapping: SaveTableMappingRequest,
    ) -> dict:

        key = mapping.table_name.strip().lower()

        payload = mapping.model_dump()

        cls._mappings[key] = payload

        return payload

    @classmethod
    def get_mapping(
        cls,
        table_name: str,
    ) -> Optional[dict]:

        key = table_name.strip().lower()

        return cls._mappings.get(key)

    @classmethod
    def get_all_mappings(cls) -> List[dict]:
        return list(cls._mappings.values())

    @classmethod
    def delete_mapping(
        cls,
        table_name: str,
    ) -> bool:

        key = table_name.strip().lower()

        if key not in cls._mappings:
            return False

        del cls._mappings[key]

        return True