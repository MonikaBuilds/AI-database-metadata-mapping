from app.schemas.mapping import SaveTableMappingRequest
from app.services.mapping_service import MappingService
from fastapi import APIRouter, HTTPException

from app.schemas.database import (
    ConsentRequest,
    DatabaseConnectionRequest,
)

from app.services.database_service import DatabaseService


router = APIRouter(
    prefix="/databases",
    tags=["Databases"],
)


@router.post("/test-connection")
def test_connection(request: DatabaseConnectionRequest):
    payload = request.model_dump()

    success = DatabaseService.test_connection(payload)

    if not success:
        raise HTTPException(
            status_code=400,
            detail="Unable to connect to database",
        )

    return {
        "success": True,
        "message": "Database connection successful",
    }


@router.post("/consent")
def record_consent(request: ConsentRequest):
    DatabaseService.record_consent(
        database_name=request.database_name,
        authorized=request.authorized,
    )

    return {
        "success": True,
        "authorized": request.authorized,
    }


@router.post("/schema")
def fetch_schema(request: DatabaseConnectionRequest):
    payload = request.model_dump()

    try:
        metadata = DatabaseService.fetch_schema(payload)

        return {
            "success": True,
            "metadata": metadata,
        }

    except PermissionError as exc:
        raise HTTPException(
            status_code=403,
            detail=str(exc),
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to fetch database metadata",
        )
        
@router.post("/mappings")
def save_table_mapping(
    request: SaveTableMappingRequest,
):
    mapping = MappingService.save_mapping(request)

    return {
        "success": True,
        "message": "Table mapping saved successfully",
        "mapping": mapping,
    }


@router.get("/mappings")
def get_all_mappings():
    return {
        "success": True,
        "mappings": MappingService.get_all_mappings(),
    }


@router.get("/mappings/{table_name}")
def get_table_mapping(table_name: str):
    mapping = MappingService.get_mapping(table_name)

    if not mapping:
        raise HTTPException(
            status_code=404,
            detail="Mapping not found",
        )

    return {
        "success": True,
        "mapping": mapping,
    }


@router.delete("/mappings/{table_name}")
def delete_table_mapping(table_name: str):
    deleted = MappingService.delete_mapping(table_name)

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Mapping not found",
        )

    return {
        "success": True,
        "message": "Mapping deleted successfully",
    }