import { useState, useRef, useEffect } from 'react';
import { Menu, MousePointerClick, LogOut, User, ChevronDown  } from 'lucide-react'; 
import { Link } from '@inertiajs/react'; 
import ClientManager from './ClientManager'; 
import StaffManager from './StaffManager';
import DashboardOverview from './DashboardOverview';
import SalesManager from './SalesManager';
import { usePage } from '@inertiajs/react';

const MODULES = [
  { id: 'dashboard', label: 'Dashboard', iconPath: '/icons/dashboard.png', color: '#f606aa' },
  { id: 'clients', label: 'Clients', iconPath: '/icons/clients.png', color: '#1109e7' },
  { id: 'scheduling', label: 'Scheduling', iconPath: '/icons/scheduling.png', color: '#3B82C4' },
  { id: 'sales', label: 'Services', iconPath: '/icons/services.png', color: '#1F9D6B' },
  { id: 'inventory', label: 'Inventory', iconPath: '/icons/inventory.png', color: '#C4762F' },
  { id: 'vouchers', label: 'Vouchers', iconPath: '/icons/vouchers.png', color: '#8A5CC7' },
  { id: 'expenses', label: 'Expenses', iconPath: '/icons/expenses.png', color: '#C4562F' },
  { id: 'reports', label: 'Reports', iconPath: '/icons/reports.png', color: '#2F9AA6' },
  { id: 'payroll', label: 'Payroll', iconPath: '/icons/payroll.png', color: '#4f9054' },
  { id: 'users', label: 'Users', iconPath: '/icons/users.png', color: '#044a58' },
  { id: 'settings', label: 'Settings', iconPath: '/icons/settings.png', color: '#3c0448' },
];

// FIX: the `${...}` placeholders were escaped with a leading backslash
// (\${r}), which stops template-literal interpolation. The function was
// returning the literal string "rgba(${r}, ${g}, ${b}, ${alpha})" — not a
// real color — so the browser silently dropped it and every hover/selected
// tint rendered as nothing.
function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function Watermark() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
    >
      <div className="flex flex-col items-center opacity-[0.06] translate-y-4">
        <svg width="260" height="220" viewBox="0 0 260 220" fill="none">
          <path
            d="M130 40 C 90 10, 30 40, 40 100 C 10 120, 20 180, 70 190 C 80 210, 130 210, 130 190"
            stroke="#D6416B"
            strokeWidth="6"
            fill="none"
          />
          <path
            d="M130 40 C 170 10, 230 40, 220 100 C 250 120, 240 180, 190 190 C 180 210, 130 210, 130 190"
            stroke="#D6416B"
            strokeWidth="6"
            fill="none"
          />
        </svg>
        <span className="mt-4 text-[64px] font-semibold tracking-widest text-neutral-900">
          MIMOCHI
        </span>
        <span className="text-sm tracking-[0.5em] text-neutral-900 -mt-1">
          BEAUTY AND WELLNESS CENTER
        </span>
      </div>
    </div>
  );
}

