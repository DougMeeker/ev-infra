"""Phase 5: Financial & Milestone Tracking routes.

Endpoints:
  Cost Estimates (C-1):
    GET    /api/financials/cost-estimates               list (filter: site_id, project_id)
    POST   /api/financials/cost-estimates               create or upsert
    GET    /api/financials/cost-estimates/<id>          get one
    PUT    /api/financials/cost-estimates/<id>          update
    DELETE /api/financials/cost-estimates/<id>          delete

  Milestones (C-3):
    GET    /api/financials/milestones                   list (filter: project_id, site_id)
    POST   /api/financials/milestones                   create
    POST   /api/financials/milestones/initialize        bulk-init standard milestones for project+site
    GET    /api/financials/milestones/<id>              get one
    PUT    /api/financials/milestones/<id>              update
    DELETE /api/financials/milestones/<id>              delete

  Budget Summary (C-2):
    GET    /api/financials/budget-summary               project budget overview with rollup
    PUT    /api/financials/projects/<project_id>/budget update budget_allocated/committed/spent
"""
from flask import Blueprint, request, jsonify
from sqlalchemy import func
from ..extensions import db
from ..models import (
    SiteCostEstimate, Milestone, Project, Site, ProjectStatus,
    MILESTONE_TYPES
)

financial_bp = Blueprint('financials', __name__, url_prefix='/api/financials')


# ── Helpers ───────────────────────────────────────────────────────────

def _date_or_none(val):
    """Parse a date string (YYYY-MM-DD) or return None."""
    if not val:
        return None
    from datetime import date
    if isinstance(val, date):
        return val
    try:
        from datetime import datetime
        return datetime.strptime(str(val)[:10], '%Y-%m-%d').date()
    except Exception:
        return None


# ── Cost Estimates ────────────────────────────────────────────────────

@financial_bp.route('/cost-estimates', methods=['GET'])
def list_cost_estimates():
    """List cost estimates. Optional filters: site_id, project_id."""
    site_id = request.args.get('site_id', type=int)
    project_id = request.args.get('project_id', type=int)

    q = SiteCostEstimate.query
    if site_id:
        q = q.filter_by(site_id=site_id)
    if project_id is not None:
        q = q.filter_by(project_id=project_id)

    estimates = q.order_by(SiteCostEstimate.site_id).all()
    return jsonify([e.to_dict() for e in estimates])


@financial_bp.route('/cost-estimates', methods=['POST'])
def create_cost_estimate():
    """Create or upsert a cost estimate for a site+project pair."""
    data = request.get_json() or {}
    site_id = data.get('site_id')
    project_id = data.get('project_id')  # nullable

    if not site_id:
        return jsonify({'error': 'site_id is required'}), 400

    if not Site.query.filter_by(id=site_id, is_deleted=False).first():
        return jsonify({'error': 'Site not found'}), 404
    if project_id and not Project.query.filter_by(id=project_id, is_deleted=False).first():
        return jsonify({'error': 'Project not found'}), 404

    # Upsert on site_id + project_id
    existing = SiteCostEstimate.query.filter_by(
        site_id=site_id,
        project_id=project_id
    ).first()

    if existing:
        _apply_cost_fields(existing, data)
        db.session.commit()
        return jsonify(existing.to_dict()), 200

    estimate = SiteCostEstimate(site_id=site_id, project_id=project_id)
    _apply_cost_fields(estimate, data)
    db.session.add(estimate)
    db.session.commit()
    return jsonify(estimate.to_dict()), 201


@financial_bp.route('/cost-estimates/<int:estimate_id>', methods=['GET'])
def get_cost_estimate(estimate_id):
    estimate = SiteCostEstimate.query.get_or_404(estimate_id)
    return jsonify(estimate.to_dict())


@financial_bp.route('/cost-estimates/<int:estimate_id>', methods=['PUT'])
def update_cost_estimate(estimate_id):
    estimate = SiteCostEstimate.query.get_or_404(estimate_id)
    data = request.get_json() or {}
    _apply_cost_fields(estimate, data)
    db.session.commit()
    return jsonify(estimate.to_dict())


@financial_bp.route('/cost-estimates/<int:estimate_id>', methods=['DELETE'])
def delete_cost_estimate(estimate_id):
    estimate = SiteCostEstimate.query.get_or_404(estimate_id)
    db.session.delete(estimate)
    db.session.commit()
    return jsonify({'status': 'deleted'})


