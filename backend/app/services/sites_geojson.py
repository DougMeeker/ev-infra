import json
import math
from typing import Dict, Any
from ..models import Site
from ..extensions import db


def first_prop(props: Dict[str, Any], keys):
    if not isinstance(props, dict):
        return None
    for k in keys:
        for candidate in (k, str(k).lower(), str(k).upper()):
            if candidate in props and props.get(candidate) not in (None, ''):
                return props.get(candidate)
    lower = {str(k).lower(): v for k, v in props.items()}
    for k in keys:
        v = lower.get(str(k).lower())
        if v not in (None, ''):
            return v
    return None


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000.0  # meters
    try:
        dlat = math.radians((lat2 or 0) - (lat1 or 0))
        dlon = math.radians((lon2 or 0) - (lon1 or 0))
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1 or 0)) * math.cos(math.radians(lat2 or 0)) * math.sin(dlon/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c
    except Exception:
        return float('inf')


def process_upload_geojson(data: Dict[str, Any]):
    if not isinstance(data, dict) or data.get('type') != 'FeatureCollection':
        return {"error": "GeoJSON must be a FeatureCollection"}, 400
    features = data.get('features') or []
    if not isinstance(features, list) or not features:
        return {"error": "No features found in GeoJSON"}, 400

    added = 0
    updated = 0
    skipped = 0
    errors = []

    existing_sites = Site.query.filter_by(is_deleted=False).all()
    existing_by_name = {s.name: s for s in existing_sites if s.name}

    for idx, feat in enumerate(features):
        try:
            geom = feat.get('geometry') if isinstance(feat, dict) else None
            if not geom or geom.get('type') != 'Point':
                skipped += 1
                continue
            coords = geom.get('coordinates')
            if not isinstance(coords, (list, tuple)) or len(coords) < 2:
                skipped += 1
                continue
            lon, lat = coords[0], coords[1]
            try:
                lon = float(lon); lat = float(lat)
            except (TypeError, ValueError):
                skipped += 1
                continue
            props = feat.get('properties') or {}

            name = first_prop(props, [
                'name','site','site_name','Site Name','LOCATION',
                'PROPERTY','Property','PROPERTY NAME','Property Name','Real Property Name','DGS Property Name','DGS_PROP_NAME','PROPNAME','PropName'
            ])
            address = first_prop(props, ['address', 'street', 'address1'])
            city = first_prop(props, ['city', 'municipality', 'town'])
            utility = first_prop(props, ['utility', 'utility_name', 'Utility'])
            meter_number = first_prop(props, ['meter', 'meter_number', 'MeterNumber'])
            contact_name = first_prop(props, ['contact', 'contact_name'])
            contact_phone = first_prop(props, ['phone', 'contact_phone'])

            if name and name in existing_by_name:
                site = existing_by_name[name]
                site.latitude = lat
                site.longitude = lon
                if address is not None:
                    site.address = address
                if city is not None:
                    site.city = city
                if utility is not None:
                    site.utility = utility
                if meter_number is not None:
                    site.meter_number = meter_number
                if contact_name is not None:
                    site.contact_name = contact_name
                if contact_phone is not None:
                    site.contact_phone = contact_phone
                updated += 1
            else:
                fallback_name = None
                if address and city:
                    fallback_name = f"{address}, {city}"
                site = Site(
                    name=(name or fallback_name or f"Imported Site {idx+1}"),
                    latitude=lat,
                    longitude=lon,
                    address=address,
                    city=city,
                    utility=utility,
                    meter_number=meter_number,
                    contact_name=contact_name,
                    contact_phone=contact_phone
                )
                db.session.add(site)
                added += 1
                if name:
                    existing_by_name[name] = site
        except Exception as e:
            errors.append({"feature_index": idx, "error": str(e)})
            skipped += 1

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to save sites: {e}"}, 500

    return {
        "message": "GeoJSON processed",
        "added": added,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:10]
    }, 200


