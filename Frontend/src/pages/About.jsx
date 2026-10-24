import React from 'react';
import { Link } from 'react-router-dom';
import {
  Map, Activity, AlertCircle, Shield, Mountain, CloudRain, Droplets, Waves,
  Ban, Megaphone, Radio, Info,
} from 'lucide-react';

const SectionTitle = ({ children }) => (
  <h2 className="font-condensed text-[24px] font-semibold mb-4 text-ink flex items-center gap-2">
    <div className="w-1.5 h-6 bg-river rounded-full" />
    {children}
  </h2>
);

const Card = ({ icon: Icon, title, children, to }) => {
  const body = (
    <div className="bg-snow border border-mist p-5 rounded-md shadow-sm flex flex-col gap-2 h-full hover:border-river transition-colors">
      <div className="w-10 h-10 bg-river-tint rounded-full flex items-center justify-center">
        <Icon className="w-5 h-5 text-river" />
      </div>
      <h3 className="font-condensed text-lg font-semibold text-ink">{title}</h3>
      <p className="text-granite text-sm leading-relaxed">{children}</p>
    </div>
  );
  return to ? <Link to={to} className="block h-full">{body}</Link> : body;
};

const Step = ({ n, title, children }) => (
  <li className="flex gap-3">
    <span className="w-7 h-7 shrink-0 rounded-full bg-river text-white font-condensed font-bold flex items-center justify-center">{n}</span>
    <div>
      <div className="font-semibold text-ink">{title}</div>
      <div className="text-sm text-granite">{children}</div>
    </div>
  </li>
);

