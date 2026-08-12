from typing import List, Optional

from pydantic import BaseModel, Field


class ColumnMapping(BaseModel):
    column_name: str
    business_name: str
    description: Optional[str] = None


class SaveTableMappingRequest(BaseModel):
    table_name: str

    business_entity: str = Field(
        ...,
        min_length=1,
        description="Business-friendly name for the table",
    )

    table_description: Optional[str] = None

    primary_identifier: Optional[str] = None
    date_field: Optional[str] = None
    amount_field: Optional[str] = None
    status_field: Optional[str] = None

    custom_prompt: Optional[str] = None

    columns: List[ColumnMapping] = []


class SaveTableMappingResponse(BaseModel):
    success: bool
    message: str


class TableMappingResponse(BaseModel):
    table_name: str
    business_entity: str
    table_description: Optional[str] = None

    primary_identifier: Optional[str] = None
    date_field: Optional[str] = None
    amount_field: Optional[str] = None
    status_field: Optional[str] = None

    custom_prompt: Optional[str] = None

    columns: List[ColumnMapping]