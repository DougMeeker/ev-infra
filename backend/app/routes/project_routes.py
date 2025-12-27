from flask import Blueprint, request, jsonify, abort
from ..extensions import db
from ..models import Project, Site, ProjectStatus, ProjectStep

project_bp = Blueprint('projects', __name__, url_prefix='/api/projects')

def _get_project_or_404(project_id):
    """Coerce to int and fetch via filter_by to avoid Session.get identifier issues."""
    try:
        pid = int(project_id)
    except Exception:
        abort(404)
    return Project.query.filter_by(id=pid, is_deleted=False).first_or_404()

@project_bp.route('', methods=['GET'])
def list_projects():
    projects = Project.query.filter_by(is_deleted=False).order_by(Project.name).all()
    return jsonify([p.to_dict() for p in projects])

@project_bp.route('', methods=['POST'])
def create_project():
    data = request.get_json() or {}
    name = data.get('name')
    description = data.get('description')
    if not name:
        return jsonify({'error': 'name is required'}), 400
    existing = Project.query.filter_by(name=name).first()
    if existing:
        if existing.is_deleted:
            # Restore soft-deleted project by updating fields and clearing deletion
            if description is not None:
                existing.description = description
            existing.is_deleted = False
            db.session.commit()
            return jsonify(existing.to_dict()), 200
        return jsonify({'error': 'project name already exists'}), 409
    project = Project(name=name, description=description)
    db.session.add(project)
    db.session.commit()
    return jsonify(project.to_dict()), 201

@project_bp.route('/<int:project_id>', methods=['GET'])
def get_project(project_id):
    project = _get_project_or_404(project_id)
    return jsonify(project.to_dict())

@project_bp.route('/<int:project_id>', methods=['PUT'])
def update_project(project_id):
    project = _get_project_or_404(project_id)
    data = request.get_json() or {}
    if 'name' in data:
        project.name = data['name']
    if 'description' in data:
        project.description = data['description']
    db.session.commit()
    return jsonify(project.to_dict())

@project_bp.route('/<int:project_id>', methods=['DELETE'])
def delete_project(project_id):
    project = _get_project_or_404(project_id)
    project.is_deleted = True
    db.session.commit()
    return jsonify({'status': 'deleted'})

@project_bp.route('/<int:project_id>/sites', methods=['POST'])
def add_site_to_project(project_id):
    project = _get_project_or_404(project_id)
    data = request.get_json() or {}
    site_id = data.get('site_id')
    if not site_id:
        return jsonify({'error': 'site_id is required'}), 400
    site = Site.query.get_or_404(site_id)
    if site not in project.sites:
        project.sites.append(site)
        db.session.commit()
    return jsonify({'project_id': project.id, 'site_id': site.id})

@project_bp.route('/<int:project_id>/sites', methods=['GET'])
def list_project_sites(project_id):
    """List sites associated with a project with optional search and pagination.
    Query params: q (search by site name), page (default 1), page_size (default 25)
    Returns a simple array of site dicts sorted by name.
    """
    project = _get_project_or_404(project_id)
    q = (request.args.get('q') or '').strip()
    try:
        page = int(request.args.get('page', '1'))
    except ValueError:
        page = 1
    try:
        page_size = int(request.args.get('page_size', '25'))
    except ValueError:
        page_size = 25

    # Base query: join through association table `project_sites`
    from ..models import project_sites
    from sqlalchemy import or_
    site_query = Site.query.join(project_sites, Site.id == project_sites.c.site_id).filter(project_sites.c.project_id == project_id)
    if q:
        like = f"%{q}%"
        site_query = site_query.filter(or_(
            Site.name.ilike(like),
            Site.address.ilike(like),
            Site.city.ilike(like)
        ))
    site_query = site_query.order_by(Site.name)

    if page <= 0:
        page = 1
    if page_size <= 0:
        page_size = 25
    total = site_query.count()
    items = site_query.offset((page - 1) * page_size).limit(page_size).all()
    data = [s.to_dict() for s in items]
    meta = {
        'total': total,
        'page': page,
        'page_size': page_size,
        'returned': len(items),
        'q': q
    }
    return jsonify({'items': data, 'meta': meta})

@project_bp.route('/<int:project_id>/sites/<int:site_id>', methods=['DELETE'])
def remove_site_from_project(project_id, site_id):
    project = _get_project_or_404(project_id)
    site = Site.query.get_or_404(site_id)
    if site in project.sites:
        project.sites.remove(site)
        db.session.commit()
    return jsonify({'status': 'ok'})

# Status routes
@project_bp.route('/<int:project_id>/sites/<int:site_id>/status', methods=['GET'])
def list_statuses(project_id, site_id):
    _get_project_or_404(project_id)
    Site.query.get_or_404(site_id)
    statuses = ProjectStatus.query\
        .filter_by(project_id=project_id, site_id=site_id)\
        .order_by(ProjectStatus.status_date.desc())\
        .all()
    return jsonify([s.to_dict() for s in statuses])

