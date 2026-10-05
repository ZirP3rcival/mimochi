import React from 'react';
import { User } from 'lucide-react';

/**
 * The client identity card shown at the top of the Schedule and Record
 * full-screen modules: a circular photo with the client's name badged
 * across its bottom edge, plus name/age/address alongside it.
 */
export default function ClientProfileHeader({ client }) {
    const fullName = [client?.first_name, client?.middle_initial ? `${client.middle_initial}.` : null, client?.last_name]
        .filter(Boolean)
        .join(' ');

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-5 shrink-0">
            <div className="relative w-20 h-20 rounded-full border border-gray-200 overflow-hidden bg-gray-100 shrink-0 shadow-sm">
                {client?.photo_path ? (
                    <img src={`/storage/${client.photo_path}`} alt="" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <User className="w-8 h-8" />
                    </div>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] font-bold tracking-wide text-center py-1 px-1 uppercase truncate">
                    {fullName || 'Client'}
                </div>
            </div>
            <div className="min-w-0">
                <h2 className="text-xl font-bold text-gray-800 truncate">{fullName}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                    {client?.gender === 'F' ? 'Female' : client?.gender === 'M' ? 'Male' : 'Gender: —'}
                    {' · '}Age: {client?.age ?? '—'}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">{client?.facebook_account || 'No Facebook account on file'}</p>
                <p className="text-sm text-gray-500 mt-0.5">{client?.address || 'No address on file'}</p>
            </div>
        </div>
    );
}
