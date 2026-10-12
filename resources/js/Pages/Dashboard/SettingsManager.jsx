import React, { useState } from 'react';
import UserRoleManager from './UserRoleManager';
import PositionManager from './PositionManager';

// Same tint helper the dashboard menu uses for its hover / selected states.
function hexToRgba(hex, alpha) {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Mix a hex color toward white (amount 0–1) for the gradient's light end.
function lighten(hex, amount) {
    const clean = hex.replace('#', '');
    const mix = (i) => {
        const v = parseInt(clean.substring(i, i + 2), 16);
        return Math.round(v + (255 - v) * amount);
    };
    return `rgb(${mix(0)}, ${mix(2)}, ${mix(4)})`;
}

// App-style icon: rounded square with a gradient and a white glyph,
// matching the look of the dashboard menu icons (e.g. Services).
function AppIcon({ id, color, glyph }) {
    return (
        <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.18))' }}>
            <defs>
                <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={lighten(color, 0.35)} />
                    <stop offset="100%" stopColor={color} />
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#grad-${id})`} />
            {glyph(color)}
        </svg>
    );
}

const GLYPHS = {
    // Shield with a check mark
    user_roles: (c) => (
        <>
            <path d="M32 13 L47 18.5 V32 C47 41.5 40.5 47.5 32 51.5 C23.5 47.5 17 41.5 17 32 V18.5 Z" fill="#fff" />
            <path d="M24.5 32 L30 37.5 L40 26" fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </>
    ),
    // Briefcase
    positions: (c) => (
        <>
            <path d="M25 24 V21 A3 3 0 0 1 28 18 H36 A3 3 0 0 1 39 21 V24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
            <rect x="15" y="24" width="34" height="23" rx="4.5" fill="#fff" />
            <path d="M15 34 H49" stroke={c} strokeWidth="2.5" opacity="0.55" />
            <rect x="28.5" y="31" width="7" height="6" rx="1.5" fill={c} />
        </>
    ),
    // Gear
    reserved_1: (c) => (
        <>
            {[0, 45, 90, 135].map((deg) => (
                <rect key={deg} x="29" y="13" width="6" height="38" rx="2.5" fill="#fff" transform={`rotate(${deg} 32 32)`} />
            ))}
            <circle cx="32" cy="32" r="13" fill="#fff" />
            <circle cx="32" cy="32" r="5.5" fill={c} />
        </>
    ),
};

// Left-column buttons. The last one is a placeholder reserved for a future
// settings module: add a `component` to it and it goes live.
const SETTING_MODULES = [
    { id: 'user_roles', label: 'User Role', color: '#8A5CC7', component: UserRoleManager },
    { id: 'positions', label: 'Position', color: '#3B82C4', component: PositionManager },
    { id: 'reserved_1', label: 'Reserved', color: '#1F9D6B', component: null },
];

export default function SettingsManager() {
    // Nothing selected on open: the right column stays empty until a
    // setting module button is clicked / touched.
    const [selectedId, setSelectedId] = useState(null);
    const [hoveredId, setHoveredId] = useState(null);

    const selected = SETTING_MODULES.find((m) => m.id === selectedId) || null;
    const ActiveComponent = selected?.component || null;

    return (
        <div className="w-full min-h-[calc(100vh-6rem)] bg-gray-50 flex gap-4 p-2 sm:p-4">
            {/* ── LEFT COLUMN: icon tiles (same style as the dashboard menu) ── */}
            <div className="shrink-0 w-[112px] bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex flex-col gap-3 self-start">
                {SETTING_MODULES.map((mod) => {
                    const isSelected = mod.id === selectedId;
                    const isHovered = mod.id === hoveredId;
                    const tintAlpha = isSelected ? 0.16 : isHovered ? 0.09 : 0;
                    return (
                        <button
                            key={mod.id}
                            type="button"
                            onClick={() => setSelectedId(mod.id)}
                            onMouseEnter={() => setHoveredId(mod.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            aria-label={mod.label}
                            aria-pressed={isSelected}
                            className="flex flex-col items-center justify-center gap-2 rounded-2xl py-4 px-2 transition-colors"
                            style={{ backgroundColor: hexToRgba(mod.color, tintAlpha) }}
                        >
                            <AppIcon id={mod.id} color={mod.color} glyph={GLYPHS[mod.id]} />
                            <span className="text-xs font-medium text-neutral-800 text-center leading-tight">
                                {mod.label}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* ── RIGHT COLUMN: module display area ── */}
            <div className="flex-1 min-w-0">
                {!selected && (
                    <div className="h-[70vh] min-h-[500px] bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center p-8 text-gray-400">
                        <div className="text-5xl mb-3">⚙️</div>
                        <h3 className="text-base font-bold text-gray-700">System Settings</h3>
                        <p className="text-xs max-w-sm mt-1.5 leading-relaxed">
                            Select a setting on the left to open its module here.
                        </p>
                    </div>
                )}

                {selected && ActiveComponent && <ActiveComponent key={selected.id} />}

                {selected && !ActiveComponent && (
                    <div className="h-[70vh] min-h-[500px] bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center p-8 text-gray-400">
                        <div className="mb-3">
                            <AppIcon id={`${selected.id}-lg`} color={selected.color} glyph={GLYPHS[selected.id]} />
                        </div>
                        <h3 className="text-base font-bold text-gray-700">{selected.label}</h3>
                        <p className="text-xs max-w-sm mt-1.5 leading-relaxed">
                            This button is reserved for a future settings module.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
