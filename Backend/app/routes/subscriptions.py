import re
import secrets
from datetime import datetime, timezone
from typing import List, Optional, Tuple
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from app import config
from app.database import get_db
from app.models import (
    SubscribeRequest,
    SubscribeResponse,
    SubscriptionDetail,
    AlertsResponse,
    AlertItem,
    AlertAllRequest,
    AlertAllResponse,
)
from app.routes.reports import verify_admin_key
from app.logger import logger
from app.limiter import limiter

router = APIRouter(tags=["Subscriptions & Alerts"])

# segment_id value for a whole-corridor subscription (the app's "follow all", the web's segment-less subscribe)
ALL_SEGMENTS = "all"
ALL_SEGMENTS_NAME = "Entire NH-7 corridor"

def validate_and_normalize_contact(contact: str, channel: str = "SMS") -> Tuple[bool, str, str]:
    """
    Validates E.164 phone, email, or telegram chat identifier.
    Strips spaces and hyphens. If phone is 10 digits without country code, defaults to +91.
    Normalizes phone numbers to standard E.164 (e.g. +919876543210).
    Returns (is_valid, normalized_contact, masked_contact).
    """
    contact = contact.strip()
    ch = channel.lower().strip() if channel else "sms"

    # Check email
    if "@" in contact and ch not in ("telegram",):
        email_pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
        if re.match(email_pattern, contact):
            parts = contact.split("@")
            user, domain = parts[0], parts[1]
            if len(user) <= 2:
                masked_user = user[0] + "*"
            else:
                masked_user = user[0] + "*" * min(6, len(user) - 2) + user[-1]
            return True, contact, f"{masked_user}@{domain}"
        return False, contact, contact

    # If Telegram channel, support numeric chat_id or telegram @username
    if ch == "telegram":
        if re.match(r"^-?\d{5,16}$", contact):
            masked = contact[:2] + "*****" + contact[-2:] if len(contact) >= 6 else "*****"
            return True, contact, masked
        if re.match(r"^@[a-zA-Z0-9_]{3,32}$", contact):
            masked = contact[:2] + "***" + contact[-1:] if len(contact) >= 4 else "@***"
            return True, contact, masked

    # Check phone (E.164 or Indian 10 digits): strip spaces, hyphens, parentheses, dots
    clean_phone = re.sub(r"[\s\-\(\)\.]", "", contact)

    # 1. 10 digits (e.g. 9876543210 or 9811223344) -> default to +91
    if len(clean_phone) == 10 and clean_phone.isdigit():
        clean_phone = f"+91{clean_phone}"
    # 2. 11 digits starting with 0 (e.g. 09876543210) -> replace 0 with +91
    elif len(clean_phone) == 11 and clean_phone.startswith("0") and clean_phone[1:].isdigit():
        clean_phone = f"+91{clean_phone[1:]}"
    # 3. 12 digits starting with 91 without plus (e.g. 919876543210) -> prepend +
    elif len(clean_phone) == 12 and clean_phone.startswith("91") and clean_phone.isdigit():
        clean_phone = f"+{clean_phone}"
    # 4. Digits without plus between 7 and 15 digits -> prepend +
    elif not clean_phone.startswith("+") and clean_phone.isdigit() and 7 <= len(clean_phone) <= 15:
        clean_phone = f"+{clean_phone}"

    # E.164 pattern: + followed by 7 to 15 digits
    e164_pattern = r"^\+[1-9]\d{6,14}$"
    if re.match(e164_pattern, clean_phone):
        if len(clean_phone) >= 7:
            prefix = clean_phone[:3]
            suffix = clean_phone[-4:]
            masked = f"{prefix}*****{suffix}"
        else:
            masked = clean_phone[:2] + "*****" + clean_phone[-2:]
        return True, clean_phone, masked

    return False, contact, contact

def mask_contact(contact: str) -> str:
    """Convenience helper to return masked phone or email."""
    _, _, masked = validate_and_normalize_contact(contact)
    return masked

def mask_subscriber_name(name: str) -> str:
    """
    Masks subscriber name for unauthenticated public alert queries
    to prevent subscriber enumeration and privacy leakage (e.g. 'R***h N***').
    """
    if not name or not name.strip():
        return "Subscriber"
    words = name.strip().split()
    masked_words = []
    for w in words:
        if len(w) <= 2:
            masked_words.append(w[0] + "*")
        else:
            masked_words.append(w[0] + "*" * (len(w) - 2) + w[-1])
    return " ".join(masked_words)


