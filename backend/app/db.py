from sqlmodel import SQLModel, create_engine, Session, select
from .models import *
import os, json, pathlib
DB_URL=os.getenv('DATABASE_URL','sqlite:///./lineage.db')
engine=create_engine(DB_URL, connect_args={'check_same_thread':False} if DB_URL.startswith('sqlite') else {})
def init_db(): SQLModel.metadata.create_all(engine)
def get_session():
    with Session(engine) as s: yield s

def seed(session:Session):
    if session.exec(select(Project)).first(): return
    p=Project(name='Claims Analytics Modernization', description='Generalized migration lineage workspace', business_domain='Claims', migration_wave='Wave 1', owner='Data Modernization Team'); session.add(p)
    systems=[('SAS','LEGACY_ANALYTICS','SAS','#2563eb'),('Snowflake','CLOUD_WAREHOUSE','Snowflake','#06b6d4'),('Excel','FILE_SYSTEM','Microsoft','#16a34a'),('Power BI','BI_TOOL','Microsoft','#f59e0b'),('Databricks','LAKEHOUSE','Databricks','#ef4444'),('Oracle','DATABASE','Oracle','#dc2626'),('SQL Server','DATABASE','Microsoft','#7c3aed'),('CSV','FILE_SYSTEM','Generic','#64748b'),('Manual','MANUAL','Internal','#0f172a')]
    for name,typ,vendor,color in systems: session.add(SystemRegistry(system_name=name,system_type=typ,vendor=vendor,color=color))
    session.commit(); session.refresh(p)
    from .importer import import_package
    for fn in ['claims_transform_sas_lineage.json','claims_transform_snowflake_lineage.json']:
        pkg=json.loads((pathlib.Path(__file__).parents[2]/'data'/'samples'/fn).read_text())
        import_package(session,p.project_id,pkg,fn,'seed')
    # dashboard asset and edge from Snowflake mart
    power=session.exec(select(SystemRegistry).where(SystemRegistry.system_name=='Power BI')).first()
    mart=session.exec(select(Asset).where(Asset.project_id==p.project_id, Asset.system_name=='Snowflake', Asset.qualified_name=='MART.CLAIMS_SUMMARY')).first()
    dash=Asset(project_id=p.project_id,system_id=power.system_id,system_name='Power BI',environment='PROD',namespace='Claims',qualified_name='Claims Executive Dashboard',display_name='Claims Executive Dashboard',asset_type='DASHBOARD',created_by_source='SYSTEM_SEED')
    session.add(dash); session.commit(); session.refresh(dash)
    session.add(LineageEdge(project_id=p.project_id,source_asset_id=mart.asset_id,target_asset_id=dash.asset_id,lineage_level='TABLE',transformation_type='DIRECT_COPY',transformation_expression='Power BI refresh from MART.CLAIMS_SUMMARY',created_by_source='SYSTEM_SEED',review_status='APPROVED'))
    session.commit()
