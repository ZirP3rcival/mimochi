import { Head, router } from '@inertiajs/react';

export default function StaffDashboard({ staff }) {
    function logout() {
        router.post('/logout');
    }

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
            <Head title="Staff Dashboard" />
            <div className="w-full max-w-2xl bg-white rounded-lg shadow-md p-8 text-center">
                <h1 className="text-2xl font-semibold text-gray-800 mb-2">
                    Staff Dashboard
                </h1>
                <p className="text-gray-500 mb-6">
                    Welcome, {staff?.staff_name} (staff)
                </p>
                <button
                    onClick={logout}
                    className="bg-gray-800 hover:bg-gray-900 text-white text-sm
                               font-semibold tracking-wide uppercase px-6 py-2.5 rounded-md transition"
                >
                    Log out
                </button>
            </div>
        </div>
    );
}


// Solution: Split Contexts to isolate updates
const ThemeContext = createContext();
const UserAuthContext = createContext();

export function AppProviders({ children }) {
  return (
    <ThemeProvider>
      <UserAuthProvider>
        {children}
      </UserAuthProvider>
    </ThemeProvider>
  );
}