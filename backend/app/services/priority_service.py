"""Service layer for the Site Prioritization Model (Phase 1).

Calculates composite priority scores and investigation urgency for all
active sites using configurable weight profiles.
"""
from datetime import datetime
from sqlalchemy import func, and_

from ..extensions import db
from ..models import (
    Site, Service, UtilityBill, Charger, Equipment, EquipmentUsage,
    EquipmentCategory, EquipmentCatalog, Project, ProjectStep, ProjectStatus,
    SitePriorityWeight, SitePriorityScore, Department,
)


# ---------------------------------------------------------------------------
# Weight profile CRUD
# ---------------------------------------------------------------------------

def get_weight_profiles():
    return SitePriorityWeight.query.order_by(SitePriorityWeight.id).all()


def get_weight_profile(profile_id):
    return SitePriorityWeight.query.get(profile_id)


def create_weight_profile(data):
    profile = SitePriorityWeight(
        name=data['name'],
        vehicle_count_w=data.get('vehicle_count_w', 0.20),
        annual_miles_w=data.get('annual_miles_w', 0.15),
        electrical_headroom_w=data.get('electrical_headroom_w', 0.15),
        charger_gap_w=data.get('charger_gap_w', 0.20),
        project_readiness_w=data.get('project_readiness_w', 0.10),
        energy_demand_w=data.get('energy_demand_w', 0.10),
        data_completeness_w=data.get('data_completeness_w', 0.10),
    )
    db.session.add(profile)
    db.session.commit()
    return profile


def update_weight_profile(profile_id, data):
    profile = SitePriorityWeight.query.get(profile_id)
    if not profile:
        return None
    weight_fields = [
        'name', 'vehicle_count_w', 'annual_miles_w', 'electrical_headroom_w',
        'charger_gap_w', 'project_readiness_w', 'energy_demand_w', 'data_completeness_w',
    ]
    for f in weight_fields:
        if f in data:
            setattr(profile, f, data[f])
    db.session.commit()
    return profile


def delete_weight_profile(profile_id):
    profile = SitePriorityWeight.query.get(profile_id)
    if not profile:
        return None
    if profile.name == 'Default':
        return False  # cannot delete the default profile
    db.session.delete(profile)
    db.session.commit()
    return True


# ---------------------------------------------------------------------------
# Raw value extraction (per-site)
# ---------------------------------------------------------------------------

