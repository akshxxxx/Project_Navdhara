import { Check, CloudOff, Crosshair, LoaderCircle, Phone } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useCorridor, useOfflinePack } from '@/api/hooks';
import { Disclaimer, Loading, Notice } from '@/components/ui';
import { locateOnRoad } from '@/domain/geo';
import { HELPLINES, HELPLINES_CHECKED } from '@/domain/helplines';
import { hospitalList, hospitalName } from '@/domain/hospitals';
import { whenLabel } from '@/domain/time';

export function EmergencyPage() {
  const pack = useOfflinePack();
  const { corridor } = useCorridor();
  const [mine, setMine] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);

  // Verified numbers live in the site (domain/helplines.ts); a number the backend sends for the same line wins
  const fromServer = (pack.data?.data.emergency_contacts ?? []).filter((c) => c.number.trim() && c.number.trim() !== '112');
  const lines = HELPLINES.map((h) => {
    const server = fromServer.find((c) => h.match.test(c.name));
    return { ...h, number: server?.number.trim() || h.number };
  });

  const rows = useMemo(
    () => (pack.data ? hospitalList(pack.data.data, corridor?.stretches) : []),
    [pack.data, corridor],
  );
  const ordered = mine ? [...rows.filter((r) => r.segment_id === mine), ...rows.filter((r) => r.segment_id !== mine)] : rows;
  const source = pack.data?.source;
  const savedAt = whenLabel(pack.data?.savedAt);

  const findMine = () => {
    setLocNote(null);
    if (!('geolocation' in navigator) || !corridor) {
      setLocNote('This browser cannot share your location. Find your stretch in the list.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const road = locateOnRoad([pos.coords.latitude, pos.coords.longitude], corridor.stretches);
        if (!road) {
          setLocNote('Could not place you on NH-7. Find your stretch in the list.');
          return;
        }
        if (road.offRoadKm > 10)
          setLocNote(`You are ${Math.round(road.offRoadKm)} km from NH-7. Showing the nearest stretch anyway.`);
        setMine(road.stretchId);
      },
      () => {
        setLocating(false);
        setLocNote('Could not get your location. Find your stretch in the list.');
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  };

  return (
    <div className="page">
      <section className="hero-112" aria-labelledby="call-112-title">
        <div>
          <div className="eyebrow">Emergency on NH-7?</div>
          <div className="big" id="call-112-title">
            Call 112
          </div>
          <p style={{ fontSize: 19, maxWidth: 560 }}>
            Police, ambulance, fire and disaster response. Free, 24 × 7, from any phone, even without balance.
          </p>
          <a className="call-big" href="tel:112">
            <Phone size={36} strokeWidth={2.3} aria-hidden /> Call 112 now
          </a>
        </div>
        <div className="tell-box">
          <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 700 }}>When they answer, tell them</h3>
          <ol>
            <li>
              <strong>Where you are:</strong> NH-7, the nearest town, and the km stone if you can see one.
            </li>
            <li>
              <strong>What happened:</strong> landslide, accident, vehicle stuck, road gone.
            </li>
            <li>
              <strong>How many people</strong> are hurt or trapped.
            </li>
            <li>Your phone number. Keep the line free after the call.</li>
          </ol>
        </div>
      </section>

      <h2 className="section-title">Other helplines</h2>
      <div className="helpline-grid">
        {lines.map((c) => (
          <div key={c.name} className="card helpline">
            <span className="name">{c.name}</span>
            <span className="muted">{c.use}</span>
            {c.number ? (
              <>
                <a className="number-btn" href={`tel:${c.number.replace(/[^\d+]/g, '')}`} aria-label={`Call ${c.name}, ${c.number}`}>
                  <Phone size={18} aria-hidden /> {c.number}
                </a>
                {c.alt ? (
                  <a className="small strong" style={{ color: 'var(--teal)', marginTop: 6 }} href={`tel:${c.alt.replace(/[^\d+]/g, '')}`}>
                    Landline {c.alt}
                  </a>
                ) : null}
              </>
            ) : (
              <span className="unconfirmed" title="Number not confirmed yet">
                [number to confirm]
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        Numbers checked on {HELPLINES_CHECKED} with USDMA, NHM Uttarakhand and NHAI. A number is left blank rather than
        guessed.
      </p>

      <div className="layout-side" style={{ marginTop: 28, '--side': '560px' } as React.CSSProperties}>
        <div className="card card-pad">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 30 }}>Hospitals along NH-7</h2>
            {source === 'live' ? (
              <span className="offline-badge">
                <Check size={16} aria-hidden /> Saved for offline use{savedAt ? ` · updated ${savedAt}` : ''}
              </span>
            ) : source === 'saved' ? (
              <span className="offline-badge warn">
                <CloudOff size={16} aria-hidden /> Offline copy{savedAt ? ` from ${savedAt}` : ''}
              </span>
            ) : source === 'demo' ? (
              <span className="offline-badge warn">
                <CloudOff size={16} aria-hidden /> Sample list, not checked today
              </span>
            ) : null}
          </div>
          <p className="muted" style={{ margin: '8px 0 16px' }}>
            Nearest hospital to each stretch, Rishikesh to Joshimath. Distance is from the road.
          </p>
          <div className="row" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={findMine} disabled={locating}>
              {locating ? <LoaderCircle size={18} className="spin" aria-hidden /> : <Crosshair size={18} aria-hidden />}
              Find my stretch
            </button>
            {mine ? <span className="small muted">Your stretch is at the top, highlighted.</span> : null}
          </div>
          {locNote ? (
            <div style={{ marginBottom: 12 }}>
              <Notice tone="warn" title={locNote} />
            </div>
          ) : null}
          {pack.isPending ? (
            <Loading>Loading hospitals…</Loading>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Hospital</th>
                  <th scope="col">Nearest to stretch</th>
                  <th scope="col" className="num">
                    From road
                  </th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((h) => (
                  <tr key={h.segment_id} className={h.segment_id === mine ? 'mine' : undefined}>
                    <td className="strong">{hospitalName(h.hospital_name)}</td>
                    <td className="muted">{h.segment_name}</td>
                    <td className="num">{h.distance_km != null ? `${h.distance_km.toFixed(1)} km` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside className="stack">
          <div className="card card-pad">
            <h3>Call 112 straight away if</h3>
            <ul className="bullets">
              <li>someone is hurt, trapped or missing;</li>
              <li>a vehicle is hit or buried by rocks or mud;</li>
              <li>the road has collapsed with people close by;</li>
              <li>you see fire or leaking fuel.</li>
            </ul>
            <p className="muted" style={{ marginTop: 10 }}>
              For anything else, send a report from the Reports page.
            </p>
          </div>
          <div className="card card-pad">
            <h3>If a landslide happens near you</h3>
            <ul className="bullets">
              <li>Move away from its path, sideways, never downhill.</li>
              <li>Do not drive or walk across fresh debris.</li>
              <li>Keep away from streams and the river: water can surge.</li>
              <li>Listen for rumbling or cracking and warn people behind you.</li>
              <li>Follow BRO, SDRF and police instructions.</li>
            </ul>
          </div>
          <div className="card card-pad">
            <h3>If the road is blocked</h3>
            <p>
              Stop well back from the debris, away from the slope. Turn back to the last town if you can, and wait for BRO
              or police to clear it. Do not try to drive over rubble.
            </p>
          </div>
          <Disclaimer>
            The hospital list is saved in this browser after your first visit, so it still shows with a weak signal. Raah
            is not an emergency service; always call 112.
          </Disclaimer>
        </aside>
      </div>
    </div>
  );
}
