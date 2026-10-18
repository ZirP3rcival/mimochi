import { useForm, Head } from '@inertiajs/react';
import { useEffect, useRef, useState, useCallback } from 'react';

const PINK = 'rgb(240 136 176)';
const MAROON = '#9d2b5b';

/* ------------------------------------------------------------------ */
/* Clock: shows the SYSTEM (device) date/time in the user's own        */
/* timezone, counted with the browser's monotonic timer so that later  */
/* PC clock edits don't move it. It watches for two kinds of change:   */
/*  - a sudden jump of the system clock while the page is open         */
/*  - system time (or timezone) that disagrees with the server         */
/* When online, the server time is used to verify/correct the display. */
/* ------------------------------------------------------------------ */
const DRIFT_LIMIT_MS = 30000; // device vs server difference tolerated
const JUMP_LIMIT_MS = 2000;   // system-clock jump tolerated between ticks

function utcOffset(tz, date) {
    try {
        return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
            .formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? null;
    } catch (_) { return null; }
}

function useServerClock() {
    const deviceTz = useRef(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const base = useRef({ epoch: Date.now(), perf: performance.now(), verified: false });
    const last = useRef({ dev: Date.now(), perf: performance.now() });
    const flags = useRef({ driftMs: 0, jumped: false, tzMismatch: false, serverTz: null });

    const read = () => ({
        date: new Date(base.current.epoch + (performance.now() - base.current.perf)),
        tz: deviceTz.current,
        verified: base.current.verified,
        ...flags.current,
    });
    const [now, setNow] = useState(read);

    const sync = useCallback(async () => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        try {
            const t0 = performance.now();
            const res = await fetch('/dtr/time', { cache: 'no-store', headers: { Accept: 'application/json' } });
            if (!res.ok) throw new Error('sync failed');
            const j = await res.json();
            const t1 = performance.now();
            const serverEpoch = j.epoch_ms + (t1 - t0) / 2;

            const driftMs = Math.abs(serverEpoch - Date.now());
            flags.current.driftMs = driftMs;
            flags.current.serverTz = j.timezone;
            flags.current.tzMismatch =
                utcOffset(deviceTz.current, new Date(serverEpoch)) !== utcOffset(j.timezone, new Date(serverEpoch));
            // device agrees with the server again -> clear the "jumped" flag
            if (driftMs <= DRIFT_LIMIT_MS) flags.current.jumped = false;

            base.current = { epoch: serverEpoch, perf: t1, verified: true };
            setNow(read());
        } catch (_) {
            /* offline / server unreachable: keep counting from the current base */
        }
    }, []);

    useEffect(() => {
        sync();
        const resync = setInterval(sync, 30000);
        const onVis = () => document.visibilityState === 'visible' && sync();
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('online', sync);

        const tick = setInterval(() => {
            // detect the system clock being changed while the page is open
            const dev = Date.now();
            const p = performance.now();
            const jump = (dev - last.current.dev) - (p - last.current.perf);
            last.current = { dev, perf: p };
            if (Math.abs(jump) > JUMP_LIMIT_MS) {
                flags.current.jumped = true;
                sync();
            }
            setNow(read());
        }, 250);

        return () => {
            clearInterval(resync);
            clearInterval(tick);
            document.removeEventListener('visibilitychange', onVis);
            window.removeEventListener('online', sync);
        };
    }, [sync]);

    return now;
}

function getCsrf() {
    const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
}

/* ------------------------------ Icons ------------------------------ */
const IconIn = () => (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
);
const IconOut = () => (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
);
const IconCancel = () => (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
);
const IconCam = () => (
    <svg viewBox="0 0 24 24" className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
    </svg>
);

