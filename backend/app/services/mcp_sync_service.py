"""MCP Knowledge Base sync service (Phase 2).

Generates natural-language document summaries from structured data and
pushes them to the pgvector-api /ingest endpoint for embedding and
semantic search via the MCP companion tools.
"""
import logging
from datetime import datetime

import requests
from flask import current_app
from sqlalchemy import func
from typing import Optional

from ..extensions import db
from ..models import (
    Site, Service, Equipment, EquipmentUsage, EquipmentCatalog, EquipmentCategory,
    Charger, Project, ProjectStep, ProjectStatus, Department,
    SitePriorityScore, SitePriorityWeight, McpSyncLog,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_enabled():
    return current_app.config.get('MCP_SYNC_ENABLED', False)


def _headers() -> dict:
    api_key = current_app.config.get('MCP_API_KEY', '')
    h = {'Content-Type': 'application/json'}
    if api_key:
        h['X-API-Key'] = api_key
    return h


def _base_url() -> str:
    return current_app.config.get('MCP_PGVECTOR_URL', 'http://127.0.0.1:8000').rstrip('/')


def _delete_source(uri: str) -> None:
    """Delete a source and all its chunks from pgvector-api.

    A 404 is silently ignored — it simply means the document didn't exist yet
    (first-time sync).  All other errors are re-raised.
    """
    resp = requests.delete(
        f"{_base_url()}/sources",
        params={'uri': uri},
        headers=_headers(),
        timeout=10,
    )
    if resp.status_code != 404:
        resp.raise_for_status()


def _replace_document(uri: str, text: str) -> None:
    """Atomically replace a document: delete old chunks, then ingest fresh ones.

    This is the core delete-before-ingest pattern from PRD §5.3.1.1.
    The pgvector-api upserts the doc_source row on URI but always *appends*
    new doc_chunk rows, so a blind POST produces duplicate/stale chunks.
    Calling DELETE /sources first removes the source + all chunks (CASCADE)
    before re-ingesting, guaranteeing exactly one copy of each document.
    """
    _delete_source(uri)
    resp = requests.post(
        f"{_base_url()}/ingest",
        json={'uri': uri, 'content': text},
        headers=_headers(),
        timeout=30,
    )
    resp.raise_for_status()


def _bulk_purge_evinfra() -> None:
    """Delete ALL evinfra:// sources before a full re-sync.

    This is more efficient than per-document deletes during sync_all() and
    ensures zero stale ev-infra data remains while leaving all other documents
    (manuals, regulations, etc.) completely untouched.
    """
    resp = requests.delete(
        f"{_base_url()}/sources",
        params={'uri_prefix': 'evinfra://'},
        headers=_headers(),
        timeout=30,
    )
    if resp.status_code != 404:
        resp.raise_for_status()


def _log_sync(sync_type: str, doc_count: int = 0, error: Optional[str] = None):
    """Persist a sync log entry."""
    entry = McpSyncLog(
        sync_type=sync_type,
        status='error' if error else 'success',
        document_count=doc_count,
        error_message=error,
        finished_at=datetime.utcnow(),
    )
    db.session.add(entry)
    db.session.commit()
    return entry


# ---------------------------------------------------------------------------
# Document generators
# ---------------------------------------------------------------------------

def _site_summary_doc(site: Site) -> dict:
    """Generate a Site Summary document."""
    # Aggregate electrical info from services
    services = [s for s in site.services if not s.is_deleted]
    voltage = services[0].voltage if services else None
    phase = services[0].phase_count if services else None
    breaker = services[0].main_breaker_amps if services else None
    pf = services[0].power_factor if services else 0.95

    # Calculate capacity
    capacity_kw = None
    if voltage and phase and breaker:
        if phase == 3:
            capacity_kw = round(voltage * breaker * 1.732 * pf / 1000, 1)
        else:
            capacity_kw = round(voltage * breaker * pf / 1000, 1)

    # Charger totals
    chargers = Charger.query.filter_by(site_id=site.id).all()
    charger_count = len(chargers)
    total_charger_kw = round(sum(c.kw or 0 for c in chargers), 1)

    available_kw = round(capacity_kw - total_charger_kw, 1) if capacity_kw else None

    vehicle_count = Equipment.query.filter_by(site_id=site.id).count()

    district = None
    if site.departments:
        district = site.departments[0].district

    parts = [
        f"Site: {site.name}, located at {site.address or 'N/A'}, {site.city or 'N/A'}.",
    ]
    if district is not None:
        parts.append(f"District {district}.")
    parts.append(f"{vehicle_count} vehicles assigned.")
    if voltage:
        phase_str = f"{phase}Φ" if phase else ""
        parts.append(
            f"Electrical service: {voltage}V {phase_str}, {breaker}A main breaker."
        )
    if capacity_kw is not None:
        parts.append(f"Theoretical capacity: {capacity_kw} kW.")
    if available_kw is not None:
        parts.append(f"Available capacity: {available_kw} kW.")
    parts.append(f"Chargers installed: {charger_count} ({total_charger_kw} kW total).")
    parts.append(f"Leased: {'yes' if site.leased else 'no'}.")

    return {
        'uri': f'evinfra://sites/{site.id}',
        'text': ' '.join(parts),
    }


def _fleet_profile_doc(site: Site) -> dict:
    """Generate a Fleet Profile document for a site."""
    equip_rows = (
        db.session.query(Equipment.id, Equipment.annual_miles, Equipment.mc_code)
        .filter_by(site_id=site.id)
        .all()
    )
    vehicle_count = len(equip_rows)

    # Usage fallback: sum of all recorded miles per equipment
    equip_ids = [eid for eid, _, _ in equip_rows]
    usage_miles: dict[int, float] = {}
    if equip_ids:
        usage_agg = (
            db.session.query(EquipmentUsage.equipment_id, func.sum(EquipmentUsage.miles))
            .filter(EquipmentUsage.equipment_id.in_(equip_ids))
            .group_by(EquipmentUsage.equipment_id)
            .all()
        )
        usage_miles = {int(eid): float(m or 0) for eid, m in usage_agg}

    # Energy per mile by mc_code via catalog → category join
    # Also handle miles_per_kwh (energy_per_mile = 1 / miles_per_kwh when set)
    mc_codes = list({mc for _, _, mc in equip_rows if mc})
    epm_map: dict[str, float] = {}
    cat_desc_map: dict[str, str] = {}
    if mc_codes:
        catalog_rows = (
            db.session.query(
                EquipmentCatalog.mc_code,
                EquipmentCategory.energy_per_mile,
                EquipmentCategory.miles_per_kwh,
                EquipmentCategory.description,
            )
            .join(EquipmentCategory,
                  EquipmentCatalog.equipment_category_code == EquipmentCategory.code,
                  isouter=True)
            .filter(EquipmentCatalog.mc_code.in_(mc_codes))
            .all()
        )
        for mc, epm, mpk, desc in catalog_rows:
            if epm is not None:
                epm_map[mc] = float(epm)
            elif mpk:
                epm_map[mc] = 1.0 / float(mpk)
            if desc:
                cat_desc_map[mc] = desc

    # Aggregate per-site totals and category counts
    total_miles = 0.0
    demand_kwh = 0.0
    cat_counts: dict[str, int] = {}
    for eid, am, mc in equip_rows:
        miles = float(am) if am else usage_miles.get(int(eid), 0.0)
        total_miles += miles
        demand_kwh += miles * epm_map.get(mc, 0.0)
        cat = cat_desc_map.get(mc, 'Unknown')
        cat_counts[cat] = cat_counts.get(cat, 0) + 1

    total_miles = round(total_miles, 1)
    demand_kwh = round(demand_kwh, 1)

    category_breakdown = ', '.join(f'{v} {k}' for k, v in cat_counts.items()) if cat_counts else 'none'
    # Vehicle type list (top-level)
    type_list = ', '.join(f'{k}: {v}' for k, v in cat_counts.items()) if cat_counts else 'none'

    text = (
        f"Fleet at {site.name}: {vehicle_count} vehicles. "
        f"Categories: {category_breakdown}. "
        f"Total annual miles: {total_miles}. "
        f"Estimated annual energy demand: {demand_kwh} kWh. "
        f"Vehicles by type: {type_list}."
    )
    return {
        'uri': f'evinfra://sites/{site.id}/fleet',
        'text': text,
    }


def _project_status_doc(project: Project) -> dict:
    """Generate a Project Status document."""
    site_count = len(project.sites)
    step_list = ', '.join(s.title for s in project.steps) if project.steps else 'none defined'

    # Per-site latest status
    site_summaries = []
    for s in project.sites:
        latest = (
            ProjectStatus.query
            .filter_by(project_id=project.id, site_id=s.id)
            .order_by(ProjectStatus.status_date.desc())
            .first()
        )
        if latest:
            step_title = 'unknown'
            for ps in project.steps:
                if ps.step_order == latest.current_step:
                    step_title = ps.title
                    break
            site_summaries.append(f"{s.name}: step {latest.current_step} ({step_title})")
        else:
            site_summaries.append(f"{s.name}: no status")

    site_status_summary = '; '.join(site_summaries) if site_summaries else 'no sites'

    text = (
        f"Project: {project.name}. {project.description or ''}. "
        f"{site_count} sites enrolled. "
        f"Steps: {step_list}. "
        f"Per-site status: {site_status_summary}."
    )
    return {
        'uri': f'evinfra://projects/{project.id}',
        'text': text,
    }


def _priority_scores_doc() -> dict:
    """Generate a Priority Scores summary document."""
    scores = (
        SitePriorityScore.query
        .join(Site)
        .filter(Site.is_deleted == False)  # noqa: E712
        .order_by(SitePriorityScore.composite_score.desc())
        .all()
    )
    if not scores:
        return {
            'uri': 'evinfra://priorities/latest',
            'text': 'No priority scores have been calculated yet.',
        }

    profile = scores[0].weight_profile
    profile_name = profile.name if profile else 'unknown'

    top_20 = [f"{s.site.name} ({s.composite_score:.1f})" for s in scores[:20]]
    bottom_20 = [f"{s.site.name} ({s.composite_score:.1f})" for s in scores[-20:]]
    high_count = sum(1 for s in scores if (s.composite_score or 0) > 80)
    low_count = sum(1 for s in scores if (s.composite_score or 0) < 20)

    text = (
        f"Site priority rankings (profile: {profile_name}): "
        f"Top 20: {', '.join(top_20)}. "
        f"Bottom 20: {', '.join(bottom_20)}. "
        f"Sites with score > 80: {high_count}. "
        f"Sites with score < 20: {low_count}."
    )
    return {
        'uri': 'evinfra://priorities/latest',
        'text': text,
    }


# ---------------------------------------------------------------------------
# Public sync functions
# ---------------------------------------------------------------------------

def sync_site(site_id: int) -> dict:
    """Sync documents for a single site (site summary + fleet profile).

    Uses delete-before-ingest (§5.3.1.1) so re-running never leaves stale chunks.
    """
    if not _is_enabled():
        return {'skipped': True, 'reason': 'MCP sync disabled'}

    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {'skipped': True, 'reason': 'Site not found or deleted'}

    docs = [_site_summary_doc(site), _fleet_profile_doc(site)]
    try:
        for doc in docs:
            _replace_document(doc['uri'], doc['text'])
        _log_sync('site', doc_count=len(docs))
        return {'synced': len(docs)}
    except Exception as e:
        logger.error("MCP sync_site(%s) failed: %s", site_id, e)
        _log_sync('site', error=str(e))
        return {'error': str(e)}


def sync_project(project_id: int) -> dict:
    """Sync the project status document for a single project.

    Uses delete-before-ingest (§5.3.1.1) so re-running never leaves stale chunks.
    """
    if not _is_enabled():
        return {'skipped': True, 'reason': 'MCP sync disabled'}

    project = Project.query.get(project_id)
    if not project or project.is_deleted:
        return {'skipped': True, 'reason': 'Project not found or deleted'}

    doc = _project_status_doc(project)
    try:
        _replace_document(doc['uri'], doc['text'])
        _log_sync('project', doc_count=1)
        return {'synced': 1}
    except Exception as e:
        logger.error("MCP sync_project(%s) failed: %s", project_id, e)
        _log_sync('project', error=str(e))
        return {'error': str(e)}


def sync_priorities() -> dict:
    """Sync the priority scores summary document.

    Uses delete-before-ingest (§5.3.1.1) so re-running never leaves stale chunks.
    """
    if not _is_enabled():
        return {'skipped': True, 'reason': 'MCP sync disabled'}

    doc = _priority_scores_doc()
    try:
        _replace_document(doc['uri'], doc['text'])
        _log_sync('priorities', doc_count=1)
        return {'synced': 1}
    except Exception as e:
        logger.error("MCP sync_priorities failed: %s", e)
        _log_sync('priorities', error=str(e))
        return {'error': str(e)}


def sync_all() -> dict:
    """Full sync: all sites, all projects, and priority scores.

    Bulk-purges all evinfra:// sources first (§5.3.1.1), then re-ingests
    fresh documents.  Non-ev-infra documents are never touched.
    """
    if not _is_enabled():
        return {'skipped': True, 'reason': 'MCP sync disabled'}

    # Build document list before touching the knowledge base
    docs = []
    sites = Site.query.filter_by(is_deleted=False).all()
    for site in sites:
        docs.append(_site_summary_doc(site))
        docs.append(_fleet_profile_doc(site))

    projects = Project.query.filter_by(is_deleted=False).all()
    for project in projects:
        docs.append(_project_status_doc(project))

    docs.append(_priority_scores_doc())

    try:
        # Step 1: bulk-delete all existing evinfra:// documents
        _bulk_purge_evinfra()
        # Step 2: ingest each fresh document
        for doc in docs:
            _replace_document(doc['uri'], doc['text'])
        _log_sync('full', doc_count=len(docs))
        return {'synced': len(docs)}
    except Exception as e:
        logger.error("MCP sync_all failed: %s", e)
        _log_sync('full', error=str(e))
        return {'error': str(e)}


def get_sync_status() -> dict:
    """Return last sync info and document counts."""
    last = McpSyncLog.query.order_by(McpSyncLog.id.desc()).first()
    total_docs = db.session.query(func.sum(McpSyncLog.document_count)).filter(
        McpSyncLog.status == 'success'
    ).scalar() or 0

    recent_errors = (
        McpSyncLog.query
        .filter(McpSyncLog.status == 'error')
        .order_by(McpSyncLog.id.desc())
        .limit(10)
        .all()
    )

    return {
        'enabled': _is_enabled(),
        'last_sync': last.to_dict() if last else None,
        'total_documents_synced': total_docs,
        'recent_errors': [e.to_dict() for e in recent_errors],
    }
