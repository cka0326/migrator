from fastapi import FastAPI, Depends, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
import json, pandas as pd, io
from .db import init_db, get_session, seed
from .models import *
from .importer import validate_package, import_package
app=FastAPI(title='Standalone Lineage Migrator', version='0.1.0')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])
@app.on_event('startup')
def boot():
    init_db()
    with next(get_session()) as s: seed(s)
@app.get('/api/projects')
def projects(s:Session=Depends(get_session)): return s.exec(select(Project)).all()
@app.get('/api/systems')
def systems(s:Session=Depends(get_session)): return s.exec(select(SystemRegistry)).all()
@app.get('/api/projects/{project_id}/assets')
def assets(project_id:str,s:Session=Depends(get_session)): return s.exec(select(Asset).where(Asset.project_id==project_id)).all()
@app.get('/api/projects/{project_id}/imports')
def imports(project_id:str,s:Session=Depends(get_session)): return s.exec(select(ImportBatch).where(ImportBatch.project_id==project_id)).all()
@app.get('/api/projects/{project_id}/conflicts')
def conflicts(project_id:str,s:Session=Depends(get_session)): return s.exec(select(Conflict).where(Conflict.project_id==project_id)).all()
@app.get('/api/projects/{project_id}/graph')
def graph(project_id:str, level:str='TABLE', s:Session=Depends(get_session)):
    assets=s.exec(select(Asset).where(Asset.project_id==project_id)).all(); systems={x.system_name:x for x in s.exec(select(SystemRegistry)).all()}
    cols=s.exec(select(ColumnCatalog)).all(); col_by_asset={}
    for c in cols: col_by_asset.setdefault(c.asset_id,[]).append(c)
    edges=s.exec(select(LineageEdge).where(LineageEdge.project_id==project_id)).all()
    if level!='ALL': edges=[e for e in edges if e.lineage_level==level]
    return {'nodes':[{'id':a.asset_id,'type':'assetNode','position':{'x':(i%4)*320,'y':(i//4)*180},'data':{'label':a.display_name,'qualifiedName':a.qualified_name,'system':a.system_name,'assetType':a.asset_type,'environment':a.environment,'unresolved':a.unresolved_flag,'createdBy':a.created_by_source,'color':systems.get(a.system_name,SystemRegistry(system_name='x')).color,'columns':[c.model_dump() for c in col_by_asset.get(a.asset_id,[])]}} for i,a in enumerate(assets)], 'edges':[{'id':e.edge_id,'source':e.source_asset_id,'target':e.target_asset_id,'label':e.transformation_type,'animated':e.review_status=='UNREVIEWED','data':e.model_dump()} for e in edges]}
@app.post('/api/projects/{project_id}/imports/preview')
async def preview(project_id:str,file:UploadFile=File(...)):
    try: pkg=json.loads((await file.read()).decode())
    except Exception as e: raise HTTPException(400,f'Invalid JSON: {e}')
    errors=validate_package(pkg); edges=pkg.get('lineage_edges',[])
    return {'file_name':file.filename,'source_file':pkg.get('source_document',{}).get('file_name'),'system':pkg.get('source_document',{}).get('system'),'parser':pkg.get('source_document',{}).get('parser'),'asset_count':len(pkg.get('assets',[])),'column_count':len(pkg.get('columns',[])),'process_count':len(pkg.get('processes',[])),'table_edge_count':sum(1 for e in edges if e.get('lineage_level')=='TABLE'),'column_edge_count':sum(1 for e in edges if e.get('lineage_level')=='COLUMN'),'low_confidence_edges':sum(1 for e in edges if e.get('confidence_score',1)<.75),'validation_errors':errors,'actions':['confirm_import','cancel_import','map_unknown_system','exclude_asset','exclude_edge','accept_high_confidence']}
@app.post('/api/projects/{project_id}/imports')
async def do_import(project_id:str,file:UploadFile=File(...),s:Session=Depends(get_session)):
    try: pkg=json.loads((await file.read()).decode())
    except Exception as e: raise HTTPException(400,f'Invalid JSON: {e}')
    return import_package(s,project_id,pkg,file.filename)
@app.post('/api/projects/{project_id}/checkpoints')
def checkpoint(project_id:str,name:str='Manual checkpoint',s:Session=Depends(get_session)):
    snap={m.__name__: [o.model_dump(mode='json') for o in s.exec(select(m)).all()] for m in [Asset,ColumnCatalog,Process,LineageEdge,ImportBatch,ImportObject,LineageEvidence,Conflict]}
    cp=Checkpoint(project_id=project_id,name=name,snapshot=snap); s.add(cp); s.commit(); s.refresh(cp); return cp
@app.get('/api/assets/{asset_id}')
def asset_detail(asset_id:str,s:Session=Depends(get_session)):
    a=s.get(Asset,asset_id); 
    if not a: raise HTTPException(404,'Asset not found')
    cols=s.exec(select(ColumnCatalog).where(ColumnCatalog.asset_id==asset_id)).all(); up=s.exec(select(LineageEdge).where(LineageEdge.target_asset_id==asset_id)).all(); down=s.exec(select(LineageEdge).where(LineageEdge.source_asset_id==asset_id)).all()
    hist=s.exec(select(ImportObject).where(ImportObject.object_id==asset_id)).all()
    return {'asset':a,'columns':cols,'upstream':up,'downstream':down,'import_history':hist}
@app.post('/api/profile/{project_id}')
async def profile(project_id:str,file:UploadFile=File(...)):
    data=await file.read(); df=pd.read_csv(io.BytesIO(data)) if file.filename.endswith('.csv') else pd.read_excel(io.BytesIO(data))
    return {'rows':len(df),'columns':len(df.columns),'preview':df.head(10).fillna('').to_dict('records'),'column_profiles':{c:{'null_count':int(df[c].isna().sum()),'distinct_count':int(df[c].nunique()),'data_type':str(df[c].dtype)} for c in df.columns}}