def _gather_raw_values():
    """Collect raw dimension values for every active site.

    Returns a dict keyed by site_id:
        {site_id: {vehicle_count, annual_miles, headroom_ratio, charger_gap,
                    project_readiness, energy_demand, data_completeness,
                    has_service}}
    """
    sites = Site.query.filter_by(is_deleted=False).all()
    site_ids = [s.id for s in sites]
    if not site_ids:
        return {}

    # -- Vehicle counts per site --
    vc_rows = (
        db.session.query(Equipment.site_id, func.count(Equipment.id))
        .filter(Equipment.site_id.in_(site_ids))
        .group_by(Equipment.site_id)
        .all()
    )
    vehicle_counts = {int(sid): int(cnt) for sid, cnt in vc_rows}

    # -- Annual miles per site --
    # Prefer equipment.annual_miles; fall back to sum of usage.miles across
    # the most recent 12 months of EquipmentUsage data.
    equip_rows = (
        db.session.query(Equipment.id, Equipment.site_id, Equipment.annual_miles, Equipment.mc_code)
        .filter(Equipment.site_id.in_(site_ids))
        .all()
    )
    equip_by_site = {}  # site_id -> list of (equip_id, annual_miles, mc_code)
    for eid, sid, am, mc in equip_rows:
        equip_by_site.setdefault(sid, []).append((eid, am, mc))

    # Usage fallback: aggregate last-12-month miles per equipment
    usage_agg = (
        db.session.query(EquipmentUsage.equipment_id, func.sum(EquipmentUsage.miles))
        .group_by(EquipmentUsage.equipment_id)
        .all()
    )
    usage_miles = {int(eid): float(m or 0) for eid, m in usage_agg}

    # Energy per mile by mc_code (via catalog -> category)
    catalog_rows = (
        db.session.query(EquipmentCatalog.mc_code, EquipmentCategory.energy_per_mile)
        .join(EquipmentCategory, EquipmentCatalog.equipment_category_code == EquipmentCategory.code, isouter=True)
        .all()
    )
    epm_map = {mc: float(epm) for mc, epm in catalog_rows if epm is not None}

    annual_miles_by_site = {}
    energy_demand_by_site = {}
    for sid in site_ids:
        total_miles = 0.0
        total_demand = 0.0
        for eid, am, mc in equip_by_site.get(sid, []):
            miles = float(am) if am else usage_miles.get(eid, 0.0)
            total_miles += miles
            epm = epm_map.get(mc, 0.0)
            total_demand += miles * epm
        annual_miles_by_site[sid] = total_miles
        energy_demand_by_site[sid] = total_demand

    # -- Charger ports per site --
    port_rows = (
        db.session.query(Charger.site_id, func.coalesce(func.sum(Charger.port_count), 0))
        .filter(Charger.site_id.in_(site_ids))
        .group_by(Charger.site_id)
        .all()
    )
    port_counts = {int(sid): int(cnt) for sid, cnt in port_rows}

    # -- Electrical headroom per site --
    # headroom_ratio = available_kw / theoretical_kw  (higher = more room)
    svc_rows = (
        db.session.query(Service.site_id, Service.main_breaker_amps,
                         Service.voltage, Service.phase_count, Service.power_factor)
        .filter(and_(Service.site_id.in_(site_ids), Service.is_deleted == False))
        .all()
    )
    # Aggregate theoretical capacity per site
    site_capacity = {}  # site_id -> theoretical_kw
    sites_with_service = set()
    sites_with_breaker = set()
    sites_with_voltage_phase = set()
    for sid, amps, volts, phase, pf in svc_rows:
        sites_with_service.add(sid)
        if amps:
            sites_with_breaker.add(sid)
        if volts and phase:
            sites_with_voltage_phase.add(sid)
        if all([amps, volts, phase, pf]):
            kw = (volts * amps * phase * pf) / 1000.0
            site_capacity[sid] = site_capacity.get(sid, 0.0) + kw

    # 12-month peak demand per site (aggregate across services)
    bill_peak = (
        db.session.query(Service.site_id, func.max(UtilityBill.max_power))
        .join(UtilityBill, and_(
            UtilityBill.service_id == Service.id,
            UtilityBill.is_deleted == False,
        ))
        .filter(Service.site_id.in_(site_ids))
        .group_by(Service.site_id)
        .all()
    )
    peak_demand = {int(sid): float(pk or 0) for sid, pk in bill_peak}

    headroom = {}
    for sid in site_ids:
        theoretical = site_capacity.get(sid)
        if theoretical and theoretical > 0:
            demand = peak_demand.get(sid, 0.0)
            available = theoretical - demand
            headroom[sid] = max(available / theoretical, 0.0)
        else:
            headroom[sid] = None  # missing service data

    # -- Utility bill presence per site --
    bill_sites = set(
        r[0] for r in
        db.session.query(Service.site_id)
        .join(UtilityBill, and_(
            UtilityBill.service_id == Service.id,
            UtilityBill.is_deleted == False,
        ))
        .filter(Service.site_id.in_(site_ids))
        .distinct()
        .all()
    )

    # -- Equipment usage presence per site --
    usage_sites = set(
        r[0] for r in
        db.session.query(Equipment.site_id)
        .join(EquipmentUsage, EquipmentUsage.equipment_id == Equipment.id)
        .filter(Equipment.site_id.in_(site_ids))
        .distinct()
        .all()
    )

    # -- Charger presence per site (any charger record) --
    charger_sites = set(
        r[0] for r in
        db.session.query(Charger.site_id)
        .filter(Charger.site_id.in_(site_ids))
        .distinct()
        .all()
    )

    # -- Project readiness per site --
    # readiness = max(current_step / total_steps) across projects
    ps_rows = (
        db.session.query(
            ProjectStatus.site_id,
            ProjectStatus.project_id,
            ProjectStatus.current_step,
        )
        .filter(ProjectStatus.site_id.in_(site_ids))
        .all()
    )
    step_counts = dict(
        db.session.query(ProjectStep.project_id, func.count(ProjectStep.id))
        .group_by(ProjectStep.project_id)
        .all()
    )
    readiness = {}
    for sid, pid, cur_step in ps_rows:
        total = step_counts.get(pid, 0)
        if total > 0:
            ratio = cur_step / total
            readiness[sid] = max(readiness.get(sid, 0.0), ratio)

    # -- Data completeness (additive, 0–100) --
    completeness = {}
    for sid in site_ids:
        score = 0
        if sid in sites_with_service:
            score += 25
        if sid in sites_with_breaker:
            score += 20
        if sid in sites_with_voltage_phase:
            score += 15
        if sid in bill_sites:
            score += 15
        if sid in usage_sites:
            score += 15
        if sid in charger_sites:
            score += 10
        completeness[sid] = score

    # -- Assemble raw values --
    raw = {}
    for sid in site_ids:
        vc = vehicle_counts.get(sid, 0)
        ports = port_counts.get(sid, 0)
        charger_gap = max(vc - ports, 0)
        raw[sid] = {
            'vehicle_count': vc,
            'annual_miles': annual_miles_by_site.get(sid, 0.0),
            'headroom_ratio': headroom.get(sid),
            'charger_gap': charger_gap,
            'project_readiness': readiness.get(sid, 0.0),
            'energy_demand': energy_demand_by_site.get(sid, 0.0),
            'data_completeness': completeness.get(sid, 0),
            'has_service': sid in sites_with_service,
        }
    return raw


