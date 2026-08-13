from fastapi import APIRouter, HTTPException, Query

from app.schemas.database import (
    ConsentRequest,
    DatabaseConnectionRequest,
)

from app.schemas.mapping import SaveTableMappingRequest

from app.services.database_service import DatabaseService
from app.services.mapping_service import MappingService


# ============================================================
# ROUTER
# ============================================================

router = APIRouter(
    prefix="/databases",
    tags=["Databases"],
)


# ============================================================
# TEST DATABASE CONNECTION
# ============================================================

@router.post("/test-connection")
def test_connection(
    request: DatabaseConnectionRequest,
):
    """
    Test whether the supplied database credentials
    can successfully connect to the target database.

    This endpoint only verifies connectivity.
    It does not fetch business rows.
    """

    payload = request.model_dump()

    try:
        success = DatabaseService.test_connection(
            payload
        )

        if not success:
            raise HTTPException(
                status_code=400,
                detail="Unable to connect to database",
            )

        return {
            "success": True,
            "message": "Database connection successful",
        }

    except HTTPException:
        raise

    except Exception as exc:
        print(
            "Database connection error:",
            exc,
        )

        raise HTTPException(
            status_code=500,
            detail="Database connection test failed",
        )


# ============================================================
# METADATA CONSENT
# ============================================================

@router.post("/consent")
def record_consent(
    request: ConsentRequest,
):
    """
    Record whether the user has granted permission
    for schema/metadata inspection.
    """

    try:
        DatabaseService.record_consent(
            database_name=request.database_name,
            authorized=request.authorized,
        )

        return {
            "success": True,
            "database_name":
                request.database_name,
            "authorized":
                request.authorized,
        }

    except Exception as exc:
        print(
            "Consent error:",
            exc,
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to record metadata consent",
        )


# ============================================================
# FETCH DATABASE SCHEMA
# ============================================================

@router.post("/schema")
def fetch_schema(
    request: DatabaseConnectionRequest,
):
    """
    Fetch structural database metadata.

    Expected metadata includes:
    - database name
    - tables
    - columns
    - data types
    - primary keys
    - foreign keys
    - relationships

    No actual table records should be queried.
    """

    payload = request.model_dump()

    try:
        metadata = DatabaseService.fetch_schema(
            payload
        )

        return {
            "success": True,
            "metadata": metadata,
        }

    except PermissionError as exc:
        raise HTTPException(
            status_code=403,
            detail=str(exc),
        )

    except Exception as exc:
        print(
            "Schema fetch error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to fetch database metadata",
        )


# ============================================================
# SAVE TABLE MAPPING
# ============================================================

@router.post("/mappings")
def save_table_mapping(
    request: SaveTableMappingRequest,
    database_name: str = Query(
        ...,
        description="Database containing the mapped table",
    ),
):
    """
    Save business meaning, column mappings,
    and AI instructions for a database table.
    """

    try:
        mapping = MappingService.save_mapping(
            request=request,
            database_name=database_name,
        )

        return {
            "success": True,
            "message":
                "Table mapping saved successfully",
            "data": mapping,
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )

    except Exception as exc:
        print(
            "Save mapping error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to save table mapping",
        )


# ============================================================
# GET ALL TABLE MAPPINGS
# ============================================================

@router.get("/mappings")
def get_all_mappings(
    database_name: str = Query(
        ...,
        description="Database whose mappings should be returned",
    ),
):
    """
    Return all saved mappings belonging
    to one database.
    """

    try:
        mappings = MappingService.get_all_mappings(
            database_name=database_name,
        )

        return {
            "success": True,
            "database_name": database_name,
            "mappings": mappings,
        }

    except Exception as exc:
        print(
            "Get all mappings error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve mappings",
        )


# ============================================================
# GET ONE TABLE MAPPING
# ============================================================

@router.get("/mappings/{table_name}")
def get_table_mapping(
    table_name: str,
    database_name: str = Query(
        ...,
        description="Database containing the table",
    ),
):
    """
    Return the saved business mapping
    for a specific table.
    """

    try:
        mapping = MappingService.get_mapping(
            database_name=database_name,
            table_name=table_name,
        )

        if not mapping:
            raise HTTPException(
                status_code=404,
                detail="Mapping not found",
            )

        return {
            "success": True,
            "data": mapping,
        }

    except HTTPException:
        raise

    except Exception as exc:
        print(
            "Get table mapping error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve table mapping",
        )


# ============================================================
# DELETE TABLE MAPPING
# ============================================================

@router.delete("/mappings/{table_name}")
def delete_table_mapping(
    table_name: str,
    database_name: str = Query(
        ...,
        description="Database containing the table",
    ),
):
    """
    Delete the saved mapping for one table.
    """

    try:
        deleted = MappingService.delete_mapping(
            database_name=database_name,
            table_name=table_name,
        )

        if not deleted:
            raise HTTPException(
                status_code=404,
                detail="Mapping not found",
            )

        return {
            "success": True,
            "message":
                f'Mapping for "{table_name}" deleted successfully',
        }

    except HTTPException:
        raise

    except Exception as exc:
        print(
            "Delete mapping error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to delete table mapping",
        )