import hashlib, json, pathlib
from jsonschema import Draft202012Validator
from sqlmodel import Session, select
from .models import *
SCHEMA_PATH = pathlib.Path(__file__).parents[1]/'lineage.schema.json'

def norm(v): return (v or '').strip().lower()
def load_schema(): return json.loads(SCHEMA_PATH.read_text())
def validate_package(pkg):
    errors=sorted(Draft202012Validator(load_schema()).iter_errors(pkg), key=lambda e: list(e.path))
    return [f"{'.'.join(map(str,e.path)) or '$'}: {e.message}" for e in errors]

def asset_ref(a): return a.get('asset_key') or a.get('qualified_name') or a.get('display_name')
def col_key(c): return (c.get('asset_ref'), norm(c.get('column_name')))

def match_asset(session, project_id, data):
    sys=data.get('system_name') or data.get('system') or 'UNKNOWN'; env=data.get('environment','UNKNOWN')
    ns=data.get('namespace',''); q=data.get('qualified_name') or data.get('display_name') or 'UNRESOLVED'; typ=data.get('asset_type','UNKNOWN')
    if not sys or not q or q=='UNRESOLVED': return None,'CREATE_UNRESOLVED_STUB'
    stmt=select(Asset).where(Asset.project_id==project_id, Asset.system_name==sys, Asset.environment==env, Asset.namespace==ns, Asset.qualified_name==q, Asset.asset_type==typ)
    found=session.exec(stmt).first()
    if found: return found,'EXACT_CANONICAL_IDENTITY'
    for ast in session.exec(select(Asset).where(Asset.project_id==project_id, Asset.system_name==sys, Asset.asset_type==typ)).all():
        if norm(ast.qualified_name)==norm(q): return ast,'NORMALIZED_QUALIFIED_NAME'
    for ast in session.exec(select(Asset).where(Asset.project_id==project_id, Asset.namespace==ns, Asset.asset_type==typ)).all():
        if norm(ast.display_name)==norm(data.get('display_name') or q): return ast,'NAMESPACE_DISPLAY_NAME_TYPE'
    return None,'CREATE_NEW'

def match_column(session, asset_id, data):
    n=norm(data.get('column_name'))
    found=session.exec(select(ColumnCatalog).where(ColumnCatalog.asset_id==asset_id, ColumnCatalog.normalized_column_name==n)).first()
    return (found,'ASSET_NORMALIZED_COLUMN') if found else (None,'CREATE_NEW')

def match_process(session, project_id, data, source_file):
    name=data.get('process_name') or f"{source_file} step {data.get('sequence_number',1)}"
    stmt=select(Process).where(Process.project_id==project_id, Process.system_name==(data.get('system_name') or data.get('system') or 'UNKNOWN'), Process.process_name==name, Process.sequence_number==data.get('sequence_number'), Process.source_code_reference==data.get('source_code_reference',''))
    found=session.exec(stmt).first(); return (found,'SYSTEM_NAME_PROCESS_SEQUENCE_SOURCE') if found else (None,'CREATE_NEW')

def edge_match_stmt(project_id, s,t,sc,tc,p,level,expr):
    return select(LineageEdge).where(LineageEdge.project_id==project_id, LineageEdge.source_asset_id==s, LineageEdge.target_asset_id==t, LineageEdge.source_column_id==sc, LineageEdge.target_column_id==tc, LineageEdge.process_id==p, LineageEdge.lineage_level==level, LineageEdge.transformation_expression==expr)