# ---------------------------------------------------------------------------
# Min-max normalization
# ---------------------------------------------------------------------------

def _minmax(values):
    """Return (min, max) ignoring None values."""
    filtered = [v for v in values if v is not None]
    if not filtered:
        return 0, 0
    return min(filtered), max(filtered)


def _normalize(value, lo, hi):
    if value is None:
        return None
    if hi == lo:
        return 100.0 if value > 0 else 0.0
    return ((value - lo) / (hi - lo)) * 100.0


# ---------------------------------------------------------------------------
# Score calculation
# ---------------------------------------------------------------------------

def calculate_site_scores(weight_profile_id=None):
    """Calculate priority scores for all active sites.

    Returns a list of SitePriorityScore ORM objects (not yet committed).
    """
    if weight_profile_id is None:
        profile = SitePriorityWeight.query.filter_by(name='Default').first()
        if not profile:
            return []
        weight_profile_id = profile.id
    else:
        profile = SitePriorityWeight.query.get(weight_profile_id)
        if not profile:
            return []

    raw = _gather_raw_values()
    if not raw:
        return []

    # Compute min/max for normalization (dimensions 1–6)
    vc_lo, vc_hi = _minmax([r['vehicle_count'] for r in raw.values()])
    am_lo, am_hi = _minmax([r['annual_miles'] for r in raw.values()])
    hr_lo, hr_hi = _minmax([r['headroom_ratio'] for r in raw.values()])
    cg_lo, cg_hi = _minmax([r['charger_gap'] for r in raw.values()])
    pr_lo, pr_hi = _minmax([r['project_readiness'] for r in raw.values()])
    ed_lo, ed_hi = _minmax([r['energy_demand'] for r in raw.values()])

    results = []
    for site_id, r in raw.items():
        vc_score = _normalize(r['vehicle_count'], vc_lo, vc_hi)
        am_score = _normalize(r['annual_miles'], am_lo, am_hi)
        hr_score = _normalize(r['headroom_ratio'], hr_lo, hr_hi)  # may be None
        cg_score = _normalize(r['charger_gap'], cg_lo, cg_hi)
        pr_score = _normalize(r['project_readiness'], pr_lo, pr_hi)
        ed_score = _normalize(r['energy_demand'], ed_lo, ed_hi)
        dc_score = float(r['data_completeness'])  # already 0-100

        # Build weights dict; redistribute headroom weight if missing
        weights = {
            'vc': profile.vehicle_count_w,
            'am': profile.annual_miles_w,
            'hr': profile.electrical_headroom_w,
            'cg': profile.charger_gap_w,
            'pr': profile.project_readiness_w,
            'ed': profile.energy_demand_w,
            'dc': profile.data_completeness_w,
        }
        scores = {
            'vc': vc_score or 0.0,
            'am': am_score or 0.0,
            'hr': hr_score,
            'cg': cg_score or 0.0,
            'pr': pr_score or 0.0,
            'ed': ed_score or 0.0,
            'dc': dc_score,
        }

        if hr_score is None:
            # Redistribute headroom weight proportionally to other dimensions
            hr_w = weights.pop('hr')
            remaining_total = sum(weights.values())
            if remaining_total > 0:
                for k in weights:
                    weights[k] += hr_w * (weights[k] / remaining_total)
            scores['hr'] = 0.0  # not included in composite

        # Normalize weights to sum to 1.0
        w_total = sum(weights.values())
        if w_total > 0:
            for k in weights:
                weights[k] /= w_total

        composite = (
            weights['vc'] * scores['vc'] +
            weights['am'] * scores['am'] +
            weights.get('hr', 0) * (scores['hr'] or 0) +
            weights['cg'] * scores['cg'] +
            weights['pr'] * scores['pr'] +
            weights['ed'] * scores['ed'] +
            weights['dc'] * scores['dc']
        )

        # Investigation urgency
        inv_urgency = (100 - dc_score) * ((scores['vc'] + scores['cg']) / 200.0)

        needs_survey = (dc_score < 25) and (r['vehicle_count'] > 0)

        score_obj = SitePriorityScore(
            site_id=site_id,
            weight_profile_id=weight_profile_id,
            composite_score=round(composite, 2),
            vehicle_count_score=round(scores['vc'], 2),
            annual_miles_score=round(scores['am'], 2),
            electrical_headroom_score=round(hr_score, 2) if hr_score is not None else None,
            charger_gap_score=round(scores['cg'], 2),
            project_readiness_score=round(scores['pr'], 2),
            energy_demand_score=round(scores['ed'], 2),
            data_completeness_score=round(dc_score, 2),
            investigation_urgency=round(inv_urgency, 2),
            needs_survey=needs_survey,
            calculated_at=datetime.utcnow(),
        )
        results.append(score_obj)

    return results