export default function DashboardAdmin({ staff }) { 
  const [selectedId, setSelectedId] = useState('dashboard'); // Defaulting to clients module for easier local workspace access
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [hoveredId, setHoveredId] = useState(null);
  const selectedModule = MODULES.find((m) => m.id === selectedId) || null;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  function handleSelect(id) {
    setSelectedId(id);
    setSidebarOpen(false);
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-white overflow-hidden font-sans">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #ffffff; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #D6416B; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #c2325c; }
      `}</style>

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 shrink-0 h-[68px] w-full">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? 'Collapse menu' : 'Expand menu'}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <Menu size={20} />
          </button>
          
          <div className="flex items-center gap-3">
            <img 
              src="/images/logo.jpg" 
              alt="Mimochi Logo" 
              className="w-10 h-10 object-contain shrink-0" 
            />
            <h1 className="text-lg font-bold tracking-wide text-neutral-900 hidden sm:block">
              Mimochi System v1.0
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-gray-500 font-medium text-sm whitespace-nowrap hidden xs:block">
            {staff?.staff_name}
          </span>

          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-1.5 p-1.5 rounded-full hover:bg-neutral-100 transition focus:outline-none focus:ring-2 focus:ring-neutral-200"
              aria-haspopup="true"
              aria-expanded={dropdownOpen}
            >
              <div className="w-8 h-8 rounded-full bg-gray-800 text-white flex items-center justify-center font-semibold text-sm shrink-0 shadow-sm">
                {staff?.staff_name ? staff.staff_name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
              </div>
              {/* FIX: same escaped-template-literal bug — the rotate-180
                  class was never actually being applied when open. */}
              <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-neutral-200 rounded-xl shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="px-4 py-2 border-b border-neutral-100 xs:hidden">
                  <p className="text-sm font-semibold text-neutral-800 truncate">{staff?.staff_name}</p>
                  <p className="text-xs text-neutral-400 capitalize">{staff?.role || 'Admin'}</p>
                </div>

                <Link
                  href="/profile" 
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition w-full text-left"
                >
                  <User className="w-4 h-4 text-neutral-500" />
                  <span>My Account</span>
                </Link>

                <hr className="border-neutral-100 my-1" />

                <Link
                  href="/logout"
                  method="post"
                  as="button"
                  replace={true}
                  onSuccess={() => {
                    window.location.href = '/login';
                  }}
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition w-full text-left font-medium"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log out</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body Layout */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div
          className="shrink-0 border-r border-neutral-200 bg-white overflow-y-auto custom-scrollbar transition-[width] duration-200 ease-out"
          style={{ width: sidebarOpen ? 340 : 76 }}
        >
          {sidebarOpen ? (
            <div className="p-5">
              <p className="text-xs font-semibold tracking-wide text-orange-600 mb-4">SYSTEM MENU</p>
              <div className="grid grid-cols-2 gap-3">
                {MODULES.map((mod) => {
                  const isSelected = mod.id === selectedId;
                  const isHovered = mod.id === hoveredId;
                  const tintAlpha = isSelected ? 0.16 : isHovered ? 0.09 : 0;
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => handleSelect(mod.id)}
                      onMouseEnter={() => setHoveredId(mod.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className="flex flex-col items-center justify-center gap-2 rounded-2xl py-5 px-3 transition-colors"
                      style={{ backgroundColor: hexToRgba(mod.color, tintAlpha) }}
                    >
                      <img src={mod.iconPath} className="w-14 h-14 object-contain" alt={mod.label} />
                      <span className="text-sm font-medium text-neutral-800">{mod.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="py-4 flex flex-col items-center gap-2">
              {MODULES.map((mod) => {
                const isSelected = mod.id === selectedId;
                const isHovered = mod.id === hoveredId;
                return (
                  <div key={mod.id} className="relative">
                    <button
                      type="button"
                      onClick={() => handleSelect(mod.id)}
                      onMouseEnter={() => setHoveredId(mod.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      aria-label={mod.label}
                      title={mod.label}
                      className="w-12 h-12 rounded-xl flex items-center justify-center transition-colors"
                      style={{
                        backgroundColor: isSelected ? hexToRgba(mod.color, 0.16) : isHovered ? hexToRgba(mod.color, 0.09) : 'transparent',
                      }}
                    >
                      <img src={mod.iconPath} className="w-8 h-8 object-contain" alt="" />
                    </button>
                    {isHovered && (
                       /* FIX: tooltip used to be a hardcoded pink for every
                          module regardless of its own color. It now uses
                          that module's own accent color at full opacity —
                          same hue as the hover tint above, just solid so
                          the white label text stays legible. */
                       <div
                         className="absolute left-full top-1/2 -translate-y-1/2 ml-4 whitespace-nowrap text-white text-xs font-medium px-3 py-1.5 rounded-md z-50 shadow-md"
                         style={{ backgroundColor: mod.color }}
                       >
                        {mod.label}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right side content */}
        <div
          className="relative flex-1 min-w-0 overflow-y-auto p-6 custom-scrollbar"
          style={{ backgroundColor: selectedModule ? hexToRgba(selectedModule.color, 0.04) : 'transparent' }}
        >
          <Watermark />
          
          {selectedModule ? (
            <div className="relative bg-white/70 backdrop-blur-[2px] border border-neutral-200 rounded-xl overflow-visible">
              <div className="px-5 py-3 border-b border-neutral-200 font-semibold" style={{ color: selectedModule.color }}>
                {selectedModule.label}
              </div>
              
              <div className="p-2 min-h-[300px]">
                {selectedId === 'dashboard' ? (
                  /* Overview stats/schedule/staff-load, driven by the
                     `dashboard` global prop when the server sends it;
                     falls back to its own mock data otherwise. */
                  <DashboardOverview data={usePage().props.dashboard} />
                ) : selectedId === 'clients' ? (
                  /* Feed the 'clients' global prop tree collection array cleanly down into the manager */
                  <ClientManager clients={usePage().props.clients} />
                ) : selectedId === 'sales' ? (
                  /* Sale item catalog: same server-driven list + form
                     pattern as Clients, scoped to the `sale_items` table. */
                  <SalesManager saleItems={usePage().props.saleItems} />
                ) : selectedId === 'users' ? (
                  /* Staff/account directory: same server-driven list + form
                     pattern as Clients, scoped to the `staff` table. Pass
                     the logged-in admin's own id so the manager can hide
                     the disable/delete actions on their own row. */
                  <StaffManager
                    staffList={usePage().props.staffList}
                    currentStaffId={staff?.id}
                  />
                ) : (
                  <div className="flex items-center justify-center h-72 text-neutral-400 text-sm">
                    {selectedModule.label} module content goes here
                  </div>
                )}

                
              </div>
            </div>
          ) : (
            <div className="relative h-full flex flex-col items-center justify-center gap-3 text-neutral-400">
              <MousePointerClick size={28} />
              <p className="text-sm">Select a menu item to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
