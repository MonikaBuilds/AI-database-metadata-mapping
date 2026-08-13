from typing import List, Optional

from pydantic import BaseModel, Field


class ColumnMapping(BaseModel):
    column_name: str = Field(..., min_length=1)
    business_name: str = ""
    description: Optional[str] = None


class CustomMapping(BaseModel):
    business_name: str = Field(..., min_length=1)
    column_name: str = Field(..., min_length=1)
    description: Optional[str] = None


class SaveTableMappingRequest(BaseModel):
    table_name: str = Field(..., min_length=1)

    business_entity: str = Field(
        ...,
        min_length=1,
        description="Business-friendly name for the table",
    )

    business_description: Optional[str] = None

    primary_identifier: Optional[str] = None
    date_field: Optional[str] = None
    amount_field: Optional[str] = None
    status_field: Optional[str] = None

    column_mappings: List[ColumnMapping] = Field(
        default_factory=list
    )

    custom_mappings: List[CustomMapping] = Field(
        default_factory=list
    )

    custom_prompt: Optional[str] = None


class SaveTableMappingResponse(BaseModel):
    success: bool
    message: str


class TableMappingResponse(BaseModel):
    database_name: str
    table_name: str

    business_entity: str
    business_description: Optional[str] = None

    primary_identifier: Optional[str] = None
    date_field: Optional[str] = None
    amount_field: Optional[str] = None
    status_field: Optional[str] = None

    column_mappings: List[ColumnMapping] = Field(
        default_factory=list
    )

    custom_mappings: List[CustomMapping] = Field(
        default_factory=list
    )

    custom_prompt: Optional[str] = None