def recalculate_all(weight_profile_id=None):
    """Recalculate all scores and persist to the database."""
    scores = calculate_site_scores(weight_profile_id)
    if not scores:
        return 0

    # Delete existing scores for this weight profile
    wpid = scores[0].weight_profile_id
    SitePriorityScore.query.filter_by(weight_profile_id=wpid).delete()

    for s in scores:
        db.session.add(s)
    db.session.commit()
    return len(scores)


def get_ranked_sites(weight_profile_id=None, page=1, per_page=25,
                     sort='composite_score', order='desc',
                     district=None, min_score=None, search=None):
    """Return paginated ranked site scores."""
    q = SitePriorityScore.query.join(Site)
    if weight_profile_id:
        q = q.filter(SitePriorityScore.weight_profile_id == weight_profile_id)
    if district is not None:
        q = q.filter(Site.id.in_(
            db.session.query(Department.site_id).filter(Department.district == district)
        ))
    if min_score is not None:
        q = q.filter(SitePriorityScore.composite_score >= min_score)
    if search:
        q = q.filter(Site.name.ilike(f'%{search}%'))

    # Sorting
    sort_col = getattr(SitePriorityScore, sort, SitePriorityScore.composite_score)
    if order == 'asc':
        q = q.order_by(sort_col.asc())
    else:
        q = q.order_by(sort_col.desc())

    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    return {
        'items': [s.to_dict() for s in items],
        'total': total,
        'page': page,
        'per_page': per_page,
        'pages': (total + per_page - 1) // per_page,
    }


def get_investigation_list(page=1, per_page=25, district=None, search=None):
    """Return sites needing survey, ranked by investigation urgency."""
    q = (SitePriorityScore.query
         .join(Site)
         .filter(SitePriorityScore.needs_survey == True))
    if district is not None:
        q = q.filter(Site.id.in_(
            db.session.query(Department.site_id).filter(Department.district == district)
        ))
    if search:
        q = q.filter(Site.name.ilike(f'%{search}%'))
    q = q.order_by(SitePriorityScore.investigation_urgency.desc())

    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    return {
        'items': [s.to_dict() for s in items],
        'total': total,
        'page': page,
        'per_page': per_page,
        'pages': (total + per_page - 1) // per_page,
    }


def get_site_score(site_id):
    """Get score breakdown for a single site."""
    return SitePriorityScore.query.get(site_id)
