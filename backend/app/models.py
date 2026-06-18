from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel, Column, JSON
import uuid

def uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"

class Project(SQLModel, table=True):
    project_id: str = Field(default_factory=lambda: uid('prj'), primary_key=True)
    name: str
    description: str = ""
    business_domain: str = ""
    migration_wave: str = ""
    owner: str = ""
    status: str = "ACTIVE"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class SystemRegistry(SQLModel, table=True):
    system_id: str = Field(default_factory=lambda: uid('sys'), primary_key=True)
    system_name: str = Field(index=True, unique=True)
    system_type: str = "UNKNOWN"
    vendor: str = ""
    description: str = ""
    icon: str = "database"
    color: str = "#64748b"
    default_namespace_pattern: str = "{namespace}.{name}"
    active_flag: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class Asset(SQLModel, table=True):
    asset_id: str = Field(default_factory=lambda: uid('ast'), primary_key=True)
    project_id: str = Field(index=True)
    system_id: Optional[str] = Field(default=None, index=True)
    system_name: str = Field(index=True)
    environment: str = "UNKNOWN"
    namespace: str = ""
    qualified_name: str = Field(index=True)
    display_name: str
    asset_type: str = "UNKNOWN"
    description: str = ""
    owner: str = ""
    source_location: str = ""
    business_purpose: str = ""
    criticality: str = "MEDIUM"
    lifecycle_status: str = "ACTIVE"
    migration_status: str = "NOT_MIGRATED"
    tags: list = Field(default_factory=list, sa_column=Column(JSON))
    custom_metadata: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_by_source: str = "UNKNOWN"
    first_import_batch_id: Optional[str] = None
    last_import_batch_id: Optional[str] = None
    unresolved_flag: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ColumnCatalog(SQLModel, table=True):
    column_id: str = Field(default_factory=lambda: uid('col'), primary_key=True)
    asset_id: str = Field(index=True)
    column_name: str
    normalized_column_name: str = Field(index=True)
    ordinal_position: Optional[int] = None
    data_type: str = "UNKNOWN"
    normalized_data_type: str = "UNKNOWN"
    length: Optional[int] = None
    precision: Optional[int] = None
    scale: Optional[int] = None
    nullable: bool = True
    primary_key_flag: bool = False
    business_definition: str = ""
    technical_definition: str = ""
    pii_flag: bool = False
    cde_flag: bool = False
    default_value: str = ""
    format: str = ""
    allowed_values: list = Field(default_factory=list, sa_column=Column(JSON))
    custom_metadata: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_by_source: str = "UNKNOWN"
    first_import_batch_id: Optional[str] = None
    last_import_batch_id: Optional[str] = None
    unresolved_flag: bool = False

class Process(SQLModel, table=True):
    process_id: str = Field(default_factory=lambda: uid('prc'), primary_key=True)
    project_id: str = Field(index=True)
    system_id: Optional[str] = None
    system_name: str = "UNKNOWN"
    process_type: str = "UNKNOWN"
    process_name: str
    sequence_number: Optional[int] = None
    source_code_reference: str = ""
    code_snippet: str = ""
    description: str = ""
    confidence_score: float = 1.0
    extraction_method: str = "UNKNOWN"
    review_status: str = "UNREVIEWED"
    reviewer: str = ""
    review_notes: str = ""
    first_import_batch_id: Optional[str] = None
    last_import_batch_id: Optional[str] = None

