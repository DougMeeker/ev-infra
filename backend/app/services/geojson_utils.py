import math


def first_prop(props, keys):
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