/* ------------------------- DTR module (right) ---------------------- */
function DtrModule() {
    const clock = useServerClock();
    const videoRef = useRef(null);
    const streamRef = useRef(null);

    const [staff, setStaff] = useState([]);
    const [staffId, setStaffId] = useState('');
    const [camReady, setCamReady] = useState(false);
    const [camError, setCamError] = useState('');
    const [status, setStatus] = useState({ time_in: null, time_out: null });
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null); // { type: 'ok' | 'err', text }

    // staff list from DB
    useEffect(() => {
        fetch('/dtr/staff', { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then(setStaff)
            .catch(() => setMsg({ type: 'err', text: 'Could not load staff list.' }));
    }, []);

    const stopCamera = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setCamReady(false);
    }, []);

    // open camera when a staff name is selected
    useEffect(() => {
        setMsg(null);
        setCamError('');
        if (!staffId) {
            stopCamera();
            setStatus({ time_in: null, time_out: null });
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera needs HTTPS or localhost.');
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
                    audio: false,
                });
                if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play().catch(() => {});
                }
                setCamReady(true);
            } catch (e) {
                setCamError(e?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access and select the name again.' : (e?.message || 'Camera not available.'));
            }
        })();

        fetch(`/dtr/status?staff_id=${staffId}`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json()).then(setStatus).catch(() => {});

        return () => { cancelled = true; };
    }, [staffId, stopCamera]);

    useEffect(() => stopCamera, [stopCamera]);

    // Reset the whole DTR module: staff, camera, status, messages
    function resetModule() {
        stopCamera();
        setStaffId('');
        setStatus({ time_in: null, time_out: null });
        setCamError('');
        setMsg(null);
        setBusy(false);
    }

    function captureBlob() {
        const v = videoRef.current;
        const c = document.createElement('canvas');
        c.width = v.videoWidth || 640;
        c.height = v.videoHeight || 480;
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.85));
    }

    async function punch(kind) {
        if (!staffId || !camReady || busy) return;
        setBusy(true);
        setMsg(null);
        try {
            const blob = await captureBlob();
            const fd = new FormData();
            fd.append('staff_id', staffId);
            fd.append('image', blob, `${kind}.jpg`);

            const res = await fetch(kind === 'in' ? '/dtr/time-in' : '/dtr/time-out', {
                method: 'POST',
                headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCsrf() },
                body: fd,
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j.message || Object.values(j.errors || {})[0]?.[0] || 'Request failed.');

            const who = staff.find((s) => String(s.id) === String(staffId))?.name;
            setMsg({ type: 'ok', text: `${who}: ${j.message}` });
            setStatus((s) => ({ ...s, ...(kind === 'in' ? { time_in: j.time_in } : { time_out: j.time_out }) }));
            // clear selection + close camera shortly after a successful punch
            setTimeout(resetModule, 3500);
        } catch (e) {
            setMsg({ type: 'err', text: e.message });
        } finally {
            setBusy(false);
        }
    }

    const tz = clock?.tz;
    const fmt = (opts) => clock ? new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).format(clock.date) : '';
    const dateText = fmt({ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeFull = fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    const [timeText, timePeriod] = timeFull ? timeFull.split(' ') : ['', ''];

    // Date/time integrity notice
    let clockWarning = '';
    if (clock) {
        const off = clock.driftMs > DRIFT_LIMIT_MS;
        const mins = Math.max(1, Math.round(clock.driftMs / 60000));
        if (off) {
            clockWarning = `This device's date/time is off by about ${mins} min. Showing the verified time; please correct the system clock.`;
        } else if (clock.jumped) {
            clockWarning = 'A system date/time change was detected. Showing the last trusted time until it can be verified online.';
        } else if (clock.tzMismatch) {
            clockWarning = `This device's timezone (${clock.tz}) differs from the server (${clock.serverTz}).`;
        }
    }

    const canIn = staffId && camReady && !busy && !status.time_in;
    const canOut = staffId && camReady && !busy && status.time_in && !status.time_out;

    return (
        <div className="w-full flex flex-col bg-white shadow-md px-5 sm:px-8 py-5 lg:py-[clamp(0.75rem,2.5vh,2rem)] lg:h-full lg:max-h-[820px]" style={{ borderRadius: '30px' }}>
            <h2 className="text-center text-sm sm:text-base lg:text-[clamp(0.85rem,2.2vh,1.125rem)] font-semibold tracking-wide text-gray-800">
                DAILY TIME RECORD MODULE
            </h2>

            {/* Server date / time */}
            <div className="text-center mt-3 lg:mt-[clamp(0.25rem,1.5vh,1rem)] select-none" aria-live="off">
                <div className="text-lg sm:text-2xl lg:text-[clamp(1rem,3vh,1.5rem)] font-medium" style={{ color: MAROON }}>{dateText || '\u00A0'}</div>
                <div className="mt-1 whitespace-nowrap tabular-nums font-bold leading-none" style={{ color: PINK, minHeight: '1em' }}>
                    <span className="text-4xl sm:text-5xl lg:text-[clamp(1.75rem,7vh,3rem)]">{timeText || '--:--:--'}</span>
                    <span className="text-lg sm:text-2xl lg:text-[clamp(1rem,3vh,1.5rem)] ml-2">{timePeriod}</span>
                </div>
            </div>

            {clockWarning && (
                <div role="alert" className="mt-2 rounded-md bg-amber-50 text-amber-800 text-xs lg:text-[clamp(0.65rem,1.6vh,0.875rem)] px-3 py-1.5 text-center">
                    {clockWarning}
                </div>
            )}

            {/* Staff dropdown */}
            <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                aria-label="Staff name"
                className="mt-3 lg:mt-[clamp(0.5rem,1.5vh,1rem)] w-full rounded-md border border-gray-300 bg-white px-3 py-2 lg:py-[clamp(0.4rem,1.2vh,0.625rem)] outline-none focus:ring-2 focus:ring-[rgb(240,136,176)] focus:border-[rgb(240,136,176)] transition"
            >
                <option value="">Select staff name</option>
                {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                ))}
            </select>

            {/* Camera (left, vertical) + action buttons (right) */}
            <div className="mt-3 lg:mt-[clamp(0.5rem,1.5vh,1rem)] flex gap-3 items-stretch lg:flex-1 lg:min-h-0">
                <div className="relative w-[45%] lg:w-auto lg:h-full lg:max-w-[50%] shrink-0 aspect-[3/4] rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center">
                    <video
                        ref={videoRef}
                        muted
                        playsInline
                        className={`absolute inset-0 w-full h-full object-cover ${camReady ? '' : 'hidden'}`}
                        style={{ transform: 'scaleX(-1)' }}
                    />
                    {!camReady && (
                        <div className="flex flex-col items-center gap-2 px-3 text-center text-gray-400">
                            <IconCam />
                            <span className="text-xs sm:text-sm">
                                {camError || (staffId ? 'Starting camera…' : 'Select your name to open the camera')}
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col gap-2 lg:gap-[clamp(0.4rem,1.2vh,0.75rem)] lg:min-h-0">
                    <button
                        type="button"
                        onClick={() => punch('in')}
                        disabled={!canIn}
                        className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1 rounded-xl text-white text-sm font-semibold tracking-wide bg-emerald-500 hover:bg-emerald-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <IconIn /> TIME IN
                    </button>
                    <button
                        type="button"
                        onClick={() => punch('out')}
                        disabled={!canOut}
                        className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1 rounded-xl text-white text-sm font-semibold tracking-wide bg-rose-500 hover:bg-rose-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <IconOut /> TIME OUT
                    </button>
                    <button
                        type="button"
                        onClick={resetModule}
                        disabled={!staffId}
                        className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1 rounded-xl text-white text-sm font-semibold tracking-wide bg-orange-500 hover:bg-orange-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <IconCancel /> CANCEL
                    </button>
                </div>
            </div>

            {staffId && (status.time_in || status.time_out) && (
                <p className="mt-2 text-center text-xs text-gray-500">
                    Today: {status.time_in ? `In ${status.time_in}` : ''}{status.time_out ? ` · Out ${status.time_out}` : ''}
                </p>
            )}

            {msg && (
                <div
                    role="status"
                    className={`mt-2 rounded-md px-3 py-1.5 text-xs sm:text-sm text-center ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}
                >
                    {msg.text}
                </div>
            )}
        </div>
    );
}

/* ----------------------------- Page ----------------------------- */
export default function Login() {
    const { data, setData, post, processing, errors, reset } = useForm({
        username: '',
        password: '',
    });

    function submit(e) {
        e.preventDefault();
        post('/login', { onFinish: () => reset('password') });
    }

    return (
        <div className="relative w-full min-h-[100dvh] lg:h-[100dvh] lg:overflow-hidden flex items-center justify-center bg-gray-100 px-4 py-6 lg:py-3 isolate">
            <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: "url('/images/carnation.jpg')", opacity: 0.6 }}
            />
            <Head title="Log in" />

            {/* Two columns, centered; stacks on small screens */}
            <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-center justify-items-center lg:h-full">

                {/* LEFT: login form */}
                <div className="w-full max-w-md">
                    <div className="flex justify-center mb-6">
                        <img
                            src="/images/logo.jpg"
                            alt="Mimochi Logo"
                            className="w-[5rem] h-[5rem] -my-2 object-contain shrink-0"
                            style={{ borderRadius: '40px' }}
                        />
                    </div>

                    <div className="w-full bg-white shadow-md px-6 py-8 sm:px-10 sm:py-10" style={{ borderRadius: '30px' }}>
                        <form onSubmit={submit} noValidate>
                            <div className="mb-5">
                                <label htmlFor="username" className="block text-sm text-gray-700 mb-2">Username :</label>
                                <input
                                    id="username"
                                    type="text"
                                    autoComplete="username"
                                    value={data.username}
                                    onChange={(e) => setData('username', e.target.value)}
                                    className="w-full rounded-md border border-gray-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-[rgb(240,136,176)] focus:border-[rgb(240,136,176)] transition"
                                />
                                {errors.username && (
                                    <div className="mt-2 text-sm text-red-600" role="alert">{errors.username}</div>
                                )}
                            </div>

                            <div className="mb-6">
                                <label htmlFor="password" className="block text-sm text-gray-700 mb-2">Password :</label>
                                <input
                                    id="password"
                                    type="password"
                                    autoComplete="current-password"
                                    value={data.password}
                                    onChange={(e) => setData('password', e.target.value)}
                                    className="w-full rounded-md border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[rgb(240,136,176)] focus:border-[rgb(240,136,176)] transition"
                                />
                                {errors.password && <p className="mt-2 text-sm text-red-600">{errors.password}</p>}
                            </div>

                            <div className="flex justify-end">
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className="text-white text-sm font-semibold tracking-wide uppercase px-6 py-2.5 rounded-md transition disabled:opacity-60 disabled:cursor-not-allowed"
                                    style={{ backgroundColor: PINK }}
                                >
                                    Log in
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                {/* RIGHT: DTR module */}
                <div className="w-full max-w-md lg:max-w-lg lg:h-full flex items-center justify-center">
                    <DtrModule />
                </div>
            </div>
        </div>
    );
}