def _apply_cost_fields(estimate, data):
    """Apply numeric cost fields from request data to a SiteCostEstimate instance."""
    for field in ('charger_hardware', 'electrical_upgrade', 'construction_civil',
                  'utility_interconnection', 'design_engineering', 'contingency'):
        if field in data:
            val = data[field]
            setattr(estimate, field, float(val) if val not in (None, '') else 0.0)
    if 'notes' in data:
        estimate.notes = data['notes'] or None


# ── Milestones ────────────────────────────────────────────────────────

@financial_bp.route('/milestones', methods=['GET'])
def list_milestones():
    """List milestones. Filterable by project_id and/or site_id."""
    project_id = request.args.get('project_id', type=int)
    site_id = request.args.get('site_id', type=int)

    q = Milestone.query
    if project_id:
        q = q.filter_by(project_id=project_id)
    if site_id:
        q = q.filter_by(site_id=site_id)

    milestones = q.order_by(Milestone.site_id, Milestone.project_id, Milestone.id).all()
    return jsonify([m.to_dict() for m in milestones])


@financial_bp.route('/milestones/initialize', methods=['POST'])
def initialize_milestones():
    """Bulk-initialize standard milestones for a project+site pair.

    Creates one row per MILESTONE_TYPES entry (skipping any that already exist).
    Body: { project_id, site_id }
    """
    data = request.get_json() or {}
    project_id = data.get('project_id')
    site_id = data.get('site_id')

    if not project_id or not site_id:
        return jsonify({'error': 'project_id and site_id are required'}), 400
    if not Project.query.filter_by(id=project_id, is_deleted=False).first():
        return jsonify({'error': 'Project not found'}), 404
    if not Site.query.filter_by(id=site_id, is_deleted=False).first():
        return jsonify({'error': 'Site not found'}), 404

    created = []
    for mtype in MILESTONE_TYPES:
        existing = Milestone.query.filter_by(
            project_id=project_id, site_id=site_id, milestone_type=mtype
        ).first()
        if not existing:
            m = Milestone(project_id=project_id, site_id=site_id, milestone_type=mtype)
            db.session.add(m)
            created.append(mtype)

    db.session.commit()
    milestones = Milestone.query.filter_by(
        project_id=project_id, site_id=site_id
    ).order_by(Milestone.id).all()
    return jsonify({
        'created': created,
        'milestones': [m.to_dict() for m in milestones]
    }), 201


@financial_bp.route('/milestones', methods=['POST'])
def create_milestone():
    """Create a single milestone record."""
    data = request.get_json() or {}
    project_id = data.get('project_id')
    site_id = data.get('site_id')
    milestone_type = data.get('milestone_type')

    if not project_id or not site_id or not milestone_type:
        return jsonify({'error': 'project_id, site_id, and milestone_type are required'}), 400
    if not Project.query.filter_by(id=project_id, is_deleted=False).first():
        return jsonify({'error': 'Project not found'}), 404
    if not Site.query.filter_by(id=site_id, is_deleted=False).first():
        return jsonify({'error': 'Site not found'}), 404

    m = Milestone(
        project_id=project_id,
        site_id=site_id,
        milestone_type=milestone_type,
        target_date=_date_or_none(data.get('target_date')),
        actual_date=_date_or_none(data.get('actual_date')),
        notes=data.get('notes'),
    )
    db.session.add(m)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        if 'uq_milestone_project_site_type' in str(e):
            return jsonify({'error': 'Milestone of this type already exists for this project+site'}), 409
        return jsonify({'error': str(e)}), 500
    return jsonify(m.to_dict()), 201


@financial_bp.route('/milestones/<int:milestone_id>', methods=['GET'])
def get_milestone(milestone_id):
    m = Milestone.query.get_or_404(milestone_id)
    return jsonify(m.to_dict())


@financial_bp.route('/milestones/<int:milestone_id>', methods=['PUT'])
def update_milestone(milestone_id):
    m = Milestone.query.get_or_404(milestone_id)
    data = request.get_json() or {}
    if 'target_date' in data:
        m.target_date = _date_or_none(data['target_date'])
    if 'actual_date' in data:
        m.actual_date = _date_or_none(data['actual_date'])
    if 'notes' in data:
        m.notes = data['notes'] or None
    if 'milestone_type' in data:
        m.milestone_type = data['milestone_type']
    db.session.commit()
    return jsonify(m.to_dict())


