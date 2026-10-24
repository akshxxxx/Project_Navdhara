import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CircleAlert,
  CircleCheck,
  Crosshair,
  ImagePlus,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Send,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { api, ApiError, connectionHelp, photoSrc } from '@/api/client';
import { useCorridor, useFieldReports } from '@/api/hooks';
import { KEYS, readJson, writeJson } from '@/api/storage';
import type { FieldReport } from '@/api/types';
import { CorridorMap } from '@/components/CorridorMap';
import { Disclaimer, Loading, Notice } from '@/components/ui';
import { CORRIDOR_KM, nearestTown } from '@/domain/corridor';
import { locateOnRoad, midpoint, pointAtKm } from '@/domain/geo';
import { prepareReportPhoto, type ReportPhoto } from '@/domain/photo';
import { encodeDescription, MAX_DESCRIPTION, parseDescription, REPORT_TYPES, type ReportType } from '@/domain/reports';
import type { LatLng, Stretch } from '@/domain/stretch';
import { relativeStamp } from '@/domain/time';

/** Reports farther than this from NH-7 are refused by the backend */
const GEOFENCE_KM = 3;

interface Spot {
  point: LatLng;
  km: number;
  town: string;
  offRoadKm: number;
  source: 'gps' | 'map' | 'stretch' | 'km';
}

export function ReportsPage() {
  const [sent, setSent] = useState<{ id: number; note: string | null } | null>(null);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Report a problem on the road</h1>
          <p className="lede">Tell other travellers what you see. Officials check every report before it changes the map.</p>
        </div>
      </div>

      <div className="notice error" style={{ alignItems: 'center', marginBottom: 24 }}>
        <CircleAlert size={24} aria-hidden style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, color: 'var(--ink)' }}>
          <strong style={{ color: '#7D1527' }}>Someone hurt or in danger?</strong> Call 112 first. Report later.
        </span>
        <a href="tel:112" className="btn btn-danger btn-sm">
          Call 112
        </a>
      </div>

      <div className="layout-side" style={{ '--side': '560px' } as React.CSSProperties}>
        <SendReport onSent={(id, note) => setSent({ id, note })} />
        <aside className="stack">
          <div className="card card-pad">
            <h3>What happens to your report</h3>
            <ol className="steps">
              <li>
                <span className="step-num">1</span>
                <span>
                  <strong>Pending.</strong> Everyone can see it in Recent reports straight away.
                </span>
              </li>
              <li>
                <span className="step-num">2</span>
                <span>
                  <strong>Checked by officials.</strong> They mark it Verified or Rejected.
                </span>
              </li>
              <li>
                <span className="step-num">3</span>
                <span>
                  <strong>Verified reports raise the stretch's risk</strong> by one level on the map, fading over about
                  two days. Rejected reports change nothing.
                </span>
              </li>
            </ol>
          </div>
          <RecentReports sent={sent} />
        </aside>
      </div>
    </div>
  );
}

