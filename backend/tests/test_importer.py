import json, pathlib, pytest
from sqlmodel import SQLModel, create_engine, Session
from app.models import *
from app.importer import validate_package, import_package, match_asset

def session():
    e=create_engine('sqlite:///:memory:'); SQLModel.metadata.create_all(e); return Session(e)
def pkg(): return json.loads((pathlib.Path(__file__).parents[2]/'data/samples/claims_transform_sas_lineage.json').read_text())
def test_json_validation_accepts_sample(): assert validate_package(pkg()) == []
def test_json_validation_rejects_bad_version():
    p=pkg(); p['schema_version']='9'; assert validate_package(p)
def test_asset_matching_exact_and_normalized():
    s=session(); pr=Project(name='P'); s.add(pr); s.commit(); s.refresh(pr)
    a=Asset(project_id=pr.project_id,system_name='SAS',environment='PROD',namespace='RAW',qualified_name='RAW.CLAIMS',display_name='CLAIMS',asset_type='TABLE'); s.add(a); s.commit()
    found,strategy=match_asset(s,pr.project_id,{'system_name':'SAS','environment':'PROD','namespace':'RAW','qualified_name':'RAW.CLAIMS','asset_type':'TABLE'}); assert found.asset_id==a.asset_id and strategy=='EXACT_CANONICAL_IDENTITY'
    found,strategy=match_asset(s,pr.project_id,{'system_name':'SAS','environment':'PROD','namespace':'X','qualified_name':'raw.claims','asset_type':'TABLE'}); assert found.asset_id==a.asset_id and strategy=='NORMALIZED_QUALIFIED_NAME'
def test_import_merge_provenance_and_edge_deduplication():
    s=session(); pr=Project(name='P'); s.add(pr); s.add(SystemRegistry(system_name='SAS')); s.commit(); s.refresh(pr)
    b1=import_package(s,pr.project_id,pkg(),'one.json'); b2=import_package(s,pr.project_id,pkg(),'two.json')
    assert b1.created_edge_count > 0 and b2.created_edge_count == 0 and b2.updated_edge_count == b1.created_edge_count
    assert len(s.exec(select(ImportObject).where(ImportObject.import_batch_id==b1.import_batch_id, ImportObject.object_type=='EDGE')).all()) == b1.created_edge_count
    assert len(s.exec(select(LineageEvidence)).all()) == b1.created_edge_count + b2.updated_edge_count
