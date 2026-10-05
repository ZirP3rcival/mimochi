import { Users, CalendarCheck2, UserCheck, PackageCheck } from 'lucide-react';

// ---------------------------------------------------------------------------
// Mock data. Swap these for real values by passing a `data` prop shaped the
// same way, e.g. <DashboardOverview data={usePage().props.dashboard} />
// ---------------------------------------------------------------------------
const MOCK_STATS = [
  { id: 'clients', label: 'Total clients', value: '1,485', icon: Users, color: '#f606aa' },
  { id: 'schedules', label: 'Active schedules', value: '512', icon: CalendarCheck2, color: '#3B82C4' },
  { id: 'staff', label: 'Available staff', value: '89', icon: UserCheck, color: '#C4762F' },
  { id: 'packages', label: 'Active packages', value: '210', icon: PackageCheck, color: '#8A5CC7' },
];

const MOCK_SCHEDULE = [
  { client: 'Emily Johnson', service: 'Consultation', staff: 'Dr. Michael R.', time: '09:00 AM', status: 'Confirmed' },
  { client: 'Mark Davis', service: 'Follow-up Exam', staff: 'Sarah L., NP', time: '10:15 AM', status: 'Confirmed' },
  { client: 'Sarah Wilson', service: 'Therapy Session', staff: 'Dr. A. Khan', time: '11:30 AM', status: 'Pending' },
  { client: 'Robert Brown', service: 'Group Fitness', staff: 'Jessica T.', time: '01:00 PM', status: 'In progress' },
  { client: 'Lisa White', service: 'Initial Assessment', staff: 'Dr. E. Green', time: '02:30 PM', status: 'Confirmed' },
];

const MOCK_STAFF_LOAD = [
  { name: 'Dr. Michael R.', appointments: 4 },
  { name: 'Sarah L., NP', appointments: 5 },
  { name: 'Dr. A. Khan', appointments: 3 },
  { name: 'Jessica T.', appointments: 6 },
];

const MOCK_TREND = [22, 18, 30, 24, 15, 19, 28, 35, 26, 20, 32, 45, 38, 24, 18, 26, 33, 40, 35, 22, 16, 24, 30, 38, 44, 30, 20, 28, 42, 36];

// Each panel gets its own accent so the dashboard doesn't read as one flat
// white surface. Body = a light wash of the color; header = a stronger,
// visibly darker wash of the same color (see PanelHeader below).
const PANEL_COLORS = {
  schedule: '#3B82C4',
  staffLoad: '#8A5CC7',
  trend: '#D6416B',
};

const STATUS_STYLES = {
  Confirmed: { bg: '#E7F7EF', fg: '#1F9D6B' },
  Pending: { bg: '#FDF3E3', fg: '#C4762F' },
  'In progress': { bg: '#FDE9EF', fg: '#D6416B' },
};

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function StatCard({ stat }) {
  const Icon = stat.icon;
  return (
    <div
      className="flex items-center gap-3 rounded-xl border p-4"
      style={{ backgroundColor: hexToRgba(stat.color, 0.07), borderColor: hexToRgba(stat.color, 0.18) }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: hexToRgba(stat.color, 0.22) }}
      >
        <Icon className="h-5 w-5" style={{ color: stat.color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{stat.label}</p>
        <p className="mt-0.5 text-2xl font-semibold text-neutral-900">{stat.value}</p>
      </div>
    </div>
  );
}

// A panel's header sits at a stronger tint of the panel's own accent color
// than the panel body does, so the header always reads visibly darker.
function PanelHeader({ color, children, right = null }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{ backgroundColor: hexToRgba(color, 0.22), borderBottom: `1px solid ${hexToRgba(color, 0.16)}` }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
        {children}
      </p>
      {right}
    </div>
  );
}

