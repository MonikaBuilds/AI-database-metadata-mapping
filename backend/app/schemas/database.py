from pydantic import BaseModel, Field, field_validator


class DatabaseConnectionRequest(BaseModel):
    db_type: str = "mysql"
    host: str
    port: int = Field(default=3306)
    database_name: str
    username: str
    password: str

    @field_validator("host", "database_name", "username", "password")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Field cannot be empty")
        return value.strip()

    @field_validator("port")
    @classmethod
    def validate_port(cls, value: int) -> int:
        if not 1 <= value <= 65535:
            raise ValueError("Port must be between 1 and 65535")
        return value


class ConsentRequest(BaseModel):
    database_name: str
    authorized: bool