export const About = () => {
  return (
    <div className="flex-1 w-full max-w-[960px] mx-auto p-4 lg:p-8 font-sans pb-24">
      <div className="mb-10">
        <h1 className="font-condensed text-[34px] md:text-[40px] leading-tight font-semibold mb-3 text-ink">How the Raah console works</h1>
        <p className="text-lg text-granite max-w-3xl">
          Raah is the NH-7 control-room console for officials (Rishikesh to Joshimath, 247 km, 18 stretches).
          It brings terrain risk, rainfall, slope-sensor nodes, field reports and official closures into one
          view, and lets you act on them: verify reports, declare closures and alert subscribers.
        </p>
      </div>

      <section className="mb-12">
        <SectionTitle>What feeds the risk level of a stretch</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card icon={Mountain} title="Terrain model">
            A Random Forest trained on the 309 road-blocking landslides mapped on NH-7 after the 2022 monsoon
            (Mey et al., 2024), using 30 m elevation data. It ranks how landslide-prone each stretch is.
            Held-out AUC 0.664: a useful ranking, not a prediction.
          </Card>
          <Card icon={CloudRain} title="Rainfall">
            3-day rainfall (past and forecast) from Open-Meteo, combined with the terrain rank by a labelled,
            uncalibrated rule. In dry weather (15 mm or less over 3 days) a stretch cannot go above Moderate.
          </Card>
          <Card icon={Activity} title="Slope-sensor nodes" to="/sensors">
            A WARNING raises the stretch to at least High; an ALARM makes it Very High and the trip planner says AVOID.
            A node that goes silent after an alert keeps its stretch escalated (SENSOR LOST) until an official
            confirms the site has been checked.
          </Card>
          <Card icon={AlertCircle} title="Verified field reports" to="/report">
            Reports from patrols and the public count only after an official verifies them. A recent verified
            report can raise a stretch by one level; its weight halves every 48 hours.
          </Card>
          <Card icon={Ban} title="Official closures" to="/admin">
            A closure declared on the Admin page always wins: any trip through a closed stretch says AVOID,
            and one-way or restricted stretches say CAUTION.
          </Card>
          <Card icon={Map} title="Levels">
            Low, Moderate (score ≥ 0.25), High (≥ 0.50), Very High (≥ 0.75), or Closed. The Map, Plan trip,
            Alerts and Sensors pages all show the same level from the backend.
          </Card>
        </div>
      </section>

      <section className="mb-12">
        <SectionTitle>The slope-sensor node (Raah Node)</SectionTitle>
        <div className="bg-snow border border-mist rounded-md p-5 shadow-sm">
          <p className="text-sm text-granite mb-4">
            An ESP32 beside the road reads four sensors, decides one of four states (OK, WATCH, WARNING, ALARM)
            and reports every second over Wi-Fi.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex gap-2"><Mountain className="w-4 h-4 text-river shrink-0 mt-0.5" /><span><strong className="text-ink">Tilt and tilt rate</strong> (MPU6050): WATCH from 2°, WARNING from 5° or 3°/min, ALARM from 8° or 8°/min. The only sensor that can raise an ALARM.</span></div>
            <div className="flex gap-2"><Waves className="w-4 h-4 text-river shrink-0 mt-0.5" /><span><strong className="text-ink">Vibration</strong> (MPU6050): WARNING at 0.10 g RMS or a knock of 0.35 g or more. Never an ALARM on its own: passing trucks shake the road too.</span></div>
            <div className="flex gap-2"><Droplets className="w-4 h-4 text-river shrink-0 mt-0.5" /><span><strong className="text-ink">Soil moisture</strong> (LM393 probe): WATCH from 50%; at 70% or more the soil counts as saturated: WARNING, and the tilt thresholds drop to 60%. Never an ALARM on its own.</span></div>
            <div className="flex gap-2"><CloudRain className="w-4 h-4 text-river shrink-0 mt-0.5" /><span><strong className="text-ink">Rain plate</strong>: rain on the plate raises the node to at least WATCH.</span></div>
          </div>
          <ol className="mt-5 space-y-3">
            <Step n="1" title="Node raises ALARM">The reading reaches the backend in about a second.</Step>
            <Step n="2" title="The whole console reacts">The stretch turns Very High on the map, the trip planner says AVOID, and a red pill appears in the header of every page.</Step>
            <Step n="3" title="Subscribers are alerted once">One Telegram/SMS message per incident, timed on the laptop clock in the Incidents table.</Step>
            <Step n="4" title="If the node goes silent">After 15 seconds it shows SENSOR LOST and the alert is held. Release it on the Sensors page once the site has been checked.</Step>
          </ol>
          <p className="text-xs text-granite mt-4">Thresholds are bench-calibrated defaults. Mock, replayed and simulated nodes are labelled on every screen; simulated nodes never raise a stretch.</p>
        </div>
      </section>

      <section className="mb-12">
        <SectionTitle>A shift in the control room</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ol className="bg-snow border border-mist rounded-md p-5 shadow-sm space-y-3">
            <Step n="1" title="Watch the corridor"><Link to="/" className="text-river underline">Map</Link> and <Link to="/alerts" className="text-river underline">Alerts</Link> for stretch levels; <Link to="/sensors" className="text-river underline">Sensors</Link> for live node readings.</Step>
            <Step n="2" title="Verify reports"><Link to="/report" className="text-river underline">Reports</Link> or the Admin page: Verify or Reject each pending report.</Step>
            <Step n="3" title="Close or restrict a stretch">Admin → Closures. Lift it again with Reopen.</Step>
          </ol>
          <ol start="4" className="bg-snow border border-mist rounded-md p-5 shadow-sm space-y-3">
            <Step n="4" title="Alert subscribers">"Alert All" on a stretch on the Map, or Admin → Broadcast for a custom message or the whole corridor.</Step>
            <Step n="5" title="Pre-position crews">Admin → BRO Priority ranks stretches by hazard × consequence (hospital distance, detours, traffic).</Step>
            <Step n="6" title="Check a route">Plan trip shows the risk at the hour each stretch is reached and safer departure windows.</Step>
          </ol>
        </div>
      </section>

      <section className="mb-12">
        <SectionTitle>Limits you should state when using it</SectionTitle>
        <ul className="bg-snow border border-mist rounded-md p-5 shadow-sm text-sm text-granite space-y-2 list-disc pl-9">
          <li>Raah is a decision-support prototype, not an official warning. Low risk does not mean safe; landslides also happen in dry weather.</li>
          <li>The terrain model has moderate skill (held-out AUC 0.664) and is trained on one season of landslides.</li>
          <li>The rainfall rule and its weights are demonstration values, not fitted to closure records.</li>
          <li>Sensor thresholds are bench-calibrated; one node covers its own slope, not a whole stretch.</li>
          <li>Alerts go only to subscribers who gave consent. In test mode (DRY_RUN) they are logged, not delivered.</li>
        </ul>
      </section>

      <section className="bg-ink text-white p-6 md:p-8 rounded-md shadow-pop flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Shield className="w-10 h-10 text-river-tint shrink-0" />
          <div>
            <div className="font-condensed text-2xl font-semibold">Emergency: 112</div>
            <div className="text-sm opacity-80 flex items-center gap-1"><Info className="w-4 h-4" /> Follow BRO, SDRF and police instructions on the ground.</div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/" className="inline-flex items-center gap-2 bg-river hover:bg-white hover:text-ink px-5 py-3 rounded-md font-condensed font-bold transition-colors"><Map className="w-4 h-4" /> Map</Link>
          <Link to="/sensors" className="inline-flex items-center gap-2 bg-white/10 hover:bg-white hover:text-ink px-5 py-3 rounded-md font-condensed font-bold transition-colors"><Radio className="w-4 h-4" /> Sensors</Link>
          <Link to="/admin" className="inline-flex items-center gap-2 bg-white/10 hover:bg-white hover:text-ink px-5 py-3 rounded-md font-condensed font-bold transition-colors"><Megaphone className="w-4 h-4" /> Admin</Link>
        </div>
      </section>
    </div>
  );
};