class LineageEdge(SQLModel, table=True):
    edge_id: str = Field(default_factory=lambda: uid('edg'), primary_key=True)
    project_id: str = Field(index=True)
    source_asset_id: str = Field(index=True)
    source_column_id: Optional[str] = Field(default=None, index=True)
    target_asset_id: str = Field(index=True)
    target_column_id: Optional[str] = Field(default=None, index=True)
    process_id: Optional[str] = Field(default=None, index=True)
    lineage_level: str = "TABLE"
    transformation_type: str = "UNKNOWN"
    transformation_expression: str = ""
    join_condition: str = ""
    filter_condition: str = ""
    group_by_columns: list = Field(default_factory=list, sa_column=Column(JSON))
    order_by_columns: list = Field(default_factory=list, sa_column=Column(JSON))
    business_rule: str = ""
    evidence_code_snippet: str = ""
    evidence_start_line: Optional[int] = None
    evidence_end_line: Optional[int] = None
    confidence_score: float = 1.0
    unresolved_flag: bool = False
    unresolved_reason: str = ""
    review_status: str = "UNREVIEWED"
    created_by_source: str = "UNKNOWN"
    first_import_batch_id: Optional[str] = None
    last_import_batch_id: Optional[str] = None
    manually_edited_after_import: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ImportBatch(SQLModel, table=True):
    import_batch_id: str = Field(default_factory=lambda: uid('imp'), primary_key=True)
    project_id: str = Field(index=True)
    upload_file_name: str
    original_source_file_name: str = ""
    source_file_type: str = "UNKNOWN"
    source_system_name: str = "UNKNOWN"
    parser_name: str = "UNKNOWN"
    parser_version: Optional[str] = None
    schema_version: str = "1.0.0"
    file_hash: str = ""
    uploaded_by: str = "local_user"
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    import_status: str = "UPLOADED"
    validation_summary: dict = Field(default_factory=dict, sa_column=Column(JSON))
    import_summary: dict = Field(default_factory=dict, sa_column=Column(JSON))
    raw_json_storage_path: str = ""
    error_log: list = Field(default_factory=list, sa_column=Column(JSON))
    created_asset_count: int = 0; updated_asset_count: int = 0
    created_column_count: int = 0; updated_column_count: int = 0
    created_process_count: int = 0; updated_process_count: int = 0
    created_edge_count: int = 0; updated_edge_count: int = 0
    unresolved_item_count: int = 0; low_confidence_edge_count: int = 0

class ImportObject(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uid('iobj'), primary_key=True)
    import_batch_id: str = Field(index=True)
    object_type: str
    object_id: str = Field(index=True)
    action_taken: str
    match_strategy: str = ""
    confidence_score: float = 1.0
    notes: str = ""

class LineageEvidence(SQLModel, table=True):
    evidence_id: str = Field(default_factory=lambda: uid('evd'), primary_key=True)
    edge_id: str = Field(index=True)
    import_batch_id: str = Field(index=True)
    source_document_id: str = ""
    source_file_name: str = ""
    code_snippet: str = ""
    start_line: Optional[int] = None
    end_line: Optional[int] = None
    extraction_method: str = "AI_EXTRACTED"
    confidence_score: float = 1.0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Conflict(SQLModel, table=True):
    conflict_id: str = Field(default_factory=lambda: uid('cfl'), primary_key=True)
    project_id: str; import_batch_id: str
    object_type: str; object_id: str
    conflict_type: str
    old_value: dict = Field(default_factory=dict, sa_column=Column(JSON))
    new_value: dict = Field(default_factory=dict, sa_column=Column(JSON))
    explanation: str
    status: str = "OPEN"
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MigrationMapping(SQLModel, table=True):
    mapping_id: str = Field(default_factory=lambda: uid('map'), primary_key=True)
    project_id: str; source_system_id: str; source_asset_id: str
    source_column_id: Optional[str] = None; target_system_id: str; target_asset_id: str
    target_column_id: Optional[str] = None; mapping_type: str = "TABLE_TO_TABLE"
    migration_status: str = "PLANNED"; validation_status: str = "NOT_VALIDATED"
    validation_notes: str = ""; owner: str = ""; last_validated_at: Optional[datetime] = None

class ValidationResult(SQLModel, table=True):
    validation_id: str = Field(default_factory=lambda: uid('val'), primary_key=True)
    project_id: str; mapping_id: str; validation_type: str; result_status: str
    source_value: str = ""; target_value: str = ""; tolerance: str = ""; difference: str = ""; notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AuditRecord(SQLModel, table=True):
    audit_id: str = Field(default_factory=lambda: uid('aud'), primary_key=True)
    object_type: str; object_id: str; action: str
    old_value: dict = Field(default_factory=dict, sa_column=Column(JSON))
    new_value: dict = Field(default_factory=dict, sa_column=Column(JSON))
    user: str = "local_user"; timestamp: datetime = Field(default_factory=datetime.utcnow); source: str = "SYSTEM"

class Checkpoint(SQLModel, table=True):
    checkpoint_id: str = Field(default_factory=lambda: uid('chk'), primary_key=True)
    project_id: str; name: str; created_at: datetime = Field(default_factory=datetime.utcnow)
    snapshot: dict = Field(default_factory=dict, sa_column=Column(JSON))