function SendReport({ onSent }: { onSent: (id: number, note: string | null) => void }) {
  const { corridor } = useCorridor();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [type, setType] = useState<ReportType | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [kmText, setKmText] = useState('');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [photo, setPhoto] = useState<ReportPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stretches = useMemo(() => corridor?.stretches ?? [], [corridor]);

  const spotFromStretch = (s: Stretch): Spot => {
    const point = midpoint(s);
    const pos = locateOnRoad(point, [s]);
    const km = pos?.km ?? (s.kmStart + s.kmEnd) / 2;
    return { point, km, town: nearestTown(km).name, offRoadKm: 0, source: 'stretch' };
  };

  // "Report a problem" from a stretch pre-fills the place, once the map data is in
  const preset = params.get('stretch');
  const presetKey = preset && corridor ? preset : null;
  const [seenPreset, setSeenPreset] = useState<string | null>(null);
  if (presetKey !== seenPreset) {
    setSeenPreset(presetKey);
    const s = presetKey ? corridor?.byId[presetKey] : null;
    if (s) {
      const sp = spotFromStretch(s);
      setSpot(sp);
      setKmText(String(Math.round(sp.km)));
    }
  }

  // The object URL of a preview photo is released when it is replaced or the page closes
  useEffect(() => () => (photo ? URL.revokeObjectURL(photo.url) : undefined), [photo]);

  const locateMe = () => {
    setLocError(null);
    if (!('geolocation' in navigator)) {
      setLocError('This browser cannot share your location. Tap the road on the map instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const point: LatLng = [pos.coords.latitude, pos.coords.longitude];
        const road = locateOnRoad(point, stretches);
        if (!road) {
          setLocError('Could not place you on NH-7. Tap the road on the map instead.');
          return;
        }
        setKmText(String(Math.round(road.km)));
        setSpot({ point, km: road.km, town: road.town, offRoadKm: road.offRoadKm, source: 'gps' });
      },
      (err) => {
        setLocating(false);
        setLocError(
          err.code === err.PERMISSION_DENIED
            ? 'Location is blocked for this site. Allow it in the browser, or tap the road on the map.'
            : 'Could not get your location. Tap the road on the map instead.',
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const tapMap = (p: LatLng) => {
    const road = locateOnRoad(p, stretches);
    if (!road) return;
    if (road.offRoadKm > GEOFENCE_KM) {
      setLocError('That is too far from NH-7. Click on or next to the coloured road.');
      return;
    }
    setLocError(null);
    // The report is placed on the road itself, at the nearest point to the click
    const s = stretches.find((x) => x.id === road.stretchId);
    const onRoad = (s && pointAtKm(road.km, [s])) ?? p;
    setKmText(String(Math.round(road.km)));
    setSpot({ point: onRoad, km: road.km, town: road.town, offRoadKm: 0, source: 'map' });
  };

  const applyKm = (value: string) => {
    setKmText(value);
    const km = Number(value.replace(',', '.'));
    if (!value.trim() || Number.isNaN(km)) return;
    if (km < 0 || km > CORRIDOR_KM) {
      setLocError(`NH-7 runs from km 0 (Rishikesh) to km ${Math.floor(CORRIDOR_KM)} (Joshimath).`);
      return;
    }
    const point = pointAtKm(km, stretches);
    if (point) {
      setLocError(null);
      setSpot({ point, km, town: nearestTown(km).name, offRoadKm: 0, source: 'km' });
    }
  };

  const addPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      setPhoto(await prepareReportPhoto(file));
    } catch (e) {
      const why = e instanceof Error ? e.message : '';
      setPhotoError(
        why === 'not-image'
          ? 'That file is not a photo. Choose a JPEG or PNG picture.'
          : why === 'too-big'
            ? 'That photo is too large even after shrinking. Choose another one.'
            : 'Could not add the photo. Try again.',
      );
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const tooFar = spot != null && spot.offRoadKm > GEOFENCE_KM;
  const textOk = text.trim().length >= 5;
  const nameOk = name.trim().length === 0 || name.trim().length >= 2;
  const ready = !!type && !!spot && !tooFar && textOk && nameOk && consent;
  const missing = [
    !type && 'what you saw',
    !spot && 'where it is',
    !textOk && 'a short description (5+ letters)',
    !nameOk && 'a name of 2+ letters, or none',
    !consent && 'your agreement to share',
  ].filter(Boolean) as string[];

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || !type || !spot) return;
    setSending(true);
    setSendError(null);
    try {
      // The photo goes first; its URL then travels with the report
      let photoUrl: string | undefined;
      let note: string | null = null;
      if (photo) {
        try {
          photoUrl = (await api.uploadPhoto(photo.blob)).photo_url;
        } catch (err) {
          const pe = err instanceof ApiError ? err : null;
          if (pe && (pe.status === 404 || pe.status === 405)) note = 'Sent without the photo: this server does not take photos yet.';
          else if (pe && (pe.status === 413 || pe.status === 415)) note = 'Sent without the photo: the photo could not be used.';
          else throw err;
        }
      }
      const res = await api.sendReport({
        lat: spot.point[0],
        lng: spot.point[1],
        description: encodeDescription(type, spot.km, text),
        reporter_name: name.trim() || 'Traveller',
        ...(photoUrl ? { photo_url: photoUrl } : null),
      });
      const mine = readJson<number[]>(KEYS.myReports) ?? [];
      writeJson(KEYS.myReports, [res.report_id, ...mine].slice(0, 50));
      await queryClient.invalidateQueries({ queryKey: ['field-reports'] });
      setType(null);
      setText('');
      setConsent(false);
      setPhoto(null);
      onSent(res.report_id, note);
    } catch (err) {
      const ae = err instanceof ApiError ? err : null;
      if (!ae || ae.status === 0) setSendError(`${connectionHelp(err)} Your report is still here: send it again when you have signal.`);
      else if (ae.status === 409) setSendError('You already reported this place in the last 10 minutes. Thank you, one report is enough.');
      else if (ae.status === 429) setSendError('Too many reports from this network in the last minute. Wait a minute and send again.');
      else if (ae.status === 422)
        setSendError(
          ae.detail?.includes('3.0 km')
            ? 'This place is more than 3 km from NH-7. Reports must be on or next to the road.'
            : ae.detail || 'Please check the report and try again.',
        );
      else setSendError(ae.detail || 'The report could not be sent. Try again.');
    } finally {
      setSending(false);
    }
  };

  const spotTitle = spot ? `Near ${spot.town}, km ${Math.round(spot.km)}` : null;
  const spotSub = spot
    ? spot.source === 'gps'
      ? tooFar
        ? `your GPS · ${spot.offRoadKm.toFixed(1)} km from NH-7`
        : 'your GPS · on NH-7'
      : spot.source === 'km'
        ? 'from the km you typed'
        : spot.source === 'map'
          ? 'on NH-7'
          : 'middle of the stretch'
    : null;

  return (
    <form className="card card-pad" onSubmit={send} aria-label="Send a report" noValidate>
      <h2 style={{ fontSize: 30 }}>Send a report</h2>

      <h3 className="q" id="q-type">
        1. What did you see?
      </h3>
      <div className="type-grid" role="radiogroup" aria-labelledby="q-type">
        {REPORT_TYPES.map((rt) => {
          const Icon = rt.icon;
          return (
            <button
              key={rt.id}
              type="button"
              role="radio"
              aria-checked={type?.id === rt.id}
              className="type-tile"
              onClick={() => setType(rt)}
            >
              <Icon size={24} strokeWidth={1.8} aria-hidden />
              {rt.label}
            </button>
          );
        })}
      </div>

      <h3 className="q">2. Where is it?</h3>
      <div className="row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" className="btn btn-outline" onClick={locateMe} disabled={locating}>
          {locating ? <LoaderCircle size={20} className="spin" aria-hidden /> : <Crosshair size={20} aria-hidden />}
          Use my location
        </button>
        <span className="muted">or click the road on the map</span>
      </div>
      {corridor ? (
        <CorridorMap
          className="report-map"
          stretches={stretches}
          onMapClick={tapMap}
          markers={spot ? { spot: spot.point } : undefined}
          focusIds={spot ? stretches.filter((s) => spot.km >= s.kmStart && spot.km <= s.kmEnd).map((s) => s.id) : null}
          focusKey={spot ? `${spot.source}-${Math.round(spot.km)}` : 'all'}
          controls="compact"
        >
          <div className="map-overlay-top">
            <div className="spot-chip">
              {spot && !tooFar ? (
                <>
                  <Check size={18} color="var(--green)" aria-hidden />
                  <strong>{spotTitle}</strong>
                  <span className="muted small">· {spotSub}</span>
                </>
              ) : spot ? (
                <>
                  <TriangleAlert size={18} color="var(--red)" aria-hidden />
                  <strong>{spotTitle}</strong>
                  <span className="small" style={{ color: 'var(--red)' }}>
                    · {spotSub}
                  </span>
                </>
              ) : (
                <>
                  <MapPin size={18} aria-hidden />
                  <span className="muted">Not set yet</span>
                </>
              )}
            </div>
          </div>
        </CorridorMap>
      ) : (
        <Loading>Loading the map…</Loading>
      )}
      {locError ? (
        <div style={{ marginTop: 12 }}>
          <Notice tone="warn" title={locError} />
        </div>
      ) : null}
      {tooFar ? (
        <div style={{ marginTop: 12 }}>
          <Notice tone="error" title="Too far from NH-7">
            Reports must be within 3 km of the road. Click the road on the map if you are reporting for someone else.
          </Notice>
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 18, alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ width: 200 }}>
          <label className="field-label" htmlFor="km">
            NH-7 km <span className="opt">(if you know)</span>
          </label>
          <input
            id="km"
            className="input"
            inputMode="decimal"
            placeholder="e.g. 114"
            maxLength={6}
            value={kmText}
            onChange={(e) => applyKm(e.target.value)}
          />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label className="field-label" htmlFor="name">
            Your name <span className="opt">(optional)</span>
          </label>
          <input
            id="name"
            className="input"
            placeholder="e.g. Ravi, taxi driver"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>

      <h3 className="q">
        <label htmlFor="desc">3. What is happening?</label>
      </h3>
      <textarea
        id="desc"
        className="textarea"
        placeholder="For example: small stones falling on the uphill side near the bend. One lane is open."
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_DESCRIPTION))}
      />
      <p className="small muted" style={{ textAlign: 'right', marginTop: 4 }}>
        {text.length} / {MAX_DESCRIPTION}
      </p>

      <h3 className="q" style={{ marginTop: 8 }}>
        Add a photo <span className="opt muted" style={{ fontWeight: 400 }}>(optional)</span>
      </h3>
      {photo ? (
        <div className="photo-preview">
          <img src={photo.url} alt="Photo for this report" />
          <button type="button" aria-label="Remove the photo" onClick={() => setPhoto(null)}>
            <X size={20} />
          </button>
        </div>
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/*"
            capture="environment"
            className="sr-only"
            id="photo"
            onChange={(e) => addPhoto(e.target.files?.[0])}
          />
          <label htmlFor="photo" className="btn btn-outline" style={{ cursor: 'pointer' }}>
            {photoBusy ? <LoaderCircle size={20} className="spin" aria-hidden /> : <ImagePlus size={20} aria-hidden />}
            Choose or take a photo
          </label>
        </>
      )}
      {photoError ? (
        <div style={{ marginTop: 8 }}>
          <Notice tone="warn" title={photoError} />
        </div>
      ) : null}
      <p className="small muted" style={{ marginTop: 6 }}>
        Officials see the photo. Location details inside the photo file are removed before it is sent.
      </p>

      <label className="checkbox-row" style={{ marginTop: 22 }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>I agree to share this report, its place and the name above to help keep NH-7 safe.</span>
      </label>

      {sendError ? (
        <div style={{ marginTop: 16 }}>
          <Notice tone="error" icon={TriangleAlert} title="Not sent">
            {sendError}
          </Notice>
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 22, flexWrap: 'wrap', gap: 16 }}>
        <button type="submit" className="btn btn-primary" disabled={!ready || sending} style={{ minHeight: 54 }}>
          {sending ? <LoaderCircle size={20} className="spin" aria-hidden /> : <Send size={20} aria-hidden />}
          Send report
        </button>
        <span className="small muted" style={{ flex: 1, minWidth: 220 }}>
          {!ready && missing.length
            ? `Still needed: ${missing.join(', ')}.`
            : 'Reports must be within 3 km of NH-7. One report per place every 10 minutes.'}
        </span>
      </div>
      <p className="small muted" style={{ marginTop: 16 }}>
        Report only what you see yourself. Stop safely before you type.{' '}
        <Link to="/emergency" style={{ color: 'var(--red)', fontWeight: 600 }}>
          Emergency help
        </Link>
      </p>
    </form>
  );
}

function RecentReports({ sent }: { sent: { id: number; note: string | null } | null }) {
  const reports = useFieldReports();
  const { corridor } = useCorridor();
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(8);
  const mine = useMemo(() => readJson<number[]>(KEYS.myReports) ?? [], [sent]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(
    () =>
      (reports.data ?? [])
        .map((r) => ({ r, p: parseDescription(r.description) }))
        .filter(({ p }) => filter === 'all' || p.type.id === filter)
        .sort((a, b) => b.r.id - a.r.id),
    [reports.data, filter],
  );

  const place = (r: FieldReport, km: number | null) => {
    if (km != null) return `${nearestTown(km).name}, km ${Math.round(km)}`;
    const pos = corridor ? locateOnRoad([r.lat, r.lng], corridor.stretches) : null;
    return pos ? `${pos.town}, km ${Math.round(pos.km)}` : `${r.lat.toFixed(3)}, ${r.lng.toFixed(3)}`;
  };

  return (
    <div className="card card-pad">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ margin: 0 }}>Recent reports</h3>
        <span className="small muted">Newest first</span>
      </div>

      {sent ? (
        <div className="stack" style={{ gap: 10, marginBottom: 14 }}>
          <Notice tone="ok" icon={CircleCheck} title="Report sent. Thank you!">
            It is Pending until officials check it. If verified, the stretch's risk goes up on the map.
          </Notice>
          {sent.note ? <Notice tone="warn" title={sent.note} /> : null}
        </div>
      ) : null}

      <div className="chips" style={{ marginBottom: 16 }} role="tablist" aria-label="Filter reports">
        {[{ id: 'all', label: 'All' }, ...REPORT_TYPES].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={filter === t.id}
            className={`chip ${filter === t.id ? 'active' : ''}`}
            onClick={() => setFilter(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {reports.isPending ? <Loading>Loading reports…</Loading> : null}
      {reports.isError ? (
        <Notice
          tone="error"
          title="Could not load reports"
          action={
            <button type="button" className="btn btn-outline btn-sm" onClick={() => reports.refetch()}>
              <RefreshCw size={16} aria-hidden /> Try again
            </button>
          }
        >
          {connectionHelp(reports.error)}
        </Notice>
      ) : null}
      {reports.data && !items.length ? (
        <p className="muted">{filter === 'all' ? 'No reports yet.' : 'No reports of this type yet.'}</p>
      ) : null}

      <div className="stack" style={{ gap: 12 }}>
        {items.slice(0, limit).map(({ r, p }) => {
          const isMine = mine.includes(r.id);
          const status = r.status === 'verified' ? 'verified' : r.status === 'rejected' ? 'rejected' : 'pending';
          return (
            <article key={r.id} className={`report-card ${isMine && r.id === sent?.id ? 'mine' : ''}`}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <strong style={{ flex: 1 }}>
                  {p.type.label} · {place(r, p.km)}
                </strong>
                <span className={`status ${status}`}>{status}</span>
              </div>
              <p style={{ marginTop: 6 }}>{p.text}</p>
              {r.photo_url ? (
                <img className="report-photo" src={photoSrc(r.photo_url)} alt={`Photo with the ${p.type.label} report`} loading="lazy" />
              ) : null}
              <p className="small muted" style={{ marginTop: 8 }}>
                {relativeStamp(r.created_at)} · {isMine ? <strong style={{ color: 'var(--teal)' }}>your report</strong> : r.reporter_name}
                {status === 'rejected' ? ' · could not be confirmed' : ''}
              </p>
            </article>
          );
        })}
      </div>
      {items.length > limit ? (
        <button type="button" className="show-more" style={{ marginTop: 14 }} onClick={() => setLimit((n) => n + 10)}>
          Show older reports ({items.length - limit} more)
        </button>
      ) : null}
      <Disclaimer>Reports are what travellers saw. Only verified ones change the map.</Disclaimer>
    </div>
  );
}