@router.post("/subscribe", response_model=SubscribeResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def create_subscription(request: Request, req: SubscribeRequest):
    """
    Subscribes a traveler or resident to real-time alerts for an NH-7 segment.
    Validates E.164 phone or email, masks contact in logs, stores consent,
    and returns the newly created numeric subscription_id.
    """
    is_valid, normalized_contact, masked_contact = validate_and_normalize_contact(req.phone_or_email, req.channel)
    if not is_valid:
        raise HTTPException(
            status_code=422,
            detail="Invalid contact: must be a valid E.164 phone number (e.g. +919876543210) or a valid email address."
        )

    consent_bool = bool(req.consent)

    with get_db() as conn:
        cursor = conn.cursor()
        
        # Verify segment exists ('all' subscribes to every segment)
        if req.segment_id == ALL_SEGMENTS:
            segment = {"id": ALL_SEGMENTS, "name": ALL_SEGMENTS_NAME}
        else:
            cursor.execute("SELECT id, name FROM segments WHERE id = ?", (req.segment_id,))
            segment = cursor.fetchone()
        if not segment:
            raise HTTPException(
                status_code=404,
                detail=f"Segment '{req.segment_id}' does not exist on NH-7."
            )

        now_str = datetime.now(timezone.utc).isoformat()
        token = f"tok_{secrets.token_urlsafe(16)}"
        cursor.execute("""
            INSERT INTO subscriptions (name, phone_or_email, segment_id, channel, consent, token, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            req.name.strip(),
            normalized_contact,
            req.segment_id,
            req.channel,
            1 if consent_bool else 0,
            token,
            now_str
        ))
        sub_id = cursor.lastrowid

    # Masked logging: NEVER log full phone or email
    logger.info(f"New subscription registered: ID {sub_id} for {req.name} ({req.channel}) - contact: {masked_contact} on {segment['name']}")

    return SubscribeResponse(
        subscription_id=sub_id,
        token=token,
        status="Active",
        message=f"Successfully subscribed to alerts for '{segment['name']}' via {req.channel}.",
        subscription=SubscriptionDetail(
            id=sub_id,
            token=token,
            name=req.name.strip(),
            phone_or_email=masked_contact,
            segment_id=req.segment_id,
            segment_name=segment["name"],
            channel=req.channel,
            consent=consent_bool,
            created_at=now_str
        )
    )

@router.get("/alerts", response_model=AlertsResponse)
@limiter.limit("120/minute")
def get_alerts(
    request: Request,
    token: Optional[str] = Query(None, description="Random authorization token returned by /subscribe"),
    user_id: Optional[int] = Query(None, description="Numeric subscription_id returned by /subscribe"),
    simulate_rain_mm: Optional[float] = Query(None, description="Simulate rainfall in mm for demo testing"),
    lang: Optional[str] = Query("en", description="Language code: 'en' or 'hi' (default 'en')"),
    x_sub_token: Optional[str] = Header(None, alias="X-Subscription-Token")
):
    """
    Returns active alerts for a user's subscription.
    Requires the random authorization token generated during /subscribe
    (passed via query param 'token' or 'X-Subscription-Token' header)
    to prevent sequential user_id enumeration and unauthorized access.
    """
    if lang is not None and lang not in ("en", "hi"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language '{lang}'. Supported languages are 'en' and 'hi'."
        )
    if simulate_rain_mm is not None and (simulate_rain_mm < 0.0 or simulate_rain_mm > 1000.0):
        raise HTTPException(
            status_code=400,
            detail="simulate_rain_mm must be a positive number between 0.0 and 1000.0 mm."
        )

    auth_token = (token or x_sub_token or "").strip()

    if not auth_token and user_id is not None:
        raise HTTPException(
            status_code=401,
            detail="Access denied: /alerts?user_id=... requires the subscription token returned by POST /subscribe. Pass via query param 'token' or 'X-Subscription-Token' header."
        )

    sub = None
    if auth_token:
        with get_db() as conn:
            cursor = conn.cursor()
            # LEFT JOIN: whole-corridor subscriptions store segment_id = 'all'
            sub_query = """
                SELECT s.id, s.name, s.phone_or_email, s.channel, s.segment_id, s.token,
                       seg.name as segment_name, seg.risk_level, seg.risk_score
                FROM subscriptions s
                LEFT JOIN segments seg ON s.segment_id = seg.id
            """
            # Verify subscription using token (and optional user_id)
            if user_id is not None:
                cursor.execute(sub_query + " WHERE s.id = ?", (user_id,))
                sub = cursor.fetchone()
                if not sub:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Subscription ID '{user_id}' not found."
                    )
                if not sub["token"] or not secrets.compare_digest(sub["token"], auth_token):
                    raise HTTPException(
                        status_code=401,
                        detail="Invalid subscription token for this subscription ID."
                    )
            else:
                cursor.execute(sub_query + " WHERE s.token = ?", (auth_token,))
                sub = cursor.fetchone()
                if not sub:
                    raise HTTPException(
                        status_code=401,
                        detail="Invalid subscription token."
                    )

    # No token at all: public corridor feed (no subscriber data). The app's Alerts tab
    # calls /alerts before the user has subscribed; it used to receive the FIRST
    # subscriber's alerts here, which leaked another person's subscription.
    is_corridor = sub is None or sub["segment_id"] == ALL_SEGMENTS

    meta = {}
    live_map = {}
    try:
        from app.risk_service import get_live_risk_map_with_metadata
        live_segments, meta = get_live_risk_map_with_metadata(simulate_rain_mm=simulate_rain_mm)
        live_map = {s["id"]: s for s in live_segments}
    except Exception as e:
        logger.exception(f"get_live_risk_map in alerts failed ({e}); falling back to seeded database values")

    if is_corridor and not live_map:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, risk_level, risk_score FROM segments ORDER BY sequence_order ASC")
            live_map = {r["id"]: dict(r) for r in cursor.fetchall()}

    from app import i18n
    is_hi = (lang == "hi")
    now_str = datetime.now(timezone.utc).isoformat()
    channel = sub["channel"] if sub else "App"

    if is_corridor:
        targets = list(live_map.values())
    else:
        seg_live = live_map.get(sub["segment_id"]) or {
            "id": sub["segment_id"],
            "name": sub["segment_name"],
            "risk_level": sub["risk_level"],
            "risk_score": sub["risk_score"],
        }
        targets = [seg_live]

    alerts: List[AlertItem] = []
    for seg in targets:
        item = _build_alert_item(seg, channel=channel, issued_at=now_str, lang=lang or "en")
        if item:
            alerts.append(item)
    if is_corridor:
        level_rank = {"Low": 0, "Moderate": 1, "High": 2, "Very High": 3}
        alerts.sort(key=lambda a: (level_rank.get(a.severity_en or a.severity, 0), a.risk_score), reverse=True)

    if sub is None:
        subscriber_name = "Public corridor feed"
        sub_seg_en = f"{ALL_SEGMENTS} ({ALL_SEGMENTS_NAME})"
        sub_seg_display = sub_seg_en
    else:
        subscriber_name = mask_subscriber_name(sub["name"])
        seg_name = sub["segment_name"] or ALL_SEGMENTS_NAME
        sub_seg_en = f"{sub['segment_id']} ({seg_name})"
        if is_hi and not is_corridor:
            sub_seg_display = f"{sub['segment_id']} ({i18n.localize_segment_name(sub['segment_id'], seg_name, 'hi')})"
        else:
            sub_seg_display = sub_seg_en

    return AlertsResponse(
        user_id=sub["id"] if sub else 0,
        subscriber_name=subscriber_name,
        subscribed_segment=sub_seg_display,
        subscribed_segment_en=sub_seg_en if is_hi else None,
        active_alerts_count=len(alerts),
        alerts=alerts,
        weather_source=meta.get("weather_source"),
        weather_fetched_at=meta.get("weather_fetched_at"),
        weather_age_minutes=meta.get("weather_age_minutes"),
        is_simulated=meta.get("is_simulated", False),
        stale_warning=meta.get("stale_warning"),
        lang=lang or "en",
    )


@router.post("/admin/alert-all", response_model=AlertAllResponse)
def post_alert_all(req: AlertAllRequest, admin_key: str = Depends(verify_admin_key)):
    """
    Official broadcast ("Alert All" on the officials' dashboard): sends one message to every
    consenting subscriber of the stretch (and of 'all'), or to everyone for segment_id='all',
    through the same notifiers as automatic alerts. Every send is written to alert_log.
    With DRY_RUN=true (or missing channel credentials) messages are only printed and logged.
    """
    from app.notifiers import get_notifier

    with get_db() as conn:
        cursor = conn.cursor()
        if req.segment_id == ALL_SEGMENTS:
            seg_name = ALL_SEGMENTS_NAME
            cursor.execute("SELECT id, phone_or_email, channel FROM subscriptions WHERE consent = 1")
        else:
            cursor.execute("SELECT name FROM segments WHERE id = ?", (req.segment_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"Segment '{req.segment_id}' does not exist on NH-7.")
            seg_name = row["name"]
            cursor.execute(
                "SELECT id, phone_or_email, channel FROM subscriptions WHERE consent = 1 AND (segment_id = ? OR segment_id = ?)",
                (req.segment_id, ALL_SEGMENTS),
            )
        subs = cursor.fetchall()

    message = (req.message or "").strip()
    if not message:
        level, driver = None, None
        if req.segment_id != ALL_SEGMENTS:
            try:
                from app.risk_service import get_live_risk_map_with_metadata
                live, _ = get_live_risk_map_with_metadata()
                seg = next((s for s in live if s["id"] == req.segment_id), None)
                if seg:
                    level = seg.get("adjusted_risk_level") or seg.get("risk_level")
                    driver = (seg.get("node_escalation") or {}).get("reason") or seg.get("adjustment_reason")
            except Exception as e:
                logger.warning(f"alert-all: live risk lookup failed for {req.segment_id}: {e}")
        message = f"NH-7 OFFICIAL ALERT for {seg_name}" + (f" ({req.segment_id})" if req.segment_id != ALL_SEGMENTS else "")
        message += f": current risk {level.upper()}." if level else "."
        if driver:
            message += f" {driver}"
        message += " Follow BRO / SDRF / police instructions. Emergency: 112"

    sent = failed = 0
    channels: dict = {}
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        for s in subs:
            ch = s["channel"]
            try:
                ok = get_notifier(ch).send(recipient=s["phone_or_email"], message=message, channel=ch)
            except Exception as e:
                logger.error(f"alert-all: send failed for subscription #{s['id']}: {e}")
                ok = False
            cursor.execute("""
                INSERT INTO alert_log (subscription_id, segment_id, channel, contact, risk_level, message, sent_at, status)
                VALUES (?, ?, ?, ?, 'OFFICIAL BROADCAST', ?, ?, ?)
            """, (s["id"], req.segment_id, ch, s["phone_or_email"], message, now_iso, "sent" if ok else "failed"))
            if ok:
                sent += 1
                channels[ch.lower()] = channels.get(ch.lower(), 0) + 1
            else:
                failed += 1

    logger.info(f"Official alert-all on {req.segment_id}: {sent} sent, {failed} failed, {len(subs)} recipients")
    return AlertAllResponse(
        segment_id=req.segment_id,
        segment_name=seg_name,
        message=message,
        recipients=len(subs),
        sent=sent,
        failed=failed,
        channels=channels,
        dry_run=config.DRY_RUN,
    )


def _build_alert_item(seg: dict, channel: str, issued_at: str, lang: str) -> Optional[AlertItem]:
    """
    One alert for a segment at Moderate or above (Low gives none).
    Uses the ground-report adjusted level when reports escalated the segment.
    """
    from app import i18n
    is_hi = (lang == "hi")
    seg_id = seg["id"]
    seg_name = seg["name"]
    risk_level = seg.get("adjusted_risk_level") or seg.get("risk_level", "Low")
    risk_score = seg.get("risk_score", 0.0)
    rain_mm_3d = seg.get("rain_mm_3d")
    rain_status = seg.get("rain_status", "unavailable")
    main_driver = seg.get("main_driver")

    driver_text = f" Primary factor: {main_driver}." if main_driver else ""
    rain_text = f" (3-day rain: {rain_mm_3d} mm)" if rain_mm_3d is not None else ""

    # Generate active alerts based on the segment's live hazard profile
    if risk_level in ("Very High", "High"):
        suffix = "01"
        msg_en = (
            f"HIGH ALERT on {seg_name}: Geological instability & active rockfall hazard{rain_text}.{driver_text} "
            "Road clearance readiness advised. Travel with extreme caution or check official closure advisories."
        )
    elif risk_level == "Moderate":
        suffix = "02"
        msg_en = (
            f"ADVISORY on {seg_name}: Moderate slope wetness and slippery road conditions{rain_text}.{driver_text} "
            "Speed limits enforced near drainage outlets."
        )
    else:
        return None

    msg = i18n.build_subscriber_alert_message(
        segment_name=seg_name,
        risk_level=risk_level,
        rain_mm=rain_mm_3d,
        main_driver=main_driver,
        lang=lang
    )
    return AlertItem(
        alert_id=f"ALT-NH7-{seg_id.upper()}-{suffix}",
        segment_id=seg_id,
        segment_name=i18n.localize_segment_name(seg_id, seg_name, "hi") if is_hi else seg_name,
        segment_name_en=seg_name if is_hi else None,
        severity=i18n.localize_risk_level(risk_level, "hi") if is_hi else risk_level,
        severity_en=risk_level if is_hi else None,
        risk_score=risk_score,
        risk_index=risk_score,
        message=msg,
        message_en=msg_en if is_hi else None,
        channel=channel,
        issued_at=issued_at,
        rain_mm_3d=rain_mm_3d,
        rain_status=rain_status,
        main_driver=i18n.localize_main_driver(main_driver, "hi") if is_hi else main_driver,
        main_driver_en=main_driver if is_hi else None,
    )
