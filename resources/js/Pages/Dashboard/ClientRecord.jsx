import React from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import ClientProfileHeader from './ClientProfileHeader';
import ClientScheduleBoard from './ClientScheduleBoard';

/**
 * A client's service record. The schedule board does the heavy lifting:
 * it lists everything booked and lets staff assign date / time / staff and
 * mark each piece done. Pass onBookServices to show a "Book Services"
 * button that opens the ClientSchedule picker.
 */
export default function ClientRecord({ client, onClose, onBookServices }) {
    return (
        <div className="w-full min-h-[calc(100vh-6rem)] bg-gray-50 flex flex-col gap-4 p-2 sm:p-4">
            <ClientProfileHeader client={client} />

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col flex-1 min-h-[420px] overflow-hidden">
                <div className="p-4 border-b border-gray-100 shrink-0 flex items-center justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-bold text-gray-800">Service Record</h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                            Items, bundles and package cards booked for this client. Assign date, time and staff, then mark each one done.
                        </p>
                    </div>
                    {onBookServices && (
                        <button
                            type="button"
                            onClick={() => onBookServices(client)}
                            className="bg-[rgb(240,136,176)] hover:bg-[rgb(225,120,160)] text-white font-semibold text-sm px-3 py-2 rounded-lg flex items-center gap-2 transition shadow-sm whitespace-nowrap"
                        >
                            <Plus className="w-4 h-4" /> Book Services
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                    <ClientScheduleBoard client={client} />
                </div>
            </div>

            <div className="flex justify-end shrink-0">
                <button
                    type="button"
                    onClick={() => onClose && onClose()}
                    className="flex items-center gap-1.5 px-5 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Clients
                </button>
            </div>
        </div>
    );
}