@project_bp.route('/<int:project_id>/sites/<int:site_id>/status', methods=['POST'])
def create_status(project_id, site_id):
    project = _get_project_or_404(project_id)
    site = Site.query.get_or_404(site_id)
    data = request.get_json() or {}
    current_step = data.get('current_step')
    status_message = data.get('status_message')
    status_date = data.get('status_date')  # optional ISO string (YYYY-MM-DD or full ISO)
    estimated_cost = data.get('estimated_cost')
    actual_cost = data.get('actual_cost')
    if current_step is None:
        return jsonify({'error': 'current_step is required'}), 400
    status = ProjectStatus(
        project_id=project.id,
        site_id=site.id,
        current_step=int(current_step),
        status_message=status_message,
    )
    from datetime import datetime, date
    if status_date:
        # Accept YYYY-MM-DD or full ISO timestamp
        try:
            if len(status_date) == 10:
                # Strict YYYY-MM-DD
                status.status_date = datetime.strptime(status_date, "%Y-%m-%d")
            else:
                status.status_date = datetime.fromisoformat(status_date)
        except Exception:
            return jsonify({'error': 'invalid status_date format; expected YYYY-MM-DD or ISO timestamp'}), 400
    else:
        # Default to today's date
        status.status_date = datetime.combine(date.today(), datetime.min.time())
    if estimated_cost is not None:
        status.estimated_cost = float(estimated_cost)
    if actual_cost is not None:
        status.actual_cost = float(actual_cost)
    db.session.add(status)
    db.session.commit()
    return jsonify(status.to_dict()), 201


@project_bp.route('/<int:project_id>/status/latest', methods=['GET'])
def latest_statuses(project_id):
    """Return the latest status entry per site in the project, including sites without status."""
    project = _get_project_or_404(project_id)
    # Subquery to get max status_date per site
    from sqlalchemy import func, and_
    subq = db.session.query(
        ProjectStatus.site_id.label('site_id'),
        func.max(ProjectStatus.status_date).label('max_date')
    ).filter(ProjectStatus.project_id == project_id).group_by(ProjectStatus.site_id).subquery()

    # Join to get full status rows
    latest_rows = db.session.query(ProjectStatus).join(
        subq,
        and_(ProjectStatus.site_id == subq.c.site_id, ProjectStatus.status_date == subq.c.max_date)
    ).filter(ProjectStatus.project_id == project_id).all()

    status_map = {row.site_id: row for row in latest_rows}
    response = []
    for site in project.sites:
        status = status_map.get(site.id)
        if status:
            data = status.to_dict()
        else:
            data = {
                'id': None,
                'project_id': project.id,
                'site_id': site.id,
                'status_date': None,
                'status_message': None,
                'current_step': None,
                'estimated_cost': None,
                'actual_cost': None,
                'created_at': None,
                'updated_at': None
            }
        data['site_name'] = site.name
        response.append(data)
    # Sort by site name for consistency
    response.sort(key=lambda x: (x['site_name'] or '').lower())
    return jsonify(response)

# ---- Project Steps CRUD ----
@project_bp.route('/<int:project_id>/steps', methods=['GET'])
def list_steps(project_id):
    _get_project_or_404(project_id)
    steps = ProjectStep.query.filter_by(project_id=project_id).order_by(ProjectStep.step_order).all()
    return jsonify([s.to_dict() for s in steps])

@project_bp.route('/<int:project_id>/steps', methods=['POST'])
def create_step(project_id):
    _get_project_or_404(project_id)
    data = request.get_json() or {}
    title = data.get('title')
    step_order = data.get('step_order')
    description = data.get('description')
    if not title:
        return jsonify({'error': 'title is required'}), 400
    if step_order is None:
        # default to next order
        max_order = db.session.query(db.func.max(ProjectStep.step_order)).filter_by(project_id=project_id).scalar()
        step_order = (max_order or 0) + 1
    step = ProjectStep(project_id=project_id, title=title, step_order=int(step_order), description=description)
    db.session.add(step)
    db.session.commit()
    return jsonify(step.to_dict()), 201

@project_bp.route('/<int:project_id>/steps/<int:step_id>', methods=['PUT'])
def update_step(project_id, step_id):
    _get_project_or_404(project_id)
    step = ProjectStep.query.filter_by(id=step_id, project_id=project_id).first_or_404()
    data = request.get_json() or {}
    if 'title' in data:
        step.title = data['title']
    if 'description' in data:
        step.description = data['description']
    if 'step_order' in data:
        step.step_order = int(data['step_order'])
    db.session.commit()
    return jsonify(step.to_dict())

@project_bp.route('/<int:project_id>/steps/<int:step_id>', methods=['DELETE'])
def delete_step(project_id, step_id):
    _get_project_or_404(project_id)
    step = ProjectStep.query.filter_by(id=step_id, project_id=project_id).first_or_404()
    db.session.delete(step)
    db.session.commit()
    return jsonify({'status': 'deleted'})