def refresh_geojson_features(features, tolerance_m: float = 10.0):
    added = 0
    updated = 0
    skipped = 0
    errors = []
    stats = {
        "total_features": len(features) if isinstance(features, list) else 0,
        "non_point": 0,
        "invalid_coords": 0,
        "matched_exact_coord": 0,
        "matched_proximity": 0,
        "matched_addr_city": 0,
        "exceptions": 0,
    }

    existing_sites = Site.query.filter_by(is_deleted=False).all()
    existing_by_addr_city = {}
    for s in existing_sites:
        key = None
        if s.address and s.city:
            key = f"{s.address.strip()}, {s.city.strip()}".lower()
        if key:
            existing_by_addr_city.setdefault(key, []).append(s)

    for idx, feat in enumerate(features):
        try:
            geom = feat.get('geometry') if isinstance(feat, dict) else None
            if not geom or geom.get('type') != 'Point':
                skipped += 1
                stats["non_point"] += 1
                continue
            coords = geom.get('coordinates')
            if not isinstance(coords, (list, tuple)) or len(coords) < 2:
                skipped += 1
                stats["invalid_coords"] += 1
                continue
            lon, lat = coords[0], coords[1]
            try:
                lon = float(lon); lat = float(lat)
            except (TypeError, ValueError):
                skipped += 1
                continue
            props = feat.get('properties') or {}

            name = first_prop(props, ['name', 'site', 'site_name', 'Site Name', 'LOCATION', 'Real Property Name'])
            address = first_prop(props, ['address', 'street', 'address1'])
            city = first_prop(props, ['city', 'municipality', 'town'])
            utility = first_prop(props, ['utility', 'utility_name', 'Utility'])
            meter_number = first_prop(props, ['meter', 'meter_number', 'MeterNumber'])
            contact_name = first_prop(props, ['contact', 'contact_name'])
            contact_phone = first_prop(props, ['phone', 'contact_phone'])

            # Exact coordinate match first
            site = next((s for s in existing_sites if s.latitude == lat and s.longitude == lon), None)
            if not site:
                # Proximity match within tolerance (or a slightly higher fallback to handle minor inaccuracies)
                nearest = None
                nearest_dist = float('inf')
                for s in existing_sites:
                    if s.latitude is None or s.longitude is None:
                        continue
                    dist = haversine_m(lat, lon, s.latitude, s.longitude)
                    if dist < nearest_dist:
                        nearest = s
                        nearest_dist = dist
                # Use max of provided tolerance and 25m to catch close-but-not-exact points
                if nearest is not None and nearest_dist <= max(tolerance_m, 25.0):
                    site = nearest
                    stats["matched_proximity"] += 1
            else:
                stats["matched_exact_coord"] += 1

            if not site and address and city:
                # Address+City exact string fallback if coordinates vary slightly
                ac_key = f"{str(address).strip()}, {str(city).strip()}".lower()
                candidates = existing_by_addr_city.get(ac_key, [])
                if candidates:
                    # If multiple candidates, choose nearest by coordinate
                    nearest = None
                    nearest_dist = float('inf')
                    for s in candidates:
                        if s.latitude is None or s.longitude is None:
                            continue
                        dist = haversine_m(lat, lon, s.latitude, s.longitude)
                        if dist < nearest_dist:
                            nearest = s
                            nearest_dist = dist
                    site = nearest or candidates[0]
                    stats["matched_addr_city"] += 1

            if site:
                if address is not None:
                    site.address = address
                if city is not None:
                    site.city = city
                if utility is not None:
                    site.utility = utility
                if meter_number is not None:
                    site.meter_number = meter_number
                if contact_name is not None:
                    site.contact_name = contact_name
                if contact_phone is not None:
                    site.contact_phone = contact_phone
                if (not site.name) or (isinstance(site.name, str) and (site.name.startswith('Imported Site') or site.name.startswith('DGS Property'))):
                    if name:
                        site.name = name
                    elif address and city:
                        site.name = f"{address}, {city}"
                updated += 1
            else:
                site = Site(
                    name=(name or (f"{address}, {city}" if (address and city) else f"Imported Site {idx+1}")),
                    latitude=lat,
                    longitude=lon,
                    address=address,
                    city=city,
                    utility=utility,
                    meter_number=meter_number,
                    contact_name=contact_name,
                    contact_phone=contact_phone
                )
                db.session.add(site)
                added += 1
        except Exception as e:
            errors.append({"feature_index": idx, "error": str(e)})
            skipped += 1
            stats["exceptions"] += 1

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to save sites: {e}"}, 500

    return {
        "message": "GeoJSON refreshed",
        "added": added,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:10],
        "stats": stats
    }, 200