def import_package(session:Session, project_id:str, pkg:dict, upload_name='upload.json', uploaded_by='local_user'):
    errs=validate_package(pkg)
    raw=json.dumps(pkg,indent=2); h=hashlib.sha256(raw.encode()).hexdigest()
    batch=ImportBatch(project_id=project_id, upload_file_name=upload_name, original_source_file_name=pkg['source_document']['file_name'], source_file_type=pkg['source_document'].get('file_type','UNKNOWN'), source_system_name=pkg['source_document'].get('system','UNKNOWN'), parser_name=pkg['source_document'].get('parser','UNKNOWN'), parser_version=pkg['source_document'].get('parser_version'), schema_version=pkg.get('schema_version',''), file_hash=h, uploaded_by=uploaded_by, validation_summary={'errors':errs})
    session.add(batch); session.commit(); session.refresh(batch)
    if errs: batch.import_status='FAILED'; batch.error_log=errs; session.add(batch); session.commit(); return batch
    maps={}; cmaps={}; pmaps={}
    for a in pkg.get('assets',[]):
        ast,strategy=match_asset(session,project_id,a); action='MATCHED_EXISTING'
        if not ast:
            sys=a.get('system_name') or a.get('system') or 'UNKNOWN'; system=session.exec(select(SystemRegistry).where(SystemRegistry.system_name==sys)).first()
            ast=Asset(project_id=project_id, system_id=system.system_id if system else None, system_name=sys, environment=a.get('environment','UNKNOWN'), namespace=a.get('namespace',''), qualified_name=a.get('qualified_name') or a.get('display_name') or f"UNRESOLVED::{uid('stub')}", display_name=a.get('display_name') or a.get('qualified_name') or 'Unresolved asset', asset_type=a.get('asset_type','UNKNOWN'), description=a.get('description',''), created_by_source='AI_LINEAGE_IMPORT', first_import_batch_id=batch.import_batch_id, last_import_batch_id=batch.import_batch_id, unresolved_flag=strategy=='CREATE_UNRESOLVED_STUB')
            session.add(ast); session.commit(); session.refresh(ast); action='CREATED'; batch.created_asset_count+=1
        else:
            ast.last_import_batch_id=batch.import_batch_id; session.add(ast); batch.updated_asset_count+=1
        maps[asset_ref(a)]=ast; session.add(ImportObject(import_batch_id=batch.import_batch_id, object_type='ASSET', object_id=ast.asset_id, action_taken=action, match_strategy=strategy, confidence_score=a.get('confidence_score',1)))
    session.commit()
    for c in pkg.get('columns',[]):
        ast=maps.get(c.get('asset_ref'))
        if not ast: continue
        col,strategy=match_column(session,ast.asset_id,c); action='MATCHED_EXISTING'
        if not col:
            col=ColumnCatalog(asset_id=ast.asset_id,column_name=c.get('column_name','UNRESOLVED_COLUMN'), normalized_column_name=norm(c.get('column_name')), ordinal_position=c.get('ordinal_position'), data_type=c.get('data_type','UNKNOWN'), normalized_data_type=norm(c.get('data_type','UNKNOWN')), created_by_source='AI_LINEAGE_IMPORT', first_import_batch_id=batch.import_batch_id, last_import_batch_id=batch.import_batch_id, unresolved_flag=ast.unresolved_flag)
            session.add(col); session.commit(); session.refresh(col); action='CREATED'; batch.created_column_count+=1
        else: col.last_import_batch_id=batch.import_batch_id; session.add(col); batch.updated_column_count+=1
        cmaps[col_key(c)]=col; session.add(ImportObject(import_batch_id=batch.import_batch_id, object_type='COLUMN', object_id=col.column_id, action_taken=action, match_strategy=strategy))
    for p in pkg.get('processes',[]):
        proc,strategy=match_process(session,project_id,p,pkg['source_document']['file_name']); action='MATCHED_EXISTING'
        if not proc:
            proc=Process(project_id=project_id, system_name=p.get('system_name') or p.get('system') or pkg['source_document'].get('system','UNKNOWN'), process_type=p.get('process_type','UNKNOWN'), process_name=p.get('process_name') or f"{pkg['source_document']['file_name']} step {p.get('sequence_number',1)}", sequence_number=p.get('sequence_number'), source_code_reference=p.get('source_code_reference',''), code_snippet=p.get('code_snippet',''), confidence_score=p.get('confidence_score',1), extraction_method='AI_EXTRACTED', first_import_batch_id=batch.import_batch_id, last_import_batch_id=batch.import_batch_id)
            session.add(proc); session.commit(); session.refresh(proc); action='CREATED'; batch.created_process_count+=1
        pmaps[p.get('process_key') or proc.process_name]=proc; session.add(ImportObject(import_batch_id=batch.import_batch_id, object_type='PROCESS', object_id=proc.process_id, action_taken=action, match_strategy=strategy))
    session.commit()
    for e in pkg.get('lineage_edges',[]):
        sa=maps.get(e.get('source_asset_ref')); ta=maps.get(e.get('target_asset_ref'))
        if not sa or not ta: batch.unresolved_item_count+=1; continue
        sc=cmaps.get((e.get('source_asset_ref'),norm(e.get('source_column')))); tc=cmaps.get((e.get('target_asset_ref'),norm(e.get('target_column')))); pr=pmaps.get(e.get('process_ref')) or next(iter(pmaps.values()),None)
        level=e.get('lineage_level','COLUMN' if e.get('source_column') or e.get('target_column') else 'TABLE'); expr=e.get('transformation_expression','')
        existing=session.exec(edge_match_stmt(project_id,sa.asset_id,ta.asset_id,sc.column_id if sc else None,tc.column_id if tc else None,pr.process_id if pr else None,level,expr)).first()
        if existing:
            existing.last_import_batch_id=batch.import_batch_id; session.add(existing); edge=existing; action='MATCHED_EXISTING'; batch.updated_edge_count+=1
        else:
            # conflict same target/process/level but different expression/source
            conflicts=session.exec(select(LineageEdge).where(LineageEdge.project_id==project_id, LineageEdge.target_asset_id==ta.asset_id, LineageEdge.target_column_id==(tc.column_id if tc else None), LineageEdge.lineage_level==level)).all()
            for old in conflicts:
                if old.transformation_expression!=expr or old.source_asset_id!=sa.asset_id:
                    session.add(Conflict(project_id=project_id, import_batch_id=batch.import_batch_id, object_type='LINEAGE_EDGE', object_id=old.edge_id, conflict_type='TARGET_LINEAGE_CONFLICT', old_value={'edge_id':old.edge_id,'expression':old.transformation_expression,'source_asset_id':old.source_asset_id}, new_value=e, explanation=f"Imported lineage for target {ta.display_name} conflicts with an existing edge; no approved metadata was overwritten."))
            edge=LineageEdge(project_id=project_id, source_asset_id=sa.asset_id, source_column_id=sc.column_id if sc else None, target_asset_id=ta.asset_id, target_column_id=tc.column_id if tc else None, process_id=pr.process_id if pr else None, lineage_level=level, transformation_type=e.get('transformation_type','UNKNOWN'), transformation_expression=expr, evidence_code_snippet=e.get('evidence_code_snippet',''), evidence_start_line=e.get('evidence_start_line'), evidence_end_line=e.get('evidence_end_line'), confidence_score=e.get('confidence_score',1), unresolved_flag=sa.unresolved_flag or ta.unresolved_flag, created_by_source='AI_LINEAGE_IMPORT', first_import_batch_id=batch.import_batch_id, last_import_batch_id=batch.import_batch_id)
            session.add(edge); session.commit(); session.refresh(edge); action='CREATED'; batch.created_edge_count+=1
        if edge.confidence_score < .75: batch.low_confidence_edge_count+=1
        session.add(ImportObject(import_batch_id=batch.import_batch_id, object_type='EDGE', object_id=edge.edge_id, action_taken=action, match_strategy='FULL_EDGE_SIGNATURE', confidence_score=e.get('confidence_score',1)))
        session.add(LineageEvidence(edge_id=edge.edge_id, import_batch_id=batch.import_batch_id, source_document_id=pkg['source_document'].get('document_id',''), source_file_name=pkg['source_document']['file_name'], code_snippet=e.get('evidence_code_snippet',''), start_line=e.get('evidence_start_line'), end_line=e.get('evidence_end_line'), confidence_score=e.get('confidence_score',1)))
    batch.import_status='IMPORTED'; batch.import_summary={'assets':len(pkg.get('assets',[])),'columns':len(pkg.get('columns',[])),'edges':len(pkg.get('lineage_edges',[]))}
    session.add(batch); session.commit(); session.refresh(batch); return batch