function TrendChart({ points, color = '#D6416B' }) {
  const width = 640;
  const height = 180;
  const padding = 24;
  const max = Math.max(...points);
  const min = 0;
  const stepX = (width - padding * 2) / (points.length - 1);

  const coords = points.map((v, i) => {
    const x = padding + i * stepX;
    const y = height - padding - ((v - min) / (max - min || 1)) * (height - padding * 2);
    return [x, y];
  });

  const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${coords[coords.length - 1][0].toFixed(1)},${height - padding} L${coords[0][0].toFixed(1)},${height - padding} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={t}
          x1={padding}
          x2={width - padding}
          y1={padding + t * (height - padding * 2)}
          y2={padding + t * (height - padding * 2)}
          stroke="#F1F1F1"
          strokeWidth="1"
        />
      ))}
      <path d={areaPath} fill="url(#trendFill)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.5" fill={color} />
      ))}
    </svg>
  );
}

export default function DashboardOverview({ data }) {
  const stats = data?.stats ?? MOCK_STATS;
  const schedule = data?.schedule ?? MOCK_SCHEDULE;
  const staffLoad = data?.staffLoad ?? MOCK_STAFF_LOAD;
  const trend = data?.trend ?? MOCK_TREND;

  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="p-4 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Overview dashboard</h2>
        <p className="text-sm text-neutral-400">{today}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <StatCard key={stat.id} stat={stat} />
        ))}
      </div>

      {/* Schedule + staff workload */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div
          className="xl:col-span-2 rounded-xl border overflow-hidden"
          style={{ backgroundColor: hexToRgba(PANEL_COLORS.schedule, 0.05), borderColor: hexToRgba(PANEL_COLORS.schedule, 0.18) }}
        >
          <PanelHeader color={PANEL_COLORS.schedule}>Current client schedule / appointments</PanelHeader>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left text-xs text-neutral-500"
                  style={{ backgroundColor: hexToRgba(PANEL_COLORS.schedule, 0.09), borderBottom: `1px solid ${hexToRgba(PANEL_COLORS.schedule, 0.14)}` }}
                >
                  <th className="px-4 py-2 font-medium">Client name</th>
                  <th className="px-4 py-2 font-medium">Service</th>
                  <th className="px-4 py-2 font-medium">Staff member</th>
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((row, i) => {
                  const badge = STATUS_STYLES[row.status] ?? { bg: '#F1F1F1', fg: '#6B7280' };
                  return (
                    <tr
                      key={i}
                      className="last:border-0 transition-colors"
                      style={{ borderBottom: `1px solid ${hexToRgba(PANEL_COLORS.schedule, 0.08)}` }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = hexToRgba(PANEL_COLORS.schedule, 0.06))}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td className="px-4 py-2.5 font-medium text-neutral-800 whitespace-nowrap">{row.client}</td>
                      <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">{row.service}</td>
                      <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">{row.staff}</td>
                      <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">{row.time}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                          style={{ backgroundColor: badge.bg, color: badge.fg }}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3" style={{ borderTop: `1px solid ${hexToRgba(PANEL_COLORS.schedule, 0.14)}` }}>
            <button
              type="button"
              className="text-sm font-medium rounded-lg px-3 py-1.5 text-white transition-colors"
              style={{ backgroundColor: PANEL_COLORS.schedule }}
            >
              View all schedules
            </button>
          </div>
        </div>

        <div
          className="rounded-xl border overflow-hidden"
          style={{ backgroundColor: hexToRgba(PANEL_COLORS.staffLoad, 0.05), borderColor: hexToRgba(PANEL_COLORS.staffLoad, 0.18) }}
        >
          <PanelHeader color={PANEL_COLORS.staffLoad}>Current staff workload</PanelHeader>
          <div>
            {staffLoad.map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: i < staffLoad.length - 1 ? `1px solid ${hexToRgba(PANEL_COLORS.staffLoad, 0.08)}` : 'none' }}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-sm font-semibold"
                  style={{ backgroundColor: PANEL_COLORS.staffLoad }}
                >
                  {s.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-800 truncate">{s.name}</p>
                  <p className="text-xs text-neutral-400">{s.appointments} appointments today</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trend chart */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: hexToRgba(PANEL_COLORS.trend, 0.05), borderColor: hexToRgba(PANEL_COLORS.trend, 0.18) }}
      >
        <PanelHeader color={PANEL_COLORS.trend}>Daily schedule trend (month view)</PanelHeader>
        <div className="p-4">
          <TrendChart points={trend} color={PANEL_COLORS.trend} />
        </div>
      </div>
    </div>
  );
}