@financial_bp.route('/milestones/<int:milestone_id>', methods=['DELETE'])
def delete_milestone(milestone_id):
    m = Milestone.query.get_or_404(milestone_id)
    db.session.delete(m)
    db.session.commit()
    return jsonify({'status': 'deleted'})


# ── Budget Summary (C-2) ──────────────────────────────────────────────

@financial_bp.route('/budget-summary', methods=['GET'])
def budget_summary():
    """Aggregate budget overview for all active projects.

    Returns each project with:
      - budget_allocated, budget_committed, budget_spent (manual fields)
      - rollup_estimated_cost: sum of latest estimated_cost per site from project_status
      - rollup_actual_cost: sum of latest actual_cost per site from project_status
      - rollup_cost_estimates: sum of totals from site_cost_estimates linked to this project
    """
    projects = Project.query.filter_by(is_deleted=False).order_by(Project.name).all()
    project_ids = [p.id for p in projects]

    # Latest project_status per (project_id, site_id) — subquery
    latest_status_sq = (
        db.session.query(
            ProjectStatus.project_id,
            ProjectStatus.site_id,
            func.max(ProjectStatus.status_date).label('max_date')
        )
        .filter(ProjectStatus.project_id.in_(project_ids))
        .group_by(ProjectStatus.project_id, ProjectStatus.site_id)
        .subquery()
    )

    # Aggregate estimated/actual costs per project from latest status rows
    cost_rollups = (
        db.session.query(
            ProjectStatus.project_id,
            func.sum(ProjectStatus.estimated_cost).label('sum_estimated'),
            func.sum(ProjectStatus.actual_cost).label('sum_actual'),
        )
        .join(latest_status_sq, (
            (ProjectStatus.project_id == latest_status_sq.c.project_id) &
            (ProjectStatus.site_id == latest_status_sq.c.site_id) &
            (ProjectStatus.status_date == latest_status_sq.c.max_date)
        ))
        .group_by(ProjectStatus.project_id)
        .all()
    )
    rollup_by_project = {
        row.project_id: {
            'rollup_estimated_cost': row.sum_estimated,
            'rollup_actual_cost': row.sum_actual,
        }
        for row in cost_rollups
    }

    # Sum of detailed cost estimates per project from site_cost_estimates
    estimate_sums = (
        db.session.query(
            SiteCostEstimate.project_id,
            func.sum(
                SiteCostEstimate.charger_hardware +
                SiteCostEstimate.electrical_upgrade +
                SiteCostEstimate.construction_civil +
                SiteCostEstimate.utility_interconnection +
                SiteCostEstimate.design_engineering +
                SiteCostEstimate.contingency
            ).label('total')
        )
        .filter(SiteCostEstimate.project_id.in_(project_ids))
        .group_by(SiteCostEstimate.project_id)
        .all()
    )
    estimate_sum_by_project = {
        row.project_id: row.total for row in estimate_sums
    }

    result = []
    for p in projects:
        rollup = rollup_by_project.get(p.id, {})
        d = {
            'id': p.id,
            'name': p.name,
            'description': p.description,
            'site_count': len(p.sites),
            'budget_allocated': p.budget_allocated,
            'budget_committed': p.budget_committed,
            'budget_spent': p.budget_spent,
            'rollup_estimated_cost': rollup.get('rollup_estimated_cost'),
            'rollup_actual_cost': rollup.get('rollup_actual_cost'),
            'rollup_cost_estimates': estimate_sum_by_project.get(p.id),
        }
        result.append(d)
    return jsonify(result)


@financial_bp.route('/projects/<int:project_id>/budget', methods=['PUT'])
def update_project_budget(project_id):
    """Update the budget_allocated, budget_committed, budget_spent fields on a project."""
    project = Project.query.filter_by(id=project_id, is_deleted=False).first_or_404()
    data = request.get_json() or {}

    for field in ('budget_allocated', 'budget_committed', 'budget_spent'):
        if field in data:
            val = data[field]
            setattr(project, field, float(val) if val not in (None, '') else None)

    db.session.commit()
    return jsonify({
        'id': project.id,
        'name': project.name,
        'budget_allocated': project.budget_allocated,
        'budget_committed': project.budget_committed,
        'budget_spent': project.budget_spent,
    })


# ── Milestone types reference ─────────────────────────────────────────

@financial_bp.route('/milestone-types', methods=['GET'])
def list_milestone_types():
    """Return the ordered list of standard milestone type names."""
    return jsonify(MILESTONE_TYPES)
