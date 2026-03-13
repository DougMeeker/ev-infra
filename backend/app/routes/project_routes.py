from flask import Blueprint, request, jsonify, abort
from ..extensions import db
from ..models import Project, Site, ProjectStatus, ProjectStep, Department
import csv
import io
import re
from datetime import datetime, date

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
    from ..models import Charger
    from sqlalchemy import func
    projects = Project.query.filter_by(is_deleted=False).order_by(Project.name).all()
    # One query: charger counts keyed by project_id
    project_ids = [p.id for p in projects]
    charger_counts = {}
    if project_ids:
        rows = db.session.query(Charger.project_id, func.count(Charger.id)) \
            .filter(Charger.project_id.in_(project_ids)) \
            .group_by(Charger.project_id).all()
        charger_counts = {pid: cnt for pid, cnt in rows}
    result = []
    for p in projects:
        d = p.to_dict()
        d['charger_count'] = charger_counts.get(p.id, 0)
        result.append(d)
    return jsonify(result)

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
    Query params: q (search by site name), department_id (filter by department), page (default 1), page_size (default 25)
    Returns a simple array of site dicts sorted by name.
    """
    project = _get_project_or_404(project_id)
    q = (request.args.get('q') or '').strip()
    department_id = (request.args.get('department_id') or '').strip()
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
    from sqlalchemy import or_, func, cast
    from sqlalchemy import String as SAString
    site_query = Site.query.join(project_sites, Site.id == project_sites.c.site_id).filter(project_sites.c.project_id == project_id)
    if q:
        like = f"%{q}%"
        dept_sites_q = db.session.query(Department.site_id).filter(
            or_(
                Department.unit_name.ilike(like),
                (func.lpad(cast(Department.district, SAString), 2, '0') + '-' +
                 func.lpad(cast(Department.unit, SAString), 4, '0')).ilike(like)
            ),
            Department.site_id.isnot(None)
        ).subquery()
        site_query = site_query.filter(or_(
            Site.name.ilike(like),
            func.coalesce(Site.address, '').ilike(like),
            func.coalesce(Site.city, '').ilike(like),
            Site.id.in_(dept_sites_q)
        ))
    if department_id:
        dept_like = f"%{department_id}%"
        dept_sites_filter = db.session.query(Department.site_id).filter(
            or_(
                Department.unit_name.ilike(dept_like),
                (func.lpad(cast(Department.district, SAString), 2, '0') + '-' +
                 func.lpad(cast(Department.unit, SAString), 4, '0')).ilike(dept_like)
            ),
            Department.site_id.isnot(None)
        ).subquery()
        site_query = site_query.filter(Site.id.in_(dept_sites_filter))
    site_query = site_query.order_by(Site.name)

    if page <= 0:
        page = 1
    if page_size <= 0:
        page_size = 25
    total = site_query.count()
    items = site_query.offset((page - 1) * page_size).limit(page_size).all()
    data = [s.to_dict() for s in items]
    # Two queries: chargers for this project per site, and total chargers per site
    from ..models import Charger
    from sqlalchemy import func
    page_site_ids = [s.id for s in items]
    project_charger_counts = {}
    site_charger_counts = {}
    if page_site_ids:
        proj_rows = db.session.query(Charger.site_id, func.count(Charger.id)) \
            .filter(Charger.site_id.in_(page_site_ids), Charger.project_id == project_id) \
            .group_by(Charger.site_id).all()
        project_charger_counts = {sid: cnt for sid, cnt in proj_rows}
        total_rows = db.session.query(Charger.site_id, func.count(Charger.id)) \
            .filter(Charger.site_id.in_(page_site_ids)) \
            .group_by(Charger.site_id).all()
        site_charger_counts = {sid: cnt for sid, cnt in total_rows}
    for d in data:
        d['charger_count_project'] = project_charger_counts.get(d['id'], 0)
        d['charger_count_site'] = site_charger_counts.get(d['id'], 0)
    meta = {
        'total': total,
        'page': page,
        'page_size': page_size,
        'returned': len(items),
        'q': q,
        'department_id': department_id
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

@project_bp.route('/<int:project_id>/sites/<int:old_site_id>/reassign/<int:new_site_id>', methods=['POST'])
def reassign_project_site(project_id, old_site_id, new_site_id):
    """
    Reassign a project from one site to another, preserving status history.
    Copies all status records from old_site to new_site, then removes old_site association.
    """
    project = _get_project_or_404(project_id)
    old_site = Site.query.get_or_404(old_site_id)
    new_site = Site.query.get_or_404(new_site_id)
    
    # Verify old site is currently associated
    if old_site not in project.sites:
        return jsonify({'error': 'Project is not associated with the old site'}), 400
    
    # Add new site if not already associated
    if new_site not in project.sites:
        project.sites.append(new_site)
        db.session.flush()
    
    # Copy all status records from old site to new site
    old_statuses = ProjectStatus.query.filter_by(
        project_id=project_id,
        site_id=old_site_id
    ).all()
    
    copied_count = 0
    skipped_count = 0
    
    for old_status in old_statuses:
        # Check if status already exists for new site on this date
        existing = ProjectStatus.query.filter_by(
            project_id=project_id,
            site_id=new_site_id,
            status_date=old_status.status_date
        ).first()
        
        if not existing:
            # Create copy with new site_id
            new_status = ProjectStatus(
                project_id=project_id,
                site_id=new_site_id,
                current_step=old_status.current_step,
                status_message=old_status.status_message,
                status_date=old_status.status_date,
                estimated_cost=old_status.estimated_cost,
                actual_cost=old_status.actual_cost
            )
            db.session.add(new_status)
            copied_count += 1
        else:
            skipped_count += 1
    
    # Remove old site association
    project.sites.remove(old_site)
    
    db.session.commit()
    
    return jsonify({
        'status': 'ok',
        'statuses_copied': copied_count,
        'statuses_skipped': skipped_count,
        'message': f'Project reassigned from site {old_site_id} to site {new_site_id}'
    })

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
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        # Check for unique constraint violation
        error_msg = str(e)
        if 'uq_project_site_statusdate' in error_msg or 'UniqueViolation' in error_msg:
            return jsonify({
                'error': 'A status entry already exists for this date. Please choose a different date or time.'
            }), 409
        return jsonify({'error': 'Failed to create status: ' + str(e)}), 500
    # MCP sync hook (fire-and-forget)
    try:
        from ..services.mcp_sync_service import sync_project
        sync_project(project_id)
    except Exception:
        pass
    return jsonify(status.to_dict()), 201


@project_bp.route('/<int:project_id>/sites/<int:site_id>/status/<int:status_id>', methods=['PUT'])
def update_status(project_id, site_id, status_id):
    """Update a project status entry."""
    _get_project_or_404(project_id)
    Site.query.get_or_404(site_id)
    status = ProjectStatus.query.get_or_404(status_id)
    
    # Verify the status belongs to this project and site
    if status.project_id != project_id or status.site_id != site_id:
        return jsonify({'error': 'Status not found for this project/site'}), 404
    
    data = request.get_json() or {}
    
    if 'current_step' in data:
        status.current_step = int(data['current_step'])
    if 'status_message' in data:
        status.status_message = data['status_message']
    if 'status_date' in data:
        status_date = data['status_date']
        try:
            if len(status_date) == 10:
                status.status_date = datetime.strptime(status_date, "%Y-%m-%d")
            else:
                status.status_date = datetime.fromisoformat(status_date)
        except Exception:
            return jsonify({'error': 'invalid status_date format'}), 400
    if 'estimated_cost' in data:
        status.estimated_cost = float(data['estimated_cost']) if data['estimated_cost'] else None
    if 'actual_cost' in data:
        status.actual_cost = float(data['actual_cost']) if data['actual_cost'] else None
    
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        # Check for unique constraint violation
        error_msg = str(e)
        if 'uq_project_site_statusdate' in error_msg or 'UniqueViolation' in error_msg:
            return jsonify({
                'error': 'A status entry already exists for this date. Please choose a different date or time.'
            }), 409
        return jsonify({'error': 'Failed to update status: ' + str(e)}), 500
    # MCP sync hook (fire-and-forget)
    try:
        from ..services.mcp_sync_service import sync_project
        sync_project(project_id)
    except Exception:
        pass
    return jsonify(status.to_dict()), 200


@project_bp.route('/<int:project_id>/sites/<int:site_id>/status/<int:status_id>', methods=['DELETE'])
def delete_status(project_id, site_id, status_id):
    """Delete a project status entry."""
    _get_project_or_404(project_id)
    Site.query.get_or_404(site_id)
    status = ProjectStatus.query.get_or_404(status_id)
    
    # Verify the status belongs to this project and site
    if status.project_id != project_id or status.site_id != site_id:
        return jsonify({'error': 'Status not found for this project/site'}), 404
    
    db.session.delete(status)
    db.session.commit()
    return jsonify({'status': 'deleted'}), 200


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


def _normalize_date_token(token: str):
    if token is None:
        return None
    s = str(token).strip()
    if not s:
        return None
    # Normalize common variants like "7-3" or accidental double slashes
    s = s.replace('--', '-').replace('//', '/')
    # Accept M/D or M-D
    m = re.match(r"^(\d{1,2})\s*[/\-]\s*(\d{1,2})$", s)
    if not m:
        return None
    mm = int(m.group(1))
    dd = int(m.group(2))
    # Assume year 2025 as per instructions
    try:
        return datetime(2025, mm, dd)
    except Exception:
        return None


def _parse_status_segments(raw: str):
    """Parse the 'Project Status' free text into dated segments.
    Returns list of tuples: (status_date: datetime, message: str)
    Rules:
    - Segments are separated by ';'
    - Segments may start with a date token like '9/22' or '7-3'
    - If the first segment has no date, assume 2025-01-01
    - All undated non-first segments are skipped
    """
    results = []
    if not raw:
        return results
    try:
        parts = [p.strip() for p in str(raw).split(';')]
    except Exception:
        parts = [str(raw).strip()]

    first_assigned = False
    for idx, part in enumerate(parts):
        if not part:
            continue
        # Try to pull a leading date token "M/D" or "M-D"
        # Also handle formats like "9/22 - ..." (optional dash)
        m = re.match(r"^\s*(\d{1,2}\s*[/\-]\s*\d{1,2})\s*-?\s*(.*)$", part)
        if m:
            dt = _normalize_date_token(m.group(1))
            msg = (m.group(2) or '').strip()
            if dt is not None and msg:
                results.append((dt, msg))
            elif dt is not None:
                results.append((dt, ''))
            # If msg empty, still keep dated entry
            first_assigned = True
            continue
        # No explicit date
        if idx == 0:
            # Assume 2025-01-01
            assumed = datetime(2025, 1, 1)
            results.append((assumed, part))
            first_assigned = True
        else:
            # Skip undated later segments
            continue
    return results


@project_bp.route('/<int:project_id>/import-caltrans', methods=['POST'])
def import_caltrans_csv(project_id):
    """Import Caltrans Project Tracker CSV to update site membership and project statuses.
    Expected CSV headers (case-sensitive per provided file):
    - 'Site Address'
    - 'Site City'
    - 'Road Map Step #'
    - 'Project Status'
    Behavior:
    - Match sites by exact address+city (case-insensitive). If not found, create site.
    - If site not linked to project, link it.
    - Parse 'Project Status' into dated segments and upsert ProjectStatus entries
      (unique by project_id, site_id, status_date). current_step from 'Road Map Step #' or 1.
    """
    project = _get_project_or_404(project_id)
    if 'file' not in request.files:
        return jsonify({'error': 'file is required'}), 400
    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({'error': 'no file provided'}), 400

    # Read file content into text stream
    try:
        content = file.read()
        text = content.decode('utf-8', errors='replace')
    except Exception as e:
        return jsonify({'error': f'failed to read file: {e}'}), 400

    reader = csv.DictReader(io.StringIO(text))
    # Counters
    sites_created = 0
    sites_linked = 0
    statuses_created = 0
    statuses_updated = 0
    rows_processed = 0
    skipped = 0
    errors = []

    # Build quick lookup of current project site IDs for O(1) membership checks
    current_site_ids = set([s.id for s in project.sites])

    # Helper to find site by address+city
    def find_site(addr_raw, city_raw):
        if not addr_raw or not city_raw:
            return None
        addr = str(addr_raw).strip().lower()
        city = str(city_raw).strip().lower()
        if not addr or not city:
            return None
        return Site.query.filter(
            db.func.lower(Site.address) == addr,
            db.func.lower(Site.city) == city,
            Site.is_deleted.is_(False)
        ).first()

    for idx, row in enumerate(reader):
        rows_processed += 1
        try:
            # Extract fields
            addr = (row.get('Site Address') or '').strip()
            city = (row.get('Site City') or '').strip()
            step_raw = (row.get('Road Map Step #') or '').strip()
            status_raw = row.get('Project Status') or ''

            # Determine step
            try:
                current_step = int(step_raw)
            except Exception:
                current_step = 1

            site = find_site(addr, city)
            if site is None:
                # Create new site with name as address, city
                name = f"{addr}, {city}".strip(', ')
                site = Site(name=name, address=addr or None, city=city or None)
                db.session.add(site)
                db.session.flush()  # get id
                sites_created += 1

            # Link to project if not already
            if site.id not in current_site_ids:
                try:
                    project.sites.append(site)
                    sites_linked += 1
                    current_site_ids.add(site.id)
                except Exception:
                    # Ignore if already linked
                    pass

            # Parse and upsert statuses
            segments = _parse_status_segments(status_raw)
            for dt, msg in segments:
                # Ensure midnight time (matching other APIs)
                if isinstance(dt, date) and not isinstance(dt, datetime):
                    dt = datetime.combine(dt, datetime.min.time())
                existing = ProjectStatus.query.filter_by(
                    project_id=project.id,
                    site_id=site.id,
                    status_date=dt
                ).first()
                if existing:
                    # Update message and step if changed
                    prev_msg = existing.status_message or ''
                    prev_step = existing.current_step
                    changed = False
                    if (msg or '') != prev_msg:
                        existing.status_message = msg
                        changed = True
                    if int(current_step) != int(prev_step):
                        existing.current_step = int(current_step)
                        changed = True
                    if changed:
                        statuses_updated += 1
                else:
                    st = ProjectStatus(
                        project_id=project.id,
                        site_id=site.id,
                        status_date=dt,
                        status_message=msg,
                        current_step=int(current_step)
                    )
                    db.session.add(st)
                    statuses_created += 1
        except Exception as e:
            errors.append({'row': idx, 'error': str(e)})
            skipped += 1

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'failed to import: {e}'}), 500

    return jsonify({
        'message': 'Caltrans CSV import complete',
        'rows_processed': rows_processed,
        'sites_created': sites_created,
        'sites_added_to_project': sites_linked,
        'statuses_created': statuses_created,
        'statuses_updated': statuses_updated,
        'skipped': skipped,
        'errors': errors[:25]
    }), 200
